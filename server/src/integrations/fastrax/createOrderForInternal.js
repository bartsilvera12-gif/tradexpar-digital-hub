/**
 * Tras pago (webhook) o admin: ope=12 (ped, sku, gra, qtd, pgt) solo ítems Fastrax.
 * pdc = id Fastrax; ped = pedido ecommerce. No afecta Dropi.
 */

import {
  createFastraxRemoteOrder12,
  fastraxEnabled,
  fastraxConfigured,
  fastraxInvoiceOrder15,
} from "./client.js";
import { extractFastraxPedPdc, logFastraxInfo } from "./fastraxResponse.js";
import { FASTRAX_SOURCE } from "./mapper.js";

function utcNowIso() {
  return new Date().toISOString();
}

function pgtForOrder() {
  const n = Number(process.env.FASTRAX_PGT || 3);
  if (n === 1 || n === 2) return n;
  return 3;
}

function str(x) {
  if (x == null) return "";
  return String(x);
}

/**
 * @param {string[]} skus
 */
function buildGra(skus) {
  const n = skus.length;
  if (n === 0) return "";
  if (n === 1) {
    return str(process.env.FASTRAX_GRA_FIRST ?? "");
  }
  return new Array(n).fill("").join(",");
}

/**
 * @param {Record<string, unknown>} p
 */
function pickExternalSku(p) {
  const extSku = p.external_sku != null && str(p.external_sku) !== "" ? str(p.external_sku) : "";
  if (extSku) return extSku;
  if (p.external_product_id != null && str(p.external_product_id) !== "") return str(p.external_product_id);
  return str(p.sku) || "";
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} message
 * @param {unknown} fullResponse
 * @param {Record<string, unknown> | null} [payload]
 */
async function recordFailure(sb, orderId, message, fullResponse, payload = null) {
  await upsertMap(sb, {
    order_id: orderId,
    status: "failed",
    fastrax_status: "failed",
    last_error: str(message).slice(0, 2_000),
    error: str(message).slice(0, 2_000),
    response: fullResponse && typeof fullResponse === "object" ? fullResponse : { raw: fullResponse },
    ...(payload ? { payload } : {}),
    updated_at: utcNowIso(),
  });
}

/**
 * @param {string} pdc
 * @param {string} ped
 */
async function runFastraxAutoInvoiceOpe15(pdc, ped) {
  if (str(process.env.FASTRAX_AUTO_INVOICE).trim() !== "1") {
    return { ok: true, skipped: true, message: null, parsed: null };
  }
  const body = pdc
    ? { pdc: str(pdc) }
    : { ped: str(ped) };
  const r = await fastraxInvoiceOrder15(body);
  if (!r || r.ok === false) {
    const m = (r && r.message) || (r && r.cestatus) || "Error ope=15 (facturación)";
    logFastraxInfo("invoice_ope15_failed", { ope: 15, cestatus: str(m).slice(0, 500) });
    return { ok: false, message: str(m), parsed: r?.parsed, skipped: false };
  }
  return { ok: true, message: null, parsed: r.parsed, skipped: false };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} orderId
 * @param {{ context?: string, force?: boolean }} [options]
 */
