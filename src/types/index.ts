export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
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
}

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
}

export interface Order {
  id: string;
  items: OrderItem[];
  total: number;
  status: string;
  created_at: string;
  /** Pedidos nuevos: solo tradexpar | dropi; valores antiguos pueden incluir otros. */
  checkout_type?: string;
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
