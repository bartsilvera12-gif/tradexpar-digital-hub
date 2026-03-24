const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://tan-trout-550053.hostingersite.com";
const API_KEY = import.meta.env.VITE_API_KEY || "";

const headers: HeadersInit = {
  "x-api-key": API_KEY,
  "Accept": "application/json",
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

import type { Product, Order, CreateOrderPayload, PaymentResponse, PaymentStatus } from "@/types";

export const api = {
  getProducts: () => apiFetch<Product[]>("/api/public/products"),

  createOrder: (data: CreateOrderPayload) =>
    apiFetch<Order>("/api/public/orders", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  createPayment: (orderId: string) =>
    apiFetch<PaymentResponse>(`/api/public/orders/${orderId}/create-payment`, {
      method: "POST",
    }),

  getPaymentStatus: (orderId: string, ref: string) =>
    apiFetch<PaymentStatus>(`/api/public/orders/${orderId}/payment-status?ref=${ref}`),
};
