/**
 * Fastrax Market (POST application/x-www-form-urlencoded, estilo PHP).
 * Credenciales: FASTRAX_API_URL, FASTRAX_COD, FASTRAX_PASS.
 * Tras HTTP 2xx se aplica comprobación de negocio (estatus/cestatus) vía `fastraxResponse.js`.
 */

import https from "node:https";
import { URL } from "node:url";
import { withFastraxBusinessGate, logFastraxOpe } from "./fastraxResponse.js";

function envTrim(key) {
  const v = process.env[key];
  if (v == null) return "";
  return String(v).trim();
}

export function fastraxEnabled() {
  return String(process.env.FASTRAX_ENABLED ?? "1").trim() !== "0";
}

/**
 * Importación de catálogo (sync-products, import SKUs/items): solo con FASTRAX_ENABLED=true explícito.
 * Pedidos / ope 12–13 siguen usando {@link fastraxEnabled} (habilitado si no es "0").
 */
export function fastraxCatalogImportAllowed() {
  return String(process.env.FASTRAX_ENABLED ?? "").trim().toLowerCase() === "true";
}

export function fastraxConfigured() {
  if (!fastraxEnabled()) return false;
  return Boolean(
    envTrim("FASTRAX_API_URL") && envTrim("FASTRAX_COD") && envTrim("FASTRAX_PASS")
  );
}

function sslInsecure() {
  return String(process.env.FASTRAX_SSL_INSECURE ?? "0").trim() === "1";
}

/**
 * @returns {{ url: string, cod: string, pas: string }}
 */
export function getFastraxCreds() {
  const url = envTrim("FASTRAX_API_URL").replace(/\/+$/, "");
  const cod = envTrim("FASTRAX_COD");
  const pas = envTrim("FASTRAX_PASS");
  return { url, cod, pas };
}

const FORM_HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded",
  Accept: "application/json,text/plain,*/*",
};

/**
 * @param {number} ope
 * @param {Record<string, unknown>} extra
 * @returns {URLSearchParams}
 */
function buildFormParams(ope, extra) {
  const { cod, pas } = getFastraxCreds();
  const params = {
    ope,
    cod: String(cod),
    pas: String(pas),
    ...(extra && typeof extra === "object" ? extra : {}),
  };
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      body.append(key, String(value));
    }
  }
  return body;
}

/**
 * @param {string} baseUrl
 * @param {string} body
 * @param {number} timeoutMs
 * @param {{ rejectUnauthorized: boolean }} tls
 */
function fastraxPostHttps(baseUrl, body, timeoutMs, tls) {
  return new Promise((resolve) => {
    let u;
    try {
      u = new URL(baseUrl);
    } catch {
      resolve({ ok: false, status: 0, message: "URL Fastrax inválida", parsed: null });
      return;
    }
    const options = {
      hostname: u.hostname,
      port: u.port || 443,
      path: `${u.pathname}${u.search}`,
      method: "POST",
      headers: {
        ...FORM_HEADERS,
        "Content-Length": Buffer.byteLength(body, "utf8"),
      },
      rejectUnauthorized: tls.rejectUnauthorized,
    };
    const req = https.request(options, (r) => {
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = { _raw: text.slice(0, 8_000) };
        }
        if (r.statusCode < 200 || r.statusCode >= 300) {
          resolve({
            ok: false,
            status: r.statusCode || 0,
            message:
              typeof parsed === "object" && parsed && (parsed).message
                ? String(/** @type {Record<string, unknown>} */ (parsed).message)
                : `HTTP ${r.statusCode}`,
            parsed,
            raw: text,
          });
        } else {
          resolve({ ok: true, status: r.statusCode || 200, parsed, raw: text });
        }
      });
    });
    const timer = setTimeout(() => {
      req.destroy();
      resolve({ ok: false, status: 0, message: "Fastrax request timeout", parsed: null });
    }, timeoutMs);
    req.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, status: 0, message: e instanceof Error ? e.message : String(e), parsed: null });
    });
    req.write(body);
    req.end();
    req.on("close", () => clearTimeout(timer));
  });
}

/**
 * @param {Buffer} buf
 * @param {string} [headerContentType]
 */
