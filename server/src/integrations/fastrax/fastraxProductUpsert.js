/**
 * Upsert de una fila Fastrax en `tradexpar.products` (solo fastrax, no toca otras filas).
 */

import { FASTRAX_SOURCE, mapFastraxRowToProduct } from "./mapper.js";

function str(v) {
  if (v == null) return "";
  return String(v).trim();
}

function numV(v) {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Nombre o descripción con URL encoding típico (PHP) — mismo criterio que búsqueda ope=2.
 * @param {unknown} raw
 */
function decodeFastraxTextField(raw) {
  if (raw == null) return "";
  const s0 = String(raw).replace(/\+/g, " ");
  try {
    return decodeURIComponent(s0).trim();
  } catch {
    return s0.trim();
  }
}

/**
 * @param {Record<string, unknown>} raw
 */
function descBrandCatFromFastraxDetail(raw) {
  const dRaw = raw.des ?? raw.bre ?? raw.descripcion;
  const description = dRaw != null && String(dRaw) !== "" ? decodeFastraxTextField(dRaw) : "";
  return {
    description: description,
    brand: str(raw.mar ?? raw.Mar ?? raw.marca),
    category: str(raw.cat ?? raw.caw ?? raw.rubro),
  };
}

/**
 * Import desde el buscador: datos ya resueltos (sin ope=2 otra vez).
 * UPSERT por (external_provider, external_product_id).
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {{ sku?: unknown, name?: unknown, price?: unknown, stock?: unknown, raw_detail?: unknown }} item
 * @returns {Promise<{ ok: boolean, action?: 'inserted' | 'updated', id?: string, error?: string }>}
 */
export async function upsertFastraxFromImportItem(sb, item) {
  const extSku = str(item.sku);
  if (!extSku) {
    return { ok: false, error: "sku requerido" };
  }
  const nameIn = str(item.name);
  const name = nameIn || `Producto ${extSku}`;
  const price = Math.max(0, numV(item.price));
  const stock = Math.max(0, Math.floor(numV(item.stock)));

  let rawPayload = /** @type {Record<string, unknown>} */ ({});
  const rd = item.raw_detail;
  if (rd && typeof rd === "object" && !Array.isArray(rd)) {
    if (Object.prototype.hasOwnProperty.call(/** @type {object} */(rd), "_ope2_error")) {
      return { ok: false, error: "raw_detail ope2 inválido" };
    }
    rawPayload = { .../** @type {Record<string, unknown>} */(rd) };
  }
  const dbc = descBrandCatFromFastraxDetail(rawPayload);

  const now = new Date().toISOString();
  const row = {
    name,
    sku: extSku,
    description: dbc.description || name,
    category: dbc.category,
    brand: dbc.brand,
    price,
    stock,
    image: "",
    product_source_type: FASTRAX_SOURCE,
    external_provider: FASTRAX_SOURCE,
    external_sku: extSku,
    external_product_id: extSku,
    external_payload: rawPayload,
    external_last_sync_at: now,
    updated_at: now,
    external_active: price > 0,
  };

  const { data: existing, error: eFind } = await sb
    .from("products")
    .select("id")
    .eq("external_provider", FASTRAX_SOURCE)
    .eq("external_product_id", extSku)
    .maybeSingle();
  if (eFind) {
    return { ok: false, error: eFind.message };
  }

  if (existing?.id) {
    const { error: eUp } = await sb.from("products").update({ ...row }).eq("id", existing.id);
    if (eUp) {
      return { ok: false, error: eUp.message };
    }
    return { ok: true, action: "updated", id: String(existing.id) };
  }

  const { data: ins, error: eIn } = await sb.from("products").insert([{ ...row }]).select("id").maybeSingle();
  if (eIn) {
    return { ok: false, error: eIn.message };
  }
  return { ok: true, action: "inserted", id: ins?.id ? String(ins.id) : undefined };
}

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
