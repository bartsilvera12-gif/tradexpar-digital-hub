import type { Order, OrderKindComputed, OrderLineItem } from "@/types";

export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "waiting_supplier",
  "shipped",
  "delivered",
  "cancelled",
  "completed",
] as const;

export type OrderStatusValue = (typeof ORDER_STATUSES)[number];

export const ITEM_STATUSES_ERP = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export const ITEM_STATUSES_DROPI = [
  "pending",
  "pending_supplier",
  "ordered_in_dropi",
  "confirmed_by_dropi",
  "shipped_by_dropi",
  "delivered",
  "failed",
  "cancelled",
] as const;

export function deriveOrderKind(items: OrderLineItem[]): OrderKindComputed {
  if (!items.length) return "internal";
  const set = new Set(
    items.map((i) => (i.product_source_type === "dropi" ? "dropi" : "internal"))
  );
  if (set.size === 1) return set.has("dropi") ? "dropi" : "internal";
  return "mixed";
}

export function orderKindLabel(k: OrderKindComputed): string {
  if (k === "internal") return "Tradexpar";
  if (k === "dropi") return "Dropi";
  return "Mixto";
}

export function productTypeLabel(src: OrderLineItem["product_source_type"]): string {
  if (src === "dropi") return "Dropi";
  if (src === "fastrax") return "Fastrax";
  return "Tradexpar";
}

export function sourceLabel(src: OrderLineItem["product_source_type"]): string {
  if (src === "dropi") return "Dropi";
  if (src === "fastrax") return "Fastrax";
  return "Tradexpar";
}

export function isDropiLine(it: OrderLineItem): boolean {
  return it.product_source_type === "dropi" || it.external_provider === "dropi";
}

export function dropiLinkForLine(
  it: OrderLineItem,
  orderExternalUrl?: string | null
): string | null {
  if (it.external_url?.trim()) return it.external_url.trim();
  const base = import.meta.env.VITE_DROPI_ORDER_BASE_URL?.replace(/\/$/, "");
  if (base && it.external_order_id?.trim()) {
    return `${base}/${encodeURIComponent(it.external_order_id.trim())}`;
  }
  if (orderExternalUrl?.trim()) return orderExternalUrl.trim();
  return null;
}

/** Etiquetas en español para estados de pedido y de línea (UI). */
const STATUS_LABEL_ES: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  processing: "En proceso",
  waiting_supplier: "Esperando proveedor",
  shipped: "Enviado",
  delivered: "Entregado",
  cancelled: "Cancelado",
  completed: "Completado",
  failed: "Fallido",
  pending_supplier: "Pendiente proveedor",
  ordered_in_dropi: "Pedido en Dropi",
  confirmed_by_dropi: "Confirmado por Dropi",
  shipped_by_dropi: "Enviado por Dropi",
};

export function statusLabelEs(status: string): string {
  const k = status.toLowerCase().trim();
  if (STATUS_LABEL_ES[k]) return STATUS_LABEL_ES[k];
  return k
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const STATUS_RING: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/40",
  confirmed: "bg-sky-500/15 text-sky-800 dark:text-sky-200 border-sky-500/40",
  processing: "bg-blue-500/15 text-blue-800 dark:text-blue-200 border-blue-500/40",
  waiting_supplier: "bg-orange-500/15 text-orange-900 dark:text-orange-200 border-orange-500/40",
  shipped: "bg-violet-500/15 text-violet-800 dark:text-violet-200 border-violet-500/40",
  delivered: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/40",
  completed: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/40",
  cancelled: "bg-destructive/15 text-destructive border-destructive/40",
  failed: "bg-destructive/15 text-destructive border-destructive/40",
  pending_supplier: "bg-orange-500/15 text-orange-900 dark:text-orange-200 border-orange-500/40",
  ordered_in_dropi: "bg-cyan-500/15 text-cyan-900 dark:text-cyan-200 border-cyan-500/40",
  confirmed_by_dropi: "bg-teal-500/15 text-teal-900 dark:text-teal-200 border-teal-500/40",
  shipped_by_dropi: "bg-indigo-500/15 text-indigo-900 dark:text-indigo-200 border-indigo-500/40",
};

export function statusBadgeClass(status: string): string {
  const k = status.toLowerCase();
  return STATUS_RING[k] ?? "bg-muted text-muted-foreground border-border";
}

