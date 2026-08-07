import { createRequireAdminMiddleware } from "../../adminAuth.js";
import { createApiKeyMiddleware, resolveApiKey } from "../../middleware/apiKey.js";
import { fastraxConfigured, fastraxEnabled, getFastraxImageOpe3, getVersion, listProductsPage } from "./client.js";
import { createFastraxOrderForInternalOrder, runFastraxInvoiceForMap } from "./createOrderForInternal.js";
import { supabaseService } from "./db.js";
import {
  importFastraxItemsToProducts,
  importFastraxPageRangeWithBatch,
  importFastraxPageWithBatch,
  importFastraxSkusToProducts,
  loadFastraxBatchDetailsForSkus,
  searchFastraxAllPagesOpe4Global,
  searchFastraxFastListOpe4Only,
  searchFastraxReadonlyOpe4Ope2,
} from "./controlledCatalog.js";
import { runFastraxProductSync } from "./sync-products.js";
import {
  getLastSuccessfulSyncAt,
  getLastSyncRun,
  isFastraxSyncRunning,
  runFastraxCatalogSync,
} from "./sync-catalog.js";
import { fastraxPost, listBalancesOpe98, listProductsOpe1 } from "./client.js";
import { extractProductRows, mapFastraxRowToProduct } from "./mapper.js";
import { computeFastraxStockCrc, deriveFastraxActive } from "./fastraxProductUpsert.js";
import { sitToLabel } from "./mapper.js";
import { syncFastraxOrderStatusForOrderId } from "./syncOrderStatus.js";
import { orderCanFulfillFastraxTest } from "./orderFastraxGates.js";

const requireAdmin = createRequireAdminMiddleware("fastrax");
const requireApiKey = createApiKeyMiddleware();

/**
 * Acepta `x-api-key` o sesión admin (JWT) para herramientas híbridas.
 * La clave se resuelve por request: a nivel de módulo se leería antes del `dotenv.config()`
 * de `index.js` (los `import` de ESM se evalúan primero) y quedaría vacía → 401 permanente.
 */
