export type AffiliateRequestStatus = "pending" | "approved" | "rejected";
export type AffiliateStatus = "active" | "suspended" | "pending";
export type CommissionStatus = "pending" | "approved" | "paid" | "cancelled" | "rejected";

export interface AffiliateRequestRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  document_id: string | null;
  message: string | null;
  status: AffiliateRequestStatus;
  admin_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface AffiliateRow {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string | null;
  document_id: string | null;
  customer_id: string | null;
  request_id: string | null;
  commission_rate: number;
  default_buyer_discount_percent: number;
  status: AffiliateStatus;
  created_at: string;
  updated_at?: string;
}

export interface AffiliateLinkRow {
  id: string;
  affiliate_id: string;
  label: string | null;
  ref_token: string;
  is_active: boolean;
  created_at: string;
}

export interface AffiliateCommissionRuleRow {
  id: string;
  affiliate_id: string;
  product_id: string | null;
  commission_percent: number;
  created_at: string;
  updated_at: string;
}

export interface AffiliateDiscountRuleRow {
  id: string;
  affiliate_id: string;
  product_id: string | null;
  discount_percent: number;
  created_at: string;
  updated_at: string;
}

export interface AffiliateSalesDetailRow {
  attribution_id: string;
  affiliate_id: string;
  affiliate_code: string;
  affiliate_name: string;
  order_id: string;
  order_created_at: string;
  order_total: number;
  commission_total: number;
  commission_status: CommissionStatus;
  ref_code: string;
  products_label: string;
  total_qty: number;
}

export interface AffiliateSummaryRow {
  affiliate_id: string;
  name: string;
  /** Rellenado en el panel uniendo con `affiliates`; la vista SQL puede no exponerlo. */
  email?: string | null;
  code: string;
  status: AffiliateStatus;
  default_commission_percent: number;
  default_buyer_discount_percent: number;
  orders_count: number;
  total_sold: number;
  commission_total: number;
  commission_pending: number;
  commission_approved: number;
  commission_paid: number;
}

export interface SubmitAffiliateRequestInput {
  full_name: string;
  email: string;
  phone?: string;
  document_id?: string;
  message?: string;
}

/** Fila devuelta por `affiliate_portal_snapshot` (vista de ventas). */
export interface AffiliatePortalSaleRow {
  attribution_id: string;
  order_id: string;
  order_created_at: string;
  order_total: number;
  commission_total: number;
  commission_status: CommissionStatus;
  products_label: string;
  total_qty: number;
}

export interface AffiliatePortalAffiliate {
  id: string;
  code: string;
  name: string;
  email: string;
  commission_rate: number;
  default_buyer_discount_percent: number;
  status: string;
  phone?: string | null;
  document_id?: string | null;
  customer_id?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

export type AffiliatePortalSnapshot =
  | { ok: false; reason: string }
  | {
      ok: true;
      affiliate: AffiliatePortalAffiliate;
      totals_pending: number;
      totals_approved: number;
      totals_paid: number;
      sales: AffiliatePortalSaleRow[];
    };
