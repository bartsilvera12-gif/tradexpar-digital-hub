import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import {
  buildStartTransactionToken,
  checkoutUrlFromHash,
  iniciarTransaccion,
  verifyWebhookToken,
} from "./pagopar.js";

function normalizeSupabaseUrl(raw) {
  const u = (raw || "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u.replace(/\/+$/, "");
  return `https://${u.replace(/\/+$/, "")}`;
}

const PORT = Number(process.env.PORT || 8787);
const SUPABASE_URL = normalizeSupabaseUrl(process.env.SUPABASE_URL);
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_SCHEMA = (process.env.SUPABASE_SCHEMA || "tradexpar").trim();
const API_KEY = process.env.API_PUBLIC_KEY || process.env.API_KEY || "";

const PAGOPAR_PUBLIC_KEY =
  process.env.PAGOPAR_PUBLIC_KEY || process.env.PAGOPAR_PUBLIC_TOKEN || "";
const PAGOPAR_PRIVATE_KEY =
  process.env.PAGOPAR_PRIVATE_KEY || process.env.PAGOPAR_PRIVATE_TOKEN || "";
const PAGOPAR_FORMA_PAGO = Number(process.env.PAGOPAR_FORMA_PAGO || 9);
const PAGOPAR_ITEM_CATEGORIA = String(process.env.PAGOPAR_ITEM_CATEGORIA || "909");
const PAGOPAR_ITEM_CIUDAD = String(process.env.PAGOPAR_ITEM_CIUDAD || "1");
const PAGOPAR_ITEM_PRODUCTO_ID = Number(process.env.PAGOPAR_ITEM_PRODUCTO_ID || 895);
const PAGOPAR_ITEM_IMAGEN_URL =
  process.env.PAGOPAR_ITEM_IMAGEN_URL ||
  "https://www.pagopar.com/static/img/logo.png";
const PAGOPAR_RETURN_URL =
  process.env.PAGOPAR_RETURN_URL ||
  "https://greenyellow-goat-534491.hostingersite.com/success?hash=($hash)";
const PAGOPAR_WEBHOOK_URL =
  process.env.PAGOPAR_WEBHOOK_URL ||
  "https://greenyellow-goat-534491.hostingersite.com/api/pagopar/webhook";
/** Si es "true", no exige token de webhook (solo desarrollo). */
const PAGOPAR_SKIP_WEBHOOK_VERIFY = String(process.env.PAGOPAR_SKIP_WEBHOOK_VERIFY || "") === "true";

function requireEnv() {
  const miss = [];
  if (!SUPABASE_URL) miss.push("SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) miss.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!PAGOPAR_PUBLIC_KEY) miss.push("PAGOPAR_PUBLIC_KEY o PAGOPAR_PUBLIC_TOKEN");
  if (!PAGOPAR_PRIVATE_KEY) miss.push("PAGOPAR_PRIVATE_KEY o PAGOPAR_PRIVATE_TOKEN");
  if (!API_KEY) miss.push("API_PUBLIC_KEY o API_KEY");
  if (miss.length) {
    console.warn("[payments-api] Faltan variables:", miss.join(", "));
  }
}

function supabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: SUPABASE_SCHEMA },
  });
}

function randomRef() {
  return crypto.randomBytes(16).toString("hex");
}

