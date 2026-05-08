/**
 * Persiste imágenes ope=3 en disco y expone URLs bajo /fastrax-products/ (express.static).
 *
 * - `saveLocalFastraxProductImageIfNeeded(sku, rawDetail)`:
 *   variante legacy (devuelve solo URL principal). Internamente delega en la
 *   versión multi-imagen y devuelve `mainImage`.
 * - `saveLocalFastraxProductImagesIfNeeded(sku, rawDetail)`:
 *   descarga TODAS las imágenes informadas en `raw_detail.img|Img` (índices
 *   1..N, máximo MAX_IMAGES por seguridad) y devuelve
 *   `{ mainImage: string | null, gallery: string[] }`.
 *
 * Nombres de archivo:
 *   {SKU}-1.jpg, {SKU}-2.jpg, …  (formato nuevo, multi-imagen).
 *
 * Compatibilidad con productos previamente importados:
 *   Si ya existía el legacy {SKU}.jpg y aún no existe {SKU}-1.jpg, se copia
 *   automáticamente para evitar redescargar y dejar el path numerado listo.
 */

import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFastraxImageOpe3 } from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Raíz `server/` (este archivo vive en server/src/integrations/fastrax). */
const SERVER_ROOT = path.resolve(__dirname, "..", "..", "..");
export const FASTRAX_LOCAL_IMAGE_DIR = path.join(SERVER_ROOT, "public", "fastrax-products");

/**
 * Tope de seguridad: si `raw_detail.img` viene exagerado (p. ej. mal codificado),
 * limitamos a este máximo para no martillar el bridge.
 */
const MAX_IMAGES_PER_PRODUCT = 10;

function numF(v) {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Misma idea que `pickImagesCountFromOpe2` en controlledCatalog.js.
 * @param {Record<string, unknown> | null | undefined} row
 */
function fastraxImageCountFromRaw(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return 0;
  const v = row.img ?? row.Img;
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  const t = String(v).trim();
  if (!t) return 0;
  if (/^-?\d+([.,]\d+)?$/.test(t)) return Math.max(0, Math.floor(numF(t)));
  return 1;
}

/**
 * @param {string} sku
 */
function safeSkuFileBase(sku) {
  const s = String(sku).trim();
  if (!s) return "";
  const base = s.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^\.+/, "_").slice(0, 200);
  return base || "sku";
}

/**
 * Intenta GET interno al propio servidor (misma semántica que el curl con x-api-key).
 * @param {string} sku
 * @param {number} idx — índice de imagen (1..N)
 * @returns {Promise<Buffer | null>}
 */
async function fetchImageBufferViaInternalHttp(sku, idx) {
  const sSku = String(sku).trim();
  const nIdx = Math.max(1, Math.floor(Number(idx) || 1));
  if (!sSku) return null;
  const port = Number(process.env.PORT || 8787);
  const origin = String(process.env.FASTRAX_INTERNAL_IMAGE_ORIGIN || `http://127.0.0.1:${port}`).replace(/\/+$/, "");
  const key = String(process.env.API_PUBLIC_KEY || process.env.API_KEY || "").trim();
  if (!key) return null;
  try {
    const url = `${origin}/api/admin/fastrax/products/${encodeURIComponent(sSku)}/image/${nIdx}`;
    const res = await fetch(url, { headers: { "x-api-key": key } });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json") || ct.includes("text/json")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    if (buf[0] === 0x7b || buf[0] === 0x5b) return null;
    return buf;
  } catch {
    return null;
  }
}

/**
 * @param {string} sku
 * @param {number} idx
 * @returns {Promise<Buffer | null>}
 */
async function fetchImageBufferDirect(sku, idx) {
  const r = await getFastraxImageOpe3(sku, idx);
  if (!r || !r.ok || !r.body || !Buffer.isBuffer(r.body)) return null;
  return r.body;
}