function requireApiKeyOrAdmin(req, res, next) {
  const resolved = resolveApiKey();
  const k = String(req.headers["x-api-key"] ?? "")
    .trim();
  if (resolved && k && k === resolved) {
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

  /**
   * GET /api/admin/fastrax/products/list-fast — solo ope=4, sin ope=2.
   * Útil para paginar rápido en el admin; los detalles se cargan después con
   * `/products/details-batch` cuando el admin lo pida.
   */
  app.get("/api/admin/fastrax/products/list-fast", requireApiKeyOrAdmin, async (req, res) => {
    if (!fastraxEnabled() || !fastraxConfigured()) {
      return res.status(503).json({ ok: false, error: "Fastrax no habilitado o no configurado" });
    }
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const size = Math.max(1, Math.min(500, Math.floor(Number(req.query.size) || 50)));
    const onlyQ = String(req.query.only_stock ?? "").toLowerCase();
    const only_stock = onlyQ === "1" || onlyQ === "true" || onlyQ === "yes" || onlyQ === "y";
    const q = req.query.q != null && String(req.query.q).trim() ? String(req.query.q) : undefined;
    const r = await searchFastraxFastListOpe4Only({ page, size, only_stock, q });
    if (r && r.ok) {
      return res.json(r);
    }
    return res.status(502).json(
      r && typeof r === "object" ? { ...r, ok: false } : { ok: false, error: "fastrax_list_fast_failed" }
    );
  });

  /**
   * POST /api/admin/fastrax/products/details-batch — ope=2 en lote para los SKUs
   * recibidos (max 500 por request). No persiste nada.
   * Body: { skus: string[], batch_size?: number, concurrency?: number }
   */
  app.post("/api/admin/fastrax/products/details-batch", requireApiKeyOrAdmin, async (req, res) => {
    if (!fastraxEnabled() || !fastraxConfigured()) {
      return res.status(503).json({ ok: false, error: "Fastrax no habilitado o no configurado" });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const rawSkus = Array.isArray(body.skus) ? body.skus : [];
    const skus = rawSkus.map((s) => (s == null ? "" : String(s).trim())).filter(Boolean).slice(0, 500);
    if (skus.length === 0) {
      return res.status(400).json({ ok: false, error: "skus requerido (array no vacío, hasta 500)" });
    }
    const batchSizeIn = body.batch_size != null ? Number(body.batch_size) : undefined;
    const concurrencyIn = body.concurrency != null ? Number(body.concurrency) : undefined;
    try {
      const r = await loadFastraxBatchDetailsForSkus(skus, {
        batchSize: Number.isFinite(batchSizeIn) ? batchSizeIn : undefined,
        concurrency: Number.isFinite(concurrencyIn) ? concurrencyIn : undefined,
      });
      return res.json(r);
    } catch (e) {
      return res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  /**
   * GET /api/admin/fastrax/products/search-global — recorre páginas ope=4 (cap
   * duro 30) buscando q/sku, y enriquece con un único batch ope=2 final.
   */
  app.get("/api/admin/fastrax/products/search-global", requireApiKeyOrAdmin, async (req, res) => {
    if (!fastraxEnabled() || !fastraxConfigured()) {
      return res.status(503).json({ ok: false, error: "Fastrax no habilitado o no configurado" });
    }
    const q = req.query.q != null && String(req.query.q).trim() ? String(req.query.q) : undefined;
    const sku = req.query.sku != null && String(req.query.sku).trim() ? String(req.query.sku).trim() : undefined;
    const onlyQ = String(req.query.only_stock ?? "").toLowerCase();
    const only_stock = onlyQ === "1" || onlyQ === "true" || onlyQ === "yes" || onlyQ === "y";
    const max_pages = req.query.max_pages != null ? Number(req.query.max_pages) : undefined;
    const page_size = req.query.page_size != null ? Number(req.query.page_size) : undefined;
    const max_results = req.query.max_results != null ? Number(req.query.max_results) : undefined;
    try {
      const r = await searchFastraxAllPagesOpe4Global({
        q,
        sku,
        only_stock,
        max_pages,
        page_size,
        max_results,
      });
      return res.json(r);
    } catch (e) {
      return res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  /**
   * POST /api/admin/fastrax/products/import-page — ope=4 + ope=2 batch + upsert.
   * Body: { page?: number, size?: number, batch_size?: number, concurrency?: number }
   */
  app.post("/api/admin/fastrax/products/import-page", requireAdmin, async (req, res) => {
    if (!fastraxEnabled() || !fastraxConfigured()) {
      return res.status(503).json({ ok: false, error: "Fastrax no habilitado o no configurado" });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const page = body.page != null ? Number(body.page) : undefined;
    const size = body.size != null ? Number(body.size) : undefined;
    const batch_size = body.batch_size != null ? Number(body.batch_size) : undefined;
    const concurrency = body.concurrency != null ? Number(body.concurrency) : undefined;
    try {
      const sb = supabaseService();
      const r = await importFastraxPageWithBatch(sb, { page, size, batch_size, concurrency });
      return res.json(r);
    } catch (e) {
      return res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  /**
   * POST /api/admin/fastrax/products/import-range — varias páginas con tope duro.
   * Body: { from_page: number, to_page: number, size?: number, batch_size?: number,
   *         concurrency?: number, max_pages?: number }
   */
  app.post("/api/admin/fastrax/products/import-range", requireAdmin, async (req, res) => {
    if (!fastraxEnabled() || !fastraxConfigured()) {
      return res.status(503).json({ ok: false, error: "Fastrax no habilitado o no configurado" });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const from_page = body.from_page != null ? Number(body.from_page) : undefined;
    const to_page = body.to_page != null ? Number(body.to_page) : undefined;
    if (!Number.isFinite(from_page) || !Number.isFinite(to_page)) {
      return res.status(400).json({ ok: false, error: "from_page y to_page requeridos (números)" });
    }
    const size = body.size != null ? Number(body.size) : undefined;
    const batch_size = body.batch_size != null ? Number(body.batch_size) : undefined;
    const concurrency = body.concurrency != null ? Number(body.concurrency) : undefined;
    const max_pages = body.max_pages != null ? Number(body.max_pages) : undefined;
    try {
      const sb = supabaseService();
      const r = await importFastraxPageRangeWithBatch(sb, {
        from_page,
        to_page,
        size,
        batch_size,
        concurrency,
        max_pages,
      });
      return res.json(r);
    } catch (e) {
      return res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  /** Buscador → `tradexpar.products` (items con datos y raw_detail; Bearer admin). */
  app.post("/api/admin/fastrax/import", requireAdmin, async (req, res) => {
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

  /**
   * POST /api/admin/fastrax/reprocess-metadata
   * Reprocesa name/brand/category de los productos Fastrax ya guardados usando
   * el mapper actualizado, sobre `external_payload` almacenado (no llama a la
   * API de Fastrax). Sirve para arreglar en bulk despues de cambiar el mapper.
   * Body opcional: { fields: ["name","brand","category"] } (default: los 3).
   */
  app.post("/api/admin/fastrax/reprocess-metadata", requireApiKeyOrAdmin, async (req, res) => {
    try {
      const sb = supabaseService();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const allowed = new Set(["name", "brand", "category"]);
      const fields = Array.isArray(body.fields)
        ? body.fields.filter((f) => allowed.has(f))
        : ["name", "brand", "category"];
      if (!fields.length) {
        return res.status(400).json({ ok: false, error: "fields debe incluir al menos uno de name/brand/category" });
      }

      const stats = { reviewed: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 };
      const errors = [];
      const pageSize = 500;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await sb
          .from("products")
          .select("id, name, brand, category, external_payload")
          .eq("external_provider", "fastrax")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const row of data) {
          stats.reviewed += 1;
          const p = row.external_payload;
          if (!p || typeof p !== "object" || Array.isArray(p)) {
            stats.skipped += 1;
            continue;
          }
          const m = mapFastraxRowToProduct(/** @type {Record<string, unknown>} */ (p));
          if (!m) {
            stats.skipped += 1;
            continue;
          }
          const patch = {};
          if (fields.includes("name") && m.name && m.name !== row.name) patch.name = m.name;
          if (fields.includes("brand") && m.brand && m.brand !== row.brand) patch.brand = m.brand;
          if (fields.includes("category") && m.category && m.category !== row.category) patch.category = m.category;
          if (Object.keys(patch).length === 0) {
            stats.unchanged += 1;
            continue;
          }
          patch.updated_at = new Date().toISOString();
          const { error: e2 } = await sb.from("products").update(patch).eq("id", row.id);
          if (e2) {
            stats.failed += 1;
            if (errors.length < 20) errors.push(`${row.id}: ${e2.message}`);
          } else {
            stats.updated += 1;
          }
        }
        if (data.length < pageSize) break;
      }
      return res.json({ ok: true, fields, stats, errors: errors.length ? errors : undefined });
    } catch (e) {
      console.error("[fastrax/reprocess-metadata]", e);
      return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  /**
   * GET /api/admin/fastrax/sync/probe?sku=127141
   * Diagnóstico: llama ope=1, ope=98 y opcionalmente ope=2 para un SKU dado y
   * devuelve tamaños de respuesta, si el SKU aparece en cada una, y la fila
   * cruda si aparece. Útil para depurar credenciales/depósitos con soporte.
   */
  app.get("/api/admin/fastrax/sync/probe", requireApiKeyOrAdmin, async (req, res) => {
    const sku = String(req.query?.sku ?? "").trim();
    try {
      const [one, b, two] = await Promise.all([
        listProductsOpe1(),
        listBalancesOpe98(),
        sku ? fastraxPost(2, { sku }) : Promise.resolve(null),
      ]);
      const rowsOne = one.ok ? extractProductRows(one.parsed) : [];
      const rowsB = b.ok ? extractProductRows(b.parsed) : [];
      const findBySku = (rows) =>
        !sku
          ? null
          : rows.find((r) => {
              const k = String(r?.sku ?? r?.SKU ?? r?.codigo ?? r?.cod_art ?? "").trim();
              return k === sku;
            }) || null;

      // Simular la decisión del upsert (sin escribir): mapear la fila de Fastrax
      // y comparar el CRC computado contra el CRC almacenado en DB.
      let upsertPreview = null;
      if (sku) {
        const rowB = findBySku(rowsB);
        const rowOne = findBySku(rowsOne);
        // Mismo criterio que collectChanged: ope=98 primero, ope=1 después.
        const raw = rowB || rowOne;
        if (raw) {
          const m = mapFastraxRowToProduct(raw);
          if (m) {
            const active = deriveFastraxActive(m);
            const crcComputed = computeFastraxStockCrc(m, active);
            const sb = supabaseService();
            const { data: existing } = await sb
              .from("products")
              .select("id, stock, external_sync_crc, external_last_sync_at")
              .eq("external_provider", "fastrax")
              .eq("external_sku", sku)
              .maybeSingle();
            upsertPreview = {
              picked_from: rowB ? "ope98" : "ope1",
              mapped: { external_sku: m.external_sku, stock: m.stock, price: m.price, active },
              crc_computed: crcComputed,
              db_existing: existing ?? null,
              would_action: !existing
                ? "no_match_in_db"
                : existing.external_sync_crc === crcComputed
                  ? "unchanged"
                  : "update",
            };
          } else {
            upsertPreview = { picked_from: rowB ? "ope98" : "ope1", mapped: null, would_action: "mapper_returned_null" };
          }
        } else {
          upsertPreview = { picked_from: null, would_action: "sku_not_in_ope1_ope98" };
        }
      }

      return res.json({
        ok: true,
        sku,
        upsert_preview: upsertPreview,
        ope1: {
          ok: !!one.ok,
          error: one.ok ? undefined : one.message,
          rows: rowsOne.length,
          sku_found: !!findBySku(rowsOne),
          sku_row: findBySku(rowsOne),
          first_row_sample: rowsOne[0] ?? null,
        },
        ope98: {
          ok: !!b.ok,
          error: b.ok ? undefined : b.message,
          rows: rowsB.length,
          sku_found: !!findBySku(rowsB),
          sku_row: findBySku(rowsB),
        },
        ope2: two
          ? {
              ok: !!two.ok,
              error: two.ok ? undefined : two.message,
              parsed: two.parsed,
            }
          : null,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  /**
   * GET /api/admin/fastrax/sync/status
   * Estado de la sincronización automática para el panel: última corrida
   * (fecha/hora, estado, contadores), si hay una en curso y la marca "desde".
   */
  app.get("/api/admin/fastrax/sync/status", requireApiKeyOrAdmin, async (_req, res) => {
    try {
      const sb = supabaseService();
      const [{ run }, since] = await Promise.all([
        getLastSyncRun(sb).then((r) => (r.ok ? r : { run: null })),
        getLastSuccessfulSyncAt(sb),
      ]);
      return res.json({
        ok: true,
        enabled: fastraxEnabled(),
        configured: fastraxConfigured(),
        auto_sync_enabled: process.env.FASTRAX_AUTO_SYNC_ENABLED !== "0",
        interval_ms: Number(process.env.FASTRAX_SYNC_INTERVAL_MS || 600_000) || 600_000,
        running: isFastraxSyncRunning(),
        last_successful_at: since ? since.toISOString() : null,
        last_run: run,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  /**
   * POST /api/admin/fastrax/sync/run  { mode?: 'full' | 'incremental' }
   * Dispara una sincronización manual (mismo flujo que el scheduler). Rechaza con
   * 409 si ya hay una en curso.
   */
  app.post("/api/admin/fastrax/sync/run", requireAdmin, async (req, res) => {
    if (!fastraxEnabled()) return res.status(503).json({ ok: false, error: "FASTRAX_ENABLED=0" });
    if (!fastraxConfigured()) {
      return res.status(503).json({ ok: false, error: "Falta FASTRAX_API_URL / CÓD / PASS" });
    }
    if (isFastraxSyncRunning()) {
      return res.status(409).json({ ok: false, error: "Ya hay una sincronización en curso." });
    }
    try {
      const sb = supabaseService();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const mode = body.mode === "full" ? "full" : "incremental";
      const result = await runFastraxCatalogSync(sb, { mode, trigger: "manual" });
      const code = result.ok ? 200 : result.busy ? 409 : 502;
      return res.status(code).json(result);
    } catch (e) {
      console.error("[fastrax/sync/run]", e);
      return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
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
   * GET /api/admin/orders/fastrax/status-bulk?ids=uuid1,uuid2,...
   * Lectura masiva de `fastrax_order_map` para evitar N peticiones cuando el panel admin
   * expande varias filas a la vez. Limitado a 200 ids por request.
   */
  app.get("/api/admin/orders/fastrax/status-bulk", requireApiKey, async (req, res) => {
    const idsRaw = String(req.query?.ids ?? "").trim();
    if (!idsRaw) return res.status(400).json({ ok: false, error: "ids requerido" });
    const ids = [...new Set(idsRaw.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 200);
    if (ids.length === 0) return res.json({ ok: true, statuses: {} });
    try {
      const sb = supabaseService();
      const { data: maps, error: me } = await sb
        .from("fastrax_order_map")
        .select("*")
        .in("order_id", ids);
      if (me) throw me;
      /** @type {Record<string, ReturnType<typeof buildFastraxAdminStatusPayload>>} */
      const statuses = {};
      const byOrder = new Map();
      for (const m of maps ?? []) {
        if (m && m.order_id != null) byOrder.set(String(m.order_id), m);
      }
      for (const oid of ids) {
        const map = byOrder.get(oid) ?? null;
        statuses[oid] = buildFastraxAdminStatusPayload(oid, map);
      }
      res.setHeader("Cache-Control", "private, max-age=15");
      return res.json({ ok: true, statuses });
    } catch (e) {
      console.error("[fastrax/status-bulk]", e);
      return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
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
        // 422 (no 502): un rechazo de negocio de Fastrax (producto inválido, sin saldo,
        // cliente inválido) o su timeout NO es un fallo de gateway. Con 502, un CDN/proxy
        // (p. ej. Cloudflare) puede interceptar y reemplazar el cuerpo con su propia página
        // de error, ocultando el mensaje real. El cuerpo `{ ok:false, error }` se conserva.
        return res.status(422).json(r);
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
        // 422 (no 502): mismo criterio que en /create — un fallo de facturación de negocio
        // no es un error de gateway; evita que un CDN/proxy oculte el mensaje real.
        return res.status(422).json({ ok: false, order_id: orderId, ...r });
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