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

/**
 * Fastrax devuelve textos URL-encoded (`+` = espacio, `%2F` = `/`, `%C2%A0` = NBSP, etc).
 * Los decodificamos antes de guardar para que el nombre se vea limpio en la tienda.
 * @param {unknown} v
 */
function decodeStr(v) {
  const s = String(v ?? "").replace(/\+/g, " ").trim();
  if (!s) return "";
  try {
    // Uso decodeURIComponent para %XX; si viene basura, cae al catch y devuelve el string sin decodificar.
    return decodeURIComponent(s).replace(/ /g, " ").replace(/\s+/g, " ").trim();
  } catch {
    return s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
  }
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
  const keys = ["nom", "nombre", "name", "titulo"];
  for (const k of keys) {
    const v = decodeStr(row[k]);
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
const STOCK_KEYS = ["sal", "Sal", "saldo", "Saldo", "stock", "Stock", "disponible", "cantidad", "existencia"];

/** @param {unknown} v */
function stockNumOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
}

export function pickStock(row) {
  // `num()` devuelve 0 para claves ausentes, así que NO se puede usar `n >= 0` como corte:
  // haría que la primera clave gane siempre y el resto quede muerto (stock 0 salvo que venga en `sal`).
  for (const k of STOCK_KEYS) {
    const n = stockNumOrNull(row[k]);
    if (n != null) return n;
  }
  return 0;
}

/**
 * ¿La fila cruda trae realmente algún dato de stock? Permite distinguir "stock 0 real" de
 * "la fila no informó stock", necesario para no pisar un saldo bueno al mezclar respuestas.
 * @param {Record<string, unknown> | null | undefined} row
 */
export function fastraxRowHasStock(row) {
  if (!row || typeof row !== "object") return false;
  return STOCK_KEYS.some((k) => stockNumOrNull(/** @type {Record<string, unknown>} */ (row)[k]) != null);
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
 * Códigos del árbol de categorías de Fastrax (`caw` / `cat`) → categoría real.
 * Combinación de: (1) codigos "árbol" (caw) que llegan como "41,42" y (2) códigos
 * de categoría directa (cat) extraídos del CSV oficial que compartió el cliente.
 * Fastrax a veces envía el ID del nodo en vez del nombre; sin esto, el código
 * termina guardado como "categoría" y aparece en el menú de la tienda.
 */
const FASTRAX_CATEGORY_CODE_MAP = {
  // Códigos árbol (caw)
  "41,42": "INSUMOS",
  "41,44": "INSUMOS",
  "66,78": "ACCESORIOS",
  "66,31": "ACCESORIOS",
  "66,27": "ACCESORIOS",
  "66,77": "ACCESORIOS",
  "66,71": "ACCESORIOS",
  "66,88": "ACCESORIOS",
  "33,35": "ACCESORIOS",
  "33,91": "ELECTRONICOS",
  "24,23": "ELECTRONICOS",
  "64,60": "PDV",
  "33,37": "COMPONENTE PC",
  "43,79": "NETWORK",
  "43,83": "NETWORK",
  "102,106": "Herramientas",
  // Códigos directos (cat) — extraídos del CSV oficial de Fastrax
  "14": "ALMACENAMIENTO EXT",
  "52": "NETWORK",
  "58": "SOFTWARE",
  "59": "GAMER",
  "79": "ACCESORIOS",
  "86": "ENTRETENIMIENTO",
  "91": "ELECTRONICOS",
  "96": "COMPUTADORAS ESCRITORIO",
  "97": "INSUMOS",
  "105": "PDV",
  "110": "COMPONENTE PC",
  "112": "TERMICOS",
  "120": "ELECTRODOMESTICO",
  "122": "MINERIA",
};

/**
 * Códigos de marca de Fastrax (campo `mar`) → nombre de marca real.
 * Extraídos del CSV oficial de Fastrax (COD MARCA → MARCA).
 */
const FASTRAX_BRAND_CODE_MAP = {
  "2": "HP",
  "3": "DIVERSAS",
  "5": "EPSON",
  "7": "KINGSTON",
  "8": "GENERICO",
  "9": "KLIP",
  "12": "AMP",
  "13": "BRADY",
  "15": "FUJIKURA",
  "17": "BENQ",
  "21": "LG",
  "22": "AMD",
  "27": "ASUS",
  "29": "TRANSITION",
  "30": "MICROSOFT",
  "31": "GIGABYTE",
  "32": "JVC",
  "34": "LANPRO",
  "36": "INTEL",
  "43": "FTX",
  "47": "ATRIAN",
  "48": "XTECH",
  "51": "3NSTAR",
  "56": "CRUCIAL",
  "58": "MSI",
  "60": "FAYSER",
  "67": "ADECOM",
  "73": "OPTOMA",
  "75": "SENTAL PARAGUAY",
  "89": "ASUSTOR",
  "91": "XIAOMI",
  "112": "MULTILASER",
  "120": "IGLOO",
  "127": "HIKVISION",
  "131": "KITCHENAID",
  "136": "SAFARIMAX",
};

/**
 * Resuelve la marca real. Si el valor viene como código (solo dígitos), lo mapea
 * a nombre; si viene como texto legible, lo respeta.
 * @param {Record<string, unknown>} raw
 */
export function resolveFastraxBrand(raw) {
  const v = decodeStr(raw?.mar ?? raw?.Mar ?? raw?.marca);
  if (!v) return "";
  // Si es un código numérico, mapear
  if (/^\d+$/.test(v)) return FASTRAX_BRAND_CODE_MAP[v] || "";
  return v.slice(0, 100);
}

/** Un valor "solo números" (con `,` `.` o espacios) es un código de Fastrax, no un nombre. */
const FASTRAX_NUMERIC_CODE_RE = /^\d+(?:[.,\s]+\d+)*$/;

/**
 * Resuelve la categoría real a partir de los campos crudos de Fastrax (`caw`, `cat`, `rubro`).
 * - Nombre legible → se respeta.
 * - Código conocido → nombre mapeado.
 * - Código numérico desconocido → "" (nunca metemos un número en el menú de categorías).
 * @param {Record<string, unknown>} raw
 * @returns {string}
 */
export function resolveFastraxCategory(raw) {
  const caw = str(raw?.caw ?? raw?.Caw);
  const cat = str(raw?.cat ?? raw?.Cat ?? raw?.rubro ?? raw?.Rubro);
  for (const v of [caw, cat]) {
    if (v && !FASTRAX_NUMERIC_CODE_RE.test(v.replace(/\s+/g, ""))) return v.slice(0, 200);
  }
  for (const code of [caw, cat]) {
    const mapped = code ? FASTRAX_CATEGORY_CODE_MAP[code.replace(/\s+/g, "")] : undefined;
    if (mapped) return mapped;
  }
  return "";
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
    description: decodeStr(raw.des ?? raw.bre ?? raw.descripcion ?? ""),
    image: str(
      raw.img ?? raw.Img ?? raw.foto ?? raw.image ?? rowUrl(raw)
    ),
    category: resolveFastraxCategory(raw),
    brand: resolveFastraxBrand(raw),
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