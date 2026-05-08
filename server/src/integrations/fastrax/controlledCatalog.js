/**
 * Búsqueda en Fastrax (ope=4/2) sin escribir en DB, e importación acotada por SKUs.
 *
 * Rendimiento: la búsqueda y la importación dejaron de hacer una llamada ope=2
 * por SKU. Ahora resuelven los detalles con `getProductDetailsBatch` (ope=2 en
 * lote, lotes de FASTRAX_DETAIL_BATCH_SIZE, default 20, máx 50, concurrencia
 * configurable). El bloqueo de SKUs locales/Dropi se hace con una sola query
 * `IN(sku)` por chunk en lugar de 1 query por SKU.
 */

import {
  fastraxDetailBatchSize,
  fastraxDetailConcurrency,
  fastraxOpe4DefaultPageSize,
  getProductDetails,
  getProductDetailsBatch,
  listFastraxProductsOpe4,
} from "./client.js";
import { extractProductRows, mapFastraxRowToProduct } from "./mapper.js";
import { upsertFastraxFromImportItem, upsertFastraxFromRawRow } from "./fastraxProductUpsert.js";

/**
 * Pre-bloqueo: SKUs ya presentes en `tradexpar.products` con product_source_type
 * `tradexpar` o `dropi`. Devuelve un Set para evitar pisar productos locales o
 * Dropi al importar Fastrax.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string[]} skus
 * @returns {Promise<Set<string>>}
 */
async function getBlockedSkusForFastraxImport(sb, skus) {
  const blocked = new Set();
  if (!Array.isArray(skus) || skus.length === 0) return blocked;
  const uniq = [...new Set(skus.map((s) => String(s).trim()).filter(Boolean))];
  const CHUNK = 500;
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const chunk = uniq.slice(i, i + CHUNK);
    const { data, error } = await sb
      .from("products")
      .select("sku, product_source_type")
      .in("sku", chunk)
      .in("product_source_type", ["tradexpar", "dropi"]);
    if (error) {
      console.warn("[fastrax/import] block lookup failed:", error.message);
      continue;
    }
    for (const r of data ?? []) {
      if (r?.sku) blocked.add(String(r.sku));
    }
  }
  return blocked;
}

/**
 * @param {Record<string, unknown>} raw
 * @param {ReturnType<typeof mapFastraxRowToProduct> | null} m
 * @returns {{ sku: string, name: string, price: number, stock: number, state: string }}
 */
function toListItem(m) {
  if (!m) {
    return {
      sku: "",
      name: "",
      price: 0,
      stock: 0,
      state: "—",
    };
  }
  const st = m.stock > 0 ? "con_stock" : "sin_stock";
  const state = m.price > 0 ? (st === "con_stock" ? "Vendible" : "Sin stock") : "Precio 0";
  return {
    sku: m.external_sku,
    name: m.name,
    price: m.price,
    stock: m.stock,
    state,
  };
}

/**
 * Búsqueda: ope=4 con paginación, opc. filtros. Si `sku` está fijo, ope=2 detalle.
 *
 * @param {object} q
 * @param {number} [q.page]
 * @param {number} [q.size]
 * @param {string} [q.sku] — forzar detalle ope=2
 * @param {string} [q.search] — filtra en esta página (nombre o SKU, insensible)
 * @param {boolean} [q.only_stock] — solo filas con stock > 0
 */
export async function searchFastraxAdmin(q) {
  const skuQ = (q.sku && String(q.sku).trim()) || "";
  if (skuQ) {
    const r = await getProductDetails(skuQ);
    if (!r || r.ok === false) {
      return {
        ok: false,
        ope: 2,
        message: r && r.message ? String(r.message) : "Fastrax ope=2 error",
        parsed: r && r.parsed,
      };
    }
    const rows = extractProductRows(/** @type {unknown} */ (r.parsed));
    const raw0 =
      rows[0] ||
      (r.parsed && typeof r.parsed === "object" && !Array.isArray(r.parsed) ? r.parsed : null);
    const m = raw0 && typeof raw0 === "object" ? mapFastraxRowToProduct(/** @type {Record<string, unknown>} */ (raw0)) : null;
    const item = toListItem(m);
    return {
      ok: true,
      mode: "detail",
      ope: 2,
      page: 1,
      size: 1,
      total_this_view: 1,
      item,
      /**
       * Respuesta ope=2 (sin `pas`); útil para depurar en admin.
       */
      data: r.parsed,
    };
  }

  const page = Math.max(1, Math.floor(Number(q.page) || 1));
  const size = Math.max(1, Math.min(500, Math.floor(Number(q.size) || 20)));
  const r4 = await listFastraxProductsOpe4(page, size);
  if (!r4 || r4.ok === false) {
    return {
      ok: false,
      ope: 4,
      page,
      size,
      message: r4 && r4.message ? String(r4.message) : "Fastrax ope=4 error",
      parsed: r4 && r4.parsed,
    };
  }
  const rows = extractProductRows(/** @type {unknown} */ (r4.parsed));
  const list = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const m = mapFastraxRowToProduct(/** @type {Record<string, unknown>} */ (raw));
    if (!m) continue;
    list.push(toListItem(m));
  }
  const searchN = (q.search && String(q.search).trim().toLowerCase()) || "";
  let out = list;
  if (searchN) {
    out = out.filter(
      (it) =>
        (it.sku && it.sku.toLowerCase().includes(searchN)) ||
        (it.name && it.name.toLowerCase().includes(searchN))
    );
  }
  if (q.only_stock === true || q.only_stock === 1 || String(q.only_stock).toLowerCase() === "true") {
    out = out.filter((it) => (it.stock ?? 0) > 0);
  }
  return {
    ok: true,
    mode: "list",
    ope: 4,
    page,
    size,
    /**
     * Filas devueltas por ope=4 en esta petición; el filtro `search/only_stock` aplica en memoria
     * sobre la página (no búsqueda global en todo el catálogo).
     */
    count_source: list.length,
    count_filtered: out.length,
    items: out,
  };
}