function apiKeyMiddleware(req, res, next) {
  const key = req.headers["x-api-key"];
  if (!API_KEY || key !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

/** Mapea fila orders → status para SuccessPage.tsx */
function mapDbPaymentStatusToFrontend(row) {
  const raw = (row?.payment_status || "pending").toString().toLowerCase();
  if (["approved", "paid", "completed", "pagado", "success"].includes(raw)) {
    return "approved";
  }
  if (["rejected", "failed", "cancelled", "canceled", "rechazado"].includes(raw)) {
    return "rejected";
  }
  return "pending";
}

function extractPagoparHashFromIniciarResult(body) {
  const r = body?.resultado;
  if (Array.isArray(r) && r[0]) {
    const h = r[0].data ?? r[0].hash_pedido ?? r[0].hash;
    if (h) return String(h);
  }
  if (typeof r === "string" && r.length > 20) return r;
  return null;
}

function normalizeBuyerFromOrder(order) {
  const nombre = (order.customer_name || "Cliente").toString().slice(0, 200);
  const email = (order.customer_email || "sin-email@tradexpar.local").toString().slice(0, 200);
  const telefono = (order.customer_phone || "000000").toString().replace(/\D/g, "").slice(0, 20) || "000000";
  const documento = telefono.slice(-7) || "0000000";
  return {
    ruc: `${documento}-0`,
    email,
    ciudad: null,
    nombre,
    telefono,
    direccion: "",
    documento,
    coordenadas: "",
    razon_social: nombre,
    tipo_documento: "CI",
    direccion_referencia: null,
  };
}

const app = express();
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
/** Webhook: body crudo a veces viene como JSON o x-www-form-urlencoded */
app.use("/api/pagopar/webhook", express.json({ limit: "1mb" }));
app.use("/api/pagopar/webhook", express.urlencoded({ extended: true, limit: "1mb" }));
app.use(express.json({ limit: "512kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "tradexpar-payments-api" });
});

/**
 * POST /api/public/orders/:orderId/create-payment
 */
app.post("/api/public/orders/:orderId/create-payment", apiKeyMiddleware, async (req, res) => {
  try {
    requireEnv();
    const orderId = req.params.orderId;
    const sb = supabaseAdmin();

    const { data: order, error: fetchErr } = await sb
      .from("orders")
      .select("id, total, customer_name, customer_email, customer_phone, status")
      .eq("id", orderId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!order) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }

    const ref = randomRef();
    const montoTotal = Math.max(0, Math.round(Number(order.total) || 0));
    if (montoTotal <= 0) {
      return res.status(400).json({ error: "Total del pedido inválido" });
    }

    const token = buildStartTransactionToken(PAGOPAR_PRIVATE_KEY, ref, montoTotal);

    const fechaMax = new Date();
    fechaMax.setDate(fechaMax.getDate() + 3);
    const fecha_maxima_pago = fechaMax.toISOString().slice(0, 19).replace("T", " ");

    const comprador = normalizeBuyerFromOrder(order);

    const payload = {
      token,
      comprador,
      public_key: PAGOPAR_PUBLIC_KEY,
      monto_total: montoTotal,
      tipo_pedido: "VENTA-COMERCIO",
      compras_items: [
        {
          ciudad: PAGOPAR_ITEM_CIUDAD,
          nombre: `Pedido Tradexpar ${orderId.slice(0, 8)}`,
          cantidad: 1,
          categoria: PAGOPAR_ITEM_CATEGORIA,
          public_key: PAGOPAR_PUBLIC_KEY,
          url_imagen: PAGOPAR_ITEM_IMAGEN_URL,
          descripcion: `Pago pedido ${orderId}`,
          id_producto: PAGOPAR_ITEM_PRODUCTO_ID,
          precio_total: montoTotal,
          vendedor_telefono: "",
          vendedor_direccion: "",
          vendedor_direccion_referencia: "",
          vendedor_direccion_coordenadas: "",
        },
      ],
      fecha_maxima_pago,
      id_pedido_comercio: ref,
      descripcion_resumen: `Tradexpar #${orderId.slice(0, 8)}`,
      forma_pago: PAGOPAR_FORMA_PAGO,
    };

    if (PAGOPAR_RETURN_URL) {
      payload.url_respuesta = PAGOPAR_RETURN_URL;
    }
    if (PAGOPAR_WEBHOOK_URL) {
      payload.url_notificacion = PAGOPAR_WEBHOOK_URL;
    }

    const { error: upErr } = await sb
      .from("orders")
      .update({
        payment_reference: ref,
        payment_status: "pending",
        pagopar_hash: null,
      })
      .eq("id", orderId);

    if (upErr) throw upErr;

    const pp = await iniciarTransaccion(payload);

    if (!pp.respuesta) {
      const msg = pp.mensaje || pp.resultado || "PagoPar rechazó iniciar transacción";
      return res.status(502).json({ error: String(msg), pagopar: pp });
    }

    const hashPedido = extractPagoparHashFromIniciarResult(pp);
    if (!hashPedido) {
      return res.status(502).json({
        error: "PagoPar no devolvió hash de pedido",
        pagopar: pp,
      });
    }

    const { error: hashErr } = await sb
      .from("orders")
      .update({ pagopar_hash: hashPedido })
      .eq("id", orderId);

    if (hashErr) {
      console.error("[create-payment] No se pudo guardar pagopar_hash:", hashErr);
    }

    const paymentLink = checkoutUrlFromHash(hashPedido);

    return res.json({
      paymentLink,
      ref,
      hash: hashPedido,
      pagopar_hash: hashPedido,
      order_id: orderId,
    });
  } catch (e) {
    console.error("[create-payment]", e);
    return res.status(500).json({ error: e instanceof Error ? e.message : "Error interno" });
  }
});

/**
 * GET /api/public/orders/:orderId/payment-status?ref=&hash=
 */
app.get("/api/public/orders/:orderId/payment-status", apiKeyMiddleware, async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const ref = (req.query.ref || "").toString();
    const hash = (req.query.hash || "").toString();
    const sb = supabaseAdmin();

    const { data: row, error } = await sb
      .from("orders")
      .select("id, payment_reference, payment_status, pagopar_hash")
      .eq("id", orderId)
      .maybeSingle();

    if (error) throw error;
    if (!row) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }

    if (ref && row.payment_reference && ref !== row.payment_reference) {
      return res.status(403).json({ error: "Referencia no coincide con el pedido" });
    }

    if (hash && row.pagopar_hash && hash !== row.pagopar_hash) {
      return res.status(403).json({ error: "Hash no coincide con el pedido" });
    }

    const status = mapDbPaymentStatusToFrontend(row);
    return res.json({
      status,
      ref: row.payment_reference || ref,
      order_id: row.id,
    });
  } catch (e) {
    console.error("[payment-status]", e);
    return res.status(500).json({ error: e instanceof Error ? e.message : "Error interno" });
  }
});

