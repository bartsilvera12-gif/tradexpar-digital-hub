/**
 * Dropi vía bridge WordPress REST (`tradexpar-dropi/v1`).
 * GET {DROPI_BRIDGE_URL}/products · GET {DROPI_BRIDGE_URL}/product/{id}
 * Header: x-bridge-key (sin llamadas directas a api.dropi.* desde el VPS).
 * No Fastrax.
 */

import { extractDropiProductRows } from "./mapper.js";

function envTrim(key, fallback = "") {
  const v = process.env[key];
  if (v == null) return fallback;
  return String(v).trim();
}

function normalizeBridgeBase(raw) {
  return (raw || "").trim().replace(/\/+$/, "");
}

function bridgeVerboseLogs() {
  return String(process.env.DROPI_BRIDGE_DEBUG ?? "").trim() === "1";
}

function truncateSummary(text, max = 1200) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function truncateBodySummary(obj, max = 2500) {
  try {
    const s = JSON.stringify(obj);
    return s.length > max ? `${s.slice(0, max)}…` : s;
  } catch {
    return "(no serializable)";
  }
}

/**
 * Respuesta estilo plugin Dropi / bridge: `{ isSuccess, status, objects: [...] }`.
 * Prioridad: longitud de `objects` si es array; si no, filas extraíbles por el mapper.
 */
function countBridgeProducts(parsed) {
  if (!parsed || typeof parsed !== "object") return 0;
  const o = parsed.objects;
  if (Array.isArray(o)) return o.length;
  return extractDropiProductRows(parsed).length;
}

/** URL base del bridge (sin barra final). Ej.: https://tienda.tradexpar.com.py/wp-json/tradexpar-dropi/v1 */
export function resolveBridgeBaseUrl() {
  return normalizeBridgeBase(envTrim("DROPI_BRIDGE_URL"));
}

export function dropiConfigured() {
  return Boolean(resolveBridgeBaseUrl() && envTrim("DROPI_BRIDGE_KEY"));
}

function assertBridgeEnv() {
  const base = resolveBridgeBaseUrl();
  const key = envTrim("DROPI_BRIDGE_KEY");
  if (!base) {
    throw new Error("Definí DROPI_BRIDGE_URL en el entorno del server (bridge WordPress).");
  }
  if (!key) {
    throw new Error("Definí DROPI_BRIDGE_KEY en el entorno del server.");
  }
  return { base, key };
}

function bridgeHeaders(key) {
  return {
    Accept: "application/json",
    "User-Agent": "TradexparDropiBridge/1.0",
    "x-bridge-key": key,
  };
}

function summarizeHttpError(parsed, rawText, httpStatus) {
  if (parsed && typeof parsed === "object") {
    const msg = parsed.message ?? parsed.error ?? parsed.msg;
    if (msg != null) return truncateSummary(String(msg), 1500);
  }
  return truncateSummary(rawText || `HTTP ${httpStatus}`, 1500);
}

/**
 * Listado: GET {DROPI_BRIDGE_URL}/products
 */
export async function fetchDropiProductList() {
  const { base, key } = assertBridgeEnv();
  const url = `${base}/products`;

  const res = await fetch(url, {
    method: "GET",
    headers: bridgeHeaders(key),
  });

  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { _parse_error: true, _raw: text.slice(0, 2000) };
  }

  const objetos = countBridgeProducts(parsed);
  const bridgeStatus =
    parsed && typeof parsed === "object" && parsed.status !== undefined ? parsed.status : undefined;
  const bridgeOk =
    parsed && typeof parsed === "object" && parsed.isSuccess !== undefined ? parsed.isSuccess : undefined;

  console.info("[dropi/bridge] fetchDropiProductList", {
    url,
    httpStatus: res.status,
    isSuccess: bridgeOk,
    statusCampo: bridgeStatus,
    objetosRecibidos: objetos,
    ...(bridgeVerboseLogs() ? { respuestaResumida: truncateBodySummary(parsed) } : {}),
  });

  if (!res.ok) {
    const errResumido = summarizeHttpError(parsed, text, res.status);
    console.warn("[dropi/bridge] fetchDropiProductList error", {
      url,
      httpStatus: res.status,
      errorResumido: errResumido,
    });
    throw new Error(errResumido);
  }

  if (parsed && typeof parsed === "object" && parsed.isSuccess === false) {
    const parts = [];
    if (parsed.message != null) parts.push(`message: ${String(parsed.message)}`);
    if (parsed.status != null) parts.push(`status: ${String(parsed.status)}`);
    if (parsed.ip != null) parts.push(`ip: ${String(parsed.ip)}`);
    const msg = parts.join(" | ") || "Bridge isSuccess=false";
    console.warn("[dropi/bridge] fetchDropiProductList error", {
      url,
      httpStatus: res.status,
      errorResumido: truncateSummary(msg),
    });
    throw new Error(msg);
  }

  return parsed;
}

