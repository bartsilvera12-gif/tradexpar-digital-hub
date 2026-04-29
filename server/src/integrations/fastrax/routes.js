import { createRequireAdminMiddleware } from "../../adminAuth.js";
import { createApiKeyMiddleware } from "../../middleware/apiKey.js";
import {
  fastraxCatalogImportAllowed,
  fastraxConfigured,
  fastraxEnabled,
  getFastraxImageOpe3,
  getVersion,
  listProductsPage,
} from "./client.js";
import { createFastraxOrderForInternalOrder, runFastraxInvoiceForMap } from "./createOrderForInternal.js";
import { supabaseService } from "./db.js";
import {
  importFastraxItemsToProducts,
  importFastraxSkusToProducts,
  searchFastraxReadonlyOpe4Ope2,
} from "./controlledCatalog.js";
import { runFastraxProductSync } from "./sync-products.js";
import { sitToLabel } from "./mapper.js";
import { syncFastraxOrderStatusForOrderId } from "./syncOrderStatus.js";
import { orderCanFulfillFastraxTest } from "./orderFastraxGates.js";

const requireAdmin = createRequireAdminMiddleware();
const requireApiKey = createApiKeyMiddleware();

const RESOLVED_API_KEY = String(
  process.env.API_PUBLIC_KEY || process.env.API_KEY || ""
).trim();
/**
 * Acepta `x-api-key` o sesión admin (JWT) para herramientas híbridas.
 */
function requireApiKeyOrAdmin(req, res, next) {
  const k = String(req.headers["x-api-key"] ?? "")
    .trim();
  if (RESOLVED_API_KEY && k && k === RESOLVED_API_KEY) {
    return next();
  }
  return requireAdmin(req, res, next);
}

function fstr(x) {
  if (x == null) return "";
  return String(x);
}

/**
 * @param {Record<string, unknown> | null | undefined} map
 * @returns {{
 *   fastrax_ped: string | null;
 *   fastrax_pdc: string | null;
 *   status_code: number | null;
 *   status_label: string;
 *   last_sync_at: string | null;
 *   error: string | null;
 * }}
 */
function buildFastraxTrackingFromMap(map) {
  if (!map || typeof map !== "object") {
    return {
      fastrax_ped: null,
      fastrax_pdc: null,
      status_code: null,
      status_label: "",
      last_sync_at: null,
      error: null,
    };
  }
  const pdcRaw = map.fastrax_pdc != null && fstr(map.fastrax_pdc).trim() ? fstr(map.fastrax_pdc).trim() : null;
  const pdc =
    pdcRaw || (map.fastrax_order_id && fstr(map.fastrax_order_id).trim() ? fstr(map.fastrax_order_id).trim() : null);
  const ped = map.fastrax_ped != null && fstr(map.fastrax_ped).trim() ? fstr(map.fastrax_ped).trim() : null;
  let codeNum = null;
  if (map.fastrax_status_code != null && !Number.isNaN(Number(map.fastrax_status_code))) {
    codeNum = Math.floor(Number(map.fastrax_status_code));
  } else if (map.fastrax_sit != null) {
    const s = fstr(map.fastrax_sit).replace(/^0+/, "") || fstr(map.fastrax_sit);
    if (s && !Number.isNaN(Number(s))) codeNum = Math.floor(Number(s));
  }
  const labelFrom = fstr(map.fastrax_status_label).trim();
  const label = labelFrom || (codeNum != null ? sitToLabel(codeNum, "Desconocido") : "");
  const e1 = fstr(map.error).trim();
  const e2 = fstr(map.last_error).trim();
  return {
    fastrax_ped: ped,
    fastrax_pdc: pdc,
    status_code: codeNum,
    status_label: label,
    last_sync_at: map.last_sync_at != null && fstr(map.last_sync_at) ? fstr(map.last_sync_at) : null,
    error: e1 || e2 || null,
  };
}

/**
 * @param {string} orderId
 * @param {Record<string, unknown> | null} map
 */
function buildFastraxAdminStatusPayload(orderId, map) {
  return {
    ok: true,
    provider: "fastrax",
    order_id: orderId,
    has_map: Boolean(map && (map.id != null || map.order_id != null)),
    map,
    tracking: buildFastraxTrackingFromMap(map),
  };
}

