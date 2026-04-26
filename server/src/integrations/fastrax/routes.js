import { createRequireAdminMiddleware } from "../../adminAuth.js";
import { createApiKeyMiddleware } from "../../middleware/apiKey.js";
import { fastraxConfigured, fastraxEnabled, getVersion, listProductsPage } from "./client.js";
import { createFastraxOrderForInternalOrder, runFastraxInvoiceForMap } from "./createOrderForInternal.js";
import { supabaseService } from "./db.js";
import { runFastraxProductSync } from "./sync-products.js";
import { syncFastraxOrderStatusForOrderId } from "./syncOrderStatus.js";
import { orderCanFulfillFastraxTest } from "./orderFastraxGates.js";

const requireAdmin = createRequireAdminMiddleware();
const requireApiKey = createApiKeyMiddleware();

/**
 * @param {import('express').Express} app
 */
export function registerFastraxRoutes(app) {
  app.get("/api/fastrax/health", async (_req, res) => {
    const c = getFastraxCredsShallow();
    return res.json({
      ok: true,
      service: "fastrax",
      enabled: fastraxEnabled(),
      configured: fastraxConfigured(),
      has_url: Boolean(c.url),
      has_cod: Boolean(c.cod),
      has_pass: Boolean(c.pass),
    });
  });

  app.get("/api/fastrax/version", requireApiKey, async (_req, res) => {
    if (!fastraxEnabled() || !fastraxConfigured()) {
      return res.status(503).json({ ok: false, error: "Fastrax no habilitado o no configurado" });
    }
    const r = await getVersion();
    if (!r.ok) {
      return res.status(502).json({ ok: false, message: r.message, parsed: r.parsed });
    }
    return res.json({ ok: true, ope: 10, data: r.parsed });
  });

  app.get("/api/fastrax/products/page", requireApiKey, async (req, res) => {
    if (!fastraxEnabled() || !fastraxConfigured()) {
      return res.status(503).json({ ok: false, error: "Fastrax no habilitado o no configurado" });
    }
    const p = Math.max(1, Number(req.query.page) || 1);
    const r = await listProductsPage(p);
    if (!r.ok) {
      return res.status(502).json({ ok: false, message: r.message, ope4_page: p, parsed: r.parsed });
    }
    return res.json({ ok: true, ope: 4, page: p, data: r.parsed });
  });

  app.post("/api/admin/fastrax/sync-products", requireAdmin, async (req, res) => {
    if (!fastraxEnabled()) {
      return res.status(503).json({ ok: false, error: "FASTRAX_ENABLED=0" });
    }
    if (!fastraxConfigured()) {
      return res.status(503).json({ ok: false, error: "Falta FASTRAX_API_URL / CÓD / PASS" });
    }
    try {
      const sb = supabaseService();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const maxPages = body.max_pages != null ? Number(body.max_pages) : undefined;
      const mergeOpe98 = body.merge_ope_98 === false ? false : true;
      const result = await runFastraxProductSync(sb, { maxPages, mergeOpe98 });
      return res.json(result);
    } catch (e) {
      console.error("[fastrax/sync-products]", e);
      return res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  /**
   * GET /api/admin/orders/:orderId/fastrax/status
   * - Sin query `live`: lee `fastrax_order_map` (como Dropi GET status).
   * - Con `?live=1`: ope=13 y actualiza mapa.
   */
  app.get("/api/admin/orders/:orderId/fastrax/status", requireApiKey, async (req, res) => {
    const orderId = String(req.params.orderId || "").trim();
    const live = String(req.query?.live ?? "").trim() === "1" || String(req.query?.live ?? "").toLowerCase() === "true";
    if (!orderId) {
      return res.status(400).json({ ok: false, error: "orderId inválido" });
    }
    try {
      const sb = supabaseService();
      if (live) {
        const r = await syncFastraxOrderStatusForOrderId(orderId, sb);
        if (r?.ok === true) {
          return res.json({ ok: true, order_id: orderId, source: "fastrax", live: true, ...r });
        }
        if (r?.reason === "no_map") {
          return res.status(404).json(r);
        }
        if (r?.reason === "not_configured" || r?.reason === "fastrax_disabled") {
          return res.status(503).json(r);
        }
        return res.status(502).json(r);
      }

      const { data: orderRow, error: oe } = await sb.from("orders").select("id").eq("id", orderId).maybeSingle();
      if (oe) throw oe;
      if (!orderRow?.id) {
        return res.status(404).json({ ok: false, order_id: orderId, error: "Pedido no encontrado" });
      }
      const { data: map, error: me } = await sb
        .from("fastrax_order_map")
        .select("*")
        .eq("order_id", orderId)
        .maybeSingle();
      if (me) throw me;
      if (!map) {
        return res.json({ ok: true, order_id: orderId, has_map: false, map: null });
      }
      const st = String(map.fastrax_status ?? map.status ?? "");
      const m = { ...map };
      return res.json({ ok: true, order_id: orderId, has_map: true, map: m, status: st || null });
    } catch (e) {
      console.error("[fastrax/status]", e);
      return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/admin/orders/:orderId/fastrax/create", requireApiKey, async (req, res) => {
    const orderId = String(req.params.orderId || "").trim();
    if (!orderId) {
      return res.status(400).json({ ok: false, error: "orderId inválido" });
    }
    try {
      if (!fastraxEnabled() || !fastraxConfigured()) {
        return res.status(503).json({ ok: false, error: "Fastrax no disponible" });
      }
      const sb = supabaseService();
      const { data: orderRow, error: oe } = await sb.from("orders").select("id").eq("id", orderId).maybeSingle();
      if (oe) throw oe;
      if (!orderRow?.id) {
        return res.status(404).json({ ok: false, order_id: orderId, error: "Pedido no encontrado" });
      }
      const can = await orderCanFulfillFastraxTest(sb, orderId);
      if (!can.ok) {
        return res.status(422).json({
          ok: false,
          order_id: orderId,
          error: "No hay ítems Fastrax o faltan datos",
        });
      }
      const { data: mapEx } = await sb.from("fastrax_order_map").select("*").eq("order_id", orderId).maybeSingle();
      if (mapEx && (mapEx.fastrax_pdc || mapEx.fastrax_order_id)) {
        return res.json({ ok: true, order_id: orderId, skipped: true, map: mapEx });
      }
      const r = await createFastraxOrderForInternalOrder(sb, orderId, { context: "admin" });
      if (r.ok === false) {
        return res.status(502).json(r);
      }
      const { data: map2 } = await sb.from("fastrax_order_map").select("*").eq("order_id", orderId).maybeSingle();
      return res.json({ ok: true, ...r, map: map2 ?? null });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/admin/orders/:orderId/fastrax/invoice", requireApiKey, async (req, res) => {
    const orderId = String(req.params.orderId || "").trim();
    if (!orderId) {
      return res.status(400).json({ ok: false, error: "orderId inválido" });
    }
    try {
      if (!fastraxEnabled() || !fastraxConfigured()) {
        return res.status(503).json({ ok: false, error: "Fastrax no disponible" });
      }
      const sb = supabaseService();
      const { data: orderRow, error: oe } = await sb.from("orders").select("id").eq("id", orderId).maybeSingle();
      if (oe) throw oe;
      if (!orderRow?.id) {
        return res.status(404).json({ ok: false, order_id: orderId, error: "Pedido no encontrado" });
      }
      const r = await runFastraxInvoiceForMap(sb, orderId);
      if (!r.ok) {
        return res.status(502).json({ ok: false, order_id: orderId, ...r });
      }
      const { data: map2 } = await sb.from("fastrax_order_map").select("*").eq("order_id", orderId).maybeSingle();
      return res.json({ ok: true, order_id: orderId, map: map2 ?? null, parsed: r.parsed });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
}

/**
 * @returns {{ url: string, cod: string, pass: string }}
 */
function getFastraxCredsShallow() {
  return {
    url: String(process.env.FASTRAX_API_URL || "").trim(),
    cod: String(process.env.FASTRAX_COD || "").trim(),
    pass: String(process.env.FASTRAX_PASS || "").trim() ? "set" : "",
  };
}