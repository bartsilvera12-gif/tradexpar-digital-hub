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
 * Nombre con URL-encoding típico de PHP.
 * @param {string | null | undefined} raw
 * @returns {string}
 */
function decodeFastraxDisplayName(raw) {
  if (raw == null) return "";
  const withSpaces = String(raw).replace(/\+/g, " ");
  try {
    return decodeURIComponent(withSpaces).trim();
  } catch {
    return withSpaces.trim();
  }
}

/**
 * Solo lectura: ope=4 (una página, tam ≤ 20) + ope=2 por SKU. Sin tocar la DB.
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

  /**
   * @param {Record<string, unknown> | null} raw0
   * @param {string} [skuCtx]
   */
  const itemFromOpe2 = (raw0, skuCtx) => {
    if (!raw0) return null;
    const m = mapFastraxRowToProduct(/** @type {Record<string, unknown>} */ (raw0));
    if (!m) return null;
    const name = decodeFastraxDisplayName(m.name);
    const it = toListItem({ ...m, name, external_sku: skuCtx || m.external_sku });
    if (q) {
      if (!name.toLowerCase().includes(qn) && !String(it.sku).toLowerCase().includes(qn)) return null;
    }
    if (onlyStock && (it.stock ?? 0) <= 0) return null;
    return { sku: it.sku, name, price: it.price, stock: it.stock, state: it.state };
  };

  if (onlySku) {
    const r2 = await getProductDetails(onlySku);
    if (!r2 || r2.ok === false) {
      return {
        ok: false,
        page: 1,
        items: [],
        message: r2 && r2.message ? String(r2.message) : "ope=2",
        data: r2 && r2.parsed,
      };
    }
    const drows = extractProductRows(/** @type {unknown} */ (r2.parsed));
    const raw0 =
      drows[0] ||
      (r2.parsed && typeof r2.parsed === "object" && !Array.isArray(r2.parsed) ? r2.parsed : null);
    const row = itemFromOpe2(
      raw0 && typeof raw0 === "object" ? /** @type {Record<string, unknown>} */ (raw0) : null,
      onlySku
    );
    if (!row) {
      return { ok: true, page: 1, items: [], data: r2.parsed };
    }
    return {
      ok: true,
      page: 1,
      items: [row],
      data: r2.parsed,
    };
  }

  const r4 = await listFastraxProductsOpe4(page, size);
  if (!r4 || r4.ok === false) {
    return {
      ok: false,
      page,
      items: [],
      message: r4 && r4.message ? String(r4.message) : "ope=4",
    };
  }
  const listRows = extractProductRows(/** @type {unknown} */ (r4.parsed));
  const skus = [];
  const seen = new Set();
  for (const raw of listRows) {
    if (!raw || typeof raw !== "object") continue;
    const m0 = mapFastraxRowToProduct(/** @type {Record<string, unknown>} */ (raw));
    if (!m0) continue;
    const s = m0.external_sku;
    if (!s || seen.has(s)) continue;
    seen.add(s);
    skus.push(s);
    if (skus.length >= 20) break;
  }

  const items = [];
  for (const sku of skus) {
    const r2 = await getProductDetails(sku);
    if (!r2 || r2.ok === false) continue;
    const drows = extractProductRows(/** @type {unknown} */ (r2.parsed));
    const raw0 =
      drows[0] ||
      (r2.parsed && typeof r2.parsed === "object" && !Array.isArray(r2.parsed) ? r2.parsed : null);
    if (!raw0) continue;
    const row = itemFromOpe2(/** @type {Record<string, unknown>} */ (raw0), sku);
    if (row) items.push(row);
  }
  return { ok: true, page, items };
}
