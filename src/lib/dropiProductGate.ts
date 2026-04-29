import type { CartItem, Product } from "@/types";

/** Misma variable que en servidor: solo en "true" se oculta catálogo y se bloquea checkout. */
export function isDropiValidationEnforced(): boolean {
  return String(import.meta.env.VITE_DROPI_ENFORCE_PRODUCT_VALIDATION ?? "")
    .trim()
    .toLowerCase() === "true";
}

/** Producto Dropi no vendible (validación backend). */
export function isDropiProductBlocked(product: Product): boolean {
  if (!isDropiValidationEnforced()) return false;
  if (product.product_source_type !== "dropi") return false;
  return product.dropi_sellable === false;
}

/** Catálogo tienda: excluye Dropi marcados no vendibles. */
export function filterStorefrontCatalog(products: Product[]): Product[] {
  if (!isDropiValidationEnforced()) return products;
  return products.filter((p) => !isDropiProductBlocked(p));
}

/** Mismo texto en checkout, carrito y toasts. */
export const DROPI_CHECKOUT_BLOCK_MESSAGE =
  "Este producto no está disponible para envío en este momento. Por favor retiralo del carrito.";

/** Lanza si el carrito tiene Dropi no vendibles. */
export function assertCheckoutDropiSellable(items: CartItem[]): void {
  if (!isDropiValidationEnforced()) return;
  const bad = items.filter((i) => isDropiProductBlocked(i.product));
  if (bad.length > 0) {
    throw new Error(DROPI_CHECKOUT_BLOCK_MESSAGE);
  }
}
