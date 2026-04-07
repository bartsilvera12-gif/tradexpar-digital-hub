import crypto from "node:crypto";

/** Alineado a pagopar-sdk / Postman: parseFloat(monto).toString() sin ceros finales innecesarios. */
export function normalizeAmountForSignature(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) throw new Error(`Monto inválido: ${amount}`);
  let s = String(parseFloat(n.toFixed(2)));
  if (s.includes(".")) {
    s = s.replace(/\.?0+$/, "");
  }
  return s || "0";
}

export function sha1Hex(str) {
  return crypto.createHash("sha1").update(str, "utf8").digest("hex");
}

export function buildStartTransactionToken(privateKey, idPedidoComercio, montoTotal) {
  const norm = normalizeAmountForSignature(montoTotal);
  return sha1Hex(`${privateKey}${String(idPedidoComercio)}${norm}`);
}

export function buildGenericToken(privateKey, suffix) {
  return sha1Hex(`${privateKey}${suffix}`);
}

/** Laravel krugerdavid/laravel-pagopar: sha1(private_key + hash) */
export function verifyWebhookToken(privateKey, hashPedido, tokenRecibido) {
  if (!hashPedido || !tokenRecibido || !privateKey) return false;
  const expected = sha1Hex(`${privateKey}${hashPedido}`);
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(String(tokenRecibido), "utf8");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return expected === String(tokenRecibido);
  }
}

const PAGOPAR_API = "https://api.pagopar.com";

export async function iniciarTransaccion(payload) {
  const res = await fetch(`${PAGOPAR_API}/api/comercios/2.0/iniciar-transaccion`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
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