/**
 * Importa los SKUs indicados (ope=2 en lote → upsert en `products` como Fastrax).
 * Pre-bloquea SKUs locales/Dropi con una sola query `IN(sku)`.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string[]} skus
 * @param {{ batchSize?: number, concurrency?: number }} [opts]
 */
export async function importFastraxSkusToProducts(sb, skus, opts = {}) {
  const t0 = Date.now();
  const uniq = [...new Set((skus || []).map((s) => String(s).trim()).filter(Boolean))];
  if (uniq.length === 0) {
    return { ok: true, message: "empty_skus", inserted: 0, updated: 0, failed: 0, skipped: 0, results: [], duration_ms: 0 };
  }

  const blocked = await getBlockedSkusForFastraxImport(sb, uniq);
  const candidates = uniq.filter((s) => !blocked.has(s));
  const batch = candidates.length > 0
    ? await getProductDetailsBatch(candidates, opts)
    : { bySku: new Map(), missing: [], failed: [], stats: { skus: 0, batches: 0, batches_split: 0, ok_rows: 0, missing: 0, failed: 0, duration_ms: 0 } };

  const results = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  for (const sku of uniq) {
    if (blocked.has(sku)) {
      skipped += 1;
      results.push({
        sku,
        ok: false,
        skipped: true,
        error: "Ya hay un producto local o Dropi con el mismo campo SKU; no se importa encima",
      });
      continue;
    }
    const raw0 = batch.bySku.get(sku);
    if (!raw0) {
      const reason = batch.failed.includes(sku) ? "ope=2 fallo" : "ope=2 sin fila";
      results.push({ sku, ok: false, error: reason });
      continue;
    }
    const u = await upsertFastraxFromRawRow(sb, /** @type {Record<string, unknown>} */ (raw0));
    if (u.ok) {
      if (u.action === "inserted") inserted += 1;
      if (u.action === "updated") updated += 1;
      results.push({ sku, ok: true, action: u.action, id: u.id });
    } else {
      results.push({ sku, ok: false, error: u.error || "upsert" });
      console.warn(`[fastrax/import] upsert fallo sku=${sku}: ${u.error || "(sin detalle)"}`);
    }
  }

  const failed = results.filter((r) => !r.ok && !r.skipped).length;
  const firstError =
    results.find((r) => !r.ok && !r.skipped && r.error)?.error || "";
  const dur = Date.now() - t0;
  console.info("[fastrax/import] from_skus", {
    total: uniq.length,
    blocked: blocked.size,
    inserted,
    updated,
    skipped,
    failed,
    detail_batches: batch.stats.batches,
    detail_failed: batch.stats.failed,
    duration_ms: dur,
    ...(firstError ? { first_error: firstError } : {}),
  });
  return {
    ok: true,
    source: "fastrax",
    inserted,
    updated,
    failed,
    skipped,
    results,
    duration_ms: dur,
    ...(firstError ? { first_error: firstError } : {}),
  };
}

/**
 * Importa al catálogo local desde el buscador (sin volver a llamar ope=2).
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {Array<{ sku?: unknown, name?: unknown, price?: unknown, stock?: unknown, raw_detail?: unknown }>} items
 * @returns {Promise<{ ok: boolean, inserted: number, updated: number, failed: number }>}
 */
