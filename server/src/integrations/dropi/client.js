/**
 * Dropi — versión de prueba rígida (Paraguay), 1:1 con `wc-dropi-integration`.
 * Listado fijo: POST https://api.dropi.com.py/integrations/products/index
 * No Fastrax.
 */

function envTrim(key, fallback = "") {
  const v = process.env[key];
  if (v == null) return fallback;
  return String(v).trim();
}

/** Prueba controlada: mismo host/body que el plugin WP para PY. */
const RIGID_PRODUCTS_INDEX_URL = "https://api.dropi.com.py/integrations/products/index";

const RIGID_LIST_BODY = Object.freeze({
  startData: 1,
  pageSize: 10,
  order_type: "DESC",
  order_by: "id",
  keywords: "",
  active: true,
  no_count: true,
  integration: true,
  get_stock: false,
});

function listDebugEnabled() {
  return String(process.env.DROPI_LIST_DEBUG ?? "").trim() === "1";
}

function truncateBodySummary(obj, max = 2500) {
  try {
    const s = JSON.stringify(obj);
    return s.length > max ? `${s.slice(0, max)}…` : s;
  } catch {
    return "(no serializable)";
  }
}

export function dropiConfigured() {
  return Boolean(envTrim("DROPI_INTEGRATION_KEY"));
}

/**
 * Detalle (fuera del alcance del listado rígido): mismo host PY que el plugin.
 * @param {string | number} externalId
 */
export async function fetchDropiProductDetail(externalId) {
  const key = envTrim("DROPI_INTEGRATION_KEY");
  if (!key) {
    throw new Error("DROPI_INTEGRATION_KEY no está definida en el entorno del server.");
  }
  const base = "https://api.dropi.com.py/integrations/";
  const id = encodeURIComponent(String(externalId).trim());
  const detailUrl = `${base}products/v2/${id}`;

  const res = await fetch(detailUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "TradexparDropiSync/1.0",
      "dropi-integration-key": key,
    },
  });

  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Detalle Dropi: respuesta no JSON (${res.status})`);
  }

  if (!res.ok) {
    const msg =
      (parsed && typeof parsed === "object" && (parsed.message || parsed.error)) ||
      text.slice(0, 500) ||
      `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : String(msg));
  }

  if (parsed && typeof parsed === "object" && parsed.isSuccess === false) {
    const bits = ["Dropi isSuccess=false"];
    if (parsed.message != null) bits.push(`message: ${parsed.message}`);
    if (parsed.status != null) bits.push(`status: ${String(parsed.status)}`);
    if (parsed.ip != null) bits.push(`ip: ${String(parsed.ip)}`);
    throw new Error(bits.join(" | "));
  }

  return parsed;
}

/**
 * Listado rígido — ignora argumentos; mismo request que el plugin WP (PY).
 * Logs solo con DROPI_LIST_DEBUG=1 (sin token completo).
 */
export async function fetchDropiProductList() {
  const key = envTrim("DROPI_INTEGRATION_KEY");
  if (!key) {
    throw new Error("DROPI_INTEGRATION_KEY no está definida en el entorno del server.");
  }

  const log = listDebugEnabled();
  const bodyJson = JSON.stringify(RIGID_LIST_BODY);

  if (log) {
    console.info("[dropi/client] fetchDropiProductList (rígido PY)", {
      url: RIGID_PRODUCTS_INDEX_URL,
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "dropi-integration-key": "(oculto)",
      },
      body: bodyJson,
    });
  }

  const res = await fetch(RIGID_PRODUCTS_INDEX_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      Accept: "application/json",
      "User-Agent": "TradexparDropiSync/1.0",
      "dropi-integration-key": key,
    },
    body: bodyJson,
  });

  const text = await res.text();

  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { _parse_error: true, _raw: text.slice(0, 2000) };
  }

  if (log) {
    console.info("[dropi/client] fetchDropiProductList respuesta HTTP", {
      status: res.status,
      ok: res.ok,
      bodyResumido: truncateBodySummary(parsed),
    });
  }

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
    throw new Error(parts.join(" | ") || "Dropi isSuccess=false");
  }

  return parsed;
}