function sniffOrPickImageContentType(buf, headerContentType) {
  const h = (headerContentType || "").split(";")[0].trim().toLowerCase();
  if (h && h.startsWith("image/")) return h;
  if (buf && buf.length >= 2) {
    if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
    if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
    if (buf[0] === 0x42 && buf[1] === 0x4d) return "image/bmp";
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46) return "image/webp";
  }
  if (h) return h;
  return "application/octet-stream";
}

/**
 * Si el cuerpo es JSON de error/negocio, devuelve el mensaje; si no, null.
 * @param {Buffer} buf
 * @param {string} contentType
 */
function tryFastraxImageErrorMessage(buf, contentType) {
  const ct = (contentType || "").toLowerCase();
  if (!ct.includes("json") && !ct.startsWith("text/")) {
    if (buf.length < 2 || (buf[0] !== 0x7b && buf[0] !== 0x5b)) return null;
  }
  const t = buf.length > 64 * 1024 ? buf.toString("utf8", 0, 64 * 1024) : buf.toString("utf8");
  const trim = t.trim();
  if (!trim || (trim[0] !== "{" && trim[0] !== "[")) return null;
  try {
    const j = JSON.parse(t);
    if (j == null || typeof j !== "object" || Array.isArray(j)) return "Respuesta ope3 no es imagen";
    const o = /** @type {Record<string, unknown>} */(j);
    if (o.message != null && strErr(o.message)) return strErr(o.message);
    const rawE = o.estatus ?? o.Estatus;
    if (rawE == null) return "Respuesta ope3 no es imagen";
    if (strErr(String(rawE)) === "0" || (Number(rawE) === 0 && Number.isFinite(Number(rawE)))) {
      return null;
    }
    const n = Number(rawE);
    if (Number.isFinite(n) && n !== 0) {
      return strErr(o.cestatus || o.cEst || o.mensaje || o.msg) || `Fastrax estatus ${n} (ope=3)`;
    }
  } catch {
    return null;
  }
  return "Respuesta ope3 no es imagen";
}

/**
 * @param {unknown} v
 */
function strErr(v) {
  if (v == null) return "";
  return String(v).trim() || "";
}

/**
 * @param {string} baseUrl
 * @param {string} postBody
 * @param {number} timeoutMs
 * @param {{ rejectUnauthorized: boolean }} tls
 */
function fastraxPostBinaryHttps(baseUrl, postBody, timeoutMs, tls) {
  return new Promise((resolve) => {
    let u;
    try {
      u = new URL(baseUrl);
    } catch {
      resolve({ ok: false, status: 0, message: "URL Fastrax inválida" });
      return;
    }
    const options = {
      hostname: u.hostname,
      port: u.port || 443,
      path: `${u.pathname}${u.search}`,
      method: "POST",
      headers: {
        ...FORM_HEADERS,
        Accept: "image/*,application/octet-stream,*/*",
        "Content-Length": Buffer.byteLength(postBody, "utf8"),
      },
      rejectUnauthorized: tls.rejectUnauthorized,
    };
    const req = https.request(options, (r) => {
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => {
        const body = Buffer.concat(chunks);
        const status = r.statusCode || 0;
        const contentType = (r.headers["content-type"] && String(r.headers["content-type"]).split(";")[0].trim()) || "";
        if (status < 200 || status >= 300) {
          const errMsg = tryFastraxImageErrorMessage(body, contentType) || `HTTP ${status}`;
          resolve({ ok: false, status, message: errMsg, body, contentType });
        } else {
          resolve({ ok: true, status, body, contentType });
        }
      });
    });
    const timer = setTimeout(() => {
      req.destroy();
      resolve({ ok: false, status: 0, message: "Fastrax request timeout" });
    }, timeoutMs);
    req.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, status: 0, message: e instanceof Error ? e.message : String(e) });
    });
    req.write(postBody, "utf8");
    req.end();
    req.on("close", () => clearTimeout(timer));
  });
}

/**
 * ope=3: imagen del producto (`sku`, `img` índice, típicamente 1..n).
 * @param {string} sku
 * @param {number} img
 * @returns {Promise<
 *   | { ok: true; body: Buffer; contentType: string; status: number }
 *   | { ok: false; message: string; status: number; body?: Buffer; contentType?: string }
 * >}
 */
