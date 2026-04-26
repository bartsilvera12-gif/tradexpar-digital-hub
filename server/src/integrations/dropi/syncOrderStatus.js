import { supabaseService } from "./db.js";
import { fetchDropiBridgeGetOrderByDropiId } from "./client.js";
import { pickErrorMessageString } from "./dropiErrors.js";
import { extractDropiOrderStatusFromResponse, dropiStatusToCustomerLabel } from "./dropiStatusLabels.js";

function utcNowIso() {
  return new Date().toISOString();
}

/**
 * Sincroniza el estado lógico del pedido en Dropi leyendo el bridge o el JSON almacenado.
 * @param {string} orderId UUID pedido interno
 * @returns {Promise<Record<string, unknown>>}
 */
export async function syncDropiOrderStatus(orderId) {
  const oid = String(orderId || "").trim();
  if (!oid) {
    return { ok: false, reason: "invalid_order_id" };
  }

  console.info("[dropi/status-sync] start", { order_id: oid });
  const sb = supabaseService();
  const { data: map, error: me } = await sb.from("dropi_order_map").select("*").eq("order_id", oid).maybeSingle();
  if (me) {
    const err = pickErrorMessageString(me);
    console.error("[dropi/status-sync] error", { order_id: oid, err });
    return { ok: false, reason: "load_error", order_id: oid, error: err };
  }
  if (!map || typeof map !== "object") {
    return { ok: false, reason: "no_map", order_id: oid };
  }

  const m = /** @type {Record<string, unknown>} */ (map);
  console.info("[dropi/status-sync] map loaded", {
    order_id: oid,
    dropi_order_id: m.dropi_order_id ?? null,
  });

  const exId = m.dropi_order_id != null && String(m.dropi_order_id).trim() !== "" ? String(m.dropi_order_id).trim() : "";
  if (!exId) {
    return { ok: false, reason: "missing_dropi_order_id", order_id: oid };
  }

  let newResponse = m.response;
  let statusCode = null;
  let statusLabel = null;
  let fromBridge = false;

  try {
    const remote = await fetchDropiBridgeGetOrderByDropiId(exId);
    if (remote != null) {
      fromBridge = true;
      newResponse = /** @type {Record<string, unknown>} */ (remote);
      const ext = extractDropiOrderStatusFromResponse(/** @type {Record<string, unknown>} */ (remote));
      statusCode = ext.code;
      statusLabel = ext.name ? dropiStatusToCustomerLabel(ext.name) : null;
      if (!statusCode) {
        const r0 = /** @type {Record<string, unknown>} */ (remote);
        const s = r0?.status_name ?? r0?.status;
        if (s != null && s !== "" && (typeof s === "string" || typeof s === "number")) {
          statusCode = String(s);
          if (!statusLabel) statusLabel = dropiStatusToCustomerLabel(String(s));
        }
      }
    }
  } catch (e) {
    const msg = pickErrorMessageString(e) || (e instanceof Error ? e.message : String(e));
    const ts = utcNowIso();
    await sb
      .from("dropi_order_map")
      .update({
        last_error: msg.slice(0, 2000),
        error: msg.slice(0, 2000),
        last_sync_at: ts,
        updated_at: ts,
      })
      .eq("order_id", oid);
    console.error("[dropi/status-sync] error", { order_id: oid, err: msg });
    return { ok: false, reason: "bridge_error", order_id: oid, error: msg };
  }

  if (!fromBridge) {
    const last = m.response;
    if (last && typeof last === "object" && !Array.isArray(last)) {
      const ext2 = extractDropiOrderStatusFromResponse(/** @type {Record<string, unknown>} */ (last));
      if (ext2.name || ext2.code) {
        statusCode = ext2.code;
        statusLabel = ext2.name ? dropiStatusToCustomerLabel(ext2.name) : (ext2.code ? dropiStatusToCustomerLabel(ext2.code) : null);
        console.info("[dropi/status-sync] bridge request", { order_id: oid, mode: "from_stored_response" });
      } else {
        return {
          ok: false,
          reason: "dropi_status_endpoint_pending",
          order_id: oid,
          dropi_order_id: exId,
        };
      }
    } else {
      return {
        ok: false,
        reason: "dropi_status_endpoint_pending",
        order_id: oid,
        dropi_order_id: exId,
      };
    }
  } else {
    console.info("[dropi/status-sync] bridge request", { order_id: oid, mode: "get", dropi_order_id: exId });
  }

  let stRaw = statusCode && String(statusCode).trim() ? String(statusCode).trim() : "";
  if (!stRaw && m.dropi_status != null && String(m.dropi_status).trim()) {
    stRaw = String(m.dropi_status).trim();
  }
  if (!stRaw && statusLabel && statusLabel !== "—") stRaw = statusLabel;
  if (!stRaw) stRaw = "unknown";
  const labelFinal =
    statusLabel && statusLabel !== "—" ? statusLabel : dropiStatusToCustomerLabel(stRaw);
  const ts2 = utcNowIso();

  const resPayload = fromBridge ? newResponse : m.response;
  const { error: upE } = await sb
    .from("dropi_order_map")
    .update({
      dropi_status: stRaw,
      dropi_status_label: labelFinal,
      response: resPayload,
      last_sync_at: ts2,
      last_error: null,
      error: null,
      updated_at: ts2,
    })
    .eq("order_id", oid);

  if (upE) {
    const msg = pickErrorMessageString(upE);
    console.error("[dropi/status-sync] error", { order_id: oid, err: msg });
    return { ok: false, reason: "update_error", order_id: oid, error: msg };
  }

  const out = {
    ok: true,
    order_id: oid,
    dropi_order_id: exId,
    dropi_status: stRaw,
    dropi_status_label: labelFinal,
    last_sync_at: ts2,
  };
  console.info("[dropi/status-sync] success", out);
  return out;
}
