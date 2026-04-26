/**
 * Tras pago (webhook) o admin: crea pedido en Fastrax (ope=12) solo con ítems Fastrax; guarda `fastrax_order_map`.
 * No afecta Dropi.
 */

import { createFastraxRemoteOrder, fastraxConfigured, fastraxEnabled } from "./client.js";
import { pickFastraxOrderIdFromCreateResponse, FASTRAX_SOURCE } from "./mapper.js";

function utcNowIso() {
  return new Date().toISOString();
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} orderId
 * @param {{ context?: string, force?: boolean }} [options]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function createFastraxOrderForInternalOrder(sb, orderId, options = {}) {
  if (!fastraxEnabled()) {
    return { ok: true, skipped: true, reason: "fastrax_disabled" };
  }
  if (!fastraxConfigured()) {
    return { ok: true, skipped: true, reason: "fastrax_not_configured" };
  }

  const oid = String(orderId || "").trim();
  if (!oid) {
    return { ok: true, skipped: true, reason: "empty_order_id" };
  }

  const { data: mapEx, error: mErr } = await sb.from("fastrax_order_map").select("*").eq("order_id", oid).maybeSingle();
  if (mErr) {
    return { ok: false, order_id: oid, error: mErr.message || "map_load" };
  }
  const mSt = String(mapEx?.fastrax_status ?? mapEx?.status ?? "");
  const mId = mapEx?.fastrax_order_id != null && String(mapEx.fastrax_order_id).trim() ? String(mapEx.fastrax_order_id).trim() : "";
  if (mSt === "succeeded" && mId && !options.force) {
    return { ok: true, skipped: true, reason: "already_created", order_id: oid, fastrax_order_id: mId };
  }

  const { data: orderRow, error: orderErr } = await sb
    .from("orders")
    .select(
      "id, customer_name, customer_email, customer_phone, customer_document, customer_address, customer_city_code, customer_address_reference"
    )
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
  const productIds = [...new Set(items.map((i) => (i?.product_id != null ? String(i.product_id) : "")).filter(Boolean))];
  if (productIds.length === 0) {
    return { ok: true, skipped: true, reason: "no_line_items" };
  }

  const { data: prows, error: perr } = await sb
    .from("products")
    .select("id, name, sku, product_source_type, external_provider, external_product_id, price, sale_price")
    .in("id", productIds);
  if (perr) {
    return { ok: false, order_id: oid, error: perr.message };
  }
  const pmap = new Map();
  for (const p of prows ?? []) {
    pmap.set(String(p.id), p);
  }

  const det = [];
  for (const li of items) {
    if (!li || li.product_id == null) continue;
    const p = pmap.get(String(li.product_id));
    if (!p) continue;
    const st = p.product_source_type != null ? String(p.product_source_type) : "";
    const prov = p.external_provider != null ? String(p.external_provider).toLowerCase() : "";
    const isFx = st === "fastrax" || prov === "fastrax";
    if (!isFx) continue;
    const pro = p.external_product_id != null && String(p.external_product_id).trim() ? String(p.external_product_id).trim() : "";
    if (!pro) {
      const errText = "Producto Fastrax sin external_product_id; no se envió el pedido a Fastrax";
      await upsertMap(sb, {
        order_id: oid,
        status: "failed",
        fastrax_status: "failed",
        error: errText,
        last_error: errText,
        updated_at: utcNowIso(),
      });
      return { ok: false, order_id: oid, error: errText };
    }
    const qty = Math.max(1, Math.floor(Number(li.quantity) || 1));
    const unit = Math.max(0, Math.round(Number(li.unit_price) || 0) || pickUnitPrice(p));
    det.push({ pro, can: qty, pre: unit });
  }

  if (det.length === 0) {
    return { ok: true, skipped: true, reason: "no_fastrax_lines" };
  }

  /** Cuerpo ope=12: ajustable según manual (nroext / obs / com / …). */
  const orderPayload = {
    nroext: oid,
    det,
    com: "Tradexpar",
    nom: String(orderRow.customer_name ?? "").slice(0, 200),
    dir: String(orderRow.customer_address ?? "").slice(0, 500),
    tel: String(orderRow.customer_phone ?? "").slice(0, 80),
    ciu: String(orderRow.customer_city_code ?? "").slice(0, 32),
    doc: String(orderRow.customer_document ?? "").slice(0, 32),
  };

  const ts0 = utcNowIso();
  await upsertMap(sb, {
    order_id: oid,
    status: "pending",
    fastrax_status: "pending",
    payload: orderPayload,
    error: null,
    last_error: null,
    updated_at: ts0,
  });

  let r;
  try {
    r = await createFastraxRemoteOrder(orderPayload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await upsertMap(sb, {
      order_id: oid,
      status: "failed",
      fastrax_status: "failed",
      last_error: msg,
      error: msg,
      response: null,
      updated_at: utcNowIso(),
    });
    return { ok: false, order_id: oid, error: msg };
  }

  if (!r || !r.ok) {
    const msg = (r && r.message) || "Fastrax ope=12 error";
    await upsertMap(sb, {
      order_id: oid,
      status: "failed",
      fastrax_status: "failed",
      last_error: String(msg).slice(0, 2_000),
      error: String(msg).slice(0, 2_000),
      response: r?.parsed && typeof r.parsed === "object" ? r.parsed : { message: msg },
      updated_at: utcNowIso(),
    });
    return { ok: false, order_id: oid, error: String(msg) };
  }

  const extId = pickFastraxOrderIdFromCreateResponse(r.parsed);
  if (!extId) {
    const errText = "Fastrax: respuesta ope=12 sin nro/identificador de pedido reconocible (revisar mapper o manual).";
    await upsertMap(sb, {
      order_id: oid,
      status: "failed",
      fastrax_status: "failed",
      last_error: errText,
      error: errText,
      response: r.parsed && typeof r.parsed === "object" ? r.parsed : { raw: r.raw },
      updated_at: utcNowIso(),
    });
    return { ok: false, order_id: oid, error: errText };
  }

  const syncTs = utcNowIso();
  await upsertMap(sb, {
    order_id: oid,
    status: "succeeded",
    fastrax_status: "succeeded",
    fastrax_order_id: extId,
    last_error: null,
    error: null,
    response: r.parsed && typeof r.parsed === "object" ? r.parsed : { ok: 1 },
    last_sync_at: syncTs,
    updated_at: syncTs,
  });

  for (const li of items) {
    if (!li?.id) continue;
    const p = pmap.get(String(li.product_id));
    if (!p) continue;
    const isFx = String(p.product_source_type) === "fastrax" || String(p.external_provider || "").toLowerCase() === "fastrax";
    if (!isFx) continue;
    await sb
      .from("order_items")
      .update({
        external_provider: FASTRAX_SOURCE,
        external_order_id: extId,
        line_status: "ordered_in_fastrax",
      })
      .eq("id", String(li.id));
  }

  return {
    ok: true,
    order_id: oid,
    fastrax_order_id: extId,
    context: options.context ?? "internal",
  };
}

/** @param {Record<string, unknown>} p */
function pickUnitPrice(p) {
  const a = num(p.sale_price);
  if (a > 0) return Math.round(a);
  const b = num(p.price);
  return b > 0 ? Math.round(b) : 0;
}

function num(x) {
  if (x == null || x === "") return 0;
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {Record<string, unknown>} row
 * @returns {Promise<import('@supabase/postgrest-js').PostgrestError | null>}
 */
async function upsertMap(sb, row) {
  const { error: e1 } = await sb.from("fastrax_order_map").upsert(
    { ...row, updated_at: row.updated_at || utcNowIso() },
    { onConflict: "order_id" }
  );
  return e1;
}
