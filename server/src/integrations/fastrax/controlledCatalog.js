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