/**
 * ope=13, persiste y devuelve payload unificado.
 * @param {import("express").Response} res
 * @param {string} orderId
 */
async function sendFastraxStatusAfterSync(res, orderId) {
  const sb = supabaseService();
  const r = await syncFastraxOrderStatusForOrderId(orderId, sb);
  if (r && (r.reason === "not_configured" || r.reason === "fastrax_disabled")) {
    return res.status(503).json({ ok: false, reason: r.reason, order_id: orderId });
  }
  if (r && r.reason === "load_error") {
    return res.status(500).json({ ok: false, order_id: orderId, error: r.error || "load_error" });
  }
  if (r && r.reason === "no_map") {
    return res.status(404).json({ ok: false, order_id: orderId, reason: "no_map" });
  }
  const { data: map, error: me2 } = await sb.from("fastrax_order_map").select("*").eq("order_id", orderId).maybeSingle();
  if (me2) {
    return res.status(500).json({ ok: false, order_id: orderId, error: me2.message });
  }
  if (!map) {
    return res.status(404).json({ ok: false, order_id: orderId, reason: "no_map" });
  }
  const body = buildFastraxAdminStatusPayload(orderId, map);
  if (r && r.ok === false && r.error) {
    body.tracking = { ...body.tracking, error: fstr(r.error) };
  }
  return res.json(body);
}

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

  /**
   * Solo lectura: ope=4 (una página, tam ≤20) + ope=2 por fila. Auth: `x-api-key` o admin JWT.
   * Query: q, page, size, only_stock, opc. sku (solo detalle ope=2).
   */
  /**
   * Proxy a Fastrax ope=3 (imagen; no se persiste en DB).
   */
  app.get("/api/admin/fastrax/products/:sku/image/:img", requireApiKeyOrAdmin, async (req, res) => {
    if (!fastraxEnabled() || !fastraxConfigured()) {
      return res.status(503).json({ ok: false, error: "Fastrax no habilitado o no configurado" });
    }
    const sku = String(req.params.sku ?? "").trim();
    const nImg = Math.max(1, Math.floor(Number(req.params.img) || 1));
    if (!sku) {
      return res.status(400).json({ ok: false, error: "sku" });
    }
    const r = await getFastraxImageOpe3(sku, nImg);
    if (!r || !r.ok) {
      return res
        .status(502)
        .json({ ok: false, error: r && "message" in r && r.message ? r.message : "ope3" });
    }
    if (!r.body) {
      return res.status(502).json({ ok: false, error: "Cuerpo imagen vacío" });
    }
    res.setHeader("Content-Type", r.contentType || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).send(r.body);
  });

  app.get("/api/admin/fastrax/products/search", requireApiKeyOrAdmin, async (req, res) => {
    if (!fastraxEnabled() || !fastraxConfigured()) {
      return res.status(503).json({ ok: false, error: "Fastrax no habilitado o no configurado" });
    }
    const q = req.query.q != null && String(req.query.q).trim() ? String(req.query.q) : undefined;
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const size = Math.max(1, Math.min(20, Math.floor(Number(req.query.size) || 20)));
    const sku = req.query.sku != null && String(req.query.sku).trim() ? String(req.query.sku).trim() : undefined;
    const onlyQ = String(req.query.only_stock ?? "").toLowerCase();
    const only_stock = onlyQ === "1" || onlyQ === "true" || onlyQ === "yes" || onlyQ === "y";
    const r = await searchFastraxReadonlyOpe4Ope2({
      q: q || (req.query.search != null && String(req.query.search).trim() ? String(req.query.search) : undefined),
      page,
      size,
      only_stock,
      sku,
    });
    if (r && r.ok) {
      return res.json(r);
    }
    return res.status(502).json(
      r && typeof r === "object" ? { ...r, ok: false } : { ok: false, error: "fastrax_search_failed" }
    );
  });

  /** Buscador → `tradexpar.products` (items con datos y raw_detail; Bearer admin). */
  app.post("/api/admin/fastrax/import", requireAdmin, async (req, res) => {
    if (!fastraxCatalogImportAllowed()) {
      return res.status(503).json({
        ok: false,
        error: "Importación de catálogo desactivada: definí FASTRAX_ENABLED=true en el servidor.",
      });
    }
    if (!fastraxEnabled() || !fastraxConfigured()) {
      return res.status(503).json({ ok: false, error: "Fastrax no habilitado o no configurado" });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return res.status(400).json({ ok: false, error: "items requerido (array no vacío)" });
    }
    try {
      const sb = supabaseService();
      const result = await importFastraxItemsToProducts(sb, items);
      return res.json(result);
    } catch (e) {
      return res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  app.post("/api/admin/fastrax/products/import", requireAdmin, async (req, res) => {
    if (!fastraxCatalogImportAllowed()) {
      return res.status(503).json({
        ok: false,
        error: "Importación de catálogo desactivada: definí FASTRAX_ENABLED=true en el servidor.",
      });
    }
    if (!fastraxEnabled() || !fastraxConfigured()) {
      return res.status(503).json({ ok: false, error: "Fastrax no habilitado o no configurado" });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const skus = Array.isArray(body.skus) ? body.skus.map((s) => String(s).trim()).filter(Boolean) : [];
    if (skus.length === 0) {
      return res.status(400).json({ ok: false, error: "skus requerido (array no vacío)" });
    }
    try {
      const sb = supabaseService();
      const result = await importFastraxSkusToProducts(sb, skus);
      return res.json(result);
    } catch (e) {
      return res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  app.post("/api/admin/fastrax/sync-products", requireAdmin, async (req, res) => {
    if (!fastraxCatalogImportAllowed()) {
      return res.status(503).json({
        ok: false,
        error: "Sync de catálogo desactivado: definí FASTRAX_ENABLED=true en el servidor.",
      });
    }
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
   * - Sin `?live=1`: lee `fastrax_order_map` + `tracking` unificado.
   * - Con `?live=1`: ope=13, actualiza mapa, mismo JSON que POST /fastrax/sync-status.
   */
  app.get("/api/admin/orders/:orderId/fastrax/status", requireApiKey, async (req, res) => {
    const orderId = String(req.params.orderId || "").trim();
    const live =
      String(req.query?.live ?? "").trim() === "1" || String(req.query?.live ?? "").toLowerCase() === "true";
    if (!orderId) {
      return res.status(400).json({ ok: false, error: "orderId inválido" });
    }
    try {
      if (live) {
        if (!fastraxEnabled() || !fastraxConfigured()) {
          return res.status(503).json({ ok: false, error: "Fastrax no disponible" });
        }
        const sb0 = supabaseService();
        const { data: orderRow, error: oe } = await sb0.from("orders").select("id").eq("id", orderId).maybeSingle();
        if (oe) throw oe;
        if (!orderRow?.id) {
          return res.status(404).json({ ok: false, order_id: orderId, error: "Pedido no encontrado" });
        }
        return await sendFastraxStatusAfterSync(res, orderId);
      }
      const sb = supabaseService();
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
      return res.json(buildFastraxAdminStatusPayload(orderId, map));
    } catch (e) {
      console.error("[fastrax/status]", e);
      return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  /**
   * POST /api/admin/orders/:orderId/fastrax/sync-status — ope=13 y respuesta unificada (mismo cuerpo que GET ?live=1).
   */
  app.post("/api/admin/orders/:orderId/fastrax/sync-status", requireApiKey, async (req, res) => {
    const orderId = String(req.params.orderId || "").trim();
    if (!orderId) {
      return res.status(400).json({ ok: false, error: "orderId inválido" });
    }
    if (!fastraxEnabled() || !fastraxConfigured()) {
      return res.status(503).json({ ok: false, error: "Fastrax no disponible" });
    }
    try {
      const sb = supabaseService();
      const { data: orderRow, error: oe } = await sb.from("orders").select("id").eq("id", orderId).maybeSingle();
      if (oe) throw oe;
      if (!orderRow?.id) {
        return res.status(404).json({ ok: false, order_id: orderId, error: "Pedido no encontrado" });
      }
      return await sendFastraxStatusAfterSync(res, orderId);
    } catch (e) {
      console.error("[fastrax/sync-status]", e);
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
      const hasPdc =
        mapEx &&
        ((mapEx.fastrax_pdc != null && fstr(mapEx.fastrax_pdc).trim()) ||
          (mapEx.fastrax_order_id != null && fstr(mapEx.fastrax_order_id).trim()));
      if (hasPdc) {
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