import { supabaseService } from "./db.js";
import { fetchDropiBridgeGetOrderByDropiId } from "./client.js";
import { pickErrorMessageString } from "./dropiErrors.js";
import {
  extractDropiOrderStatusFromResponse,
  dropiStatusToCustomerLabel,
  dropiStatusToLineStatus,
  dropiLineStatusRank,
} from "./dropiStatusLabels.js";

/**
 * Baja el estado sincronizado a las líneas Dropi del pedido.
 *
 * Sin esto la sincronización solo tocaba `dropi_order_map`: el panel de pedidos lee
 * `order_items.line_status`, así que el estado «no se actualizaba» aunque el sync dijera OK.
 * Solo avanza (ver `dropiLineStatusRank`) para no pisar un cierre manual del operador.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} orderId
 * @param {string} rawStatus Estado crudo devuelto por Dropi
 * @returns {Promise<{ updated: number, line_status: string | null, error: string | null }>}
 */
async function propagateStatusToOrderItems(sb, orderId, rawStatus) {
  const target = dropiStatusToLineStatus(rawStatus);
  if (!target) return { updated: 0, line_status: null, error: null };

  const { data: rows, error: le } = await sb
    .from("order_items")
    .select("id, line_status")
    .eq("order_id", orderId)
    .eq("external_provider", "dropi");
  if (le) {
    return { updated: 0, line_status: target, error: pickErrorMessageString(le) };
  }

  const targetRank = dropiLineStatusRank(target);
  const pending = (Array.isArray(rows) ? rows : []).filter(
    (r) => r?.id && dropiLineStatusRank(r.line_status) < targetRank
  );
  if (pending.length === 0) return { updated: 0, line_status: target, error: null };

  const { data: done, error: ue } = await sb
    .from("order_items")
    .update({ line_status: target, external_status: String(rawStatus).slice(0, 200) })
    .in(
      "id",
      pending.map((r) => String(r.id))
    )
    .select("id");
  if (ue) {
    return { updated: 0, line_status: target, error: pickErrorMessageString(ue) };
  }
  return { updated: Array.isArray(done) ? done.length : 0, line_status: target, error: null };
}

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
    return { ok: false, reason: "invalid_order_id", error: "Id de pedido inválido." };
  }

  console.info("[dropi/status-sync] start", { order_id: oid });

  // `supabaseService()` lanza si faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, y el select
  // puede rechazar por red o por schema inexistente. Sin este guard, ambos escapaban al
  // `catch` de la ruta y salían como 500 «Error interno» sin causa visible para el admin.
  let sb;
  let map;
  try {
    sb = supabaseService();
    const { data, error: me } = await sb.from("dropi_order_map").select("*").eq("order_id", oid).maybeSingle();
    if (me) {
      const err = pickErrorMessageString(me);
      console.error("[dropi/status-sync] error", { order_id: oid, err });
      return { ok: false, reason: "load_error", order_id: oid, error: err };
    }
    map = data;
  } catch (e) {
    const err = pickErrorMessageString(e) || (e instanceof Error ? e.message : String(e));
    console.error("[dropi/status-sync] error", { order_id: oid, err });
    return { ok: false, reason: "load_error", order_id: oid, error: err };
  }

  if (!map || typeof map !== "object") {
    return {
      ok: false,
      reason: "no_map",
      order_id: oid,
      error: "El pedido no tiene registro en Dropi (`dropi_order_map`). Creálo en Dropi antes de sincronizar.",
    };
  }

  const m = /** @type {Record<string, unknown>} */ (map);
  console.info("[dropi/status-sync] map loaded", {
    order_id: oid,
    dropi_order_id: m.dropi_order_id ?? null,
  });

  const exId = m.dropi_order_id != null && String(m.dropi_order_id).trim() !== "" ? String(m.dropi_order_id).trim() : "";
  if (!exId) {
    return {
      ok: false,
      reason: "missing_dropi_order_id",
      order_id: oid,
      error: "El registro Dropi existe pero no tiene `dropi_order_id`: la creación del pedido en Dropi no se completó. Reintentá la creación.",
    };
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
      // Sin fallback a `remote.status`: en el sobre del bridge eso es el estado HTTP (200),
      // no el del pedido. `extractDropiOrderStatusFromResponse` ya cubre las claves válidas.
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
  if (!stRaw) {
    // Antes se guardaba "unknown" y se devolvía ok:true: el panel mostraba un estado inventado
    // como si la sincronización hubiera funcionado. Mejor fallar de forma explícita.
    console.error("[dropi/status-sync] estado ilegible", { order_id: oid, dropi_order_id: exId });
    return {
      ok: false,
      reason: "dropi_status_unreadable",
      order_id: oid,
      dropi_order_id: exId,
      error: "Dropi respondió sin un estado reconocible para el pedido. Revisá el JSON en `dropi_order_map.response`.",
    };
  }
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
