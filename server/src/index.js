import "dotenv/config";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import {
  checkoutUrlFromHash,
  getPagoparEndpoints,
  getPagoparIniciarTransaccionTokenInputParts,
  iniciarTransaccion,
  isPagoparRespuestaOk,
  maskPagoparCredential,
  phpStrvalFloatval,
  sha1Hex,
  stripPagoparSecret,
  verifyWebhookToken,
} from "./pagopar.js";

/**
 * Base del proyecto PostgREST (sin `/rest/v1`). Si pegás la URL del curl completo, se quita el sufijo.
 */
function normalizeSupabaseUrl(raw) {
  let u = (raw || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  u = u.replace(/\/+$/, "");
  u = u.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
  return u;
}

const PORT = Number(process.env.PORT || 8787);
const SUPABASE_URL = normalizeSupabaseUrl(process.env.SUPABASE_URL);
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

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
/** `SUPABASE_LOG_DEBUG=0` silencia logs Supabase. Por defecto activo para alinear con curl / depuración. */
const SUPABASE_LOG_DEBUG = String(process.env.SUPABASE_LOG_DEBUG ?? "1").trim() !== "0";
const API_KEY = process.env.API_PUBLIC_KEY || process.env.API_KEY || "";

const _ppPubKey = stripPagoparSecret(process.env.PAGOPAR_PUBLIC_KEY || "");
const _ppPubTok = stripPagoparSecret(process.env.PAGOPAR_PUBLIC_TOKEN || "");
const _ppPrivKey = stripPagoparSecret(process.env.PAGOPAR_PRIVATE_KEY || "");
const _ppPrivTok = stripPagoparSecret(process.env.PAGOPAR_PRIVATE_TOKEN || "");
const _envHasPubTok = String(process.env.PAGOPAR_PUBLIC_TOKEN ?? "").trim().length > 0;
const _envHasPrivTok = String(process.env.PAGOPAR_PRIVATE_TOKEN ?? "").trim().length > 0;

if (_envHasPubTok) {
  console.error(
    "[payments-api] ❌ PAGOPAR_PUBLIC_TOKEN está definido en el entorno. Eliminá esa variable del .env del VPS y usá solo PAGOPAR_PUBLIC_KEY para que no quede una clave vieja mezclada en runtime."
  );
}
if (_envHasPrivTok) {
  console.error(
    "[payments-api] ❌ PAGOPAR_PRIVATE_TOKEN está definido en el entorno. Eliminá esa variable del .env del VPS y usá solo PAGOPAR_PRIVATE_KEY."
  );
}

if (_ppPubKey && _ppPubTok && _ppPubKey !== _ppPubTok) {
  console.error(
    `[payments-api] ❌ PAGOPAR_PUBLIC_KEY y PAGOPAR_PUBLIC_TOKEN difieren. PRIORIZADA: PAGOPAR_PUBLIC_KEY (efectivo ${maskPagoparCredential(_ppPubKey)}). Borrá PAGOPAR_PUBLIC_TOKEN del .env.`
  );
}
if (_ppPrivKey && _ppPrivTok && _ppPrivKey !== _ppPrivTok) {
  console.error(
    `[payments-api] ❌ PAGOPAR_PRIVATE_KEY y PAGOPAR_PRIVATE_TOKEN difieren. PRIORIZADA: PAGOPAR_PRIVATE_KEY (${maskPagoparCredential(_ppPrivKey)}). Borrá PAGOPAR_PRIVATE_TOKEN del .env.`
  );
}

const PAGOPAR_PUBLIC_KEY = _ppPubKey || _ppPubTok;
const PAGOPAR_PRIVATE_KEY = _ppPrivKey || _ppPrivTok;
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
/** Solo `vendedor_direccion` en el ítem (esta cuenta PagoPar valida jsonb con 9 claves por línea). */
const PAGOPAR_VENDEDOR_DIRECCION = String(process.env.PAGOPAR_VENDEDOR_DIRECCION || "").slice(0, 300);
/** Placeholder que reemplaza PagoPar en la URL de retorno (documentación / panel). */
const PAGOPAR_RETURN_URL_DEFAULT =
  "https://greenyellow-goat-534491.hostingersite.com/success?hash=${hash}";
const PAGOPAR_RETURN_URL = String(process.env.PAGOPAR_RETURN_URL || "").trim() || PAGOPAR_RETURN_URL_DEFAULT;
const PAGOPAR_WEBHOOK_URL_DEFAULT =
  "https://greenyellow-goat-534491.hostingersite.com/api/pagopar/webhook";
const PAGOPAR_WEBHOOK_URL = String(process.env.PAGOPAR_WEBHOOK_URL || "").trim() || PAGOPAR_WEBHOOK_URL_DEFAULT;
/**
 * Si es "1", incluye url_respuesta y url_notificacion en el JSON de iniciar-transacción.
 * Por defecto off: el panel del comercio suele tener ya redirección y webhook configurados.
 */
const PAGOPAR_SEND_PAYLOAD_URLS = String(process.env.PAGOPAR_SEND_PAYLOAD_URLS || "").trim() === "1";
/** Si es "true", no exige token de webhook (solo desarrollo). */
const PAGOPAR_SKIP_WEBHOOK_VERIFY = String(process.env.PAGOPAR_SKIP_WEBHOOK_VERIFY || "") === "true";

/** Solo con PAGOPAR_LOG_TOKEN_DEBUG=1 (VPS / depuración). Por defecto apagado. */
const PAGOPAR_LOG_TOKEN_DEBUG = String(process.env.PAGOPAR_LOG_TOKEN_DEBUG ?? "").trim() === "1";

/** `PAGOPAR_LOG_ENDPOINTS=0` desactiva logs de entorno/URLs PagoPar al crear pago. */
const PAGOPAR_LOG_ENDPOINTS = String(process.env.PAGOPAR_LOG_ENDPOINTS ?? "1").trim() !== "0";

/**
 * Body plano (documentación oficial iniciar-transacción 2.0) por defecto.
 * Wrapper `{ orderPagopar: ... }` solo con PAGOPAR_ORDER_WRAPPER=1.
 */
const PAGOPAR_ORDER_WRAPPER = String(process.env.PAGOPAR_ORDER_WRAPPER ?? "0").trim() === "1";

/** Solo con PAGOPAR_LOG_INICIAR_TRANSACCION=1: bloque completo antes del POST (VPS). Por defecto apagado. */
const PAGOPAR_LOG_INICIAR_TRANSACCION = String(process.env.PAGOPAR_LOG_INICIAR_TRANSACCION ?? "").trim() === "1";

/** EXTREMO: loguea la cadena completa private+id+monto (filtra la clave privada). Solo PAGOPAR_LOG_SHA1_PLAINTEXT=1 */
const PAGOPAR_LOG_SHA1_PLAINTEXT = String(process.env.PAGOPAR_LOG_SHA1_PLAINTEXT ?? "").trim() === "1";

/** Núcleo habitual iniciar-transacción 2.0 (referencia documentación). */
const PAGOPAR_INICIAR_CORE_KEYS = new Set([
  "token",
  "comprador",
  "public_key",
  "monto_total",
  "tipo_pedido",
  "compras_items",
  "fecha_maxima_pago",
  "id_pedido_comercio",
  "descripcion_resumen",
  "forma_pago",
]);
const PAGOPAR_INICIAR_COMMON_OPTIONAL = new Set(["url_respuesta", "url_notificacion"]);

function analyzePagoparIniciarPayloadShape(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { body_mode: "invalid", inner_keys: [], top_level_extra_vs_core: [], optional_doc_present: [] };
  }
  const inner = payload.orderPagopar && typeof payload.orderPagopar === "object" ? payload.orderPagopar : payload;
  const keys = Object.keys(inner);
  return {
    body_mode: payload.orderPagopar ? "wrapper_orderPagopar" : "flat",
    inner_keys: keys,
    top_level_extra_vs_core: keys.filter(
      (k) => !PAGOPAR_INICIAR_CORE_KEYS.has(k) && !PAGOPAR_INICIAR_COMMON_OPTIONAL.has(k)
    ),
    optional_doc_present: keys.filter((k) => PAGOPAR_INICIAR_COMMON_OPTIONAL.has(k)),
  };
}