export async function createFastraxOrderForInternalOrder(sb, orderId, options = {}) {
  if (!fastraxEnabled()) {
    return { ok: true, skipped: true, reason: "fastrax_disabled" };
  }
  if (!fastraxConfigured()) {
    return { ok: true, skipped: true, reason: "fastrax_not_configured" };
  }

  const oid = str(orderId).trim();
  if (!oid) {
    return { ok: true, skipped: true, reason: "empty_order_id" };
  }

  const { data: mapEx, error: mErr } = await sb.from("fastrax_order_map").select("*").eq("order_id", oid).maybeSingle();
  if (mErr) {
    return { ok: false, order_id: oid, error: mErr.message || "map_load" };
  }
  const mSt = str(mapEx?.fastrax_status ?? mapEx?.status);
  const mPdc = mapEx?.fastrax_pdc
    ? str(mapEx.fastrax_pdc)
    : mapEx?.fastrax_order_id
      ? str(mapEx.fastrax_order_id)
      : "";
  if (mPdc && mSt === "succeeded" && !options.force) {
    return { ok: true, skipped: true, reason: "already_created", order_id: oid, fastrax_pdc: mPdc, fastrax_order_id: mPdc };
  }

  const { data: orderRow, error: orderErr } = await sb
    .from("orders")
    .select("id, customer_name, customer_email, customer_phone, customer_document, customer_address, customer_city_code, customer_address_reference")
    .eq("id", oid)
    .maybeSingle();
  if (orderErr || !orderRow?.id) {
    return { ok: true, skipped: true, reason: "order_not_found" };
  }

  const { data: itemRows, error: itemsErr } = await sb
    .from("order_items")
    .select("id, product_id, product_name, quantity, unit_price, line_index")
    .eq("order_id", oid)
    .order("line_index", { ascending: true });
  if (itemsErr) {
    return { ok: false, order_id: oid, error: itemsErr.message };
  }
  const items = Array.isArray(itemRows) ? itemRows : [];
  const productIds = [...new Set(items.map((i) => (i?.product_id != null ? str(i.product_id) : "")).filter(Boolean))];
  if (productIds.length === 0) {
    return { ok: true, skipped: true, reason: "no_line_items" };
  }

  const { data: prows, error: perr } = await sb
    .from("products")
    .select("id, name, sku, product_source_type, external_provider, external_product_id, price, sale_price, external_sku")
    .in("id", productIds);
  if (perr) {
    return { ok: false, order_id: oid, error: perr.message };
  }
  const pmap = new Map();
  for (const p of prows ?? []) {
    pmap.set(String(p.id), p);
  }

  const skus = [];
  const qtds = [];
  for (const li of items) {
    if (!li || li.product_id == null) continue;
    const p = pmap.get(String(li.product_id));
    if (!p) continue;
    const st = p.product_source_type != null ? str(p.product_source_type) : "";
    const prov = p.external_provider != null ? str(p.external_provider).toLowerCase() : "";
    const isFx = st === "fastrax" || prov === "fastrax";
    if (!isFx) continue;
    const sku = pickExternalSku(p);
    if (!sku) {
      const errText =
        "Producto Fastrax sin SKU externo (columna external_sku, external_product_id o sku de catálogo); no se envió el pedido a Fastrax";
      await recordFailure(sb, oid, errText, { reason: "missing_sku" }, null);
      return { ok: false, order_id: oid, error: errText };
    }
    const qty = Math.max(1, Math.floor(Number(li.quantity) || 1));
    skus.push(sku);
    qtds.push(String(qty));
  }

  if (skus.length === 0) {
    return { ok: true, skipped: true, reason: "no_fastrax_lines" };
  }

  const pgt = pgtForOrder();
  const orderPayload = {
    ped: oid,
    sku: skus.join(","),
    qtd: qtds.join(","),
    gra: buildGra(skus),
    pgt,
  };

  const ts0 = utcNowIso();
  await upsertMap(sb, {
    order_id: oid,
    status: "pending",
    fastrax_status: "pending",
    fastrax_ped: oid,
    payload: orderPayload,
    error: null,
    last_error: null,
    updated_at: ts0,
  });

  let r;
  try {
    r = await createFastraxRemoteOrder12(orderPayload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : str(e);
    await recordFailure(sb, oid, msg, null, orderPayload);
    return { ok: false, order_id: oid, error: msg };
  }

  if (!r || r.ok === false) {
    const cest = (r && r.cestatus) || (r && r.message) || "Fastrax ope=12 (negocio o HTTP)";
    const msg = str(cest).slice(0, 2_000);
    await recordFailure(
      sb,
      oid,
      msg,
      r.parsed && typeof r.parsed === "object" ? r.parsed : { message: msg, raw: r },
      orderPayload
    );
    return { ok: false, order_id: oid, error: msg, cestatus: msg };
  }

  const { pdc, ped } = extractFastraxPedPdc(r.parsed, oid);
  if (!pdc) {
    const errText = "Fastrax: ope=12 ok pero sin pdc en respuesta; se guarda response. ped=ecommerce, pdc=id Fastrax.";
    await upsertMap(sb, {
      order_id: oid,
      status: "failed",
      fastrax_status: "failed",
      fastrax_ped: ped,
      last_error: errText,
      error: errText,
      response: r.parsed && typeof r.parsed === "object" ? r.parsed : { raw: r },
      updated_at: utcNowIso(),
    });
    return { ok: false, order_id: oid, error: errText };
  }

  const inv = await runFastraxAutoInvoiceOpe15(pdc, ped);
  const syncTs = utcNowIso();
  const autoInv = str(process.env.FASTRAX_AUTO_INVOICE).trim() === "1";
  const invoiceRes = autoInv
    ? (inv.parsed && typeof inv.parsed === "object" ? inv.parsed : { invoice_error: inv.message || "ope=15" })
    : null;
  const row = {
    order_id: oid,
    status: "succeeded",
    fastrax_status: "succeeded",
    fastrax_order_id: pdc,
    fastrax_ped: ped,
    fastrax_pdc: pdc,
    last_error: inv.ok
      ? null
      : str(inv.message || "Facturación ope=15 (FASTRAX_AUTO_INVOICE) falló").slice(0, 2_000),
    error: inv.ok
      ? null
      : str(inv.message || "ope=15").slice(0, 2_000),
    response: r.parsed && typeof r.parsed === "object" ? r.parsed : { ok: 1 },
    invoice_response: invoiceRes,
    last_sync_at: syncTs,
    updated_at: syncTs,
  };
  await upsertMap(sb, row);

  for (const li of items) {
    if (!li?.id) continue;
    const p = pmap.get(String(li.product_id));
    if (!p) continue;
    if (str(p.product_source_type) !== "fastrax" && str(p.external_provider).toLowerCase() !== "fastrax") continue;
    await sb
      .from("order_items")
      .update({
        external_provider: FASTRAX_SOURCE,
        external_order_id: pdc,
        line_status: "ordered_in_fastrax",
      })
      .eq("id", str(li.id));
  }

  return {
    ok: true,
    order_id: oid,
    fastrax_order_id: pdc,
    fastrax_pdc: pdc,
    fastrax_ped: ped,
    invoice_ok: inv.ok,
    invoice_error: !inv.ok ? inv.message : null,
    context: options.context ?? "internal",
  };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {Record<string, unknown>} row
 */
async function upsertMap(sb, row) {
  const { error: e1 } = await sb
    .from("fastrax_order_map")
    .upsert(
      { ...row, updated_at: row.updated_at || utcNowIso() },
      { onConflict: "order_id" }
    );
  if (e1) {
    logFastraxInfo("upsert_fastrax_order_map_failed", { ope: 0, cestatus: e1.message?.slice?.(0, 500) });
  }
  return e1;
}

/**
 * POST /fastrax/invoice: ope=15 (pdc preferido, si no ped)
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} orderId
 */
export async function runFastraxInvoiceForMap(sb, orderId) {
  const oid = str(orderId);
  const { data: map, error } = await sb.from("fastrax_order_map").select("fastrax_pdc, fastrax_ped").eq("order_id", oid).maybeSingle();
  if (error) {
    return { ok: false, error: error.message };
  }
  if (!map) {
    return { ok: false, error: "no_map" };
  }
  const pdc = str(map.fastrax_pdc);
  const ped = str(map.fastrax_ped) || oid;
  const r = pdc
    ? await fastraxInvoiceOrder15({ pdc })
    : await fastraxInvoiceOrder15({ ped });
  const ts = utcNowIso();
  if (!r.ok) {
    const m = str(r.message || (r && r.cestatus) || "ope=15");
    await sb
      .from("fastrax_order_map")
      .update({
        last_error: m.slice(0, 2_000),
        error: m.slice(0, 2_000),
        invoice_response: r.parsed && typeof r.parsed === "object" ? r.parsed : null,
        updated_at: ts,
      })
      .eq("order_id", oid);
    return { ok: false, message: m, parsed: r.parsed };
  }
  await sb
    .from("fastrax_order_map")
    .update({
      invoice_response: r.parsed && typeof r.parsed === "object" ? r.parsed : null,
      last_error: null,
      error: null,
      updated_at: ts,
    })
    .eq("order_id", oid);
  return { ok: true, message: "invoiced", parsed: r.parsed };
}
