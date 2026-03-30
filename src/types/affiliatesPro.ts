export type FraudFlagType =
  | "self_purchase"
  | "duplicate_pattern"
  | "suspicious_ip"
  | "high_refund_rate"
  | "low_conversion";

export type FraudSeverity = "low" | "medium" | "high";
export type FraudFlagStatus = "open" | "reviewed" | "dismissed" | "confirmed";

export interface AffiliateFraudFlagRow {
  id: string;
  affiliate_id: string;
  order_id: string | null;
  visit_id: string | null;
  flag_type: FraudFlagType;
  severity: FraudSeverity;
  status: FraudFlagStatus;
  notes: string | null;
  created_at: string;
}

export type AffiliateAssetType = "image" | "video" | "text" | "pdf";

export interface AffiliateAssetRow {
  id: string;
  title: string;
  asset_type: AffiliateAssetType;
  file_url: string;
  product_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AffiliateTierRow {
  id: string;
  name: string;
  min_sales: number;
  commission_bonus_percent: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface AffiliateCommissionAdjustmentRow {
  id: string;
  affiliate_id: string;
  attribution_id: string | null;
  payout_id: string | null;
  type: "refund" | "chargeback" | "manual_adjustment";
  amount: number;
  reason: string | null;
  created_at: string;
}

export interface AffiliateAnalyticsPayload {
  top_affiliates: {
    name: string;
    code: string;
    affiliate_id: string;
    sales: number;
    commission_sum: number;
  }[];
  top_products: {
    product_id: string;
    product_name: string | null;
    qty: number;
    revenue: number;
  }[];
  funnel_30d: { visits_30d: number; attributions_30d: number };
  refunds_by_affiliate: { affiliate_id: string; name: string; refunds: number; orders: number }[];
  commissions_by_status: {
    pending: number;
    approved: number;
    paid: number;
    cancelled: number;
    rejected: number;
  };
}