export async function importFastraxItemsToProducts(sb, items) {
  const t0 = Date.now();
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) {
    return { ok: true, inserted: 0, updated: 0, failed: 0, skipped: 0, duration_ms: 0 };
  }

  const skus = [];
  for (const it of list) {
    if (!it || typeof it !== "object") continue;
    const sku = String(/** @type {Record<string, unknown>} */(it).sku ?? "").trim();
    if (sku) skus.push(sku);
  }
  const blocked = await getBlockedSkusForFastraxImport(sb, skus);

  let inserted = 0;
  let updated = 0;
  let failed = 0;
  let skipped = 0;
  /** Primer error real del upsert para devolverlo arriba (diagnóstico admin). */
  let firstError = "";
  for (const it of list) {
    if (!it || typeof it !== "object") {
      failed += 1;
      continue;
    }
    const sku = String(/** @type {Record<string, unknown>} */(it).sku ?? "").trim();
    if (!sku) {
      failed += 1;
      continue;
    }
    const raw = /** @type {Record<string, unknown> | null | undefined} */(
      (/** @type {Record<string, unknown>} */(it)).raw_detail
    );
    if (raw && typeof raw === "object" && !Array.isArray(raw) && Object.prototype.hasOwnProperty.call(raw, "_ope2_error")) {
      failed += 1;
      continue;
    }
    if (blocked.has(sku)) {
      skipped += 1;
      continue;
    }
    const u = await upsertFastraxFromImportItem(sb, it);
    if (u.ok) {
      if (u.action === "inserted") inserted += 1;
      if (u.action === "updated") updated += 1;
    } else {
      failed += 1;
      if (!firstError) firstError = String(u.error || "upsert");
      console.warn(`[fastrax/import] upsert fallo sku=${sku}: ${u.error || "(sin detalle)"}`);
    }
  }
  const dur = Date.now() - t0;
  const summary = {
    total: list.length,
    blocked: blocked.size,
    inserted,
    updated,
    skipped,
    failed,
    duration_ms: dur,
  };
  if (firstError) {
    /** @type {Record<string, unknown>} */ (summary).first_error = firstError;
  }
  console.info("[fastrax/import] from_items", summary);
  return {
    ok: true,
    inserted,
    updated,
    failed,
    skipped,
    duration_ms: dur,
    ...(firstError ? { first_error: firstError } : {}),
  };
}

/**
 * Nombre ope=2: campo `nom` con URL encoding (misma idea que en PHP).
 * @param {unknown} nom
 * @returns {string}
 */
function decodeFastraxNom(nom) {
  if (nom == null) return "";
  const s = String(nom).replace(/\+/g, " ");
  try {
    return decodeURIComponent(s).trim();
  } catch {
    return s.trim();
  }
}

/**
 * @param {unknown} v
 * @returns {number}
 */
