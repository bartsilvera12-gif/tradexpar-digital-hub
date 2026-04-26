/**
 * Consulta estado de pedido en Fastrax (ope=13) y actualiza `fastrax_order_map`.
 */

import { getOrderStatus, fastraxConfigured, fastraxEnabled } from "./client.js";
import { sitToLabel, pickSitCode } from "./mapper.js";
import { supabaseService } from "./db.js";

/**
 * Nombre de campo en el cuerpo ope=13 para el id de pedido Fastrax. Por defecto `nro` (ver manual).
 */
function ope13OrderIdField() {
  const s = (process.env.FASTRAX_OPE13_ID_FIELD || "nro").trim() || "nro";
  return s;
}

/**
 * @param {string} orderId
 * @param {import('@supabase/supabase-js').SupabaseClient} [sb]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function syncFastraxOrderStatusForOrderId(orderId, sb) {
  if (!fastraxEnabled()) {
    return { ok: false, reason: "fastrax_disabled" };
  }
  if (!fastraxConfigured()) {
    return { ok: false, reason: "not_configured" };
  }
  const oid = String(orderId || "").trim();
  const client = sb || supabaseService();
  const { data: map, error: me } = await client
    .from("fastrax_order_map")
    .select("*")
    .eq("order_id", oid)
    .maybeSingle();
  if (me) {
    return { ok: false, order_id: oid, reason: "load_error", error: me };
  }
  if (!map?.id) {
    return { ok: false, order_id: oid, reason: "no_map" };
  }
  const fId = map.fastrax_order_id != null ? String(map.fastrax_order_id).trim() : "";
  if (!fId) {
    return { ok: false, order_id: oid, reason: "missing_fastrax_order_id" };
  }
  const field = ope13OrderIdField();
  const body = { [field]: fId };
  const r = await getOrderStatus(body);
  if (!r.ok) {
    const msg = (r && r.message) || "ope=13 error";
    const ts = new Date().toISOString();
    await client
      .from("fastrax_order_map")
      .update({
        last_error: String(msg).slice(0, 2_000),
        updated_at: ts,
      })
      .eq("order_id", oid);
    return { ok: false, order_id: oid, reason: "fastrax_api_error", error: String(msg) };
  }

  const sit = pickSitCode(r.parsed);
  const label = sitToLabel(sit, null);
  const lastSync = new Date().toISOString();
  await client
    .from("fastrax_order_map")
    .update({
      response: r.parsed && typeof r.parsed === "object" ? r.parsed : { data: r.parsed },
      fastrax_sit: sit != null ? String(sit) : null,
      fastrax_status_label: label,
      fastrax_status: "synced",
      status: "ok",
      last_sync_at: lastSync,
      last_error: null,
      updated_at: lastSync,
    })
    .eq("order_id", oid);

  return {
    ok: true,
    order_id: oid,
    fastrax_order_id: fId,
    sit,
    label,
    last_sync_at: lastSync,
  };
}