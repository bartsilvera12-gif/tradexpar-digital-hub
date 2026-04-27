/**
 * Upsert de una fila Fastrax en `tradexpar.products` (solo fastrax, no toca otras filas).
 */

import { FASTRAX_SOURCE, mapFastraxRowToProduct } from "./mapper.js";

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {Record<string, unknown>} raw — fila ope=2/4
 * @returns {Promise<{ ok: boolean, action?: string, id?: string, error?: string }>}
 */
export async function upsertFastraxFromRawRow(sb, raw) {
  const m = mapFastraxRowToProduct(/** @type {Record<string, unknown>} */ (raw));
  if (!m) {
    return { ok: false, error: "Sin SKU reconocible en fila Fastrax" };
  }
  return upsertFastraxMappedRow(sb, m);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {NonNullable<ReturnType<typeof mapFastraxRowToProduct>>} m
 * @returns {Promise<{ ok: boolean, action?: 'inserted' | 'updated', id?: string, error?: string }>}
 */
export async function upsertFastraxMappedRow(sb, m) {
  const now = new Date().toISOString();
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
    return { ok: false, error: eBySku.message };
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
      return { ok: false, error: eByEp.message };
    }
    if (byEp?.id) {
      exId = byEp.id;
    }
  }

  if (exId) {
    const { error: eUp } = await sb.from("products").update({ ...row }).eq("id", exId);
    if (eUp) {
      return { ok: false, error: eUp.message };
    }
    return { ok: true, action: "updated", id: exId };
  }
  const { data: ins, error: eIn } = await sb.from("products").insert([{ ...row }]).select("id").maybeSingle();
  if (eIn) {
    return { ok: false, error: eIn.message };
  }
  return { ok: true, action: "inserted", id: ins?.id ? String(ins.id) : undefined };
}
