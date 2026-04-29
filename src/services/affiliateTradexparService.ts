import { DDI } from "@/lib/ddiLabels";
import { getSupabaseData, isSupabaseConfigured } from "@/lib/supabaseClient";
import type {
  AffiliateRequestRow,
  AffiliateRow,
  AffiliateSalesDetailRow,
  AffiliateSummaryRow,
  AffiliateCommissionRuleRow,
  AffiliateDiscountRuleRow,
  SubmitAffiliateRequestInput,
  AffiliatePortalSnapshot,
  AffiliatePortalAffiliate,
  AffiliatePortalSaleRow,
} from "@/types/affiliates";
import type { OrderItem } from "@/types";
import type {
  AffiliateAnalyticsPayload,
  AffiliateAssetRow,
  AffiliateCommissionAdjustmentRow,
  AffiliateFraudFlagRow,
  AffiliateTierRow,
} from "@/types/affiliatesPro";

export function affiliatesAvailable(): boolean {
  return isSupabaseConfigured();
}

/** Mapa product_id → % descuento al comprador para el ref indicado (solo IDs con descuento mayor a 0). */
export async function fetchStoreAffiliateBuyerDiscounts(
  ref: string,
  productIds: string[]
): Promise<Record<string, number>> {
  const r = ref.trim();
  if (!r || productIds.length === 0) return {};
  let sb: ReturnType<typeof getSupabaseData>;
  try {
    sb = getSupabaseData();
  } catch {
    return {};
  }
  const { data, error } = await sb.rpc("store_affiliate_buyer_discounts", {
    p_ref: r,
    p_product_ids: productIds,
  });
  if (error) {
    console.warn("[affiliates] store_affiliate_buyer_discounts", error.message);
    return {};
  }
  const row = data as { ok?: boolean; by_product?: unknown } | null;
  const raw = row?.by_product;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}

export async function submitAffiliateRequest(input: SubmitAffiliateRequestInput): Promise<string> {
  const sb = getSupabaseData();
  const { data, error } = await sb.rpc("submit_affiliate_request", {
    p_full_name: input.full_name.trim(),
    p_email: input.email.trim(),
    p_phone: input.phone?.trim() || null,
    p_document_id: input.document_id?.trim() || null,
    p_message: input.message?.trim() || null,
  });
  if (error) throw error;
  return data as string;
}

export async function recordAffiliateVisit(
  ref: string,
  path: string,
  userAgent?: string | null,
  clientIp?: string | null
) {
  if (!ref.trim()) return null;
  const sb = getSupabaseData();
  const { data, error } = await sb.rpc("record_affiliate_visit", {
    p_ref: ref.trim(),
    p_path: path || "/",
    p_user_agent: userAgent?.slice(0, 512) || null,
    p_campaign_slug: null,
    p_client_ip: clientIp?.trim() || null,
  });
  if (error) {
    console.warn("[affiliates] record_affiliate_visit", error.message);
    return null;
  }
  return data as { ok?: boolean; reason?: string };
}

export async function syncCheckoutOrderStub(
  orderId: string,
  total: number,
  affiliateRef: string | null | undefined,
  checkoutType: string
) {
  const sb = getSupabaseData();
  const { error } = await sb.rpc("sync_checkout_order_stub", {
    p_order_id: orderId,
    p_total: total,
    p_affiliate_ref: affiliateRef?.trim() || null,
    p_checkout_type: checkoutType || "tradexpar",
  });
  if (error) throw error;
}

export async function upsertOrderItemsForAffiliate(orderId: string, items: OrderItem[], productNames: Record<string, string>) {
  const sb = getSupabaseData();
  const payload = items.map((it, line_index) => ({
    product_id: it.product_id,
    product_name: productNames[it.product_id] ?? null,
    quantity: it.quantity,
    unit_price: it.price,
    line_subtotal: it.price * it.quantity,
    line_index,
  }));
  const { error } = await sb.rpc("upsert_order_items_for_affiliate", {
    p_order_id: orderId,
    p_items: payload,
  });
  if (error) throw error;
}

export async function applyAffiliateToOrder(orderId: string) {
  const sb = getSupabaseData();
  const { data, error } = await sb.rpc("apply_affiliate_to_order", { p_order_id: orderId });
  if (error) throw error;
  return data as Record<string, unknown>;
}

/** Pedido ya existe en Supabase (`create_checkout_order`): aplica atribución y comisiones en BD. */
export async function finalizeAffiliateAttribution(orderId: string) {
  if (!isSupabaseConfigured()) return;
  try {
    await applyAffiliateToOrder(orderId);
  } catch (e) {
    console.warn("[affiliates] finalizeAffiliateAttribution", e);
  }
}

// ——— Admin (requiere grants en SQL; en producción usar service_role o API propia) ———

export async function listAffiliateRequests(): Promise<AffiliateRequestRow[]> {
  const sb = getSupabaseData();
  const { data, error } = await sb.from("affiliate_requests").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AffiliateRequestRow[];
}