function numF(v) {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Fastrax suele poner en `img` un número; si es ruta, contamos 1.
 * @param {Record<string, unknown>} row
 * @returns {number}
 */
function pickImagesCountFromOpe2(row) {
  const v = row.img ?? row.Img;
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  const t = String(v).trim();
  if (!t) return 0;
  if (/^-?\d+([.,]\d+)?$/.test(t)) return Math.max(0, Math.floor(numF(t)));
  return 1;
}

/**
 * @param {Record<string, unknown> | null} row
 * @param {string} sku
 * @param {boolean} ope2Failed
 * @param {string} [errMsg]
 */
function ope2RowToSearchItem(row, sku, ope2Failed, errMsg) {
  if (ope2Failed || !row) {
    return {
      sku: String(sku).trim(),
      name: `Producto ${String(sku).trim()}`,
      price: 0,
      stock: 0,
      images_count: 0,
      status: 0,
      raw_detail: ope2Failed
        ? { _ope2_error: true, ...(errMsg ? { message: errMsg } : {}) }
        : null,
    };
  }
  const nRaw = row.nom ?? row.Nom ?? row.nombre ?? row.Nombre;
  const name = nRaw != null && String(nRaw) !== "" ? decodeFastraxNom(nRaw) : "";
  const price = Math.max(0, numF(row.pre));
  const stock = Math.max(0, Math.floor(numF(row.sal)));
  const skuS = String(sku).trim();
  const imgN = numF(row.img);
  const base = {
    sku: skuS,
    name,
    price,
    stock,
    images_count: pickImagesCountFromOpe2(row),
    status: (() => {
      const st = [row.sit, row.Sit, row.est, row.Est, row.status, row.Status].find(
        (x) => x != null && String(x) !== ""
      );
      return Math.floor(numF(st));
    })(),
    raw_detail: { ...row },
  };
  if (imgN > 0) {
    return {
      ...base,
      image_count: Math.max(0, Math.floor(imgN)),
      preview_image_url: `/api/admin/fastrax/products/${encodeURIComponent(skuS)}/image/1`,
    };
  }
  return base;
}

/**
 * @param {unknown} root
 * @param {string[]} keys
 * @param {number} [depth]
 * @returns {number | null}
 */
function findPositiveNumberByKeysDeep(root, keys, depth = 0) {
  if (depth > 12) return null;
  const set = new Set(keys.map((k) => k.toLowerCase()));
  if (root == null) return null;
  if (Array.isArray(root)) {
    for (const e of root) {
      const f = findPositiveNumberByKeysDeep(e, keys, depth + 1);
      if (f != null) return f;
    }
    return null;
  }
  if (typeof root !== "object") return null;
  for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */(root))) {
    if (set.has(k.toLowerCase()) && v != null && v !== "") {
      const n = Number(String(v).replace(/,/g, "."));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  for (const v of Object.values(/** @type {Record<string, unknown>} */(root))) {
    const f = findPositiveNumberByKeysDeep(v, keys, depth + 1);
    if (f != null) return f;
  }
  return null;
}

/**
 * @param {unknown} parsedOpe4
 * @param {number} pageSize
 */
function inferTotalPagesFromOpe4(parsedOpe4, pageSize) {
  const s = pageSize > 0 ? pageSize : 1;
  const pags = findPositiveNumberByKeysDeep(parsedOpe4, [
    "pags",
    "totpag",
    "tot_pag",
    "paginas",
    "total_pag",
    "totpages",
    "totpags",
  ]);
  if (pags != null && pags >= 1) return Math.min(1_000_000, Math.floor(pags));
  const tot = findPositiveNumberByKeysDeep(parsedOpe4, [
    "tot",
    "total",
    "registros",
    "totreg",
    "totregistros",
    "treg",
  ]);
  if (tot != null && tot > 0) return Math.max(1, Math.min(1_000_000, Math.ceil(tot / s)));
  return 1;
}

/**
 * Log temporal: primer nodo o objeto raíz con `estatus` (respuesta ope=2).
 * @param {unknown} parsed
 */
function logFastraxSearchOpe2DetailResponse(parsed) {
  let e = "?";
  let c = "?";
  let el = "?";
  try {
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object" && !Array.isArray(parsed[0])) {
      const h = /** @type {Record<string, unknown>} */(parsed[0]);
      if (h.estatus != null || h.Estatus != null || h.cestatus != null) {
        e = String(h.estatus ?? h.Estatus ?? h.status ?? "?");
        c = String(h.cestatus ?? h.cEst ?? "?");
        if (h.element != null) el = String(h.element);
        else if (h.Element != null) el = String(h.Element);
        else if (h.el != null) el = String(h.el);
      }
    } else if (
      parsed != null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      (Object.prototype.hasOwnProperty.call(/** @type {object} */(parsed), "estatus") ||
        Object.prototype.hasOwnProperty.call(/** @type {object} */(parsed), "Estatus"))
    ) {
      const o = /** @type {Record<string, unknown>} */(parsed);
      e = String(o.estatus ?? o.Estatus ?? "?");
      c = String(o.cestatus ?? o.cEst ?? "?");
      if (o.element != null) el = String(o.element);
    }
  } catch {
    /* */
  }
  console.log(
    `[fastrax/search] detail response header estatus=${e} cestatus=${c} element=${el}`
  );
}

/**
 * Solo lectura: ope=4 (una página, tam ≤ 20) + ope=2 por SKU. Sin tocar la DB.
 * Nombres: solo desde ope=2, campo `nom` decodificado; `pre` / `sal` en detalle.
 * @param {object} p
 * @param {string} [p.q] — o alias `search`
 * @param {number} [p.page] — default 1
 * @param {number} [p.size] — default 20, max 20
 * @param {boolean} [p.only_stock]
 * @param {string} [p.sku] — si viene solo, solo ope=2 (p. ej. detalle)
 */