/**
 * GET /api/public/payment-status?hash=  (solo hash desde return URL; opcional ref)
 */
app.get("/api/public/payment-status", apiKeyMiddleware, async (req, res) => {
  try {
    const hash = (req.query.hash || "").toString();
    const ref = (req.query.ref || "").toString();
    if (!hash && !ref) {
      return res.status(400).json({ error: "Indicá hash o ref" });
    }
    const sb = supabaseAdmin();
    let q = sb.from("orders").select("id, payment_reference, payment_status, pagopar_hash").limit(1);
    if (hash) {
      q = q.eq("pagopar_hash", hash);
    } else {
      q = q.eq("payment_reference", ref);
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }
    if (ref && row.payment_reference && ref !== row.payment_reference) {
      return res.status(403).json({ error: "Referencia no coincide" });
    }
    const status = mapDbPaymentStatusToFrontend(row);
    return res.json({
      status,
      ref: row.payment_reference || ref,
      order_id: row.id,
    });
  } catch (e) {
    console.error("[payment-status-global]", e);
    return res.status(500).json({ error: e instanceof Error ? e.message : "Error interno" });
  }
});

/**
 * POST /api/pagopar/webhook  (sin x-api-key; validación por token PagoPar)
 */
app.post("/api/pagopar/webhook", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    let resultado = body.resultado;
    if (typeof resultado === "string") {
      try {
        resultado = JSON.parse(resultado);
      } catch {
        resultado = null;
      }
    }
    const items = Array.isArray(resultado) ? resultado : resultado ? [resultado] : [];
    const first = items[0] || body;

    const hashPedido =
      first.hash_pedido ||
      first.hash ||
      first.data ||
      body.hash_pedido ||
      body.hash ||
      null;
    const tokenNotif = first.token || body.token || "";

    if (!hashPedido) {
      console.warn("[webhook] Sin hash_pedido", JSON.stringify(body).slice(0, 500));
      return res.status(400).json({ ok: false, error: "missing hash" });
    }

    const okToken =
      PAGOPAR_SKIP_WEBHOOK_VERIFY ||
      verifyWebhookToken(PAGOPAR_PRIVATE_KEY, String(hashPedido), String(tokenNotif));

    if (!okToken) {
      console.warn("[webhook] Token inválido para hash", hashPedido);
      return res.status(401).json({ ok: false, error: "invalid token" });
    }

    const pagado =
      first.pagado === true ||
      first.pagado === "t" ||
      first.pagado === "true" ||
      String(first.estado_transaccion) === "1" ||
      String(body.pagado) === "true";

    const cancelado =
      first.cancelado === true ||
      first.cancelado === "t" ||
      first.cancelado === "true" ||
      String(body.cancelado) === "true";

    let payment_status = "pending";
    if (pagado) payment_status = "paid";
    else if (cancelado) payment_status = "failed";

    const sb = supabaseAdmin();
    const { data: updated, error } = await sb
      .from("orders")
      .update({ payment_status })
      .eq("pagopar_hash", String(hashPedido))
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!updated) {
      console.warn("[webhook] Ningún pedido con pagopar_hash=", hashPedido);
    }

    return res.status(200).json({ ok: true, order_id: updated?.id ?? null, payment_status });
  } catch (e) {
    console.error("[webhook]", e);
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "error" });
  }
});

requireEnv();
app.listen(PORT, () => {
  console.log(`[payments-api] listening on :${PORT}`);
});