async function fileExists(absPath) {
  try {
    await fsPromises.access(absPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Si existe el legacy `{SKU}.jpg` pero todavía no `{SKU}-1.jpg`, lo copiamos
 * para mantener compatibilidad con productos importados antes de multi-imagen.
 * No falla si el copy no se puede hacer; simplemente retorna false.
 * @param {string} fileBase
 * @returns {Promise<boolean>}
 */
async function migrateLegacyFirstImage(fileBase) {
  const legacyAbs = path.join(FASTRAX_LOCAL_IMAGE_DIR, `${fileBase}.jpg`);
  const numberedAbs = path.join(FASTRAX_LOCAL_IMAGE_DIR, `${fileBase}-1.jpg`);
  if (await fileExists(numberedAbs)) return true;
  if (!(await fileExists(legacyAbs))) return false;
  try {
    await fsPromises.copyFile(legacyAbs, numberedAbs);
    return true;
  } catch {
    return false;
  }
}

/**
 * Descarga (si hace falta) la imagen `idx` del producto y devuelve la URL
 * pública (`/fastrax-products/{SKU}-{idx}.jpg`) o null si no fue posible.
 * @param {string} sSku
 * @param {string} fileBase
 * @param {number} idx
 * @returns {Promise<string | null>}
 */
async function ensureSingleImage(sSku, fileBase, idx) {
  const fileName = `${fileBase}-${idx}.jpg`;
  const absPath = path.join(FASTRAX_LOCAL_IMAGE_DIR, fileName);
  const publicPath = `/fastrax-products/${fileName}`;

  if (await fileExists(absPath)) {
    return publicPath;
  }

  let buf = await fetchImageBufferViaInternalHttp(sSku, idx);
  if (!buf) {
    buf = await fetchImageBufferDirect(sSku, idx);
  }
  if (!buf || !buf.length) {
    return null;
  }

  try {
    await fsPromises.mkdir(FASTRAX_LOCAL_IMAGE_DIR, { recursive: true });
    await fsPromises.writeFile(absPath, buf, { flag: "wx" });
  } catch (e) {
    if (e && /** @type {NodeJS.ErrnoException} */ (e).code === "EEXIST") {
      return publicPath;
    }
    return null;
  }
  return publicPath;
}

/**
 * Descarga todas las imágenes informadas en `raw_detail.img` y devuelve
 * `{ mainImage, gallery }` con URLs públicas. No bloquea la importación
 * si alguna imagen secundaria falla; mainImage se setea siempre que al
 * menos la imagen 1 esté disponible (vía descarga o vía archivo existente).
 *
 * @param {string} sku
 * @param {Record<string, unknown> | null | undefined} rawDetail
 * @returns {Promise<{ mainImage: string | null, gallery: string[] }>}
 */
export async function saveLocalFastraxProductImagesIfNeeded(sku, rawDetail) {
  const sSku = String(sku).trim();
  if (!sSku) return { mainImage: null, gallery: [] };
  const reportedRaw = fastraxImageCountFromRaw(rawDetail);
  if (reportedRaw <= 0) return { mainImage: null, gallery: [] };
  const reported = Math.min(reportedRaw, MAX_IMAGES_PER_PRODUCT);

  const fileBase = safeSkuFileBase(sSku);

  await migrateLegacyFirstImage(fileBase);

  const gallery = [];
  let saved = 0;
  let failed = 0;
  for (let idx = 1; idx <= reported; idx += 1) {
    const url = await ensureSingleImage(sSku, fileBase, idx);
    if (url) {
      gallery.push(url);
      saved += 1;
    } else {
      failed += 1;
      if (idx === 1) {
        // Si la primera imagen falla, no tiene sentido seguir intentando
        // las siguientes en este pase (probablemente el SKU no expone
        // imágenes ahora). Logueamos y salimos.
        break;
      }
      console.warn(
        `[fastrax/image] sku=${sSku} miss idx=${idx} (sigo con las restantes)`
      );
    }
  }

  console.info(
    `[fastrax/image] sku=${sSku} images_expected=${reported}${
      reportedRaw !== reported ? ` (capped from ${reportedRaw})` : ""
    } saved=${saved} failed=${failed}`
  );

  if (gallery.length === 0) {
    return { mainImage: null, gallery: [] };
  }
  return { mainImage: gallery[0], gallery };
}

/**
 * Variante legacy: solo devuelve la imagen principal (`/fastrax-products/{SKU}-1.jpg`).
 * Mantenida para compatibilidad con callers existentes; internamente reutiliza
 * la nueva función multi-imagen, así que el efecto es exactamente el mismo
 * (descarga 1..N e instala todos los archivos numerados en disco).
 *
 * @param {string} sku
 * @param {Record<string, unknown> | null | undefined} rawDetail
 * @returns {Promise<string | null>}
 */
export async function saveLocalFastraxProductImageIfNeeded(sku, rawDetail) {
  const r = await saveLocalFastraxProductImagesIfNeeded(sku, rawDetail);
  return r.mainImage;
}
