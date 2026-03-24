export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  image: string;
  sku: string;
  description: string;
  category: string;
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
    email: string;
    phone?: string;
  };
}

export interface Order {
  id: string;
  items: OrderItem[];
  total: number;
  status: string;
  created_at: string;
  customer: {
    name: string;
    email: string;
    phone?: string;
  };
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
