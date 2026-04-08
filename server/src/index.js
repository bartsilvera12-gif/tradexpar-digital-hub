import "dotenv/config";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import {
  buildStartTransactionToken,
  checkoutUrlFromHash,
  iniciarTransaccion,
  isPagoparRespuestaOk,
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

/**
 * Schema PostgREST donde vive `orders` (tabla de la tienda). No debe ser `public` en este proyecto.
 * Preferí `SUPABASE_ORDERS_SCHEMA` en el server de pagos para no mezclar con otros usos de `SUPABASE_SCHEMA`.
 */
function resolveOrdersSchema() {
  const raw = String(
    process.env.SUPABASE_ORDERS_SCHEMA || process.env.SUPABASE_SCHEMA || "tradexpar"
  ).trim();
  const s = raw || "tradexpar";
  if (s === "public") {
    console.warn(
      "[payments-api] SUPABASE_SCHEMA/SUPABASE_ORDERS_SCHEMA es `public`; los pedidos están en `tradexpar.orders`. Usando `tradexpar` para esta API."
    );
    return "tradexpar";
  }
  return s.toLowerCase();
}

const ORDERS_SCHEMA = resolveOrdersSchema();
const API_KEY = process.env.API_PUBLIC_KEY || process.env.API_KEY || "";

const PAGOPAR_PUBLIC_KEY =
  process.env.PAGOPAR_PUBLIC_KEY || process.env.PAGOPAR_PUBLIC_TOKEN || "";
const PAGOPAR_PRIVATE_KEY =
  process.env.PAGOPAR_PRIVATE_KEY || process.env.PAGOPAR_PRIVATE_TOKEN || "";
const PAGOPAR_FORMA_PAGO = Number(process.env.PAGOPAR_FORMA_PAGO || 9);
const PAGOPAR_ITEM_CATEGORIA = String(process.env.PAGOPAR_ITEM_CATEGORIA || "909");
const PAGOPAR_ITEM_CIUDAD = String(process.env.PAGOPAR_ITEM_CIUDAD || "1");
/** Ciudad comprador: solo `ciudad` string; nunca `ciudad_id`. `ruc` / `razon_social` vacíos si no aplica. */
const PAGOPAR_COMPRADOR_CIUDAD = String(
  process.env.PAGOPAR_COMPRADOR_CIUDAD || process.env.PAGOPAR_ITEM_CIUDAD || "1"
).trim() || "1";
const PAGOPAR_ITEM_PRODUCTO_ID = Number(process.env.PAGOPAR_ITEM_PRODUCTO_ID || 895);
const PAGOPAR_ITEM_IMAGEN_URL =
  process.env.PAGOPAR_ITEM_IMAGEN_URL ||
  "https://www.pagopar.com/static/img/logo.png";
/** Campos planos `vendedor_*` en cada ítem (documentación PagoPar iniciar-transacción 2.0). */
const PAGOPAR_VENDEDOR_TELEFONO = String(process.env.PAGOPAR_VENDEDOR_TELEFONO || "").slice(0, 40);
const PAGOPAR_VENDEDOR_DIRECCION = String(process.env.PAGOPAR_VENDEDOR_DIRECCION || "").slice(0, 300);
const PAGOPAR_VENDEDOR_DIR_REF = String(process.env.PAGOPAR_VENDEDOR_DIRECCION_REFERENCIA || "").slice(0, 200);
const PAGOPAR_VENDEDOR_COORDENADAS = String(process.env.PAGOPAR_VENDEDOR_DIRECCION_COORDENADAS || "").slice(0, 80);
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
    /** Sin `db.schema` global: todas las lecturas/escrituras de pedidos pasan por `orders()` → `.schema(ORDERS_SCHEMA)` para fijar `Accept-Profile` y evitar caer en `public`. */
  });
}

