import type { PaymentResponse, PaymentStatus } from "@/types";

/** Panel pedidos: estado Fastrax (GET /api/admin/orders/:id/fastrax/status). */
export type AdminFastraxStatusResponse = {
  ok: boolean;
  provider?: "fastrax";
  order_id: string;
  has_map: boolean;
  map: Record<string, unknown> | null;
  tracking: {
    fastrax_ped: string | null;
    fastrax_pdc: string | null;
    status_code: number | null;
    status_label: string;
    last_sync_at: string | null;
    error: string | null;
  };
};

/** Base pública del servidor Node de pagos (sin barra final). Vacío en dev → URLs relativas `/api/...` (proxy Vite). */
const RAW_PAYMENTS_API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");
/** Debe coincidir con API_PUBLIC_KEY del server de pagos (definir en .env como VITE_API_KEY). */
const API_KEY = (import.meta.env.VITE_API_KEY || "").trim();

const headers: HeadersInit = {
  "x-api-key": API_KEY,
  Accept: "application/json",
  "Content-Type": "application/json",
};

function buildPaymentsUrl(path: string): string {
  const rel = path.startsWith("/") ? path : `/${path}`;
  if (RAW_PAYMENTS_API_BASE) {
    return `${RAW_PAYMENTS_API_BASE}${rel}`;
  }
  if (import.meta.env.DEV) {
    return rel;
  }
  throw new Error(
    "Checkout PagoPar: falta VITE_API_BASE_URL en el build de producción. Definila antes de `npm run build` " +
      "(URL pública donde corre el servidor Node de la carpeta `server/`, sin barra final). " +
      "Si usás el mismo dominio que la tienda, configurá el reverse proxy (Nginx) para que `/api/` llegue al Node y no al `index.html` estático."
  );
}

/** URL absoluta solo para mensajes de error (cuando la petición es relativa). */
function absoluteUrlForMessage(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(url, window.location.origin).href;
  }
  return url;
}

function looksLikeHtml(body: string): boolean {
  const t = body.trim();
  if (!t) return false;
  if (t.startsWith("<")) return true;
  const lower = t.slice(0, 64).toLowerCase();
  return lower.includes("<!doctype html") || lower.includes("<html");
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = buildPaymentsUrl(path);
  if (import.meta.env.DEV) {
    // Depuración local: URL efectiva hacia el server de pagos
    // eslint-disable-next-line no-console
    console.info("[payments-api] fetch", options?.method ?? "GET", absoluteUrlForMessage(url));
  }

  const res = await fetch(url, {
    ...options,
    headers: { ...headers, ...options?.headers },
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`API Error ${res.status}: ${text.slice(0, 500)}`);
  }
  const trimmed = text.trim();
  if (looksLikeHtml(trimmed)) {
    const abs = absoluteUrlForMessage(url);
    const ct = res.headers.get("content-type") ?? "";
    let healthUrl = "";
    try {
      healthUrl = new URL("/health", abs).href;
    } catch {
      healthUrl = "";
    }
    throw new Error(
      `La API de pagos respondió con HTML en lugar de JSON.\n` +
        `URL usada: ${abs}\n` +
        `Content-Type: ${ct || "(sin header)"}\n` +
        `Causas típicas: (1) VITE_API_BASE_URL vacía o incorrecta en el build de producción; ` +
        `(2) el reverse proxy envía /api/* al bucket estático y devuelve index.html; ` +
        `(3) VITE_API_BASE_URL apunta al sitio del storefront en vez del proceso Node.` +
        (healthUrl ? ` Verificá en el navegador: ${healthUrl}` : "")
    );
  }
  if (!trimmed) {
    throw new Error(`La API de pagos devolvió un cuerpo vacío (${res.status}). URL: ${absoluteUrlForMessage(url)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Respuesta no es JSON válido (${res.status}). URL: ${absoluteUrlForMessage(url)}. ` +
        `Revisá la URL del servidor de pagos y el header x-api-key (VITE_API_KEY).`
    );
  }
}

function assertCreatePaymentJson(data: unknown): PaymentResponse {
  if (!data || typeof data !== "object") {
    throw new Error("create-payment: la API devolvió un JSON inválido (no es un objeto).");
  }
  const o = data as Record<string, unknown>;
  if (typeof o.ref !== "string" || !o.ref.trim()) {
    throw new Error("create-payment: falta `ref` (string) en la respuesta JSON.");
  }
  if (!("paymentLink" in o) || typeof o.paymentLink !== "string") {
    throw new Error("create-payment: falta `paymentLink` (string) en la respuesta JSON.");
  }
  return data as PaymentResponse;
}

/**
 * Solo pasarela / estado de pago en backend externo.
 * Catálogo, pedidos, clientes, wishlist y admin de datos → `tradexpar` (Supabase).
 */
export type CreatePaymentPagoparOptions = {
  /** Código de forma de pago PagoPar (panel / endpoint forma-pago/traer). */
  forma_pago?: number;
  product_mode?: "physical" | "virtual" | string;
  mode?: string;
  item_categoria?: string;
  item_descripcion?: string;
  item_ciudad?: string;
  vendedor_telefono?: string;
  vendedor_direccion?: string;
  vendedor_direccion_referencia?: string;
  vendedor_direccion_coordenadas?: string;
  id_producto?: number | string;
};

