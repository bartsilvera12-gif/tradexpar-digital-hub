/**
 * Fastrax Market (POST JSON). Credenciales: FASTRAX_API_URL, FASTRAX_COD, FASTRAX_PASS.
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

/**
 * @param {number} ope
 * @param {Record<string, unknown>} extra
 */
function buildJsonBody(ope, extra) {
  const { cod, pas } = getFastraxCreds();
  return JSON.stringify({
    ope,
    cod: String(cod),
    pas: String(pas),
    ...extra,
  });
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
        "Content-Type": "application/json",
        Accept: "application/json",
        "Content-Length": Buffer.byteLength(body),
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
  const body = buildJsonBody(ope, extra);
  const timeoutMs = Math.min(
    180_000,
    Math.max(5_000, Number(process.env.FASTRAX_REQUEST_TIMEOUT_MS || 90_000) || 90_000)
  );
  logFastraxOpe(ope);
  let r;
  if (sslInsecure()) {
    r = await fastraxPostHttps(baseUrl, body, timeoutMs, { rejectUnauthorized: false });
  } else {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body,
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

export async function listProductsPage(page = 1) {
  const key = (envTrim("FASTRAX_OPE4_PAGE_PARAM") || "pag").trim() || "pag";
  return fastraxPost(4, { [key]: page });
}

export async function getProductDetails(sku) {
  return fastraxPost(2, { pro: String(sku) });
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