/** Siempre `ORDERS_SCHEMA` + `orders` → PostgREST `Accept-Profile` / ruta correcta (p. ej. tradexpar.orders). */
function orders(sb) {
  return sb.schema(ORDERS_SCHEMA).from("orders");
}

/** `id_pedido_comercio` debe ser entero en la API; el token SHA-1 usa el mismo valor. */
function randomIdPedidoComercio() {
  return Math.floor(100_000_000 + Math.random() * 900_000_000);
}

/** PostgREST / Supabase devuelve a veces objetos sin `instanceof Error`; el catch los convertía en "Error interno". */
function serializeCaughtError(e) {
  if (e instanceof Error) return { error: e.message };
  if (e && typeof e === "object") {
    const msg = e.message || e.error_description || e.details;
    if (msg) {
      return {
        error: String(msg),
        ...(e.code != null && { code: e.code }),
        ...(e.details != null && String(e.details) !== String(msg) && { details: e.details }),
        ...(e.hint != null && { hint: e.hint }),
      };
    }
  }
  return { error: e != null ? String(e) : "Error interno" };
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

/** Esquema oficial comprador: 11 claves fijas (orden estable para inspección en logs). */
function buildPagoparCompradorFromOrder(order) {
  const nombre = (order.customer_name || "Cliente").toString().slice(0, 200);
  const email = (order.customer_email || "sin-email@tradexpar.local").toString().slice(0, 200);
  const telefono = (order.customer_phone || "000000").toString().replace(/\D/g, "").slice(0, 20) || "000000";
  const rawDoc = (order.customer_document || "").toString().replace(/\s/g, "");
  const documento = rawDoc.slice(0, 20) || telefono.slice(-7) || "0000000";
  const ciudad = String(order.customer_city_code || PAGOPAR_COMPRADOR_CIUDAD).trim() || "1";
  const direccion = (order.customer_address || "").toString().slice(0, 200);
  return {
    ruc: "",
    email,
    ciudad,
    nombre,
    telefono,
    direccion,
    documento,
    coordenadas: "",
    razon_social: "",
    tipo_documento: "CI",
    direccion_referencia: "",
  };
}

const PAGOPAR_COMPRADOR_KEYS = [
  "ruc",
  "email",
  "ciudad",
  "nombre",
  "telefono",
  "direccion",
  "documento",
  "coordenadas",
  "razon_social",
  "tipo_documento",
  "direccion_referencia",
];

/** Esquema oficial cada elemento de compras_items: 13 claves planas, sin objeto `vendedor`. */
const PAGOPAR_ITEM_TOP_KEYS = [
  "ciudad",
  "nombre",
  "cantidad",
  "categoria",
  "public_key",
  "url_imagen",
  "descripcion",
  "id_producto",
  "precio_total",
  "vendedor_telefono",
  "vendedor_direccion",
  "vendedor_direccion_referencia",
  "vendedor_direccion_coordenadas",
];

function assertPagoparCompradorShape(comprador) {
  const keys = new Set(Object.keys(comprador));
  if (keys.has("ciudad_id")) {
    throw new Error("[pagopar] comprador: no enviar ciudad_id; solo ciudad (string).");
  }
  if (keys.size !== PAGOPAR_COMPRADOR_KEYS.length) {
    throw new Error(`[pagopar] comprador: se esperaban ${PAGOPAR_COMPRADOR_KEYS.length} claves, hay ${keys.size}.`);
  }
  for (const k of PAGOPAR_COMPRADOR_KEYS) {
    if (!keys.has(k)) {
      throw new Error(`[pagopar] comprador: falta la clave obligatoria "${k}".`);
    }
  }
  for (const k of keys) {
    if (!PAGOPAR_COMPRADOR_KEYS.includes(k)) {
      throw new Error(`[pagopar] comprador: clave no permitida "${k}".`);
    }
  }
}

function assertPagoparCompraItemShape(item) {
  const keys = new Set(Object.keys(item));
  if (keys.has("vendedor")) {
    throw new Error("[pagopar] compras_items: no enviar objeto vendedor anidado; usá campos planos vendedor_*.");
  }
  if (keys.size !== PAGOPAR_ITEM_TOP_KEYS.length) {
    throw new Error(`[pagopar] compras_items: se esperaban ${PAGOPAR_ITEM_TOP_KEYS.length} claves de primer nivel, hay ${keys.size}.`);
  }
  for (const k of PAGOPAR_ITEM_TOP_KEYS) {
    if (!keys.has(k)) {
      throw new Error(`[pagopar] compras_items: falta la clave obligatoria "${k}".`);
    }
  }
  for (const k of keys) {
    if (!PAGOPAR_ITEM_TOP_KEYS.includes(k)) {
      throw new Error(`[pagopar] compras_items: clave no permitida "${k}".`);
    }
  }
}

function buildPagoparCompraItem(orderId, montoTotal) {
  const shortId = orderId.slice(0, 8);
  const nombre = `Pedido Tradexpar ${shortId}`;
  const tel = String(PAGOPAR_VENDEDOR_TELEFONO || "").trim();
  const dir = String(PAGOPAR_VENDEDOR_DIRECCION || "").trim() || "Tradexpar";
  const ref = String(PAGOPAR_VENDEDOR_DIR_REF || "").trim();
  const coo = String(PAGOPAR_VENDEDOR_COORDENADAS || "").trim();
  return {
    ciudad: PAGOPAR_ITEM_CIUDAD,
    nombre,
    cantidad: 1,
    categoria: PAGOPAR_ITEM_CATEGORIA,
    public_key: PAGOPAR_PUBLIC_KEY,
    url_imagen: PAGOPAR_ITEM_IMAGEN_URL,
    descripcion: `Tradexpar — ${nombre}`,
    id_producto: PAGOPAR_ITEM_PRODUCTO_ID,
    precio_total: montoTotal,
    vendedor_telefono: tel,
    vendedor_direccion: dir,
    vendedor_direccion_referencia: ref,
    vendedor_direccion_coordenadas: coo,
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
  let supabaseHost = "";
  try {
    supabaseHost = SUPABASE_URL ? new URL(SUPABASE_URL).host : "";
  } catch {
    supabaseHost = "";
  }
  res.json({
    ok: true,
    service: "tradexpar-payments-api",
    orders_schema: ORDERS_SCHEMA,
    supabase_host: supabaseHost,
  });
});

/**
 * POST /api/public/orders/:orderId/create-payment
 */
app.post("/api/public/orders/:orderId/create-payment", apiKeyMiddleware, async (req, res) => {
  try {
    requireEnv();
    const orderId = req.params.orderId;
    let supabaseHost = "";
    try {
      supabaseHost = SUPABASE_URL ? new URL(SUPABASE_URL).host : "";
    } catch {
      supabaseHost = "";
    }
    console.info("[create-payment][debug] orderId recibido=", orderId, {
      orders_schema_efectivo: ORDERS_SCHEMA,
      supabase_host: supabaseHost,
      query: `${ORDERS_SCHEMA}.orders`,
      filtro: `id eq ${orderId}`,
    });
    const sb = supabaseAdmin();

    const { data: order, error: fetchErr } = await orders(sb)
      .select(
        "id, total, customer_name, customer_email, customer_phone, customer_document, customer_address, customer_city_code, status"
      )
      .eq("id", orderId)
      .maybeSingle();

    if (fetchErr) {
      console.error("[create-payment][debug] error Supabase al leer pedido:", fetchErr);
      throw fetchErr;
    }
    if (!order) {
      console.warn("[create-payment][debug] sin fila", {
        orders_schema: ORDERS_SCHEMA,
        tabla: "orders",
        orderId,
        supabase_host: supabaseHost,
      });
      return res.status(404).json({ error: "Pedido no encontrado" });
    }
    console.info("[create-payment][debug] pedido encontrado id=", order.id, "status=", order.status);

    const idPedidoComercio = randomIdPedidoComercio();
    const ref = String(idPedidoComercio);
    const montoTotal = Math.max(0, Math.round(Number(order.total) || 0));
    if (montoTotal <= 0) {
      return res.status(400).json({ error: "Total del pedido inválido" });
    }

    const token = buildStartTransactionToken(PAGOPAR_PRIVATE_KEY, idPedidoComercio, montoTotal);

    const fechaMax = new Date();
    fechaMax.setDate(fechaMax.getDate() + 3);
    const fecha_maxima_pago = fechaMax.toISOString().slice(0, 19).replace("T", " ");

    const comprador = buildPagoparCompradorFromOrder(order);
    const compras_items = [buildPagoparCompraItem(orderId, montoTotal)];
    assertPagoparCompradorShape(comprador);
    assertPagoparCompraItemShape(compras_items[0]);

    const orderPagopar = {
      token,
      comprador,
      public_key: PAGOPAR_PUBLIC_KEY,
      monto_total: montoTotal,
      tipo_pedido: "VENTA-COMERCIO",
      compras_items,
      fecha_maxima_pago,
      id_pedido_comercio: idPedidoComercio,
      descripcion_resumen: `Tradexpar #${orderId.slice(0, 8)}`,
      forma_pago: PAGOPAR_FORMA_PAGO,
    };
    if (PAGOPAR_RETURN_URL) {
      orderPagopar.url_respuesta = PAGOPAR_RETURN_URL;
    }
    if (PAGOPAR_WEBHOOK_URL) {
      orderPagopar.url_notificacion = PAGOPAR_WEBHOOK_URL;
    }

    /**
     * El SDK PHP suele envolver en `orderPagopar`. Por defecto activo; desactivar con `PAGOPAR_ORDER_WRAPPER=0`.
     */
    const useOrderWrapper = String(process.env.PAGOPAR_ORDER_WRAPPER ?? "1").trim() !== "0";
    const payload = useOrderWrapper ? { orderPagopar } : orderPagopar;

    console.info("[create-payment][pagopar shape]", {
      bodyWrapper: useOrderWrapper ? "orderPagopar" : "flat",
      compradorKeyCount: Object.keys(comprador).length,
      itemTopLevelKeyCount: Object.keys(compras_items[0]).length,
      itemKeys: Object.keys(compras_items[0]),
    });

    const { error: upErr } = await orders(sb)
      .update({
        payment_reference: ref,
        payment_status: "pending",
        pagopar_hash: null,
      })
      .eq("id", orderId);

    if (upErr) throw upErr;

    console.log("[pagopar][payload_final]", JSON.stringify(payload, null, 2));

    const pp = await iniciarTransaccion(payload);

    if (!isPagoparRespuestaOk(pp.respuesta)) {
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

    const { error: hashErr } = await orders(sb)
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
    const body = serializeCaughtError(e);
    const low = String(body.error || "").toLowerCase();
    const looksLikeSupabaseAuth =
      low.includes("unauthorized") ||
      low.includes("invalid api key") ||
      low.includes("jwt") ||
      body.code === "PGRST301" ||
      body.code === "42501";
    if (looksLikeSupabaseAuth) {
      body.hint =
        "El proceso Node no pudo autenticarse con Supabase: revisá SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el .env del server de pagos (debe ser la service_role del mismo proyecto que la tienda, no la anon).";
      return res.status(503).json(body);
    }
    return res.status(500).json(body);
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

    const { data: row, error } = await orders(sb)
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
    let q = orders(sb).select("id, payment_reference, payment_status, pagopar_hash").limit(1);
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
    const { data: updated, error } = await orders(sb)
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
  console.log(`[payments-api] listening on :${PORT} (orders → PostgREST schema "${ORDERS_SCHEMA}")`);
});