function requireEnv() {
  const miss = [];
  if (!SUPABASE_URL) miss.push("SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) miss.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!PAGOPAR_PUBLIC_KEY) miss.push("PAGOPAR_PUBLIC_KEY (recomendado; evitar solo *_TOKEN)");
  if (!PAGOPAR_PRIVATE_KEY) miss.push("PAGOPAR_PRIVATE_KEY (recomendado; evitar solo *_TOKEN)");
  if (!API_KEY) miss.push("API_PUBLIC_KEY o API_KEY");
  if (miss.length) {
    console.warn("[payments-api] Faltan variables:", miss.join(", "));
  }
}

let supabaseAdminSingleton = null;

/**
 * Un solo cliente con `db.schema` = PostgREST `Accept-Profile` / `Content-Profile` (mismo efecto que el curl con tradexpar).
 * Además `orders(sb)` encadena `.schema(ORDERS_SCHEMA)` por claridad.
 */
function supabaseAdmin() {
  if (!supabaseAdminSingleton) {
    supabaseAdminSingleton = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: ORDERS_SCHEMA },
    });
    if (SUPABASE_LOG_DEBUG) {
      let host = "";
      try {
        host = SUPABASE_URL ? new URL(SUPABASE_URL).host : "";
      } catch {
        host = "";
      }
      console.info("[payments-api][supabase-client] createClient inicial (singleton)", {
        supabase_url_efectiva: SUPABASE_URL,
        host,
        rest_v1_base: SUPABASE_URL ? `${SUPABASE_URL}/rest/v1` : "",
        db_schema_en_createClient: ORDERS_SCHEMA,
        service_role_key_longitud: SUPABASE_SERVICE_ROLE_KEY.length,
      });
    }
  }
  return supabaseAdminSingleton;
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

