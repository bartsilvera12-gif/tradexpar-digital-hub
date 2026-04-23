/**
 * Dropi vía bridge HTTP (WordPress/Hostinger).
 * Sin llamadas directas a api.dropi.* desde este proceso (evita Access denied desde VPS).
 * No Fastrax.
 */

import { extractDropiProductRows } from "./mapper.js";

function envTrim(key, fallback = "") {
  const v = process.env[key];
  if (v == null) return fallback;
  return String(v).trim();
}

function normalizeBridgeBase(raw) {
  let u = (raw || "").trim().replace(/\/+$/, "");
  return u;
}

function bridgeDebugEnabled() {
  return String(process.env.DROPI_BRIDGE_DEBUG ?? "").trim() === "1";
}

function truncateBodySummary(obj, max = 2500) {
  try {
    const s = JSON.stringify(obj);
    return s.length > max ? `${s.slice(0, max)}…` : s;
  } catch {
    return "(no serializable)";
  }
}

/** URL base del bridge (sin barra final), ej. https://midominio.com/wp-json/mi-namespace/v1 */
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

function logBridge(operation, payload) {
  console.info(`[dropi/bridge] ${operation}`, payload);
}

/**
 * Listado de productos vía bridge: GET {DROPI_BRIDGE_URL}/products
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

  const rows = extractDropiProductRows(parsed);
  const productCount = rows.length;

  logBridge("fetchDropiProductList", {
    url,
    method: "GET",
    status: res.status,
    ok: res.ok,
    productosRecibidos: productCount,
    ...(bridgeDebugEnabled()
      ? { respuestaResumida: truncateBodySummary(parsed) }
      : {}),
  });

  if (!res.ok) {
    const errSummary =
      (parsed && typeof parsed === "object" && (parsed.message || parsed.error || parsed.msg)) ||
      text.slice(0, 1200) ||
      `HTTP ${res.status}`;
    const msg = typeof errSummary === "string" ? errSummary : JSON.stringify(errSummary);
    throw new Error(msg);
  }

  if (parsed && typeof parsed === "object" && parsed.isSuccess === false) {
    const parts = [];
    if (parsed.message != null) parts.push(`message: ${String(parsed.message)}`);
    if (parsed.status != null) parts.push(`status: ${String(parsed.status)}`);
    if (parsed.ip != null) parts.push(`ip: ${String(parsed.ip)}`);
    throw new Error(parts.join(" | ") || "Bridge / Dropi isSuccess=false");
  }

  return parsed;
}

/**
 * Detalle de producto vía bridge: GET {DROPI_BRIDGE_URL}/product/{id}
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
    throw new Error(`Bridge detalle: respuesta no JSON (${res.status})`);
  }

  logBridge("fetchDropiProductDetail", {
    url,
    method: "GET",
    status: res.status,
    ok: res.ok,
    ...(bridgeDebugEnabled()
      ? { respuestaResumida: truncateBodySummary(parsed) }
      : {}),
  });

  if (!res.ok) {
    const msg =
      (parsed && typeof parsed === "object" && (parsed.message || parsed.error)) ||
      text.slice(0, 500) ||
      `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : String(msg));
  }

  if (parsed && typeof parsed === "object" && parsed.isSuccess === false) {
    const bits = [];
    if (parsed.message != null) bits.push(`message: ${parsed.message}`);
    if (parsed.status != null) bits.push(`status: ${String(parsed.status)}`);
    if (parsed.ip != null) bits.push(`ip: ${String(parsed.ip)}`);
    throw new Error(bits.join(" | ") || "Bridge isSuccess=false");
  }

  return parsed;
}
