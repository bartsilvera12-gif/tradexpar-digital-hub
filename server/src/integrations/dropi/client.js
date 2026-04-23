/**
 * Cliente HTTP Dropi alineado al plugin oficial WordPress `wc-dropi-integration`.
 * Listado: POST `API_URL + "products/index"`, detalle: GET `API_URL + "products/v2/" + id`.
 * Auth: `dropi-integration-key`. (Fastrax no se toca aquí.)
 */

function envTrim(key, fallback = "") {
  const v = process.env[key];
  if (v == null) return fallback;
  return String(v).trim();
}

/**
 * Base con barra final, siempre bajo `.../integrations/`.
 * `DROPI_API_URL` tiene prioridad; si no, `DROPI_API_BASE_URL` (legado) se normaliza a `.../integrations/`.
 */
export function resolveDropiApiUrl() {
  const primary = envTrim("DROPI_API_URL");
  const legacy = envTrim("DROPI_API_BASE_URL", "https://api.dropi.co");
  let base = (primary || legacy).replace(/\/+$/, "");
  if (!/\/integrations$/i.test(base)) {
    base = `${base}/integrations`;
  }
  return `${base}/`;
}

function listUrlFromApiRoot() {
  return `${resolveDropiApiUrl()}products/index`;
}

/**
 * Cuerpo POST de listado (plugin oficial) + reglas por host.
 * @param {string} listUrl - URL completa del listado (para inspeccionar hostname)
 */
export function buildDropiListRequestBody(page, pageSize, listUrl) {
  const u = new URL(listUrl);
  const host = u.hostname.toLowerCase();

  const body = {
    startData: page,
    pageSize,
    order_type: "DESC",
    order_by: "id",
    keywords: "",
    active: true,
    no_count: true,
    integration: true,
  };

  if (host === "api.dropi.com.es") {
    delete body.integration;
  }

  if (
    host === "api.dropi.co" ||
    host === "api.dropi.com.py" ||
    host === "api.dropi.pe" ||
    host === "api.dropi.pa"
  ) {
    body.get_stock = false;
  }

  return body;
}

function shouldLogDropiList() {
  return (
    String(process.env.DROPI_LIST_DEBUG ?? "").trim() === "1" ||
    String(process.env.DROPI_DEBUG ?? "").trim() === "1"
  );
}

function truncateErrorBody(text, max = 1200) {
  if (!text) return "";
  const t = String(text).replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function dropiConfigured() {
  return Boolean(envTrim("DROPI_INTEGRATION_KEY"));
}

/** @deprecated Usar `resolveDropiApiUrl`; se mantiene por compatibilidad interna. */
export function getDropiConfig() {
  const apiUrl = resolveDropiApiUrl();
  const key = envTrim("DROPI_INTEGRATION_KEY");
  return {
    apiUrl,
    listUrl: `${apiUrl}products/index`,
    key,
  };
}

/**
 * Lista productos (POST products/index).
 * @param {{ limit?: number, page?: number }} opts — page → startData, limit → pageSize
 */
export async function fetchDropiProductList(opts = {}) {
  const key = envTrim("DROPI_INTEGRATION_KEY");
  if (!key) {
    throw new Error("DROPI_INTEGRATION_KEY no está definida en el entorno del server.");
  }

  const pageSize = Math.max(1, Math.min(Number(opts.limit) || 50, 500));
  const page = Math.max(1, Number(opts.page) || 1);

  const listUrl = listUrlFromApiRoot();
  const body = buildDropiListRequestBody(page, pageSize, listUrl);

  const log = shouldLogDropiList();
  if (log) {
    console.info("[dropi/client] fetchDropiProductList", {
      url: listUrl,
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  const res = await fetch(listUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      Accept: "application/json",
      "User-Agent": "TradexparDropiSync/1.0",
      "dropi-integration-key": key,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();

  if (log) {
    console.info("[dropi/client] fetchDropiProductList response", {
      status: res.status,
      ok: res.ok,
    });
  }

  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { _parse_error: true, _raw: truncateErrorBody(text, 4000) };
  }

  if (!res.ok) {
    const errSummary =
      truncateErrorBody(
        typeof parsed === "object" && parsed !== null && (parsed.message || parsed.error || parsed.msg)
          ? String(parsed.message || parsed.error || parsed.msg)
          : text,
        1200
      ) || `HTTP ${res.status}`;
    if (log) {
      console.warn("[dropi/client] fetchDropiProductList error body (resumido)", errSummary);
    }
    throw new Error(errSummary);
  }

  if (log && parsed && typeof parsed === "object") {
    console.info("[dropi/client] list keys(sample)", Object.keys(parsed).slice(0, 40));
  }

  return parsed;
}

/**
 * Detalle de producto: GET `API_URL + "products/v2/" + id`
 * @param {string | number} externalId
 */
export async function fetchDropiProductDetail(externalId) {
  const key = envTrim("DROPI_INTEGRATION_KEY");
  if (!key) {
    throw new Error("DROPI_INTEGRATION_KEY no está definida en el entorno del server.");
  }
  const apiUrl = resolveDropiApiUrl();
  const id = encodeURIComponent(String(externalId).trim());
  const detailUrl = `${apiUrl}products/v2/${id}`;

  const log = shouldLogDropiList();
  if (log) {
    console.info("[dropi/client] fetchDropiProductDetail", { url: detailUrl, method: "GET" });
  }

  const res = await fetch(detailUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "TradexparDropiSync/1.0",
      "dropi-integration-key": key,
    },
  });

  const text = await res.text();

  if (log) {
    console.info("[dropi/client] fetchDropiProductDetail response", { status: res.status, ok: res.ok });
  }

  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { _parse_error: true, _raw: truncateErrorBody(text, 4000) };
  }

  if (!res.ok) {
    const errSummary =
      truncateErrorBody(
        typeof parsed === "object" && parsed !== null && (parsed.message || parsed.error || parsed.msg)
          ? String(parsed.message || parsed.error || parsed.msg)
          : text,
        1200
      ) || `HTTP ${res.status}`;
    if (log) {
      console.warn("[dropi/client] fetchDropiProductDetail error body (resumido)", errSummary);
    }
    throw new Error(errSummary);
  }

  return parsed;
}
