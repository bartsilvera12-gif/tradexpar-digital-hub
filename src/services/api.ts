const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");
/** Debe coincidir con API_PUBLIC_KEY del server de pagos (definir en .env como VITE_API_KEY). */
const API_KEY = (import.meta.env.VITE_API_KEY || "").trim();

const headers: HeadersInit = {
  "x-api-key": API_KEY,
  Accept: "application/json",
  "Content-Type": "application/json",
};

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...headers, ...options?.headers },
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`API Error ${res.status}: ${text.slice(0, 500)}`);
  }
  const trimmed = text.trim();
  if (trimmed.startsWith("<")) {
    throw new Error(
      "La API de pagos respondió con una página HTML (no JSON). Suele pasar si VITE_API_BASE_URL apunta al sitio estático o si en el VPS las rutas /api/… no se reenvían al servidor Node y el hosting devuelve index.html."
    );
  }
  if (!trimmed) {
    throw new Error("La API de pagos devolvió un cuerpo vacío.");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Respuesta no es JSON válido (${res.status}). Revisá la URL del servidor de pagos y el header x-api-key.`
    );
  }
}

import type { PaymentResponse, PaymentStatus } from "@/types";

/**
 * Solo pasarela / estado de pago en backend externo.
 * Catálogo, pedidos, clientes, wishlist y admin de datos → `tradexpar` (Supabase).
 */
export type CreatePaymentPagoparOptions = {
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

async function createPaymentRequest(
  orderId: string,
  options?: { pagopar?: CreatePaymentPagoparOptions }
): Promise<PaymentResponse> {
  try {
    const body =
      options?.pagopar && Object.keys(options.pagopar).length > 0
        ? JSON.stringify({ pagopar: options.pagopar })
        : JSON.stringify({});
    return await apiFetch<PaymentResponse>(`/api/public/orders/${orderId}/create-payment`, {
      method: "POST",
      body,
    });
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
};