export async function getFastraxImageOpe3(sku, img) {
  if (!fastraxConfigured()) {
    return { ok: false, status: 0, message: "Fastrax no configurado (FASTRAX_* en .env)" };
  }
  const { url: baseUrl } = getFastraxCreds();
  if (!baseUrl) {
    return { ok: false, status: 0, message: "FASTRAX_API_URL vacía" };
  }
  const sSku = String(sku).trim();
  if (!sSku) {
    return { ok: false, status: 0, message: "Fastrax ope=3: sku requerido" };
  }
  const nImg = Math.max(1, Math.floor(Number(img) || 1));
  const form = buildFormParams(3, { sku: sSku, img: String(nImg) });
  const postBody = form.toString();
  const timeoutMs = Math.min(
    180_000,
    Math.max(5_000, Number(process.env.FASTRAX_REQUEST_TIMEOUT_MS || 90_000) || 90_000)
  );
  logFastraxOpe(3);
  console.log(`[fastrax/client] ope=3 sku=${sSku} img=${nImg}`);

  if (sslInsecure()) {
    const r0 = await fastraxPostBinaryHttps(baseUrl, postBody, timeoutMs, { rejectUnauthorized: false });
    if (!r0 || !r0.ok) {
      return {
        ok: false,
        message: (r0 && "message" in r0 && r0.message) || (r0 && "status" in r0 && r0.status ? `HTTP ${r0.status}` : "ope3"),
        status: r0 && "status" in r0 && r0.status != null ? Number(r0.status) : 0,
      };
    }
    if (!r0.body) {
      return { ok: false, status: r0.status, message: "Cuerpo ope3 vacío" };
    }
    const b0 = /** @type {Buffer} */(r0.body);
    const jsonErr = tryFastraxImageErrorMessage(b0, r0.contentType || "");
    if (jsonErr) {
      return { ok: false, status: r0.status, message: jsonErr };
    }
    if (b0[0] === 0x7b || b0[0] === 0x5b) {
      return { ok: false, status: r0.status, message: "Respuesta ope3: cuerpo JSON, no imagen" };
    }
    const outCt = sniffOrPickImageContentType(b0, r0.contentType);
    return { ok: true, body: b0, contentType: outCt, status: r0.status || 200 };
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        ...FORM_HEADERS,
        Accept: "image/*,application/octet-stream,*/*",
      },
      body: postBody,
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(t);
    return {
      ok: false,
      status: 0,
      message: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(t);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const resCt = String(res.headers.get("content-type") || "")
    .split(";")[0]
    .trim();
  if (!res.ok) {
    const m = tryFastraxImageErrorMessage(buf, resCt) || `HTTP ${res.status}`;
    return { ok: false, message: m, status: res.status, body: buf, contentType: resCt || undefined };
  }
  const jsonErr = tryFastraxImageErrorMessage(buf, resCt);
  if (jsonErr) {
    return { ok: false, message: jsonErr, status: res.status, body: buf };
  }
  if (buf.length > 0 && (buf[0] === 0x7b || buf[0] === 0x5b)) {
    return { ok: false, message: "Respuesta ope3: cuerpo JSON, no imagen", status: res.status, body: buf };
  }
  return {
    ok: true,
    body: buf,
    contentType: sniffOrPickImageContentType(buf, resCt),
    status: res.status,
  };
}

/**
 * @param {number} ope
 * @param {Record<string, unknown>} [extra]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function fastraxPost(ope, extra = {}) {
  if (!fastraxConfigured()) {
    return { ok: false, status: 0, message: "Fastrax no configurado (FASTRAX_* en .env).", parsed: null };
  }
  const { url: baseUrl } = getFastraxCreds();
  if (!baseUrl) {
    return { ok: false, status: 0, message: "FASTRAX_API_URL vacía", parsed: null };
  }
  const form = buildFormParams(ope, extra);
  const bodyStr = form.toString();
  const timeoutMs = Math.min(
    180_000,
    Math.max(5_000, Number(process.env.FASTRAX_REQUEST_TIMEOUT_MS || 90_000) || 90_000)
  );
  logFastraxOpe(ope);
  let r;
  if (sslInsecure()) {
    r = await fastraxPostHttps(baseUrl, bodyStr, timeoutMs, { rejectUnauthorized: false });
  } else {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(baseUrl, {
        method: "POST",
        headers: { ...FORM_HEADERS },
        body: bodyStr,
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(t);
      return {
        ok: false,
        status: 0,
        message: e instanceof Error ? e.message : String(e),
        parsed: null,
      };
    } finally {
      clearTimeout(t);
    }
    const text = await res.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { _raw: text?.slice(0, 8_000) || "" };
    }
    if (!res.ok) {
      const msg =
        parsed && typeof parsed === "object" && parsed && "message" in parsed
          ? String(/** @type {Record<string, unknown>} */ (parsed).message)
          : `HTTP ${res.status}`;
      r = { ok: false, status: res.status, message: msg, parsed };
    } else {
      r = { ok: true, status: res.status, parsed, raw: text };
    }
  }
  if (!r.ok) {
    return r;
  }
  return withFastraxBusinessGate(/** @type {Record<string, unknown>} */ (r), { ope });
}

