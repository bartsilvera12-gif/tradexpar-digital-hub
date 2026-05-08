/**
 * Upsert de una fila Fastrax en `tradexpar.products` (solo fastrax, no toca otras filas).
 */

import { FASTRAX_SOURCE, mapFastraxRowToProduct } from "./mapper.js";
import { saveLocalFastraxProductImagesIfNeeded } from "./localFastraxImage.js";
import { formatFastraxDescription } from "./fastraxDescriptionFormatter.js";

/**
 * Indica si la columna `images` (jsonb) de tradexpar.products faltó en algún
 * insert/update previo en este proceso. Si fue así, evitamos enviarla en
 * llamadas posteriores para no repetir el round-trip que falla.
 */
let SKIP_IMAGES_COLUMN = false;

/**
 * Detecta el típico error de PostgREST cuando la columna no existe, p. ej.
 *   "Could not find the 'images' column of 'products' in the schema cache"
 *   "column \"images\" of relation \"products\" does not exist"
 * @param {{ message?: unknown } | null | undefined} err
 */
function isMissingImagesColumnError(err) {
  if (!err) return false;
  const msg = String(err.message || "").toLowerCase();
  if (!msg) return false;
  return (
    msg.includes("'images'") ||
    msg.includes('"images"') ||
    msg.includes(" images ") ||
    /column .*images.* does not exist/.test(msg)
  );
}

/**
 * Detecta el error típico cuando la check constraint del catálogo no acepta
 * 'fastrax' (BD vieja sin la migración Fastrax aplicada). Devuelve un mensaje
 * accionable para el admin en lugar del críptico de Postgres.
 * @param {{ message?: unknown } | null | undefined} err
 */
function describeKnownUpsertError(err) {
  if (!err) return "";
  const msg = String(err.message || "");
  const low = msg.toLowerCase();
  if (low.includes("products_source_type_chk") || /violates check constraint/i.test(msg)) {
    return (
      "BD bloquea product_source_type='fastrax' (constraint products_source_type_chk vieja). " +
      "Aplicá supabase/patches/2026_05_08_ensure_fastrax_in_public_catalog.sql en el SQL Editor."
    );
  }
  if (/column .*does not exist/i.test(msg) || /could not find the .* column/i.test(msg)) {
    return (
      `Columna ausente en tradexpar.products (${msg}). ` +
      "Aplicá supabase/patches/2026_05_08_ensure_fastrax_in_public_catalog.sql en el SQL Editor."
    );
  }
  return msg;
}

/**
 * Ejecuta `update`/`insert` con `images` jsonb; si la columna no existe en la
 * BD, reintenta sin ese campo y deja un log para que la próxima ejecución no
 * lo siga intentando.
 *
 * @template {{ images?: unknown }} R
 * @param {R} row
 * @param {(row: R) => Promise<{ data?: unknown, error?: { message?: unknown } | null }>} run
 */
async function runWithImagesFallback(row, run) {
  const send = SKIP_IMAGES_COLUMN ? stripImages(row) : row;
  const r = await run(/** @type {R} */ (send));
  if (r && r.error && isMissingImagesColumnError(r.error)) {
    if (!SKIP_IMAGES_COLUMN) {
      console.warn(
        "[fastrax/upsert] columna products.images ausente; reintentando sin gallery (fallback)"
      );
      SKIP_IMAGES_COLUMN = true;
    }
    return run(/** @type {R} */ (stripImages(row)));
  }
  return r;
}

/**
 * @template {{ images?: unknown }} R
 * @param {R} row
 * @returns {R}
 */
function stripImages(row) {
  if (!row || typeof row !== "object" || !("images" in row)) return row;
  const copy = { ...row };
  delete (/** @type {Record<string, unknown>} */(copy)).images;
  return /** @type {R} */ (copy);
}

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
 * @param {Record<string, unknown>} raw
 */
function descBrandCatFromFastraxDetail(raw) {
  const desRaw = raw.des ?? raw.descripcion ?? "";
  const breRaw = raw.bre ?? "";
  const description = formatFastraxDescription(desRaw, breRaw);
  return {
    description,
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
  const { mainImage, gallery } = await saveLocalFastraxProductImagesIfNeeded(extSku, rawPayload);
  const row = {
    name,
    sku: extSku,
    description: dbc.description || name,
    category: dbc.category,
    brand: dbc.brand,
    price,
    stock,
    image: mainImage || "",
    images: gallery.length > 0 ? gallery : null,
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
    const r = await runWithImagesFallback(row, (payload) =>
      sb.from("products").update({ ...payload }).eq("id", existing.id)
    );
    if (r && r.error) {
      return { ok: false, error: describeKnownUpsertError(r.error) || "update fallo" };
    }
    return { ok: true, action: "updated", id: String(existing.id) };
  }

  const r = await runWithImagesFallback(row, (payload) =>
    sb.from("products").insert([{ ...payload }]).select("id").maybeSingle()
  );
  if (r && r.error) {
    return { ok: false, error: describeKnownUpsertError(r.error) || "insert fallo" };
  }
  const insData = /** @type {{ id?: unknown } | null} */ (r && "data" in r ? r.data : null);
  return { ok: true, action: "inserted", id: insData?.id ? String(insData.id) : undefined };
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
  const payloadRecord =
    m.external_payload && typeof m.external_payload === "object" && !Array.isArray(m.external_payload)
      ? /** @type {Record<string, unknown>} */ (m.external_payload)
      : null;
  const { mainImage, gallery } = await saveLocalFastraxProductImagesIfNeeded(
    m.external_sku,
    payloadRecord
  );
  const formattedDesc = formatFastraxDescription(
    payloadRecord?.des ?? payloadRecord?.descripcion ?? m.description ?? "",
    payloadRecord?.bre ?? ""
  );
  const row = {
    name: m.name,
    sku: m.external_sku,
    description: formattedDesc || m.name,
    category: m.category,
    brand: m.brand,
    price: m.price,
    stock: m.stock,
    image: mainImage || m.image || null,
    images: gallery.length > 0 ? gallery : null,
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
    const r = await runWithImagesFallback(row, (payload) =>
      sb.from("products").update({ ...payload }).eq("id", exId)
    );
    if (r && r.error) {
      return { ok: false, error: describeKnownUpsertError(r.error) || "update fallo" };
    }
    return { ok: true, action: "updated", id: exId };
  }
  const r = await runWithImagesFallback(row, (payload) =>
    sb.from("products").insert([{ ...payload }]).select("id").maybeSingle()
  );
  if (r && r.error) {
    return { ok: false, error: describeKnownUpsertError(r.error) || "insert fallo" };
  }
  const insData = /** @type {{ id?: unknown } | null} */ (r && "data" in r ? r.data : null);
  return { ok: true, action: "inserted", id: insData?.id ? String(insData.id) : undefined };
}
