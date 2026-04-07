import type { CartItem, Product } from "@/types";

/** Origen comercial del producto: solo Tradexpar o Dropi (sin “mixto”). */
export function normalizeProductSource(product: Product): "tradexpar" | "dropi" {
  return product.product_source_type === "dropi" ? "dropi" : "tradexpar";
}

/**
 * Tipo de pedido según el carrito: solo Tradexpar o solo Dropi.
 * Si el carrito mezcla orígenes, devuelve null (pedido no válido).
 */
export function deriveCheckoutTypeFromItems(items: CartItem[]): "tradexpar" | "dropi" | null {
  if (items.length === 0) return null;
  const sources = items.map((i) => normalizeProductSource(i.product));
  const first = sources[0];
  if (!sources.every((s) => s === first)) return null;
  return first;
}

function isDiscountWindowActive(product: Product, now = new Date()): boolean {
  if (!product.discount_type || !product.discount_value || product.discount_value <= 0) return false;
  const startsAt = product.discount_starts_at ? new Date(product.discount_starts_at) : null;
  const endsAt = product.discount_ends_at ? new Date(product.discount_ends_at) : null;
  if (startsAt && Number.isNaN(startsAt.getTime())) return false;
  if (endsAt && Number.isNaN(endsAt.getTime())) return false;
  if (startsAt && now < startsAt) return false;
  if (endsAt && now > endsAt) return false;
  return true;
}

export function getEffectivePrice(product: Product): number {
  const basePrice = Number(product.price) || 0;
  if (!isDiscountWindowActive(product)) return basePrice;

  const discountValue = Number(product.discount_value) || 0;
  const nextPrice =
    product.discount_type === "percentage"
      ? basePrice - (basePrice * discountValue) / 100
      : basePrice - discountValue;

  return Math.max(0, Math.round(nextPrice));
}

/**
 * Precio unitario con descuento al comprador por distribuidor digital independiente (% sobre el precio efectivo del catálogo),
 * alineado a cómo se calcula el subtotal en `order_items` al pagar con ref.
 */
export function getStoreLineUnitPrice(product: Product, affiliateBuyerDiscountPercent: number): number {
  if (!product || typeof product !== "object") return 0;
  const base = getEffectivePrice(product);
  const pct = Math.max(0, Math.min(100, Number(affiliateBuyerDiscountPercent) || 0));
  if (pct <= 0) return base;
  return Math.max(0, Math.round(base * (1 - pct / 100)));
}

export function getDiscountPercentage(product: Product): number {
  const basePrice = Number(product.price) || 0;
  if (basePrice <= 0 || !isDiscountWindowActive(product)) return 0;
  const effective = getEffectivePrice(product);
  if (effective >= basePrice) return 0;
  return Math.round(((basePrice - effective) / basePrice) * 100);
}

export function isNewProduct(product: Product): boolean {
  if (!product.created_at) return false;
  const created = new Date(product.created_at);
  if (Number.isNaN(created.getTime())) return false;
  const diffMs = Date.now() - created.getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return diffMs >= 0 && diffMs <= sevenDaysMs;
}

export function getStockLabel(product: Product): "En Stock" | "Agotado" {
  return (product.stock ?? 0) > 0 ? "En Stock" : "Agotado";
}

export function buildWhatsAppProductLink(product: Product): string {
  const number = import.meta.env.VITE_WHATSAPP_NUMBER || "595982487844";
  const price = getEffectivePrice(product).toLocaleString("es-PY");
  const baseUrl =
    import.meta.env.VITE_PUBLIC_SITE_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const productUrl = `${baseUrl}/products/${product.id}`;
  const text = [
    "Hola, me interesa este producto:",
    `- ${product.name}`,
    `- SKU: ${product.sku || "-"}`,
    `- Precio: ₲${price}`,
    "",
    productUrl,
  ]
    .filter(Boolean)
    .join("\n");
  return `https://wa.me/${number}?${new URLSearchParams({ text }).toString()}`;
}
