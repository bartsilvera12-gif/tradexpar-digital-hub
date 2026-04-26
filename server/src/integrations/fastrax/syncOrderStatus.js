/**
 * ope=13: preferir pdc; si no hay, ped. Vector/estatus vía client.
 */

import { queryFastraxOrderStatus13, fastraxConfigured, fastraxEnabled } from "./client.js";
import { pickSitCode, sitToLabel } from "./mapper.js";
import { supabaseService } from "./db.js";

/**
 * @param {string} orderId
 * @param {import('@supabase/supabase-js').SupabaseClient} [sb]
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

  const pdc = map.fastrax_pdc != null && String(map.fastrax_pdc).trim() ? String(map.fastrax_pdc).trim() : "";
  const ped = map.fastrax_ped != null && String(map.fastrax_ped).trim() ? String(map.fastrax_ped).trim() : oid;
  const body = pdc ? { pdc } : { ped };
  const r0 = await queryFastraxOrderStatus13(body);
  const lastSync = new Date().toISOString();
  if (!r0 || r0.ok === false) {
    const errMsg = str(r0 && (r0.message || r0.cestatus)) || "ope=13 error";
    await client
      .from("fastrax_order_map")
      .update({
        last_error: errMsg.slice(0, 2_000),
        error: errMsg.slice(0, 2_000),
        response: r0 && r0.parsed && typeof r0.parsed === "object" ? r0.parsed : { err: errMsg },
        updated_at: lastSync,
      })
      .eq("order_id", oid);
    return { ok: false, order_id: oid, reason: "fastrax_api_error", error: errMsg };
  }

  const sit = pickSitCode(r0.parsed);
  const codeNum = sit != null && !Number.isNaN(Number(sit)) ? Math.floor(Number(sit)) : null;
  const label = sitToLabel(sit, null);
  await client
    .from("fastrax_order_map")
    .update({
      response: r0.parsed && typeof r0.parsed === "object" ? r0.parsed : { data: r0.parsed },
      fastrax_sit: sit != null ? str(sit) : null,
      fastrax_status_code: codeNum,
      fastrax_status_label: label,
      fastrax_status: "synced",
      status: "ok",
      last_sync_at: lastSync,
      last_error: null,
      error: null,
      updated_at: lastSync,
    })
    .eq("order_id", oid);
  return {
    ok: true,
    order_id: oid,
    fastrax_pdc: pdc || null,
    fastrax_ped: ped,
    sit,
    fastrax_status_code: codeNum,
    label,
    last_sync_at: lastSync,
  };
}

function str(x) {
  if (x == null) return "";
  return String(x);
}