export async function getVersion() {
  return fastraxPost(10, {});
}

/**
 * ope=4: listado con tamaño y página controlables.
 * @param {number} [page]
 * @param {number} [size] — tam (1–500)
 */
export async function listFastraxProductsOpe4(page = 1, size = 50) {
  const pagKey = (envTrim("FASTRAX_OPE4_PAGE_PARAM") || "pag").trim() || "pag";
  const tamKey = (envTrim("FASTRAX_OPE4_SIZE_PARAM") || "tam").trim() || "tam";
  const tam = Math.max(1, Math.min(500, Math.floor(Number(size) || 50)));
  const p = Math.max(1, Math.floor(Number(page) || 1));
  return fastraxPost(4, { [tamKey]: tam, [pagKey]: p });
}

export async function listProductsPage(page = 1) {
  const tam = Math.max(1, Math.min(500, Number(envTrim("FASTRAX_OPE4_PAGE_SIZE") || 50) || 50));
  return listFastraxProductsOpe4(page, tam);
}

/**
 * ope=2: Fastrax espera el parámetro de forma `sku=185` (no `pro`, no `sk`).
 * Acepta string, número o array de SKUs (se unen con coma).
 * @param {string | number | (string | number)[] | null | undefined} skus
 */
export async function getProductDetails(skus) {
  if (skus == null) {
    return { ok: false, status: 0, message: "Fastrax ope=2: sku requerido", parsed: null };
  }
  let normalized = "";
  if (Array.isArray(skus)) {
    normalized = skus
      .map((x) => (x == null ? "" : String(x).trim()))
      .filter(Boolean)
      .join(",");
  } else if (typeof skus === "number" && Number.isFinite(skus)) {
    normalized = String(skus);
  } else {
    normalized = String(skus).trim();
  }
  if (!normalized) {
    return { ok: false, status: 0, message: "Fastrax ope=2: sku vacío", parsed: null };
  }
  const show = normalized.length > 200 ? `${normalized.slice(0, 200)}…` : normalized;
  console.log(`[fastrax/client] ope=2 sku=${show}`);
  return fastraxPost(2, { sku: normalized });
}

export async function getStockPrice(extra = {}) {
  return fastraxPost(11, extra);
}

/**
 * ope=12: ped, sku, gra, qtd, pgt (el cliente añade cod, pas, ope).
 */
export async function createFastraxRemoteOrder12(payload) {
  return fastraxPost(12, payload && typeof payload === "object" ? payload : {});
}

/**
 * ope=13: preferir cuerpo con pdc, o con ped.
 */
export async function queryFastraxOrderStatus13(queryBody) {
  return fastraxPost(13, queryBody && typeof queryBody === "object" ? queryBody : {});
}

/** @deprecated */
export async function getOrderStatus(extra) {
  return queryFastraxOrderStatus13(extra);
}

/**
 * ope=15: facturar. Usar pdc o ped.
 */
export async function fastraxInvoiceOrder15(invoiceBody) {
  return fastraxPost(15, invoiceBody && typeof invoiceBody === "object" ? invoiceBody : {});
}