/** Claves por línea en compras_items (incluye precio_unitario en PYG entero). */
const PAGOPAR_ITEM_TOP_KEYS = [
  "ciudad",
  "nombre",
  "cantidad",
  "categoria",
  "public_key",
  "url_imagen",
  "id_producto",
  "precio_total",
  "precio_unitario",
  "vendedor_direccion",
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
    throw new Error("[pagopar] compras_items: no enviar objeto vendedor anidado; solo la clave plana vendedor_direccion.");
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
  const cantidad = Math.round(Number(item.cantidad) || 0);
  const precioTotal = Math.round(Number(item.precio_total) || 0);
  const pu = item.precio_unitario;
  if (typeof pu !== "number" || !Number.isInteger(pu)) {
    throw new Error("[pagopar] compras_items: precio_unitario debe ser number entero (PYG).");
  }
  if (cantidad <= 0) {
    throw new Error("[pagopar] compras_items: cantidad inválida.");
  }
  const esperadoUnit = Math.round(precioTotal / cantidad);
  if (pu !== esperadoUnit) {
    throw new Error(
      `[pagopar] compras_items: precio_unitario debe ser round(precio_total/cantidad); esperado ${esperadoUnit}, recibido ${pu}.`
    );
  }
}

/** Suma de precio_total de todas las líneas debe coincidir con monto_total del pedido PagoPar. */
function assertComprasItemsPrecioTotalSum(compras_items, monto_total) {
  const sum = compras_items.reduce((acc, it) => acc + Math.round(Number(it.precio_total) || 0), 0);
  if (sum !== monto_total) {
    throw new Error(
      `[pagopar] monto_total (${monto_total}) no coincide con la suma de precio_total de compras_items (${sum}).`
    );
  }
}

/**
 * Una línea de compras_items. precio_unitario = round(precio_total / cantidad), PYG entero, tipo number.
 */