export async function searchFastraxReadonlyOpe4Ope2(p) {
  const onlySku = p.sku != null && String(p.sku).trim() ? String(p.sku).trim() : "";
  const q = (p.q && String(p.q).trim()) || (p.search && String(p.search).trim()) || "";
  const onlyStock =
    p.only_stock === true ||
    p.only_stock === 1 ||
    String(p.only_stock ?? "")
      .toLowerCase() === "true" ||
    String(p.only_stock) === "1";
  const page = Math.max(1, Math.floor(Number(p.page) || 1));
  const size = Math.max(1, Math.min(20, Math.floor(Number(p.size) || 20)));
  const qn = q.toLowerCase();

  const matches = (it) => {
    if (q) {
      const inName = (it.name || "").toLowerCase().includes(qn);
      const inSku = String(it.sku).toLowerCase().includes(qn);
      if (!inName && !inSku) return false;
    }
    if (onlyStock && (it.stock ?? 0) <= 0) return false;
    return true;
  };

  if (onlySku) {
    console.log(`[fastrax/search] detail request sku=${onlySku}`);
    const r2 = await getProductDetails(onlySku);
    if (!r2 || r2.ok === false) {
      console.log(`[fastrax/search] page=1 size=${size} sku_count=1 detail_ok=0 detail_failed=1`);
      return {
        ok: false,
        page: 1,
        size,
        total_pages: 1,
        source_count: 1,
        items: [],
        message: r2 && r2.message ? String(r2.message) : "ope=2",
      };
    }
    logFastraxSearchOpe2DetailResponse(r2.parsed);
    const drows = extractProductRows(/** @type {unknown} */ (r2.parsed));
    const raw0 =
      drows[0] ||
      (r2.parsed && typeof r2.parsed === "object" && !Array.isArray(r2.parsed) ? r2.parsed : null);
    const row = raw0 && typeof raw0 === "object" ? /** @type {Record<string, unknown>} */(raw0) : null;
    const detailFailed = !row ? 1 : 0;
    const detailOk = row ? 1 : 0;
    console.log(
      `[fastrax/search] page=1 size=${size} sku_count=1 detail_ok=${detailOk} detail_failed=${detailFailed}`
    );
    if (!row) {
      return { ok: true, page: 1, size, total_pages: 1, source_count: 1, items: [] };
    }
    const item = ope2RowToSearchItem(row, onlySku, false);
    return {
      ok: true,
      page: 1,
      size,
      total_pages: 1,
      source_count: 1,
      items: matches(item) ? [item] : [],
    };
  }

  const r4 = await listFastraxProductsOpe4(page, size);
  if (!r4 || r4.ok === false) {
    return {
      ok: false,
      page,
      size,
      total_pages: 1,
      source_count: 0,
      items: [],
      message: r4 && r4.message ? String(r4.message) : "ope=4",
    };
  }
  const totalPages = inferTotalPagesFromOpe4(r4.parsed, size);
  const listRows = extractProductRows(/** @type {unknown} */(r4.parsed));
  const skus = [];
  const seen = new Set();
  for (const raw of listRows) {
    if (!raw || typeof raw !== "object") continue;
    const row = /** @type {Record<string, unknown>} */(raw);
    const s = String(row.sku ?? row.sk ?? "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    skus.push(s);
    if (skus.length >= 20) break;
  }

  const source_count = skus.length;
  if (source_count === 0) {
    return { ok: true, page, size, total_pages: totalPages, source_count: 0, items: [] };
  }

  const tDet0 = Date.now();
  const batch = await getProductDetailsBatch(skus);
  let detailOk = 0;
  let detailFailed = 0;
  const items = [];
  for (const sku of skus) {
    const raw0 = batch.bySku.get(sku);
    if (raw0) {
      detailOk += 1;
      const it = ope2RowToSearchItem(/** @type {Record<string, unknown>} */(raw0), sku, false);
      if (matches(it)) items.push(it);
    } else {
      detailFailed += 1;
      const reason = batch.failed.includes(sku) ? "ope=2 fallo" : "ope=2 sin fila";
      const fall = ope2RowToSearchItem(null, sku, true, reason);
      if (matches(fall)) items.push(fall);
    }
  }
  console.log(
    `[fastrax/search] page=${page} size=${size} sku_count=${source_count} detail_ok=${detailOk} detail_failed=${detailFailed} batches=${batch.stats.batches} batches_split=${batch.stats.batches_split} duration_ms=${Date.now() - tDet0}`
  );
  return { ok: true, page, size, total_pages: totalPages, source_count, items };
}

/**
 * Listado rápido sin ope=2: solo ope=4. Devuelve placeholders cuando ope=4 no
 * trae nombre/precio. Útil para que el admin pagine sin esperar detalles.
 *
 * @param {object} p
 * @param {number} [p.page]
 * @param {number} [p.size]
 * @param {boolean} [p.only_stock]
 * @param {string} [p.q]
 * @param {string} [p.search]
 */
export async function searchFastraxFastListOpe4Only(p) {
  const t0 = Date.now();
  const page = Math.max(1, Math.floor(Number(p.page) || 1));
  const sizeIn = Math.floor(Number(p.size) || fastraxOpe4DefaultPageSize());
  const size = Math.max(1, Math.min(500, sizeIn));
  const q = (p.q && String(p.q).trim()) || (p.search && String(p.search).trim()) || "";
  const qn = q.toLowerCase();
  const onlyStock =
    p.only_stock === true ||
    p.only_stock === 1 ||
    String(p.only_stock ?? "").toLowerCase() === "true" ||
    String(p.only_stock) === "1";

  const r4 = await listFastraxProductsOpe4(page, size);
  if (!r4 || r4.ok === false) {
    return {
      ok: false,
      mode: "list_fast",
      page,
      size,
      total_pages: 1,
      source_count: 0,
      items: [],
      message: r4 && r4.message ? String(r4.message) : "ope=4",
      duration_ms: Date.now() - t0,
    };
  }
  const totalPages = inferTotalPagesFromOpe4(r4.parsed, size);
  const rawRows = extractProductRows(/** @type {unknown} */(r4.parsed));
  const items = [];
  const seen = new Set();
  for (const raw of rawRows) {
    if (!raw || typeof raw !== "object") continue;
    const m = mapFastraxRowToProduct(/** @type {Record<string, unknown>} */(raw));
    if (!m) continue;
    if (seen.has(m.external_sku)) continue;
    seen.add(m.external_sku);
    const hasName = m.name && m.name !== `Producto ${m.external_sku}`;
    const hasPrice = m.price > 0;
    const detailState = hasName && hasPrice ? "ope4_ok" : "pendiente_detalle";
    const item = {
      sku: m.external_sku,
      name: hasName ? m.name : `Producto ${m.external_sku}`,
      price: hasPrice ? m.price : 0,
      stock: m.stock || 0,
      images_count: 0,
      status: 0,
      detail_state: detailState,
      raw_detail: null,
    };
    if (q) {
      const inSku = item.sku.toLowerCase().includes(qn);
      const inName = (item.name || "").toLowerCase().includes(qn);
      if (!inSku && !inName) continue;
    }
    if (onlyStock && item.stock <= 0) continue;
    items.push(item);
  }
  const dur = Date.now() - t0;
  console.info("[fastrax/search] list_fast", { page, size, source_count: items.length, duration_ms: dur });
  return {
    ok: true,
    mode: "list_fast",
    page,
    size,
    total_pages: totalPages,
    source_count: items.length,
    items,
    duration_ms: dur,
  };
}

/**
 * Detalles ope=2 en lote para un set de SKUs (sin tocar DB). Útil para que la
 * UI cargue detalles solo cuando el admin lo pide.
 *
 * @param {string[]} skus
 * @param {{ batchSize?: number, concurrency?: number }} [opts]
 */
export async function loadFastraxBatchDetailsForSkus(skus, opts = {}) {
  const t0 = Date.now();
  const requested = Array.isArray(skus)
    ? [...new Set(skus.map((s) => String(s ?? "").trim()).filter(Boolean))]
    : [];
  if (requested.length === 0) {
    return {
      ok: true,
      items: [],
      missing: [],
      failed: [],
      stats: { skus: 0, batches: 0, batches_split: 0, ok_rows: 0, missing: 0, failed: 0, duration_ms: 0 },
      duration_ms: 0,
    };
  }
  const batch = await getProductDetailsBatch(requested, opts);
  const items = [];
  const missing = [];
  const failed = [];
  for (const sku of requested) {
    const raw = batch.bySku.get(sku);
    if (raw) {
      items.push(ope2RowToSearchItem(/** @type {Record<string, unknown>} */(raw), sku, false));
    } else if (batch.failed.includes(sku)) {
      failed.push(sku);
      items.push(ope2RowToSearchItem(null, sku, true, "ope=2 fallo"));
    } else {
      missing.push(sku);
      items.push(ope2RowToSearchItem(null, sku, true, "ope=2 sin fila"));
    }
  }
  const dur = Date.now() - t0;
  console.info("[fastrax/details] batch", {
    skus: requested.length,
    ok: requested.length - failed.length - missing.length,
    missing: missing.length,
    failed: failed.length,
    duration_ms: dur,
  });
  return { ok: true, items, missing, failed, stats: batch.stats, duration_ms: dur };
}

/**
 * Importa una página completa: ope=4 → ope=2 batch → upsert seguro.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {{ page?: number, size?: number, batch_size?: number, concurrency?: number }} opts
 */
export async function importFastraxPageWithBatch(sb, opts = {}) {
  const t0 = Date.now();
  const page = Math.max(1, Math.floor(Number(opts.page) || 1));
  const sizeIn = Math.floor(Number(opts.size) || fastraxOpe4DefaultPageSize());
  const size = Math.max(1, Math.min(500, sizeIn));
  const r4 = await listFastraxProductsOpe4(page, size);
  if (!r4 || r4.ok === false) {
    return {
      ok: false,
      page,
      size,
      error: r4 && r4.message ? String(r4.message) : "ope=4",
      duration_ms: Date.now() - t0,
    };
  }
  const totalPages = inferTotalPagesFromOpe4(r4.parsed, size);
  const rawRows = extractProductRows(/** @type {unknown} */(r4.parsed));
  const skusOrder = [];
  const ope4ByKey = new Map();
  const seen = new Set();
  for (const raw of rawRows) {
    if (!raw || typeof raw !== "object") continue;
    const m = mapFastraxRowToProduct(/** @type {Record<string, unknown>} */(raw));
    if (!m) continue;
    if (seen.has(m.external_sku)) continue;
    seen.add(m.external_sku);
    skusOrder.push(m.external_sku);
    ope4ByKey.set(m.external_sku, /** @type {Record<string, unknown>} */(raw));
  }
  if (skusOrder.length === 0) {
    return {
      ok: true,
      page,
      size,
      total_pages: totalPages,
      stats: {
        skus_found: 0,
        blocked: 0,
        detail_batches: 0,
        detail_failed: 0,
        imported: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        duration_ms: Date.now() - t0,
      },
      results: [],
    };
  }
  const blocked = await getBlockedSkusForFastraxImport(sb, skusOrder);
  const candidates = skusOrder.filter((s) => !blocked.has(s));
  const batch = candidates.length > 0
    ? await getProductDetailsBatch(candidates, {
        batchSize: opts.batch_size,
        concurrency: opts.concurrency,
      })
    : { bySku: new Map(), missing: [], failed: [], stats: { skus: 0, batches: 0, batches_split: 0, ok_rows: 0, missing: 0, failed: 0, duration_ms: 0 } };
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const results = [];
  for (const sku of skusOrder) {
    if (blocked.has(sku)) {
      skipped += 1;
      results.push({ sku, ok: false, skipped: true, reason: "SKU ya existe en producto local/Dropi" });
      continue;
    }
    const detailRaw = batch.bySku.get(sku);
    const ope4Raw = ope4ByKey.get(sku);
    const useRaw = detailRaw || ope4Raw;
    if (!useRaw) {
      failed += 1;
      results.push({ sku, ok: false, error: "sin detalle ope=2 ni fila ope=4" });
      continue;
    }
    const u = await upsertFastraxFromRawRow(sb, /** @type {Record<string, unknown>} */(useRaw));
    if (u.ok) {
      if (u.action === "inserted") inserted += 1;
      if (u.action === "updated") updated += 1;
      results.push({ sku, ok: true, action: u.action, id: u.id, used_ope2: Boolean(detailRaw) });
    } else {
      failed += 1;
      results.push({ sku, ok: false, error: u.error || "upsert" });
    }
  }
  const dur = Date.now() - t0;
  const stats = {
    skus_found: skusOrder.length,
    blocked: blocked.size,
    detail_batches: batch.stats.batches,
    detail_failed: batch.stats.failed,
    imported: inserted,
    updated,
    skipped,
    failed,
    duration_ms: dur,
  };
  console.info("[fastrax/import] page", { page, size, ...stats });
  return { ok: true, page, size, total_pages: totalPages, stats, results };
}

/**
 * Importa un rango de páginas con tope duro de seguridad (50 páginas).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {{ from_page?: number, to_page?: number, size?: number, batch_size?: number, concurrency?: number, max_pages?: number }} opts
 */
export async function importFastraxPageRangeWithBatch(sb, opts = {}) {
  const t0 = Date.now();
  const fromPage = Math.max(1, Math.floor(Number(opts.from_page) || 1));
  const requestedTo = Math.max(fromPage, Math.floor(Number(opts.to_page) || fromPage));
  const HARD_CAP = Math.max(1, Math.min(100, Math.floor(Number(opts.max_pages) || 50)));
  const toPage = Math.min(requestedTo, fromPage + HARD_CAP - 1);
  const size = Math.max(1, Math.min(500, Math.floor(Number(opts.size) || fastraxOpe4DefaultPageSize())));
  const totals = {
    pages_processed: 0,
    skus_found: 0,
    detail_batches: 0,
    detail_failed: 0,
    imported: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };
  const pages = [];
  for (let p = fromPage; p <= toPage; p += 1) {
    const r = await importFastraxPageWithBatch(sb, {
      page: p,
      size,
      batch_size: opts.batch_size,
      concurrency: opts.concurrency,
    });
    if (!r.ok) {
      pages.push({ page: p, ok: false, error: r.error });
      break;
    }
    totals.pages_processed += 1;
    totals.skus_found += r.stats.skus_found;
    totals.imported += r.stats.imported;
    totals.updated += r.stats.updated;
    totals.skipped += r.stats.skipped;
    totals.failed += r.stats.failed;
    totals.detail_batches += r.stats.detail_batches;
    totals.detail_failed += r.stats.detail_failed;
    pages.push({ page: p, ok: true, stats: r.stats });
    if (r.stats.skus_found === 0) break;
  }
  const dur = Date.now() - t0;
  console.info("[fastrax/import] range", {
    from: fromPage,
    to: toPage,
    size,
    ...totals,
    duration_ms: dur,
  });
  return {
    ok: true,
    from_page: fromPage,
    to_page: toPage,
    size,
    totals,
    pages,
    duration_ms: dur,
  };
}

/**
 * Búsqueda global por SKU/texto recorriendo páginas ope=4 hasta `max_pages`
 * (tope duro 30) o hasta agotar resultados. Si encuentra coincidencias, hace
 * un único batch ope=2 para enriquecer con detalle. Pensado para "Buscar en
 * todo Fastrax" del admin: no se llama por defecto.
 *
 * @param {{ q?: string, sku?: string, only_stock?: boolean, max_pages?: number, page_size?: number, max_results?: number }} p
 */
export async function searchFastraxAllPagesOpe4Global(p) {
  const t0 = Date.now();
  const HARD_CAP = 30;
  const maxPages = Math.max(1, Math.min(HARD_CAP, Math.floor(Number(p.max_pages) || 10)));
  const size = Math.max(1, Math.min(500, Math.floor(Number(p.page_size) || fastraxOpe4DefaultPageSize())));
  const maxResults = Math.max(1, Math.min(500, Math.floor(Number(p.max_results) || 100)));
  const exactSku = p.sku && String(p.sku).trim() ? String(p.sku).trim() : "";
  const q = exactSku
    ? exactSku
    : (p.q && String(p.q).trim()) || "";
  const qn = q.toLowerCase();
  const onlyStock =
    p.only_stock === true ||
    p.only_stock === 1 ||
    String(p.only_stock ?? "").toLowerCase() === "true" ||
    String(p.only_stock) === "1";

  if (exactSku) {
    const direct = await getProductDetails(exactSku);
    if (direct && direct.ok !== false) {
      const drows = extractProductRows(/** @type {unknown} */(direct.parsed));
      const raw0 =
        drows[0] ||
        (direct.parsed && typeof direct.parsed === "object" && !Array.isArray(direct.parsed)
          ? direct.parsed
          : null);
      if (raw0 && typeof raw0 === "object") {
        const it = ope2RowToSearchItem(/** @type {Record<string, unknown>} */(raw0), exactSku, false);
        const dur = Date.now() - t0;
        console.info("[fastrax/search] global_direct_ope2", { sku: exactSku, duration_ms: dur });
        return {
          ok: true,
          mode: "global_exact_sku",
          q: exactSku,
          pages_scanned: 0,
          total_pages: null,
          source_count: 1,
          items: [it],
          duration_ms: dur,
        };
      }
    }
  }

  /** @type {Map<string, Record<string, unknown>>} */
  const ope4ByKey = new Map();
  let totalPages = null;
  let pagesScanned = 0;
  for (let pageN = 1; pageN <= maxPages; pageN += 1) {
    const r4 = await listFastraxProductsOpe4(pageN, size);
    if (!r4 || r4.ok === false) break;
    pagesScanned += 1;
    if (pageN === 1) totalPages = inferTotalPagesFromOpe4(r4.parsed, size);
    const rawRows = extractProductRows(/** @type {unknown} */(r4.parsed));
    if (rawRows.length === 0) break;
    for (const raw of rawRows) {
      if (!raw || typeof raw !== "object") continue;
      const m = mapFastraxRowToProduct(/** @type {Record<string, unknown>} */(raw));
      if (!m) continue;
      const sku = m.external_sku;
      if (ope4ByKey.has(sku)) continue;
      const candName = (m.name || "").toLowerCase();
      const skuMatches = qn ? sku.toLowerCase().includes(qn) || candName.includes(qn) : true;
      if (!skuMatches) continue;
      if (onlyStock && (m.stock ?? 0) <= 0) continue;
      ope4ByKey.set(sku, /** @type {Record<string, unknown>} */(raw));
      if (ope4ByKey.size >= maxResults) break;
    }
    if (ope4ByKey.size >= maxResults) break;
    if (rawRows.length < Math.min(2, size)) break;
  }

  const matchedSkus = [...ope4ByKey.keys()];
  const items = [];
  if (matchedSkus.length > 0) {
    const batch = await getProductDetailsBatch(matchedSkus);
    for (const sku of matchedSkus) {
      const detail = batch.bySku.get(sku);
      if (detail) {
        items.push(ope2RowToSearchItem(/** @type {Record<string, unknown>} */(detail), sku, false));
      } else {
        const ope4 = ope4ByKey.get(sku);
        if (ope4) {
          items.push(ope2RowToSearchItem(/** @type {Record<string, unknown>} */(ope4), sku, false));
        } else {
          items.push(ope2RowToSearchItem(null, sku, true, "ope=2 sin fila"));
        }
      }
    }
  }
  const dur = Date.now() - t0;
  console.info("[fastrax/search] global", {
    q: q || null,
    pages_scanned: pagesScanned,
    matched: matchedSkus.length,
    duration_ms: dur,
  });
  return {
    ok: true,
    mode: "global",
    q: q || null,
    pages_scanned: pagesScanned,
    total_pages: totalPages,
    source_count: matchedSkus.length,
    items,
    duration_ms: dur,
  };
}
