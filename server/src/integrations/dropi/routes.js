import { createRequireAdminMiddleware } from "../../adminAuth.js";
import { createApiKeyMiddleware } from "../../middleware/apiKey.js";
import { dropiConfigured } from "./client.js";
import { createDropiOrderForInternalOrder } from "./createOrderForInternal.js";
import { shapeError, pickErrorMessageString } from "./dropiErrors.js";
import { orderCanFulfillDropiTest } from "./orderDropiGates.js";
import { supabaseService } from "./db.js";
import { runDropiProductSync } from "./sync-products.js";
import { processDropiImageQueue } from "./sync-images.js";
import { syncDropiOrderStatus } from "./syncOrderStatus.js";

const requireAdmin = createRequireAdminMiddleware();
const requireApiKey = createApiKeyMiddleware();

/**
 * @param {Record<string, unknown> | null | undefined} m
 * @param {string} orderId
 * @param {boolean} includeResponse
 * @param {Record<string, unknown> | null} [r]
 */
function jsonMapResponse(m, orderId, { dropiCreated, fromExisting, includeResponse }, r) {
  const map = m && typeof m === "object" ? /** @type {Record<string, unknown>} */ (m) : null;
  const st = String(map?.dropi_status ?? map?.status ?? "");
  const out = {
    ok: true,
    order_id: orderId,
    has_dropi_items: true,
    dropi_created: dropiCreated,
    from_existing: fromExisting,
    dropi_order_id: (map?.dropi_order_id ?? r?.dropi_order_id) != null ? String(map?.dropi_order_id ?? r?.dropi_order_id) : null,
    dropi_order_code: (map?.dropi_order_code ?? r?.dropi_order_code) != null ? String(map?.dropi_order_code ?? r?.dropi_order_code) : null,
    map_id: map?.id != null ? map.id : (map?.order_id != null ? map.order_id : r?.map_id) ?? null,
    dropi_status: st || null,
    bridge_response: null,
  };
  if (includeResponse) {
    out.bridge_response = (map?.response ?? r?.bridge_response) != null ? map?.response ?? r?.bridge_response : null;
  }
  if (r && r.bridge_payload != null) {
    out.bridge_payload = r.bridge_payload;
  }
  return out;
}

function canReasonMessage(reason) {
  if (reason === "no_line_items") return "El pedido no tiene ítems.";
  if (reason === "dropi_missing_external_product_id") {
    return "Hay producto(s) con external_provider=dropi sin external_product_id en el catálogo.";
  }
  if (reason === "no_fulfillable_dropi" || reason === "no_product_ids") {
    return "El pedido no tiene productos con external_provider=dropi y external_product_id; no se puede enviar a Dropi.";
  }
  return "No se puede sincronizar este pedido con Dropi.";
}

/**
 * @param {string} label
 * @param {string} orderId
 * @param {unknown} e
 */
function logRouteCatch(label, orderId, e) {
  const o = e && typeof e === "object" && e !== null ? /** @type {Record<string, unknown>} */ (e) : null;
  console.error(label, {
    orderId,
    error: e,
    message: o && o.message != null ? o.message : (e instanceof Error ? e.message : undefined),
    code: o && o.code,
    details: o && o.details,
    hint: o && o.hint,
    stack: e instanceof Error ? e.stack : undefined,
  });
}

/**
 * @param {string} orderId
 * @param {unknown} e
 */
function jsonErrorBody(orderId, e) {
  const sh = shapeError(e);
  return {
    ok: false,
    order_id: orderId,
    error: pickErrorMessageString(e) || sh.error,
    error_message: sh.error_message,
    error_code: sh.error_code,
    error_details: sh.error_details,
    raw_error: sh.raw_error,
  };
}

/** Impide re-crear solo si ya hay pedido en Dropi o creación exitosa registrada. Falló sin id → se puede reintentar. */
function dropiMapBlocksRecreate(mapRow) {
  if (!mapRow || typeof mapRow !== "object") return false;
  const oid = /** @type {Record<string, unknown>} */ (mapRow).dropi_order_id;
  const hasOrderId = oid != null && String(oid).trim() !== "";
  const st = String(
    /** @type {Record<string, unknown>} */ (mapRow).dropi_status ??
      /** @type {Record<string, unknown>} */ (mapRow).status ??
      ""
  ).toLowerCase();
  return hasOrderId || st === "succeeded";
}