export async function approveAffiliateRequest(requestId: string) {
  const sb = getSupabaseData();
  const { data, error } = await sb.rpc("admin_approve_affiliate_request", { p_request_id: requestId });
  if (error) throw error;
  return data as { ok?: boolean; affiliate_id?: string; code?: string; reason?: string };
}

export async function rejectAffiliateRequest(requestId: string, note?: string) {
  const sb = getSupabaseData();
  const { data, error } = await sb.rpc("admin_reject_affiliate_request", {
    p_request_id: requestId,
    p_note: note?.trim() || null,
  });
  if (error) throw error;
  return data as { ok?: boolean; reason?: string };
}

export async function listAffiliates(): Promise<AffiliateRow[]> {
  const sb = getSupabaseData();
  const { data, error } = await sb.from("affiliates").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AffiliateRow[];
}

export async function listAffiliateSummary(): Promise<AffiliateSummaryRow[]> {
  const sb = getSupabaseData();
  const { data, error } = await sb.from("v_affiliate_summary").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as AffiliateSummaryRow[];
}

export async function listAffiliateSalesDetail(): Promise<AffiliateSalesDetailRow[]> {
  const sb = getSupabaseData();
  const { data, error } = await sb.from("v_affiliate_sales_detail").select("*").order("order_created_at", {
    ascending: false,
  });
  if (error) throw error;
  return (data ?? []) as AffiliateSalesDetailRow[];
}

export async function listCommissionRules(affiliateId: string): Promise<AffiliateCommissionRuleRow[]> {
  const sb = getSupabaseData();
  const { data, error } = await sb
    .from("affiliate_commission_rules")
    .select("*")
    .eq("affiliate_id", affiliateId)
    .order("product_id", { ascending: true, nullsFirst: true });
  if (error) throw error;
  return (data ?? []) as AffiliateCommissionRuleRow[];
}

export async function listDiscountRules(affiliateId: string): Promise<AffiliateDiscountRuleRow[]> {
  const sb = getSupabaseData();
  const { data, error } = await sb
    .from("affiliate_discount_rules")
    .select("*")
    .eq("affiliate_id", affiliateId)
    .order("product_id", { ascending: true, nullsFirst: true });
  if (error) throw error;
  return (data ?? []) as AffiliateDiscountRuleRow[];
}

export async function setCommissionRule(affiliateId: string, productId: string | null, percent: number) {
  const sb = getSupabaseData();
  const { error } = await sb.rpc("admin_set_commission_rule", {
    p_affiliate_id: affiliateId,
    p_product_id: productId,
    p_percent: percent,
  });
  if (error) throw error;
}

export async function setDiscountRule(affiliateId: string, productId: string | null, percent: number) {
  const sb = getSupabaseData();
  const { error } = await sb.rpc("admin_set_discount_rule", {
    p_affiliate_id: affiliateId,
    p_product_id: productId,
    p_percent: percent,
  });
  if (error) throw error;
}

export async function setAffiliateGlobals(affiliateId: string, commissionPercent: number, buyerDiscountPercent: number) {
  const sb = getSupabaseData();
  const { error } = await sb.rpc("admin_set_affiliate_globals", {
    p_affiliate_id: affiliateId,
    p_commission_percent: commissionPercent,
    p_buyer_discount_percent: buyerDiscountPercent,
  });
  if (error) throw error;
}

export async function setAffiliateStatus(affiliateId: string, status: "active" | "suspended") {
  const sb = getSupabaseData();
  const { error } = await sb.rpc("admin_set_affiliate_status", {
    p_affiliate_id: affiliateId,
    p_status: status,
  });
  if (error) {
    const parts = [error.message, error.hint, error.details].filter(
      (x): x is string => typeof x === "string" && x.trim().length > 0
    );
    throw new Error(parts.join(" — ") || error.code || `Error al actualizar el ${DDI.singularLower}`);
  }
}

export async function setAttributionCommissionStatus(attributionId: string, status: string) {
  const sb = getSupabaseData();
  const { error } = await sb.rpc("admin_set_attribution_commission_status", {
    p_attribution_id: attributionId,
    p_status: status,
  });
  if (error) throw error;
}

/** True si el usuario puede ver el enlace al panel (distribuidor activo o solicitud pendiente con su email). */
export async function fetchAffiliatePortalLinkVisible(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const sb = getSupabaseData();
    const { data, error } = await sb.rpc("affiliate_customer_portal_eligible");
    if (!error) return Boolean(data);
    const m = error.message?.toLowerCase() ?? "";
    const details = String((error as { details?: string }).details ?? "").toLowerCase();
    /** Función no desplegada en PostgREST / ruta 404: no elegible (evita ruido si el SQL no está en el servidor). */
    if (
      m.includes("could not find") ||
      m.includes("does not exist") ||
      m.includes("schema cache") ||
      m.includes("not found") ||
      m.includes("404") ||
      details.includes("404")
    ) {
      return false;
    }
    throw new Error(error.message);
  } catch (e) {
    /** Fallos de red al llamar este RPC opcional: ocultar enlace, sin tumbar la tienda. */
    if (e instanceof Error) {
      const low = e.message.toLowerCase();
      if (low.includes("404") || low.includes("failed to fetch")) return false;
      throw e;
    }
    return false;
  }
}

