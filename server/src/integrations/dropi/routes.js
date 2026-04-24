import { createRequireAdminMiddleware } from "../../adminAuth.js";
import { dropiConfigured } from "./client.js";
import { createDropiOrderForInternalOrder } from "./createOrderForInternal.js";
import { supabaseService } from "./db.js";
import { runDropiProductSync } from "./sync-products.js";
import { processDropiImageQueue } from "./sync-images.js";

const requireAdmin = createRequireAdminMiddleware();

/**
 * Misma regla que createOrderForInternal: al menos un ítem listo; si alguna línea es Dropi sin
 * `external_product_id`, el flujo no es válido (falle create).
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} orderId
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function orderCanFulfillDropiTest(sb, orderId) {
  const { data: items, error: ie } = await sb
    .from("order_items")
    .select("product_id")
    .eq("order_id", orderId);
  if (ie) throw ie;
  const rows = Array.isArray(items) ? items : [];
  if (rows.length === 0) {
    return { ok: false, reason: "no_line_items" };
  }
  const pids = [...new Set(rows.map((r) => r && r.product_id).filter(Boolean).map(String))];
  if (pids.length === 0) {
    return { ok: false, reason: "no_product_ids" };
  }
  const { data: prows, error: pe } = await sb
    .from("products")
    .select("id, product_source_type, external_provider, external_product_id")
    .in("id", pids);
  if (pe) throw pe;
  let hasDropiWithExt = false;
  let hasDropiMissingExt = false;
  for (const p of prows ?? []) {
    const r = p && typeof p === "object" ? p : {};
    const pst = String(r.product_source_type ?? "");
    const prov = String(r.external_provider ?? "");
    const isDropi = pst === "dropi" || prov === "dropi";
    if (!isDropi) continue;
    const extP = r.external_product_id != null ? String(r.external_product_id).trim() : "";
    if (extP) {
      hasDropiWithExt = true;
    } else {
      hasDropiMissingExt = true;
    }
  }
  if (hasDropiMissingExt) {
    return { ok: false, reason: "dropi_missing_external_product_id" };
  }
  if (!hasDropiWithExt) {
    return { ok: false, reason: "no_fulfillable_dropi" };
  }
  return { ok: true };
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
   * Prueba manual: creación Dropi sin Pagopar. No toca payment_status, webhook ni create-payment.
   * Reintento si ?force=1 cuando el mapa está `failed` o `pending` (nunca pisa `succeeded`).
   * POST /api/admin/orders/:orderId/dropi/test-create
   */
  app.post("/api/admin/orders/:orderId/dropi/test-create", requireAdmin, async (req, res) => {
    const orderId = String(req.params.orderId || "").trim();
    const force =
      String(req.query?.force ?? "").trim() === "1" ||
      String(req.query?.force ?? "").toLowerCase() === "true";

    console.info("[dropi/orders/test] requested", { orderId, force });

    if (!orderId) {
      return res.status(400).json({
        success: false,
        status: null,
        dropi_order_id: null,
        dropi_order_url: null,
        error: "orderId inválido",
      });
    }

    try {
      const sb = supabaseService();

      const { data: orderRow, error: oe } = await sb.from("orders").select("id").eq("id", orderId).maybeSingle();
      if (oe) throw oe;
      if (!orderRow?.id) {
        return res.status(404).json({
          success: false,
          status: null,
          dropi_order_id: null,
          dropi_order_url: null,
          error: "Pedido no encontrado",
        });
      }

      const { data: mapBefore, error: me } = await sb
        .from("dropi_order_map")
        .select("status, dropi_order_id, dropi_order_url, last_error")
        .eq("order_id", orderId)
        .maybeSingle();
      if (me) throw me;

      if (mapBefore?.status === "succeeded" && mapBefore?.dropi_order_id) {
        console.info("[dropi/orders/test] skipped existing", { orderId, reason: "already_succeeded" });
        return res.json({
          success: true,
          skipped: true,
          reason: "already_succeeded",
          status: mapBefore.status,
          dropi_order_id: mapBefore.dropi_order_id,
          dropi_order_url: mapBefore.dropi_order_url ?? null,
          error: mapBefore.last_error ?? null,
        });
      }

      const st = mapBefore?.status;
      if ((st === "failed" || st === "pending") && !force) {
        console.info("[dropi/orders/test] skipped existing", { orderId, reason: "needs_force", map_status: st });
        return res.status(409).json({
          success: false,
          skipped: true,
          reason: "needs_query_param_force",
          status: st ?? null,
          dropi_order_id: mapBefore?.dropi_order_id ?? null,
          dropi_order_url: mapBefore?.dropi_order_url ?? null,
          error: "Reintento solo con ?force=1 (el mapa está failed o pending).",
        });
      }

      const dropiCheck = await orderCanFulfillDropiTest(sb, orderId);
      if (!dropiCheck.ok) {
        const msg =
          dropiCheck.reason === "no_line_items"
            ? "El pedido no tiene ítems."
            : dropiCheck.reason === "dropi_missing_external_product_id"
              ? "Hay producto(s) Dropi sin external_product_id en el catálogo."
              : "El pedido no tiene líneas con producto Dropi y external_product_id; no se puede enviar a Dropi.";
        return res.status(422).json({
          success: false,
          status: mapBefore?.status ?? null,
          dropi_order_id: mapBefore?.dropi_order_id ?? null,
          dropi_order_url: mapBefore?.dropi_order_url ?? null,
          error: msg,
        });
      }

      const r = await createDropiOrderForInternalOrder(sb, orderId);

      const { data: mapAfter, error: ae } = await sb
        .from("dropi_order_map")
        .select("status, dropi_order_id, dropi_order_url, last_error")
        .eq("order_id", orderId)
        .maybeSingle();
      if (ae) throw ae;

      const errOut =
        mapAfter?.last_error != null && String(mapAfter.last_error).trim() !== ""
          ? String(mapAfter.last_error)
          : r && r.error != null && String(r.error) !== ""
            ? String(r.error)
            : null;

      const fromMap = Boolean(mapAfter?.dropi_order_id) && mapAfter?.status === "succeeded";
      const fromResult = r && r.ok === true && (r.dropi_order_id != null && String(r.dropi_order_id).trim() !== "");
      const success = fromMap || fromResult;

      if (success) {
        console.info("[dropi/orders/test] success", { orderId, dropi_order_id: mapAfter?.dropi_order_id ?? r?.dropi_order_id });
      } else if (mapAfter || r) {
        console.warn("[dropi/orders/test] failed", { orderId, map_status: mapAfter?.status, error: errOut, reason: r?.reason });
      }

      return res.json({
        success,
        skipped: r.skipped === true,
        reason: r?.reason,
        status: mapAfter?.status ?? (fromResult ? "succeeded" : null),
        dropi_order_id: mapAfter?.dropi_order_id ?? r?.dropi_order_id ?? null,
        dropi_order_url: mapAfter?.dropi_order_url ?? r?.dropi_order_url ?? null,
        error: success ? null : errOut,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[dropi/orders/test] failed", { orderId, error: msg });
      return res.status(500).json({
        success: false,
        status: null,
        dropi_order_id: null,
        dropi_order_url: null,
        error: msg,
      });
    }
  });
}
