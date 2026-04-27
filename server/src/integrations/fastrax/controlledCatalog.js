/**
 * Búsqueda en Fastrax (ope=4/2) sin escribir en DB, e importación acotada por SKUs.
 */

import { getProductDetails, listFastraxProductsOpe4 } from "./client.js";
import { extractProductRows, mapFastraxRowToProduct } from "./mapper.js";
import { upsertFastraxFromRawRow } from "./fastraxProductUpsert.js";

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
 * Importa solo los SKUs indicados (ope=2 por ítem, upsert en `products` con origen Fastrax).
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string[]} skus
 */
export async function importFastraxSkusToProducts(sb, skus) {
  const uniq = [...new Set((skus || []).map((s) => String(s).trim()).filter(Boolean))];
  if (uniq.length === 0) {
    return { ok: true, message: "empty_skus", inserted: 0, updated: 0, failed: 0, results: [] };
  }
  const results = [];
  let inserted = 0;
  let updated = 0;
  for (const sku of uniq) {
    const d = await getProductDetails(sku);
    if (!d || d.ok === false) {
      results.push({
        sku,
        ok: false,
        error: d && d.message ? String(d.message) : "ope=2",
      });
      continue;
    }
    const rows = extractProductRows(/** @type {unknown} */ (d.parsed));
    const raw0 =
      rows[0] ||
      (d.parsed && typeof d.parsed === "object" && !Array.isArray(d.parsed) ? d.parsed : null);
    if (!raw0 || typeof raw0 !== "object") {
      results.push({ sku, ok: false, error: "Respuesta ope=2 sin fila mapeable" });
      continue;
    }
    const { data: block } = await sb
      .from("products")
      .select("id")
      .eq("sku", sku)
      .in("product_source_type", ["tradexpar", "dropi"])
      .maybeSingle();
    if (block?.id) {
      results.push({
        sku,
        ok: false,
        error: "Ya hay un producto local o Dropi con el mismo campo SKU; no se importa encima",
      });
      continue;
    }
    const u = await upsertFastraxFromRawRow(sb, /** @type {Record<string, unknown>} */ (raw0));
    if (u.ok) {
      if (u.action === "inserted") inserted += 1;
      if (u.action === "updated") updated += 1;
      results.push({ sku, ok: true, action: u.action, id: u.id });
    } else {
      results.push({ sku, ok: false, error: u.error || "upsert" });
    }
  }
  return {
    ok: true,
    source: "fastrax",
    inserted,
    updated,
    failed: results.filter((r) => !r.ok).length,
    results,
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
  return {
    sku: String(sku).trim(),
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
    /** Copia plana; seguro en JSON. */
    raw_detail: { ...row },
  };
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
  let detailOk = 0;
  let detailFailed = 0;
  const items = [];
  for (const sku of skus) {
    console.log(`[fastrax/search] detail request sku=${sku}`);
    const r2 = await getProductDetails(sku);
    if (!r2 || r2.ok === false) {
      detailFailed += 1;
      const fall = ope2RowToSearchItem(null, sku, true, r2 && r2.message ? String(r2.message) : "ope=2");
      if (matches(fall)) items.push(fall);
      continue;
    }
    logFastraxSearchOpe2DetailResponse(r2.parsed);
    const drows = extractProductRows(/** @type {unknown} */(r2.parsed));
    const raw0 =
      drows[0] ||
      (r2.parsed && typeof r2.parsed === "object" && !Array.isArray(r2.parsed) ? r2.parsed : null);
    if (!raw0 || typeof raw0 !== "object") {
      detailFailed += 1;
      const fall = ope2RowToSearchItem(null, sku, true, "sin_fila");
      if (matches(fall)) items.push(fall);
      continue;
    }
    detailOk += 1;
    const it = ope2RowToSearchItem(/** @type {Record<string, unknown>} */(raw0), sku, false);
    if (matches(it)) items.push(it);
  }
  console.log(
    `[fastrax/search] page=${page} size=${size} sku_count=${source_count} detail_ok=${detailOk} detail_failed=${detailFailed}`
  );
  return { ok: true, page, size, total_pages: totalPages, source_count, items };
}