/** Método normalizado desde PagoPar `forma-pago/1.1/traer`. */
export type PagoparPaymentMethod = {
  id: number;
  title: string;
  description: string;
  min_amount: number | null;
  commission_percent: number | null;
};

async function createPaymentRequest(
  orderId: string,
  options?: { pagopar?: CreatePaymentPagoparOptions }
): Promise<PaymentResponse> {
  try {
    const body =
      options?.pagopar && Object.keys(options.pagopar).length > 0
        ? JSON.stringify({ pagopar: options.pagopar })
        : JSON.stringify({});
    const data = await apiFetch<unknown>(`/api/public/orders/${orderId}/create-payment`, {
      method: "POST",
      body,
    });
    return assertCreatePaymentJson(data);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (m.includes("Pedido no encontrado")) {
      throw new Error(
        "El servidor de pagos no encontró el pedido. Suele ocurrir cuando VITE_API_BASE_URL apunta a un backend que usa otro Supabase que el de la tienda. " +
          "En el servidor Node configurá SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY con la misma instancia que VITE_SUPABASE_URL (p. ej. Neura), schema tradexpar."
      );
    }
    throw e;
  }
}

export const api = {
  createPayment: (orderId: string, options?: { pagopar?: CreatePaymentPagoparOptions }) =>
    createPaymentRequest(orderId, options),

  getPaymentStatus: (orderId: string, ref: string, hash?: string) => {
    const q = new URLSearchParams();
    if (ref) q.set("ref", ref);
    if (hash) q.set("hash", hash);
    const qs = q.toString();
    return apiFetch<PaymentStatus>(
      `/api/public/orders/${orderId}/payment-status${qs ? `?${qs}` : ""}`
    );
  },

  /** Cuando PagoPar redirige solo con `?hash=` y no hay orderId en sesión. */
  getPaymentStatusByHash: (hash: string, ref?: string) => {
    const q = new URLSearchParams({ hash });
    if (ref) q.set("ref", ref);
    return apiFetch<PaymentStatus>(`/api/public/payment-status?${q.toString()}`);
  },

  /**
   * Consulta el estado en la API PagoPar (1.1/traer) y actualiza `orders` por `pagopar_hash`.
   * Misma clave pública `x-api-key` que el resto de `/api/public/*`.
   */
  getPagoparStatus: (hash: string) =>
    apiFetch<PaymentStatus>(`/api/public/pagopar/status?${new URLSearchParams({ hash }).toString()}`),

  getPagoparPaymentMethods: () =>
    apiFetch<{ ok: boolean; methods: PagoparPaymentMethod[]; error?: string }>(
      "/api/public/pagopar/payment-methods"
    ),

  /**
   * Panel pedidos: estado Dropi en `dropi_order_map` (mismo `x-api-key` que otras APIs Node).
   */
  getAdminOrderDropiStatus: (orderId: string) =>
    apiFetch<{
      ok: boolean;
      order_id: string;
      has_map: boolean;
      map: Record<string, unknown> | null;
    }>(`/api/admin/orders/${encodeURIComponent(orderId)}/dropi/status`),

  /** Refresca estado (bridge GET o re-parseo de `response`). */
  postAdminOrderDropiSyncStatus: (orderId: string) =>
    apiFetch<Record<string, unknown>>(
      `/api/admin/orders/${encodeURIComponent(orderId)}/dropi/sync-status`,
      { method: "POST", body: "{}" }
    ),

  /** Crea el pedido en Dropi (si el mapa aún no existe; mismo que create explícito). */
  postAdminOrderDropiCreate: (orderId: string) =>
    apiFetch<Record<string, unknown>>(
      `/api/admin/orders/${encodeURIComponent(orderId)}/dropi/create`,
      { method: "POST", body: "{}" }
    ),

  /** Fastrax: lee `fastrax_order_map`; con `live` llama ope=13. */
  getAdminOrderFastraxStatus: (orderId: string, live?: boolean) => {
    const q = new URLSearchParams();
    if (live) q.set("live", "1");
    const qs = q.toString();
    return apiFetch<AdminFastraxStatusResponse>(
      `/api/admin/orders/${encodeURIComponent(orderId)}/fastrax/status${qs ? `?${qs}` : ""}`
    );
  },

  postAdminOrderFastraxSyncStatus: (orderId: string) =>
    apiFetch<AdminFastraxStatusResponse>(
      `/api/admin/orders/${encodeURIComponent(orderId)}/fastrax/sync-status`,
      { method: "POST", body: "{}" }
    ),

  postAdminOrderFastraxCreate: (orderId: string) =>
    apiFetch<Record<string, unknown>>(
      `/api/admin/orders/${encodeURIComponent(orderId)}/fastrax/create`,
      { method: "POST", body: "{}" }
    ),

  postAdminOrderFastraxInvoice: (orderId: string) =>
    apiFetch<Record<string, unknown>>(
      `/api/admin/orders/${encodeURIComponent(orderId)}/fastrax/invoice`,
      { method: "POST", body: "{}" }
    ),
};