/**
 * Cuerpo JSON cuando `createDropiOrderForInternalOrder` devolvió ok: false.
 * @param {string} orderId
 * @param {Record<string, unknown>} r
 */
function jsonFromCreateResult(orderId, r) {
  const errStr =
    r.error != null
      ? (typeof r.error === "string" ? r.error : String(r.error))
      : r.error_message != null
        ? String(r.error_message)
        : r.reason != null
          ? String(r.reason)
          : "dropi_create_failed";
  const o = {
    ok: false,
    order_id: orderId,
    error: errStr,
    error_message: r.error_message,
    error_code: r.error_code,
    error_details: r.error_details,
    raw_error: r.raw_error,
    context: r.context,
    reason: r.reason,
  };
  if (r.bridge_payload != null) o.bridge_payload = r.bridge_payload;
  return o;
}

/**
 * @param {import('express').Express} app
 */
export function registerDropiRoutes(app) {
  app.post("/api/admin/dropi/sync-test", requireAdmin, async (req, res) => {
    try {
      const sb = supabaseService();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const idsRaw = body.ids;
      const ids = Array.isArray(idsRaw) ? idsRaw : undefined;
      const limitRaw = body.limit;
      const limitNum = limitRaw != null ? Number(limitRaw) : NaN;
      const limit = Number.isFinite(limitNum) && limitNum > 0 ? Math.min(500, Math.floor(limitNum)) : 10;

      const result =
        ids && ids.length > 0
          ? await runDropiProductSync(sb, { ids })
          : await runDropiProductSync(sb, { limit });

      return res.json({ ok: true, ...result });
    } catch (e) {
      console.error("[dropi/sync-test]", e);
      return res.status(502).json({
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  });

  app.post("/api/admin/dropi/sync-images", requireAdmin, async (req, res) => {
    try {
      const sb = supabaseService();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const retryFailed = body.retry_failed === true;
      const batchSize = Number(body.batch_size) || 40;

      if (retryFailed) {
        await sb.from("dropi_image_queue").update({ status: "pending", error: null }).eq("status", "failed");
      }

      const stats = await processDropiImageQueue(sb, { batchSize });
      return res.json({ ok: true, stats, retry_failed_applied: retryFailed });
    } catch (e) {
      console.error("[dropi/sync-images]", e);
      return res.status(502).json({
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  });

  app.get("/api/admin/dropi/status", requireAdmin, async (_req, res) => {
    try {
      const sb = supabaseService();
      const { count: pendingCount, error: pe } = await sb
        .from("dropi_image_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      if (pe) throw pe;

      const { count: failedCount, error: fe } = await sb
        .from("dropi_image_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed");

      if (fe) throw fe;

      const { data: lastRun, error: le } = await sb
        .from("dropi_sync_runs")
        .select("id, started_at, finished_at, status, mode, stats, error_message")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (le) throw le;

      return res.json({
        ok: true,
        configured: dropiConfigured(),
        queue_pending: pendingCount ?? 0,
        queue_failed: failedCount ?? 0,
        last_run: lastRun ?? null,
      });
    } catch (e) {
      console.error("[dropi/status]", e);
      return res.status(502).json({
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  });

  app.get("/api/admin/dropi/logs", requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 25));
      const sb = supabaseService();
      const { data: runs, error } = await sb
        .from("dropi_sync_runs")
        .select("id, started_at, finished_at, status, mode, stats, error_message, meta")
        .order("started_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      return res.json({ ok: true, runs: runs ?? [] });
    } catch (e) {
      console.error("[dropi/logs]", e);
      return res.status(502).json({
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  });

  /**
   * Prueba manual: `x-api-key` = API_PUBLIC_KEY | API_KEY. Reintento con ?force=1.
   * POST /api/admin/orders/:id/dropi/test-create?force=1
   */
  app.post("/api/admin/orders/:id/dropi/test-create", requireApiKey, async (req, res) => {
    const orderId = String(req.params.id || "").trim();
    const force =
      String(req.query?.force ?? "").trim() === "1" || String(req.query?.force ?? "").toLowerCase() === "true";

    if (!orderId) {
      return res.status(400).json({ ok: false, error: "id inválido" });
    }

    try {
      const sb = supabaseService();
      const { data: orderRow, error: oe } = await sb.from("orders").select("id").eq("id", orderId).maybeSingle();
      if (oe) throw oe;
      if (!orderRow?.id) {
        return res.status(404).json({ ok: false, order_id: orderId, error: "Pedido no encontrado" });
      }

      const can = await orderCanFulfillDropiTest(sb, orderId);
      if (!can.ok) {
        return res.status(422).json({
          ok: false,
          order_id: orderId,
          has_dropi_items: false,
          error: canReasonMessage(can.reason || "unknown"),
        });
      }

      const { data: mapBefore, error: me } = await sb
        .from("dropi_order_map")
        .select("*")
        .eq("order_id", orderId)
        .maybeSingle();
      if (me) throw me;

      const mSt = String(mapBefore?.dropi_status ?? mapBefore?.status ?? "");
      const mSucc = mSt === "succeeded" && mapBefore && mapBefore.dropi_order_id;
      if (mSucc) {
        return res.json(
          jsonMapResponse(mapBefore, orderId, {
            dropiCreated: false,
            fromExisting: true,
            includeResponse: true,
          }, null)
        );
      }
      if (mapBefore && !force) {
        return res.json(
          jsonMapResponse(mapBefore, orderId, {
            dropiCreated: mSt === "succeeded" && Boolean(mapBefore.dropi_order_id),
            fromExisting: true,
            includeResponse: true,
          }, null)
        );
      }

      const r = await createDropiOrderForInternalOrder(sb, orderId, {
        context: "admin_test",
        force: true,
        echoBridgePayload: true,
      });
      if (r.skipped === true) {
        const { data: map2 } = await sb.from("dropi_order_map").select("*").eq("order_id", orderId).maybeSingle();
        return res.json(
          jsonMapResponse(map2, orderId, { dropiCreated: false, fromExisting: true, includeResponse: true }, r)
        );
      }
      if (!r.ok) {
        return res.status(502).json(/** @type {Record<string, unknown>} */ (jsonFromCreateResult(orderId, r)));
      }

      const { data: mapAfter } = await sb.from("dropi_order_map").select("*").eq("order_id", orderId).maybeSingle();
      return res.json(
        jsonMapResponse(mapAfter, orderId, { dropiCreated: true, fromExisting: false, includeResponse: true }, r)
      );
    } catch (e) {
      logRouteCatch("[dropi/orders/test-create]", orderId, e);
      return res.status(500).json(/** @type {Record<string, unknown>} */ (jsonErrorBody(orderId, e)));
    }
  });

  /**
   * Estado de Dropi guardado (sin llamar a bridge). `x-api-key`.
   * GET /api/admin/orders/:id/dropi/status
   */
  app.get("/api/admin/orders/:id/dropi/status", requireApiKey, async (req, res) => {
    const orderId = String(req.params.id || "").trim();
    if (!orderId) {
      return res.status(400).json({ ok: false, error: "id inválido" });
    }
    try {
      const sb = supabaseService();
      const { data: orderRow, error: oe } = await sb.from("orders").select("id").eq("id", orderId).maybeSingle();
      if (oe) throw oe;
      if (!orderRow?.id) {
        return res.status(404).json({ ok: false, order_id: orderId, error: "Pedido no encontrado" });
      }
      const { data: map, error: me } = await sb
        .from("dropi_order_map")
        .select("*")
        .eq("order_id", orderId)
        .maybeSingle();
      if (me) throw me;
      if (!map) {
        return res.json({ ok: true, order_id: orderId, has_map: false, map: null });
      }
      return res.json({ ok: true, order_id: orderId, has_map: true, map });
    } catch (e) {
      logRouteCatch("[dropi/orders/status GET]", orderId, e);
      return res.status(500).json(/** @type {Record<string, unknown>} */ (jsonErrorBody(orderId, e)));
    }
  });

  /**
   * Sincronizar estado con bridge (o solo re-etiquetar desde `response` almacenado). `x-api-key`.
   * POST /api/admin/orders/:id/dropi/sync-status
   */
  app.post("/api/admin/orders/:id/dropi/sync-status", requireApiKey, async (req, res) => {
    const orderId = String(req.params.id || "").trim();
    if (!orderId) {
      return res.status(400).json({ ok: false, error: "id inválido" });
    }
    try {
      const sb = supabaseService();
      const { data: orderRow, error: oe } = await sb.from("orders").select("id").eq("id", orderId).maybeSingle();
      if (oe) throw oe;
      if (!orderRow?.id) {
        return res.status(404).json({ ok: false, order_id: orderId, error: "Pedido no encontrado" });
      }
      const r = await syncDropiOrderStatus(orderId);
      if (r.reason === "no_map" || r.reason === "load_error" || r.reason === "update_error" || r.reason === "bridge_error" || r.reason === "invalid_order_id") {
        if (r.reason === "no_map") {
          return res.status(404).json(r);
        }
        return res.status(502).json(r);
      }
      if (r.ok === false && r.reason === "missing_dropi_order_id") {
        return res.status(422).json(r);
      }
      if (r.ok === false && r.reason === "dropi_status_endpoint_pending") {
        return res.status(503).json(r);
      }
      if (r.ok === true) {
        return res.json({
          ok: true,
          order_id: r.order_id,
          dropi_order_id: r.dropi_order_id,
          dropi_status: r.dropi_status,
          dropi_status_label: r.dropi_status_label,
          last_sync_at: r.last_sync_at,
        });
      }
      return res.status(500).json(r);
    } catch (e) {
      logRouteCatch("[dropi/orders/sync-status]", orderId, e);
      return res.status(500).json(/** @type {Record<string, unknown>} */ (jsonErrorBody(orderId, e)));
    }
  });

  /**
   * Creación “definitiva” (misma lógica; sin reintento forzado; si ya hay mapa, devuelve el registro).
   * POST /api/admin/orders/:id/dropi/create
   */
  app.post("/api/admin/orders/:id/dropi/create", requireApiKey, async (req, res) => {
    const orderId = String(req.params.id || "").trim();
    if (!orderId) {
      return res.status(400).json({ ok: false, error: "id inválido" });
    }
    try {
      const sb = supabaseService();
      const { data: orderRow, error: oe } = await sb.from("orders").select("id").eq("id", orderId).maybeSingle();
      if (oe) throw oe;
      if (!orderRow?.id) {
        return res.status(404).json({ ok: false, order_id: orderId, error: "Pedido no encontrado" });
      }
      const can = await orderCanFulfillDropiTest(sb, orderId);
      if (!can.ok) {
        return res.status(422).json({
          ok: false,
          order_id: orderId,
          has_dropi_items: false,
          error: canReasonMessage(can.reason || "unknown"),
        });
      }
      const { data: mapEx, error: merr } = await sb
        .from("dropi_order_map")
        .select("*")
        .eq("order_id", orderId)
        .maybeSingle();
      if (merr) throw merr;
      if (mapEx && dropiMapBlocksRecreate(mapEx)) {
        return res.json(
          jsonMapResponse(mapEx, orderId, {
            dropiCreated:
              String(mapEx?.dropi_status ?? mapEx?.status ?? "").toLowerCase() === "succeeded" &&
              Boolean(mapEx?.dropi_order_id),
            fromExisting: true,
            includeResponse: false,
          }, null)
        );
      }
      const r = await createDropiOrderForInternalOrder(sb, orderId, { context: "admin_create" });
      if (r.skipped) {
        const { data: map2 } = await sb.from("dropi_order_map").select("*").eq("order_id", orderId).maybeSingle();
        return res.json(
          jsonMapResponse(map2, orderId, { dropiCreated: false, fromExisting: true, includeResponse: false }, r)
        );
      }
      if (!r.ok) {
        return res.status(502).json(/** @type {Record<string, unknown>} */ (jsonFromCreateResult(orderId, r)));
      }
      const { data: mapAfter } = await sb.from("dropi_order_map").select("*").eq("order_id", orderId).maybeSingle();
      return res.json(
        jsonMapResponse(mapAfter, orderId, { dropiCreated: true, fromExisting: false, includeResponse: false }, r)
      );
    } catch (e) {
      logRouteCatch("[dropi/orders/create]", orderId, e);
      return res.status(500).json(/** @type {Record<string, unknown>} */ (jsonErrorBody(orderId, e)));
    }
  });
}
