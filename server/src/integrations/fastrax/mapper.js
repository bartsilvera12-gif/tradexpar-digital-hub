/**
 * Mapeo Fastrax → filas `tradexpar.products`. source: fastrax
 */

import { findFirstStringKeyDeep, extractFastraxPedPdc } from "./fastraxResponse.js";

export { extractFastraxPedPdc };

export const FASTRAX_SOURCE = "fastrax";

function str(v) {
  if (v == null) return "";
  return String(v).trim();
}

function num(v) {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function isPlainObject(x) {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

/** @param {Record<string, unknown>} row */
function pickSku(row) {
  const keys = [
    "sku", "SKU",
    "codigo", "cod_art", "CodArt", "COD_ART", "articulo", "codigo_articulo", "ref", "Ref",
  ];
  for (const k of keys) {
    const v = str(row[k]);
    if (v) return v;
  }
  return "";
}

/**
 * @param {Record<string, unknown>} row
 */
function pickName(row) {
  const keys = ["nom", "nom", "nombre", "name", "titulo"];
  for (const k of keys) {
    const v = str(row[k]);
    if (v) return v.slice(0, 500);
  }
  return "";
}

/**
 * Precio venta efectivo (misma idea que ope=2/98 en Edge).
 * @param {Record<string, unknown>} row
 */
function pickPrice(row) {
  const pre = num(row.pre ?? row.Pre);
  const prm = num(row.prm ?? row.Prm);
  const precopromo = num(row.precopromo ?? row.PrecioPromo);
  const promo = String(row.promo ?? row.pmp ?? row.ppm ?? "").toLowerCase();
  const promoOn = promo === "1" || promo === "s" || promo === "true";
  if (promoOn && precopromo > 0) return Math.max(0, precopromo);
  if (promoOn && prm > 0) return Math.max(0, prm);
  if (pre > 0) return Math.max(0, pre);
  for (const k of ["precio", "importe", "pventa"]) {
    const p = num(row[k]);
    if (p > 0) return p;
  }
  return 0;
}

/**
 * @param {Record<string, unknown>} row
 */
function pickStock(row) {
  for (const k of ["sal", "Sal", "saldo", "stock", "disponible"]) {
    const n = Math.floor(num(row[k]));
    if (n >= 0) return n;
  }
  return 0;
}

/**
 * @param {unknown} root
 * @param {number} depth
 * @returns {Record<string, unknown>[]}
 */
export function extractProductRows(root, depth = 0) {
  if (depth > 8) return [];
  if (root == null) return [];
  if (Array.isArray(root)) {
    if (root.length === 0) return [];
    const first = root[0];
    if (isPlainObject(first) && pickSku(/** @type {Record<string, unknown>} */ (first))) {
      return root.filter(isPlainObject);
    }
    const merged = [];
    for (const el of root) {
      merged.push(...extractProductRows(el, depth + 1));
    }
    return merged;
  }
  if (!isPlainObject(root)) return [];
  const preferredKeys = [
    "productos", "datos", "data", "result", "rows", "items", "lista", "d", "D", "Table",
  ];
  for (const k of preferredKeys) {
    if (k in root) {
      const inner = extractProductRows(/** @type {Record<string, unknown>} */ (root)[k], depth + 1);
      if (inner.length) return inner;
    }
  }
  if (pickSku(root)) return [root];
  const merged = [];
  for (const v of Object.values(root)) {
    if (Array.isArray(v) || isPlainObject(v)) {
      merged.push(...extractProductRows(v, depth + 1));
    }
  }
  return merged;
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {{ source: string, external_sku: string, external_id: string, name: string, price: number, stock: number, description: string, image: string, category: string, brand: string, external_payload: Record<string, unknown> }}
 */
export function mapFastraxRowToProduct(raw) {
  const sku = pickSku(raw);
  if (!sku) {
    return null;
  }
  return {
    source: FASTRAX_SOURCE,
    external_sku: sku,
    external_id: sku,
    name: pickName(raw) || `Producto ${sku}`,
    price: pickPrice(raw),
    stock: pickStock(raw),
    description: str(raw.des ?? raw.bre ?? raw.descripcion ?? "") || "",
    image: str(
      raw.img ?? raw.Img ?? raw.foto ?? raw.image ?? rowUrl(raw)
    ),
    category: str(raw.caw ?? raw.cat ?? raw.rubro ?? "") || "",
    brand: str(raw.mar ?? raw.Mar ?? raw.marca ?? "") || "",
    external_payload: raw,
  };
}

/**
 * @param {Record<string, unknown>} r
 */
function rowUrl(r) {
  if (r.url) return str(r.url);
  if (r.foto) return str(r.foto);
  return "";
}

/**
 * ope=13: campo `sit` (1–9).
 * @param {unknown} n
 * @param {string | null} [fallback]
 */
export function sitToLabel(n, fallback = null) {
  const s = n != null ? String(n).trim() : "";
  const k = s.replace(/^0+/, "") || s;
  const table = {
    "1": "Emitido",
    "2": "Borrado",
    "3": "Pagado",
    "4": "Separando",
    "5": "Separado",
    "6": "Expedido",
    "7": "Entregado",
    "8": "RMA",
    "9": "Devuelto",
  };
  if (table[k]) return table[k];
  if (fallback) return fallback;
  return s || "Desconocido";
}

/**
 * ope=13: localizar `sit` en toda la respuesta.
 * @param {unknown} parsed
 * @returns {string | number | null}
 */
export function pickSitCode(parsed) {
  if (parsed == null) return null;
  if (!Array.isArray(parsed) && isPlainObject(parsed)) {
    const o = /** @type {Record<string, unknown>} */ (parsed);
    for (const k of ["sit", "Sit", "SIT", "estado", "est", "Est"]) {
      if (o[k] != null && o[k] !== "")
        return typeof o[k] === "number" ? o[k] : str(o[k]) || null;
    }
  }
  const deep = findFirstStringKeyDeep(parsed, ["sit", "Sit", "SIT", "estado", "est", "Est"]);
  if (deep) {
    const n = Number(deep);
    return Number.isFinite(n) ? n : deep;
  }
  return null;
}