export function itemSummary(items: OrderLineItem[]): { lines: number; units: number } {
  const lines = items.length;
  const units = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  return { lines, units };
}

/** Clave estable para agrupar líneas equivalentes (mismo producto / precio / canal). */
export function orderLineGroupKey(it: OrderLineItem): string {
  const pid = (it.product_id || "").trim();
  const skuNorm = (it.sku || "").trim().toLowerCase() || "_";
  const idPart = pid || skuNorm;
  const price = Number(it.price) || 0;
  const src =
    it.product_source_type === "dropi" ? "dropi" : it.product_source_type === "fastrax" ? "fastrax" : "int";
  return `${idPart}|${skuNorm}|${price.toFixed(4)}|${src}`;
}

export type OrderLineDisplayGroup = {
  key: string;
  lines: OrderLineItem[];
};

/**
 * Agrupa líneas del pedido para el detalle admin: una fila por producto equivalente
 * (mismo product_id, SKU, precio unitario y origen), con cantidad y subtotal sumados.
 */
export function groupOrderLinesForDisplay(items: OrderLineItem[]): OrderLineDisplayGroup[] {
  const byKey = new Map<string, OrderLineItem[]>();
  for (const it of items) {
    const key = orderLineGroupKey(it);
    const arr = byKey.get(key);
    if (arr) arr.push(it);
    else byKey.set(key, [it]);
  }
  const out: OrderLineDisplayGroup[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const key = orderLineGroupKey(it);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, lines: byKey.get(key) ?? [it] });
  }
  return out;
}

/** Nombre sin sufijo " (1)", " (2)" que a veces vienen del checkout al repetir ítems. */
export function displayProductNameForGroup(lines: OrderLineItem[]): string {
  const raw = lines[0]?.product_name?.trim() || "—";
  const cleaned = raw.replace(/\s*\(\d+\)\s*$/i, "").trim();
  return cleaned || "—";
}

export function aggregateGroupQuantity(lines: OrderLineItem[]): number {
  return lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
}

export function aggregateGroupSubtotal(lines: OrderLineItem[]): number {
  return lines.reduce((s, l) => {
    const sub =
      l.line_subtotal != null ? Number(l.line_subtotal) : (Number(l.price) || 0) * (Number(l.quantity) || 0);
    return s + sub;
  }, 0);
}

/** Resumen fila principal: productos distintos (agrupados) y unidades totales. */
export function itemSummaryGrouped(items: OrderLineItem[]): { productGroups: number; units: number } {
  return {
    productGroups: groupOrderLinesForDisplay(items).length,
    units: items.reduce((s, i) => s + (Number(i.quantity) || 0), 0),
  };
}

/** Pedido cerrado a efectos de filtros ERP. */
export function isOrderClosed(status: string): boolean {
  const s = status.toLowerCase();
  return s === "completed" || s === "cancelled";
}

/** Línea lista para permitir «Finalizar pedido» (entregada, cancelada o flujo Dropi cerrado). */
export function isLineResolvedForFinalize(it: OrderLineItem): boolean {
  const s = (it.line_status || "pending").toLowerCase();
  if (isDropiLine(it)) {
    return ["delivered", "cancelled", "failed", "shipped_by_dropi", "confirmed_by_dropi"].includes(s);
  }
  return ["delivered", "cancelled"].includes(s);
}

export function canFinalizeOrderFromItems(items: OrderLineItem[]): boolean {
  if (!items.length) return false;
  return items.every(isLineResolvedForFinalize);
}

/** Aplica borrador de estados por id de línea sobre los ítems del pedido. */
export function applyLineStatusDraft(
  items: OrderLineItem[],
  draft: Record<string, string> | undefined
): OrderLineItem[] {
  if (!draft) return items;
  return items.map((it) => {
    if (!it.id || draft[it.id] === undefined) return it;
    return { ...it, line_status: draft[it.id] };
  });
}

export function hasLineDraftChanges(
  order: Order,
  draft: Record<string, string> | undefined
): boolean {
  if (!draft) return false;
  return order.items.some((it) => {
    if (!it.id) return false;
    const cur = it.line_status ?? "pending";
    return draft[it.id] !== cur;
  });
}