function buildPagoparCompraItem(orderId, precioTotalLinea, cantidadLinea = 1) {
  const shortId = orderId.slice(0, 8);
  const nombre = `Pedido Tradexpar ${shortId}`;
  const dir = String(PAGOPAR_VENDEDOR_DIRECCION || "").trim() || "Tradexpar";
  const cantidad = Math.max(1, Math.round(Number(cantidadLinea) || 1));
  const precio_total = Math.round(Number(precioTotalLinea) || 0);
  const precio_unitario = Math.round(precio_total / cantidad);
  return {
    ciudad: PAGOPAR_ITEM_CIUDAD,
    nombre,
    cantidad,
    categoria: PAGOPAR_ITEM_CATEGORIA,
    public_key: PAGOPAR_PUBLIC_KEY,
    url_imagen: PAGOPAR_ITEM_IMAGEN_URL,
    id_producto: PAGOPAR_ITEM_PRODUCTO_ID,
    precio_total,
    precio_unitario,
    vendedor_direccion: dir,
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
  let pagoparHealth = null;
  try {
    const ep = getPagoparEndpoints();
    pagoparHealth = {
      pagopar_env: ep.env,
      pagopar_api_base: ep.apiBase,
      pagopar_checkout_base: ep.checkoutBase,
      pagopar_iniciar_transaccion_url: ep.iniciarTransaccionUrl,
      pagopar_staging_official_hosts: ep.stagingUsesOfficialHosts,
    };
  } catch (e) {
    pagoparHealth = { error: e instanceof Error ? e.message : String(e) };
  }

  res.json({
    ok: true,
    service: "tradexpar-payments-api",
    orders_schema: ORDERS_SCHEMA,
    supabase_host: supabaseHost,
    supabase_url_configured: Boolean(SUPABASE_URL),
    rest_v1_orders_hint: SUPABASE_URL ? `${SUPABASE_URL}/rest/v1/orders` : null,
    createClient_uses_db_schema: true,
    pagopar: pagoparHealth,
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

    const selectCols =
      "id, total, customer_name, customer_email, customer_phone, customer_document, customer_address, customer_city_code, status";
    if (SUPABASE_LOG_DEBUG) {
      const enc = encodeURIComponent;
      console.info("[create-payment][supabase-debug] lectura orders (equivalente curl Accept-Profile / Content-Profile)", {
        supabase_url: SUPABASE_URL,
        schema_efectivo: ORDERS_SCHEMA,
        createClient_db_schema: ORDERS_SCHEMA,
        cadena_orders: `schema("${ORDERS_SCHEMA}").from("orders")`,
        get_url_equivalente: `${SUPABASE_URL}/rest/v1/orders?select=${enc(selectCols)}&id=eq.${enc(orderId)}`,
        headers_esperados_como_curl: {
          apikey: "(service_role)",
          Authorization: "Bearer (service_role)",
          "Accept-Profile": ORDERS_SCHEMA,
          "Content-Profile": ORDERS_SCHEMA,
        },
      });
    }

    const { data: order, error: fetchErr } = await orders(sb)
      .select(selectCols)
      .eq("id", orderId)
      .maybeSingle();

    if (fetchErr) {
      console.error("[create-payment][supabase-debug] error completo supabase-js:", JSON.stringify(fetchErr, null, 2));
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

    const montoStrParaToken = phpStrvalFloatval(montoTotal);
    if (PAGOPAR_LOG_TOKEN_DEBUG) {
      console.info("[create-payment][token-debug] antes de SHA1 (fórmula PagoPar: private+id+strval(floatval(monto)))", {
        private_key_enmascarada: maskPagoparCredential(PAGOPAR_PRIVATE_KEY),
        id_pedido_para_token: idPedidoComercio,
        monto_total_numero_usado: montoTotal,
        monto_str_strval_floatval: montoStrParaToken,
        cadena_concat_longitud:
          stripPagoparSecret(PAGOPAR_PRIVATE_KEY).length +
          String(idPedidoComercio).length +
          montoStrParaToken.length,
      });
    }

    const tokenInputParts = getPagoparIniciarTransaccionTokenInputParts(
      PAGOPAR_PRIVATE_KEY,
      idPedidoComercio,
      montoTotal
    );
    const token = sha1Hex(tokenInputParts.plaintextConcat);

    if (PAGOPAR_LOG_TOKEN_DEBUG) {
      console.info("[create-payment][token-debug] token SHA1 generado", { token_generado: token });
    }

    const fechaMax = new Date();
    fechaMax.setDate(fechaMax.getDate() + 3);
    const fecha_maxima_pago = fechaMax.toISOString().slice(0, 19).replace("T", " ");

    const comprador = buildPagoparCompradorFromOrder(order);
    const compras_items = [buildPagoparCompraItem(orderId, montoTotal, 1)];
    assertPagoparCompradorShape(comprador);
    assertPagoparCompraItemShape(compras_items[0]);
    assertComprasItemsPrecioTotalSum(compras_items, montoTotal);

    const pagoparBody = {
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
    if (PAGOPAR_SEND_PAYLOAD_URLS) {
      pagoparBody.url_respuesta = PAGOPAR_RETURN_URL;
      pagoparBody.url_notificacion = PAGOPAR_WEBHOOK_URL;
    }

    if (PAGOPAR_LOG_TOKEN_DEBUG) {
      console.info("[create-payment][token-debug] cuerpo iniciar-transacción (coincidencia token)", {
        id_pedido_comercio_enviado: pagoparBody.id_pedido_comercio,
        monto_total_enviado: pagoparBody.monto_total,
        token_enviado: pagoparBody.token,
        coincide_id: pagoparBody.id_pedido_comercio === idPedidoComercio,
        coincide_monto: pagoparBody.monto_total === montoTotal,
      });
    }

    /** Documentación oficial: JSON plano. Wrapper solo si PAGOPAR_ORDER_WRAPPER=1. */
    const payload = PAGOPAR_ORDER_WRAPPER ? { orderPagopar: pagoparBody } : pagoparBody;

    console.info("[create-payment][pagopar shape]", {
      bodyWrapper: PAGOPAR_ORDER_WRAPPER ? "orderPagopar" : "flat",
      urls_en_payload: PAGOPAR_SEND_PAYLOAD_URLS,
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

    if (PAGOPAR_LOG_ENDPOINTS) {
      const ep = getPagoparEndpoints();
      console.info("[create-payment][pagopar-endpoints]", {
        pagopar_env_resuelto: ep.env,
        api_base: ep.apiBase,
        checkout_base: ep.checkoutBase,
        iniciar_transaccion_url: ep.iniciarTransaccionUrl,
        staging_usa_hosts_oficiales: ep.stagingUsesOfficialHosts,
        public_key_enmascarada: maskPagoparCredential(PAGOPAR_PUBLIC_KEY),
        private_key_enmascarada: maskPagoparCredential(PAGOPAR_PRIVATE_KEY),
      });
    }

    const bodyJsonParaPagopar = JSON.stringify(payload);
    const payloadShape = analyzePagoparIniciarPayloadShape(payload);
    if (PAGOPAR_LOG_INICIAR_TRANSACCION) {
      const sha1SafePattern = `<PRIVATE:${tokenInputParts.privateKeySanitizedLength}chars>${tokenInputParts.idStr}${tokenInputParts.amountStr}`;
      console.info("[create-payment][pagopar-iniciar] ANTES del POST a PagoPar", {
        public_key_enmascarada: maskPagoparCredential(PAGOPAR_PUBLIC_KEY),
        private_key_enmascarada: maskPagoparCredential(PAGOPAR_PRIVATE_KEY),
        id_pedido_comercio_exacto: idPedidoComercio,
        typeof_id_pedido_comercio: typeof idPedidoComercio,
        monto_total_exacto: montoTotal,
        typeof_monto_total: typeof montoTotal,
        id_str_usada_en_sha1: tokenInputParts.idStr,
        amount_str_usada_en_sha1: tokenInputParts.amountStr,
        private_key_sanitized_length: tokenInputParts.privateKeySanitizedLength,
        sha1_concat_pattern_sin_exponer_private: sha1SafePattern,
        token_sha1_resultante: token,
        order_wrapper_enabled: PAGOPAR_ORDER_WRAPPER,
        body_mode: payloadShape.body_mode,
        urls_incluidas_en_json: PAGOPAR_SEND_PAYLOAD_URLS,
        campos_top_level_inner: payloadShape.inner_keys,
        campos_opcionales_doc_presentes: payloadShape.optional_doc_present,
        campos_extra_vs_nucleo_doc: payloadShape.top_level_extra_vs_core,
      });
      if (PAGOPAR_LOG_SHA1_PLAINTEXT) {
        console.warn(
          "[create-payment][pagopar-iniciar] ⚠️ PAGOPAR_LOG_SHA1_PLAINTEXT=1 — cadena completa para SHA1 (contiene clave privada; desactivá tras depurar):",
          tokenInputParts.plaintextConcat
        );
      }
      console.info("[create-payment][pagopar-iniciar] JSON exacto enviado a iniciar-transacción:", bodyJsonParaPagopar);
    }

    const pp = await iniciarTransaccion(payload, {
      omitRequestBodyInPagoparModuleLog: PAGOPAR_LOG_INICIAR_TRANSACCION,
    });

    if (!isPagoparRespuestaOk(pp.respuesta)) {
      return res.status(502).json({
        error: "PagoPar rejected iniciar-transaccion",
        pagopar: pp,
        debug: {
          id_pedido_comercio: idPedidoComercio,
          monto_total: montoTotal,
          wrapper_enabled: PAGOPAR_ORDER_WRAPPER,
        },
      });
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
try {
  const ep = getPagoparEndpoints();
  console.info(
    `[payments-api] PagoPar entorno="${ep.env}" API=${ep.apiBase} checkout=${ep.checkoutBase}` +
      (ep.stagingUsesOfficialHosts ? " (staging: credenciales de prueba + hosts oficiales)" : "")
  );
} catch (e) {
  console.error("[payments-api] Config PagoPar:", e instanceof Error ? e.message : e);
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`[payments-api] listening on :${PORT} (orders → PostgREST schema "${ORDERS_SCHEMA}")`);
  console.log(
    `[payments-api] PagoPar: ORDER_WRAPPER default off (flat body). Depuración token en VPS: PAGOPAR_LOG_INICIAR_TRANSACCION=1 y PAGOPAR_LOG_TOKEN_DEBUG=1`
  );
});
