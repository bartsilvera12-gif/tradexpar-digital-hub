/**
 * PagoPar / checkout usan códigos de ciudad distintos a Dropi (cotización / sucursales).
 * No pasar el código PagoPar «tal cual» si no hay entrada explícita en el mapa (evita errores tipo sucursal inexistente).
 *
 * Configuración:
 * - `DROPI_CITY_MAP_JSON` — objeto JSON `{"pagopar_code":"dropi_code",…}` se fusiona con el mapa estático.
 * - `DROPI_CITY_NAME_MAP_JSON` — objeto JSON `{"nombre normalizado":"dropi_code"}` para reglas por nombre visible.
 * - `USE_DROPI_CITY_CODE_MAP` en createOrderForInternal.js — si `false`, comportamiento legacy: cualquier código PagoPar se reenvía como `dropi_city_code` (riesgoso).
 */

/** @type {Record<string, string>} */
const STATIC_PAGOPAR_TO_DROPI = {
  "7": "11", // Fernando de la Mora (PagoPar) → Central (Dropi) — ejemplo
};

function envTrim(key) {
  const v = process.env[key];
  if (v == null) return "";
  return String(v).trim();
}

/** `USE_DROPI_CITY_CODE_MAP=false` (env del server) = modo legacy: se reenvía el código PagoPar sin exigir entrada en el mapa. */
export function isStrictPagoparToDropiMapping() {
  return envTrim("USE_DROPI_CITY_CODE_MAP") !== "false";
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
function normalizePagoparCode(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  return s;
}

/**
 * Minúsculas, sin acentos comunes, colapsa espacios (clave para DROPI_CITY_NAME_MAP_JSON).
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeCityNameKey(raw) {
  if (raw == null) return "";
  let s = String(raw).trim().toLowerCase();
  const mapAccents = {
    á: "a",
    é: "e",
    í: "i",
    ó: "o",
    ú: "u",
    ü: "u",
    ñ: "n",
  };
  s = s.replace(/[áéíóúüñ]/g, (ch) => mapAccents[ch] ?? ch);
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * @returns {Record<string, string>}
 */
function parseJsonObjectMap(envKey) {
  const raw = envTrim(envKey);
  if (!raw) return {};
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    /** @type {Record<string, string>} */
    const out = {};
    for (const [k, v] of Object.entries(o)) {
      if (v == null) continue;
      const ks = String(k).trim();
      const vs = String(v).trim();
      if (ks && vs) out[ks] = vs;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Mapas efectivos: estático + env `DROPI_CITY_MAP_JSON`.
 * @returns {Record<string, string>}
 */
export function getMergedPagoparCodeToDropiMap() {
  const fromEnv = parseJsonObjectMap("DROPI_CITY_MAP_JSON");
  return { ...STATIC_PAGOPAR_TO_DROPI, ...fromEnv };
}

/**
 * @returns {Record<string, string>}
 */
function getNameToDropiMap() {
  return parseJsonObjectMap("DROPI_CITY_NAME_MAP_JSON");
}

/**
 * @typedef {{ ok: true, dropi_city_code: string }} MapOk
 * @typedef {{ ok: false, reason: 'missing_dropi_city_mapping', pagopar_city_code?: string }} MapFail
 */

/**
 * Resuelve código de ciudad para Dropi.
 * En modo estricto (`isStrictPagoparToDropiMapping()`), solo devuelve `ok: true` si hay mapeo explícito
 * o passthrough explícito en JSON (`"1110":"1110"`).
 *
 * @param {unknown} code - Código checkout/PagoPar (`orders.customer_city_code`)
 * @param {unknown} [cityName] - Nombre visible (`orders.customer_city_name`) para `DROPI_CITY_NAME_MAP_JSON`
 * @returns {MapOk | MapFail}
 */
export function mapPagoparToDropi(code, cityName) {
  const key = normalizePagoparCode(code);
  const nameKey = normalizeCityNameKey(cityName);
  const merged = getMergedPagoparCodeToDropiMap();
  const nameMap = getNameToDropiMap();

  if (key && merged[key]) {
    return { ok: true, dropi_city_code: String(merged[key]).trim() };
  }
  if (nameKey && nameMap[nameKey]) {
    return { ok: true, dropi_city_code: String(nameMap[nameKey]).trim() };
  }

  if (!isStrictPagoparToDropiMapping()) {
    if (key) {
      return { ok: true, dropi_city_code: key };
    }
    return { ok: false, reason: "missing_dropi_city_mapping" };
  }

  return {
    ok: false,
    reason: "missing_dropi_city_mapping",
    ...(key ? { pagopar_city_code: key } : {}),
  };
}
