import { createRequireAdminMiddleware } from "../../adminAuth.js";
import { dropiConfigured } from "./client.js";
import { supabaseService } from "./db.js";
import { runDropiProductSync } from "./sync-products.js";
import { processDropiImageQueue } from "./sync-images.js";

const requireAdmin = createRequireAdminMiddleware();

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
}
