export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  /** Umbral mínimo de inventario (opcional). */
  stock_min?: number | null;
  /** Tope máximo de inventario (opcional). */
  stock_max?: number | null;
  image: string;
  images?: string[];
  sku: string;
  description: string;
  category: string;
  created_at?: string;
  product_source_type?: "tradexpar" | "dropi";
  discount_type?: "percentage" | "fixed" | null;
  discount_value?: number | null;
  discount_starts_at?: string | null;
  discount_ends_at?: string | null;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface OrderItem {
  product_id: string;
  quantity: number;
  price: number;
  /** Opcional: se guarda en order_items (snapshot al checkout). */
  product_name?: string;
}

/** Línea de pedido en admin (ítems + metadatos catálogo / Dropi). */
export interface OrderLineItem extends OrderItem {
  id?: string;
  line_index?: number;
  line_subtotal?: number;
  line_status?: string;
  sku?: string;
  product_source_type?: "tradexpar" | "dropi";
  external_provider?: string | null;
  external_product_id?: string | null;
  external_order_id?: string | null;
  external_status?: string | null;
  external_url?: string | null;
}

export type OrderKindComputed = "internal" | "dropi" | "mixed";

export interface CreateOrderPayload {
  items: OrderItem[];
  customer: {
    name: string;
    email?: string;
    phone?: string;
  };
  checkout_type?: "tradexpar" | "dropi";
  location_url: string;
  customer_location_id?: string;
  affiliate_ref?: string;
  /** IP del cliente si el ERP/front la envía (antifraude) */
  checkout_client_ip?: string | null;
}

export interface Order {
  id: string;
  items: OrderLineItem[];
  total: number;
  status: string;
  created_at: string;
  /** Pedidos nuevos: solo tradexpar | dropi; valores antiguos pueden incluir otros. */
  checkout_type?: string;
  /** Derivado de product_source_type de las líneas (propio / Dropi / mixto). */
  order_kind?: OrderKindComputed;
  /** URL del pedido en proveedor externo (nivel pedido). */
  external_order_url?: string | null;
  customer: {
    name: string;
    email?: string;
    phone?: string;
  };
}

export interface CustomerUser {
  id: string;
  name: string;
  email: string;
  created_at?: string;
  /** Origen del registro (manual, google, etc.) — útil en admin */
  provider?: string;
  /** Listado admin (RPC): tiene fila en affiliates ligada a este customer */
  is_affiliate?: boolean;
}

export interface CustomerLocation {
  id: string;
  customer_id: string;
  label: string;
  location_url: string;
  is_default?: boolean;
  created_at?: string;
}

export interface CustomerWishlistItem {
  id: string;
  customer_id?: string;
  product_id: string;
  created_at?: string;
}

export interface PaymentResponse {
  paymentLink: string;
  ref: string;
  /** hash_pedido de PagoPar (mismo valor que `pagopar_hash` en la respuesta). */
  hash?: string;
  pagopar_hash?: string;
  order_id?: string;
}

export interface PaymentStatus {
  status: string;
  ref: string;
  order_id: string;
}

// Admin types
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
}

export interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalProducts: number;
  totalUsers: number;
}