/**
 * Detalle: GET {DROPI_BRIDGE_URL}/product/{id}
 * @param {string | number} externalId
 */
export async function fetchDropiProductDetail(externalId) {
  const { base, key } = assertBridgeEnv();
  const id = encodeURIComponent(String(externalId).trim());
  const url = `${base}/product/${id}`;

  const res = await fetch(url, {
    method: "GET",
    headers: bridgeHeaders(key),
  });

  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    const err = `Bridge detalle: respuesta no JSON (${res.status})`;
    console.warn("[dropi/bridge] fetchDropiProductDetail error", {
      url,
      httpStatus: res.status,
      errorResumido: err,
    });
    throw new Error(err);
  }

  const detailObjs =
    parsed && typeof parsed === "object" && Array.isArray(parsed.objects)
      ? parsed.objects.length
      : parsed && typeof parsed === "object"
        ? 1
        : 0;

  console.info("[dropi/bridge] fetchDropiProductDetail", {
    url,
    httpStatus: res.status,
    isSuccess:
      parsed && typeof parsed === "object" && parsed.isSuccess !== undefined ? parsed.isSuccess : undefined,
    statusCampo:
      parsed && typeof parsed === "object" && parsed.status !== undefined ? parsed.status : undefined,
    objetosRecibidos: detailObjs,
    ...(bridgeVerboseLogs() ? { respuestaResumida: truncateBodySummary(parsed) } : {}),
  });

  if (!res.ok) {
    const errResumido = summarizeHttpError(parsed, text, res.status);
    console.warn("[dropi/bridge] fetchDropiProductDetail error", {
      url,
      httpStatus: res.status,
      errorResumido: errResumido,
    });
    throw new Error(errResumido);
  }

  if (parsed && typeof parsed === "object" && parsed.isSuccess === false) {
    const bits = [];
    if (parsed.message != null) bits.push(`message: ${parsed.message}`);
    if (parsed.status != null) bits.push(`status: ${String(parsed.status)}`);
    if (parsed.ip != null) bits.push(`ip: ${String(parsed.ip)}`);
    const msg = bits.join(" | ") || "Bridge isSuccess=false";
    console.warn("[dropi/bridge] fetchDropiProductDetail error", {
      url,
      httpStatus: res.status,
      errorResumido: truncateSummary(msg),
    });
    throw new Error(msg);
  }

  return parsed;
}

/**
 * POST JSON al bridge (crear pedido en Dropi, etc.). Misma base y `x-bridge-key` que GET.
 * @param {string} [pathSegment] Ruta bajo el base (default `order` → `{base}/order`). Sin slash inicial.
 * @param {Record<string, unknown>} bodyObj
 * @returns {Promise<Record<string, unknown>>}
 */
export async function postDropiBridgeJson(pathSegment, bodyObj) {
  const { base, key } = assertBridgeEnv();
  const seg = String(pathSegment || "order")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  const url = `${base}/${seg}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...bridgeHeaders(key),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(bodyObj && typeof bodyObj === "object" ? bodyObj : {}),
  });

  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { _parse_error: true, _raw: text.slice(0, 2000) };
  }

  const bridgeOk =
    parsed && typeof parsed === "object" && parsed.isSuccess !== undefined ? parsed.isSuccess : undefined;
  console.info("[dropi/bridge] postDropiBridgeJson", {
    url,
    pathSegment: seg,
    httpStatus: res.status,
    isSuccess: bridgeOk,
    ...(String(process.env.DROPI_BRIDGE_DEBUG ?? "").trim() === "1"
      ? { respuestaResumida: truncateBodySummary(parsed) }
      : {}),
  });

  if (!res.ok) {
    const errResumido = summarizeHttpError(parsed, text, res.status);
    console.warn("[dropi/bridge] postDropiBridgeJson error", { url, httpStatus: res.status, errorResumido: errResumido });
    throw new Error(errResumido);
  }

  if (parsed && typeof parsed === "object" && parsed.isSuccess === false) {
    const bits = [];
    if (parsed.message != null) bits.push(`message: ${parsed.message}`);
    if (parsed.status != null) bits.push(`status: ${String(parsed.status)}`);
    if (parsed.ip != null) bits.push(`ip: ${String(parsed.ip)}`);
    const msg = bits.join(" | ") || "Bridge isSuccess=false";
    console.warn("[dropi/bridge] postDropiBridgeJson error", { url, httpStatus: res.status, errorResumido: truncateSummary(msg) });
    throw new Error(msg);
  }

  return /** @type {Record<string, unknown>} */ (parsed && typeof parsed === "object" ? parsed : {});
}
