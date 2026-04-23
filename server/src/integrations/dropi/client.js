/**
 * Cliente HTTP para API Dropi (integrations/products/index).
 * Auth: header dropi-integration-key
 */

function envTrim(key, fallback = "") {
  const v = process.env[key];
  if (v == null) return fallback;
  return String(v).trim();
}

export function dropiConfigured() {
  return Boolean(envTrim("DROPI_INTEGRATION_KEY"));
}

export function getDropiConfig() {
  const base = envTrim("DROPI_API_BASE_URL", "https://api.dropi.co").replace(/\/+$/, "");
  const path = envTrim("DROPI_PRODUCTS_PATH", "/integrations/products/index");
  const key = envTrim("DROPI_INTEGRATION_KEY");
  return {
    listUrl: `${base}${path.startsWith("/") ? path : `/${path}`}`,
    key,
  };
}

/**
 * Lista productos en Dropi (POST). Respuesta variable según cuenta — el caller extrae filas.
 * @param {{ limit?: number, page?: number, extraBody?: Record<string, unknown> }} opts
 */
export async function fetchDropiProductList(opts = {}) {
  const { listUrl, key } = getDropiConfig();
  if (!key) {
    throw new Error("DROPI_INTEGRATION_KEY no está definida en el entorno del server.");
  }
  const limit = Math.max(1, Math.min(Number(opts.limit) || 50, 500));
  const page = Math.max(1, Number(opts.page) || 1);

  const body = {
    page,
    limit,
    ...(opts.extraBody && typeof opts.extraBody === "object" ? opts.extraBody : {}),
  };

  const res = await fetch(listUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "TradexparDropiSync/1.0",
      "dropi-integration-key": key,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { _parse_error: true, _raw: text.slice(0, 4000) };
  }

  if (!res.ok) {
    const msg =
      (parsed && typeof parsed === "object" && (parsed.message || parsed.error || parsed.msg)) ||
      text.slice(0, 500) ||
      `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  if (process.env.DROPI_DEBUG === "1") {
    console.info("[dropi/client] sample keys", parsed && typeof parsed === "object" ? Object.keys(parsed).slice(0, 40) : typeof parsed);
  }

  return parsed;
}
