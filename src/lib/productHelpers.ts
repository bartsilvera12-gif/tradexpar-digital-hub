import { getWhatsAppDigits } from "@/config/whatsapp";
import type { CartItem, Product } from "@/types";

/**
 * Fastrax a veces deja el código del árbol de categorías (p. ej. "41,42", "102,106")
 * como `category` en vez del nombre. Eso no debe aparecer nunca en el menú de la tienda.
 */
const CATEGORY_CODE_RE = /^\d+(?:[.,\s]+\d+)*$/;

/** Valores basura que a veces llegan como categoría (booleanos/nulos serializados). */
const CATEGORY_JUNK = new Set(["false", "true", "null", "undefined", "nan", "none", "n/a", "-"]);

/** True si la categoría es un nombre mostrable (no vacío, no un código numérico de Fastrax ni un valor basura). */
export function isDisplayableCategory(category: string | null | undefined): boolean {
  const c = String(category ?? "").trim();
  if (!c) return false;
  if (CATEGORY_JUNK.has(c.toLowerCase())) return false;
  return !CATEGORY_CODE_RE.test(c.replace(/\s+/g, ""));
}

/**
 * Fastrax abrevia "auricular" como "AURI" al inicio del nombre ("AURI EARPHONE …",
 * "AURI HEADSET …"). Eso se lee como código de proveedor, no como producto, así que
 * en la tienda lo expandimos. Solo palabra completa: "AURICULAR GAMER" no se toca.
 *
 * Es una transformación de PRESENTACIÓN: se aplica en `useStoreCatalog`, no en
 * `mapProduct`, porque el admin edita y vuelve a guardar `product.name` y escribiría
 * el nombre expandido en la base (que además Fastrax pisa en la siguiente sync).
 */
const AURI_ABBREV_RE = /\bauri\b/gi;

function expandAuriCase(match: string): string {
  if (match === match.toLowerCase()) return "auricular";
  if (match === match.toUpperCase()) return "AURICULAR";
  return "Auricular";
}

/**
 * Arregla "mojibake" (mala codificación) que trae Fastrax en algunos nombres.
 * En estos nombres (casi todo en mayúsculas) la Ñ llega como "¥" o "¤"
 * ("A¥O"/"ESTA¤O" → "AÑO"/"ESTAÑO") y el grado ° como "§" ("180§" → "180°").
 * Solo de presentación; no toca lo guardado en la base.
 */
const ENCODING_FIXES: Array<[RegExp, string]> = [
  [/[¥¤]/g, "Ñ"],
  [/§/g, "°"],
];
function fixEncoding(s: string): string {
  return ENCODING_FIXES.reduce((acc, [re, to]) => acc.replace(re, to), s);
}

/**
 * Algunos nombres llegaron URL-encodeados a la base ("A+B+C", "%2F" por "/").
 * Los detectamos (tienen %XX, o "+" sin ningún espacio real) y los decodificamos.
 */
function maybeUrlDecode(s: string): string {
  const looksEncoded = /%[0-9A-Fa-f]{2}/.test(s) || (s.includes("+") && !s.includes(" "));
  if (!looksEncoded) return s;
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s.replace(/\+/g, " ");
  }
}

/**
 * Quita "ruido" de Fastrax de los nombres (solo presentación):
 *  - código interno: número de 6 dígitos SUELTO (entre espacios o bordes). No
 *    toca modelos alfanuméricos ("ST4000VX016") ni referencias en paréntesis o
 *    con guion ("(143142)", "71-(115043)"), que SÍ identifican al producto.
 *  - leyenda "N AÑO(S) GARANTIA".
 *  - paréntesis que hubieran quedado vacíos.
 */
function stripFastraxNoise(s: string): string {
  return s
    .replace(/(^|\s)\d{6}(?=\s|$)/g, "$1")
    .replace(/\s*\b\d+\s*AÑOS?\s+GARANTIA\b/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,/])/g, "$1")
    .trim();
}

/** Nombre del producto tal como se muestra al cliente en la tienda. */
export function getDisplayProductName(name: string | null | undefined): string {
  const decoded = maybeUrlDecode(String(name ?? ""));
  const fixed = fixEncoding(decoded).replace(AURI_ABBREV_RE, expandAuriCase);
  return stripFastraxNoise(fixed);
}

/**
 * True si el nombre es un "placeholder" (p. ej. "Producto 13666"): productos que
 * se importaron con solo el SKU y nunca recibieron un nombre real. Se usan para
 * ocultarlos de la tienda pública (en el admin siguen visibles para corregirlos).
 */
export function isPlaceholderProductName(name: string | null | undefined): boolean {
  return /^\s*producto\s+\d+\s*$/i.test(String(name ?? ""));
}

/**
 * Canal de checkout: Dropi aparte; Tradexpar y Fastrax comparten el mismo flujo local (sin pedido en Fastrax).
 */
export function normalizeProductSource(product: Product): "tradexpar" | "dropi" {
  return product.product_source_type === "dropi" ? "dropi" : "tradexpar";
}

/**
 * Tipo de pedido según el carrito: un solo origen o `mixed` si hay Tradexpar y Dropi juntos.
 */
export function deriveCheckoutTypeFromItems(
  items: CartItem[]
): "tradexpar" | "dropi" | "mixed" | null {
  if (items.length === 0) return null;
  const sources = items.map((i) => normalizeProductSource(i.product));
  const unique = new Set(sources);
  if (unique.size === 1) return sources[0]!;
  return "mixed";
}

/** True si el carrito incluye al menos un ítem que requiere cobertura de entrega extendida (checkout filtra ciudades). */
export function cartHasDropiItems(items: CartItem[]): boolean {
  return items.some(
    (i) =>
      i.product?.product_source_type === "dropi" ||
      String(i.product?.external_provider ?? "").trim().toLowerCase() === "dropi"
  );
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
  const number = getWhatsAppDigits();
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
