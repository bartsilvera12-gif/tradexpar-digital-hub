import { getTradexparSupabase, isTradexparSupabaseConfigured } from "@/lib/supabaseTradexpar";
import { deriveOrderKind } from "@/lib/adminOrdersUtils";
import type { CreateOrderPayload, Order, OrderLineItem } from "@/types";

function assertConfigured() {
  if (!isTradexparSupabaseConfigured()) {
    throw new Error("Configurá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para pedidos.");
  }
}

type OrderItemRow = {
  id?: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  line_subtotal?: number;
  line_index?: number;
  product_name?: string | null;
  line_status?: string | null;
  external_provider?: string | null;
  external_product_id?: string | null;
  external_order_id?: string | null;
  external_status?: string | null;
  external_url?: string | null;
};

export async function createCheckoutOrder(payload: CreateOrderPayload): Promise<Order> {
  assertConfigured();
  const sb = getTradexparSupabase();

  const p_items = payload.items.map((i, line_index) => ({
    product_id: i.product_id,
    quantity: i.quantity,
    price: i.price,
    line_subtotal: i.price * i.quantity,
    line_index,
    product_name: i.product_name ?? null,
  }));

  const { data, error } = await sb.rpc("create_checkout_order", {
    p_checkout_type: payload.checkout_type || "tradexpar",
    p_location_url: payload.location_url,
    p_customer_name: payload.customer.name,
    p_customer_email: payload.customer.email ?? null,
    p_customer_phone: payload.customer.phone ?? null,
    p_customer_location_id: payload.customer_location_id ?? null,
    p_affiliate_ref: payload.affiliate_ref ?? null,
    p_items: p_items,
    p_affiliate_campaign_slug: null,
    p_checkout_client_ip: payload.checkout_client_ip?.trim() || null,
    p_customer_document: payload.customer.document?.trim() || null,
    p_customer_address: payload.customer.address?.trim() || null,
    p_customer_city_code: payload.customer.city_code?.trim() || null,
  });

  if (error) throw error;

  const o = data as Record<string, unknown>;
  const cust = (o.customer || {}) as Record<string, unknown>;
  return {
    id: String(o.id),
    total: Number(o.total),
    status: String(o.status),
    created_at: String(o.created_at),
    checkout_type: String(o.checkout_type),
    customer: {
      name: String(cust.name ?? ""),
      email: cust.email ? String(cust.email) : undefined,
      phone: cust.phone ? String(cust.phone) : undefined,
      document: cust.document ? String(cust.document) : undefined,
      address: cust.address ? String(cust.address) : undefined,
      city_code: cust.city_code ? String(cust.city_code) : undefined,
    },
    items: payload.items,
  };
}

function rowToLine(li: OrderItemRow): OrderLineItem {
  return {
    id: li.id != null ? String(li.id) : undefined,
    product_id: String(li.product_id),
    quantity: Number(li.quantity),
    price: Number(li.unit_price),
    product_name: li.product_name ?? undefined,
    line_subtotal: li.line_subtotal != null ? Number(li.line_subtotal) : undefined,
    line_index: li.line_index != null ? Number(li.line_index) : undefined,
    line_status: li.line_status != null ? String(li.line_status) : "pending",
    external_provider: li.external_provider ?? null,
    external_product_id: li.external_product_id ?? null,
    external_order_id: li.external_order_id ?? null,
    external_status: li.external_status ?? null,
    external_url: li.external_url ?? null,
  };
}

export async function listOrdersForAdmin(): Promise<Order[]> {
  assertConfigured();
  const sb = getTradexparSupabase();
  const { data, error } = await sb
    .from("orders")
    .select(
      `id, total, status, created_at, checkout_type, affiliate_ref, external_order_url,
       customer_name, customer_email, customer_phone,
       order_items(*)`
    )
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const nested = (r.order_items as OrderItemRow[] | null) ?? [];
    const sorted = [...nested].sort((a, b) => Number(a.line_index ?? 0) - Number(b.line_index ?? 0));
    const items = sorted.map(rowToLine);
    return {
      id: String(r.id),
      total: Number(r.total),
      status: String(r.status),
      created_at: String(r.created_at),
      checkout_type: r.checkout_type as string | undefined,
      external_order_url: r.external_order_url != null ? String(r.external_order_url) : null,
      customer: {
        name: String(r.customer_name ?? ""),
        email: r.customer_email ? String(r.customer_email) : undefined,
        phone: r.customer_phone ? String(r.customer_phone) : undefined,
      },
      items,
      order_kind: deriveOrderKind(items),
    } satisfies Order;
  });

  const ids = new Set<string>();
  for (const o of rows) {
    for (const i of o.items) {
      if (i.product_id) ids.add(i.product_id);
    }
  }
  const idArr = [...ids];
  if (idArr.length === 0) return rows.map((o) => ({ ...o, order_kind: deriveOrderKind(o.items) }));

  const { data: prows, error: perr } = await sb
    .from("products")
    .select("id,sku,product_source_type")
    .in("id", idArr);
  if (perr) return rows;

  const pmap = new Map<string, { sku: string; product_source_type: string }>();
  for (const r of prows ?? []) {
    const rec = r as Record<string, unknown>;
    pmap.set(String(rec.id), {
      sku: String(rec.sku ?? ""),
      product_source_type: String(rec.product_source_type ?? "tradexpar"),
    });
  }

  return rows.map((o) => {
    const items = o.items.map((i) => {
      const p = pmap.get(i.product_id);
      const pst = p?.product_source_type === "dropi" ? "dropi" : ("tradexpar" as const);
      return { ...i, sku: p?.sku ?? i.sku, product_source_type: pst };
    });
    return { ...o, items, order_kind: deriveOrderKind(items) };
  });
}
