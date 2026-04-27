/**
 * Produción: si el build no define `VITE_API_BASE_URL`, las rutas cache Fastrax seguirían
 * resolviendo contra el host del storefront (imagen rota). Mismo origen que el API Node.
 */
const DEFAULT_PAYMENTS_PUBLIC_BASE = "https://payments.neura.com.py";

function isFastraxLocalImagePath(pathLike: string): boolean {
  const p = pathLike.replace(/^\/+/, "").toLowerCase();
  return p.startsWith("fastrax-products/");
}

/**
 * Rutas relativas del API de pagos (p. ej. `/fastrax-products/185.jpg`) se anteponen
 * `VITE_API_BASE_URL` o, para `/fastrax-products/…`, el host público del servicio de pagos.
 * URLs absolutas (`http(s)`, `data:`, `blob:`) no se modifican.
 */
export function resolveProductImageSrc(raw: string | null | undefined): string {
  const u = (raw ?? "").trim();
  if (!u) return "";
  if (/^(https?:|data:|blob:)/i.test(u) || u.startsWith("//")) return u;
  let base = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!base && isFastraxLocalImagePath(u)) {
    base = DEFAULT_PAYMENTS_PUBLIC_BASE;
  }
  if (!base) return u;
  const path = u.startsWith("/") ? u : `/${u}`;
  return `${base}${path}`;
}

/** Primera imagen del producto ya resuelta para `src`. */
export function resolveProductPrimaryImageSrc(product: {
  image?: string | null;
  images?: string[] | null;
}): string {
  const fromArr = product.images?.find((x) => typeof x === "string" && x.trim());
  const raw = (fromArr && fromArr.trim()) || (product.image && product.image.trim()) || "";
  return resolveProductImageSrc(raw);
}
