import crypto from "node:crypto";

/** Quita espacios, BOM y comillas típicas al pegar claves desde el panel PagoPar. */
export function stripPagoparSecret(raw) {
  let s = String(raw ?? "").trim();
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

export function sha1Hex(str) {
  return crypto.createHash("sha1").update(str, "utf8").digest("hex");
}

/**
 * Equivalente a PHP `strval(floatval($monto))` para concatenar en el token de iniciar-transacción.
 * Debe usarse con el mismo valor numérico que se envía en `monto_total` del JSON.
 */
export function phpStrvalFloatval(monto) {
  const n = Number(monto);
  if (!Number.isFinite(n)) throw new Error(`Monto inválido: ${monto}`);
  if (n < 0) throw new Error(`Monto inválido: ${monto}`);
  const f = parseFloat(n);
  const asInt = Math.round(f);
  if (Math.abs(f - asInt) < 1e-9) {
    return String(asInt);
  }
  let s = f.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
  return s || "0";
}

/**
 * Documentación PagoPar: sha1(private_key + idPedido + strval(floatval(monto_total)))
 * idPedido = mismo valor que `id_pedido_comercio` en el cuerpo (como string en la concatenación).
 */
export function buildStartTransactionToken(privateKey, idPedidoComercio, montoTotal) {
  const pk = stripPagoparSecret(privateKey);
  const idStr = String(idPedidoComercio);
  const amountStr = phpStrvalFloatval(montoTotal);
  return sha1Hex(`${pk}${idStr}${amountStr}`);
}

export function buildGenericToken(privateKey, suffix) {
  return sha1Hex(`${stripPagoparSecret(privateKey)}${suffix}`);
}

/** Laravel krugerdavid/laravel-pagopar: sha1(private_key + hash) */
export function verifyWebhookToken(privateKey, hashPedido, tokenRecibido) {
  if (!hashPedido || !tokenRecibido || !privateKey) return false;
  const expected = sha1Hex(`${stripPagoparSecret(privateKey)}${hashPedido}`);
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(String(tokenRecibido), "utf8");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return expected === String(tokenRecibido);
  }
}

const PAGOPAR_API = "https://api.pagopar.com";

/** PagoPar a veces devuelve `respuesta` como string `"false"` / `"true"`. */
export function isPagoparRespuestaOk(respuesta) {
  if (respuesta === true) return true;
  const s = String(respuesta ?? "").trim().toLowerCase();
  return s === "true" || s === "t" || s === "1";
}

export async function iniciarTransaccion(payload) {
  const url = `${PAGOPAR_API}/api/comercios/2.0/iniciar-transaccion`;
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  const bodyStr = JSON.stringify(payload);
  console.info("[pagopar][debug] POST", url);
  console.info("[pagopar][debug] headers", JSON.stringify(headers));
  console.info("[pagopar][debug] body (string length)", bodyStr.length, bodyStr.slice(0, 8000));
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: bodyStr,
  });
  const text = await res.text();
  console.info("[pagopar][debug] http status", res.status, "response", text.slice(0, 8000));
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`PagoPar no devolvió JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`PagoPar HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return data;
}

export function checkoutUrlFromHash(hashPedido) {
  return `https://www.pagopar.com/pagos/${hashPedido}`;
}
