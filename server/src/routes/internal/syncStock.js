/**
 * POST /api/internal/sync-stock — sincroniza stock Dropi + Fastrax (header x-api-key = INTERNAL_API_KEY).
 */
import { syncAllStock } from "../../services/syncStockService.js";

/**
 * @param {import('express').Express} app
 */
export function registerInternalSyncStockRoutes(app) {
  app.post("/api/internal/sync-stock", async (req, res) => {
    const expected = String(process.env.INTERNAL_API_KEY ?? "").trim();
    const key = req.headers["x-api-key"];
    if (!expected) {
      console.warn("[internal/sync-stock] INTERNAL_API_KEY no definido; rechazando.");
      return res.status(503).json({
        ok: false,
        error: "INTERNAL_API_KEY no configurado",
        dropi_updated: 0,
        fastrax_updated: 0,
        errors: ["server: INTERNAL_API_KEY no configurado"],
      });
    }
    if (key !== expected) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    try {
      const out = await syncAllStock();
      return res.status(200).json({
        ok: out.ok,
        dropi_updated: out.dropi_updated,
        fastrax_updated: out.fastrax_updated,
        errors: out.errors,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[internal/sync-stock]", e);
      return res.status(500).json({
        ok: false,
        dropi_updated: 0,
        fastrax_updated: 0,
        errors: [msg],
      });
    }
  });
}
