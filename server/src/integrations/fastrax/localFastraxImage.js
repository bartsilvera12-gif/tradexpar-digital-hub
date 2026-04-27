/**
 * Persiste imagen ope=3 en disco y expone URL bajo /fastrax-products/ (express.static).
 * Equivalente funcional a GET /api/admin/fastrax/products/:sku/image/1 con x-api-key.
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
 * @returns {Promise<Buffer | null>}
 */
async function fetchImageBufferViaInternalHttp(sku) {
  const sSku = String(sku).trim();
  if (!sSku) return null;
  const port = Number(process.env.PORT || 8787);
  const origin = String(process.env.FASTRAX_INTERNAL_IMAGE_ORIGIN || `http://127.0.0.1:${port}`).replace(/\/+$/, "");
  const key = String(process.env.API_PUBLIC_KEY || process.env.API_KEY || "").trim();
  if (!key) return null;
  try {
    const url = `${origin}/api/admin/fastrax/products/${encodeURIComponent(sSku)}/image/1`;
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
 * @returns {Promise<Buffer | null>}
 */
async function fetchImageBufferDirect(sku) {
  const r = await getFastraxImageOpe3(sku, 1);
  if (!r || !r.ok || !r.body || !Buffer.isBuffer(r.body)) return null;
  return r.body;
}

/**
 * @param {string} sku
 * @param {Record<string, unknown> | null | undefined} rawDetail
 * @returns {Promise<string | null>} Ruta pública tipo `/fastrax-products/482.jpg` o null.
 */
export async function saveLocalFastraxProductImageIfNeeded(sku, rawDetail) {
  const sSku = String(sku).trim();
  if (!sSku) return null;
  const nImg = fastraxImageCountFromRaw(rawDetail);
  if (nImg <= 0) return null;

  const fileBase = safeSkuFileBase(sSku);
  const fileName = `${fileBase}.jpg`;
  const absPath = path.join(FASTRAX_LOCAL_IMAGE_DIR, fileName);
  const publicPath = `/fastrax-products/${fileName}`;

  try {
    if (fs.existsSync(absPath)) {
      return publicPath;
    }
  } catch {
    /* continuar e intentar descargar */
  }

  let buf = await fetchImageBufferViaInternalHttp(sSku);
  if (!buf) {
    buf = await fetchImageBufferDirect(sSku);
  }
  if (!buf || !buf.length) {
    console.warn(`[fastrax/image] failed for sku=${sSku}`);
    return null;
  }

  try {
    await fsPromises.mkdir(FASTRAX_LOCAL_IMAGE_DIR, { recursive: true });
    await fsPromises.writeFile(absPath, buf, { flag: "wx" });
  } catch (e) {
    if (e && /** @type {NodeJS.ErrnoException} */ (e).code === "EEXIST") {
      return publicPath;
    }
    console.warn(`[fastrax/image] failed for sku=${sSku}`);
    return null;
  }

  return publicPath;
}
