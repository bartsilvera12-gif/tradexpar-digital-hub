/**
 * Sincroniza catálogo Fastrax: ope=4 por páginas (y opcional ope=98 al final) → upsert en `products`.
 * Requiere `tradexpar.products.external_sku` (ver `server/sql/fastrax_supabase_sql_arrays.mjs` / Supabase).
 */

import { fastraxPost, fastraxConfigured, fastraxEnabled, listProductsPage } from "./client.js";
import {
  extractProductRows,
  mapFastraxRowToProduct,
  FASTRAX_SOURCE,
} from "./mapper.js";

function utcNowIso() {
  return new Date().toISOString();
}

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
    const now = utcNowIso();
    const row = {
      name: m.name,
      sku: m.external_sku,
      description: m.description,
      category: m.category,
      brand: m.brand,
      price: m.price,
      stock: m.stock,
      image: m.image || null,
      product_source_type: FASTRAX_SOURCE,
      external_provider: FASTRAX_SOURCE,
      external_sku: m.external_sku,
      external_product_id: m.external_sku,
      external_payload: m.external_payload,
      external_last_sync_at: now,
      updated_at: now,
      external_active: m.price > 0,
    };

    let exId = null;
    const { data: byExtSku, error: eBySku } = await sb
      .from("products")
      .select("id")
      .eq("external_provider", FASTRAX_SOURCE)
      .eq("external_sku", m.external_sku)
      .maybeSingle();
    if (eBySku) {
      stats.failed += 1;
      stats.errors.push(eBySku.message);
      continue;
    }
    if (byExtSku?.id) {
      exId = byExtSku.id;
    } else {
      const { data: byEp, error: eByEp } = await sb
        .from("products")
        .select("id")
        .eq("external_provider", FASTRAX_SOURCE)
        .eq("external_product_id", m.external_sku)
        .maybeSingle();
      if (eByEp) {
        stats.failed += 1;
        stats.errors.push(eByEp.message);
        continue;
      }
      if (byEp?.id) {
        exId = byEp.id;
      }
    }

    if (exId) {
      const { error: eUp } = await sb
        .from("products")
        .update({ ...row })
        .eq("id", exId);
      if (eUp) {
        stats.failed += 1;
        stats.errors.push(eUp.message);
      } else {
        stats.updated += 1;
      }
    } else {
      const { error: eIn } = await sb.from("products").insert([{ ...row }]);
      if (eIn) {
        stats.failed += 1;
        stats.errors.push(eIn.message);
      } else {
        stats.inserted += 1;
      }
    }
  }

  return { ok: true, products_seen: seen.size, stats };
}