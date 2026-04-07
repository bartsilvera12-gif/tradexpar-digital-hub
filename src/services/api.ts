const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "https://greenyellow-goat-534491.hostingersite.com";
const API_KEY = import.meta.env.VITE_API_KEY || "neura_mdUMuZ51HJq77ROG2WpWo1qhcdkDkcMi";

const headers: HeadersInit = {
  "x-api-key": API_KEY,
  Accept: "application/json",
  "Content-Type": "application/json",
};

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
  });
  if (!res.ok) {
    const error = await res.text().catch(() => "Unknown error");
    throw new Error(`API Error ${res.status}: ${error}`);
  }
  return res.json();
}

import type { PaymentResponse, PaymentStatus } from "@/types";

/**
 * Solo pasarela / estado de pago en backend externo.
 * Catálogo, pedidos, clientes, wishlist y admin de datos → `tradexpar` (Supabase).
 */
async function createPaymentRequest(orderId: string): Promise<PaymentResponse> {
  try {
    return await apiFetch<PaymentResponse>(`/api/public/orders/${orderId}/create-payment`, {
      method: "POST",
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
  createPayment: (orderId: string) => createPaymentRequest(orderId),

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
