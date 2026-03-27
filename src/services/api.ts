const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://tan-trout-550053.hostingersite.com";
const API_KEY = import.meta.env.VITE_API_KEY || "neura_mdUMuZ51HJq77ROG2WpWo1qhcdkDkcMi";

const headers: HeadersInit = {
  "x-api-key": API_KEY,
  "Accept": "application/json",
  "Content-Type": "application/json",
};

function getAdminHeaders(): HeadersInit {
  const token = sessionStorage.getItem("tradexpar_admin_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

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

import type {
  Product,
  Order,
  CreateOrderPayload,
  PaymentResponse,
  PaymentStatus,
  CustomerUser,
  CustomerWishlistItem,
  CustomerLocation,
} from "@/types";

export const api = {
  getProducts: async (): Promise<Product[]> => {
    const data = await apiFetch<{ products?: Product[] }>("/api/public/products");
    return Array.isArray(data.products) ? data.products : [];
  },

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

  customerRegister: (payload: { name: string; email: string; password: string }) =>
    apiFetch<{ user: CustomerUser; token?: string }>("/api/public/customers/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  customerLogin: (payload: { email: string; password: string }) =>
    apiFetch<{ user: CustomerUser; token?: string }>("/api/public/customers/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  customerOAuthStart: (provider: "google" | "facebook") =>
    apiFetch<{ url: string }>(`/api/public/customers/oauth/${provider}`),

  getWishlist: (customerId: string) =>
    apiFetch<{ items: CustomerWishlistItem[] }>(`/api/public/customers/${customerId}/wishlist`),

  addWishlistItem: (customerId: string, productId: string) =>
    apiFetch<CustomerWishlistItem>(`/api/public/customers/${customerId}/wishlist`, {
      method: "POST",
      body: JSON.stringify({ product_id: productId }),
    }),

  removeWishlistItem: (customerId: string, productId: string) =>
    apiFetch<{ ok: boolean }>(`/api/public/customers/${customerId}/wishlist/${productId}`, {
      method: "DELETE",
    }),

  getCustomerLocations: (customerId: string) =>
    apiFetch<{ locations: CustomerLocation[] }>(`/api/public/customers/${customerId}/locations`),

  createCustomerLocation: (customerId: string, payload: { label: string; location_url: string; is_default?: boolean }) =>
    apiFetch<CustomerLocation>(`/api/public/customers/${customerId}/locations`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  adminLogin: (payload: { email: string; password: string }) =>
    apiFetch<{ token: string; user: { id: string; email: string; name: string; role: string } }>("/api/admin/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  adminGetOrders: () =>
    apiFetch<{ orders: Order[] }>("/api/admin/orders", {
      headers: getAdminHeaders(),
    }),

  adminGetUsers: () =>
    apiFetch<{ users: CustomerUser[] }>("/api/admin/users", {
      headers: getAdminHeaders(),
    }),

  adminCreateProduct: (payload: Partial<Product>) =>
    apiFetch<Product>("/api/admin/products", {
      method: "POST",
      headers: getAdminHeaders(),
      body: JSON.stringify(payload),
    }),

  adminUpdateProduct: (productId: string, payload: Partial<Product>) =>
    apiFetch<Product>(`/api/admin/products/${productId}`, {
      method: "PUT",
      headers: getAdminHeaders(),
      body: JSON.stringify(payload),
    }),

  adminDeleteProduct: (productId: string) =>
    apiFetch<{ ok: boolean }>(`/api/admin/products/${productId}`, {
      method: "DELETE",
      headers: getAdminHeaders(),
    }),
};
