/**
 * Sincroniza catálogo Fastrax: ope=4 por páginas (y opcional ope=98 al final) → upsert en `products`.
 * Requiere `tradexpar.products.external_sku` (ver `server/sql/fastrax_supabase_sql_arrays.mjs` / Supabase).
 */

import {
  fastraxPost,
  fastraxConfigured,
  fastraxEnabled,
  fastraxCatalogImportAllowed,
  listProductsPage,
} from "./client.js";
import { upsertFastraxMappedRow } from "./fastraxProductUpsert.js";
import { extractProductRows, mapFastraxRowToProduct } from "./mapper.js";

const DEFAULT_MAX_PAGES = 100;
const OPE4_STOP = 2;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {object} [options]
 * @param {number} [options.maxPages]
 * @param {boolean} [options.mergeOpe98]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function runFastraxProductSync(sb, options = {}) {
  if (!fastraxCatalogImportAllowed()) {
    return { ok: false, error: "FASTRAX_CATALOG_IMPORT_DISABLED" };
  }
  if (!fastraxEnabled()) {
    return { ok: false, error: "FASTRAX_DISABLED" };
  }
  if (!fastraxConfigured()) {
    return { ok: false, error: "Fastrax no configurado" };
  }

  const maxPages = Math.max(1, Math.min(500, Number(options.maxPages) || DEFAULT_MAX_PAGES));
  const mergeOpe98 = options.mergeOpe98 !== false;

  const seen = new Map();
  for (let page = 1; page <= maxPages; page += 1) {
    const r = await listProductsPage(page);
    if (!r.ok) {
      return { ok: false, error: r.message || "ope=4 fallo", ope4_page: page, parsed: r.parsed };
    }
    const rows = extractProductRows(r.parsed);
    if (rows.length === 0) break;
    for (const raw of rows) {
      if (!raw || typeof raw !== "object") continue;
      const m = mapFastraxRowToProduct(/** @type {Record<string, unknown>} */ (raw));
      if (!m) continue;
      seen.set(m.external_sku, m);
    }
    if (rows.length < OPE4_STOP) break;
  }

  if (mergeOpe98) {
    const b = await fastraxPost(98, {});
    if (b.ok && b.parsed) {
      for (const raw of extractProductRows(b.parsed)) {
        if (!raw || typeof raw !== "object") continue;
        const m = mapFastraxRowToProduct(/** @type {Record<string, unknown>} */ (raw));
        if (!m) continue;
        const prev = seen.get(m.external_sku);
        if (prev) {
          seen.set(m.external_sku, {
            ...prev,
            price: m.price || prev.price,
            stock: m.stock,
            name: m.name || prev.name,
            external_payload: m.external_payload,
          });
        } else {
          seen.set(m.external_sku, m);
        }
      }
    }
  }

  const stats = { total_seen: 0, inserted: 0, updated: 0, failed: 0, errors: [] };
  for (const m of seen.values()) {
    stats.total_seen += 1;
    const u = await upsertFastraxMappedRow(sb, m);
    if (!u.ok) {
      stats.failed += 1;
      stats.errors.push(String(u.error || "upsert"));
    } else if (u.action === "inserted") {
      stats.inserted += 1;
    } else {
      stats.updated += 1;
    }
  }

  return { ok: true, products_seen: seen.size, stats };
}