/** Panel del distribuidor digital independiente: requiere sesión Supabase (cliente autenticado con JWT). */
export async function fetchAffiliatePortalSnapshot(): Promise<AffiliatePortalSnapshot> {
  const sb = getSupabaseData();
  const { data, error } = await sb.rpc("affiliate_portal_snapshot");
  if (error) throw error;
  const row = data as Record<string, unknown>;
  if (row.ok !== true) {
    return { ok: false, reason: String(row.reason ?? "unknown") };
  }
  return {
    ok: true,
    affiliate: row.affiliate as AffiliatePortalAffiliate,
    totals_pending: Number(row.totals_pending ?? 0),
    totals_approved: Number(row.totals_approved ?? 0),
    totals_paid: Number(row.totals_paid ?? 0),
    sales: (Array.isArray(row.sales) ? row.sales : []) as AffiliatePortalSaleRow[],
  };
}

export async function deleteCommissionRuleForProduct(affiliateId: string, productId: string) {
  const sb = getSupabaseData();
  const { error } = await sb.rpc("admin_delete_commission_rule", {
    p_affiliate_id: affiliateId,
    p_product_id: productId,
  });
  if (error) throw error;
}

export async function deleteDiscountRuleForProduct(affiliateId: string, productId: string) {
  const sb = getSupabaseData();
  const { error } = await sb.rpc("admin_delete_discount_rule", {
    p_affiliate_id: affiliateId,
    p_product_id: productId,
  });
  if (error) throw error;
}

export async function listAffiliateFraudFlags(): Promise<AffiliateFraudFlagRow[]> {
  const sb = getSupabaseData();
  const { data, error } = await sb.from("affiliate_fraud_flags").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AffiliateFraudFlagRow[];
}

export async function setFraudFlagStatus(flagId: string, status: string, notes?: string) {
  const sb = getSupabaseData();
  const { error } = await sb.rpc("admin_fraud_flag_set_status", {
    p_flag_id: flagId,
    p_status: status,
    p_notes: notes?.trim() || null,
  });
  if (error) throw error;
}

export async function listAffiliateAdjustments(): Promise<AffiliateCommissionAdjustmentRow[]> {
  const sb = getSupabaseData();
  const { data, error } = await sb
    .from("affiliate_commission_adjustments")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AffiliateCommissionAdjustmentRow[];
}

export async function listAffiliateAssets(): Promise<AffiliateAssetRow[]> {
  const sb = getSupabaseData();
  const { data, error } = await sb.from("affiliate_assets").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AffiliateAssetRow[];
}

export async function insertAffiliateAssetAdmin(input: {
  title: string;
  asset_type: string;
  file_url: string;
  product_id?: string | null;
  is_active?: boolean;
}) {
  const sb = getSupabaseData();
  const { data, error } = await sb.rpc("admin_insert_affiliate_asset", {
    p_title: input.title,
    p_asset_type: input.asset_type,
    p_file_url: input.file_url,
    p_product_id: input.product_id ?? null,
    p_is_active: input.is_active ?? true,
  });
  if (error) throw error;
  return data as string;
}

export async function setAffiliateAssetActive(id: string, isActive: boolean) {
  const sb = getSupabaseData();
  const { error } = await sb.rpc("admin_set_affiliate_asset_active", {
    p_id: id,
    p_active: isActive,
  });
  if (error) throw error;
}

export async function fetchAffiliateAnalytics(): Promise<AffiliateAnalyticsPayload> {
  const sb = getSupabaseData();
  const { data, error } = await sb.rpc("admin_affiliate_analytics");
  if (error) throw error;
  return data as AffiliateAnalyticsPayload;
}

export async function fetchPublicAffiliateAssets(): Promise<AffiliateAssetRow[]> {
  const sb = getSupabaseData();
  const { data, error } = await sb.rpc("affiliate_public_assets");
  if (error) throw error;
  if (data == null) return [];
  if (Array.isArray(data)) return data as AffiliateAssetRow[];
  if (typeof data === "string") {
    try {
      const p = JSON.parse(data) as unknown;
      return Array.isArray(p) ? (p as AffiliateAssetRow[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function listAffiliateTiers(): Promise<AffiliateTierRow[]> {
  const sb = getSupabaseData();
  const { data, error } = await sb.from("affiliate_tiers").select("*").order("sort_order");
  if (error) throw error;
  return (data ?? []) as AffiliateTierRow[];
}

export function buildAffiliateStoreUrl(refToken: string): string {
  const base =
    import.meta.env.VITE_PUBLIC_SITE_URL ||
    (typeof window !== "undefined" ? window.location.origin : "http://localhost");
  const u = new URL("/", base.endsWith("/") ? base : `${base}/`);
  u.searchParams.set("ref", refToken);
  return u.toString();
}
