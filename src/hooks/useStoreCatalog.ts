import { useQuery } from "@tanstack/react-query";
import { tradexpar } from "@/services/tradexpar";
import { getDisplayProductName } from "@/lib/productHelpers";
import type { Product } from "@/types";

export const STORE_CATALOG_QUERY_KEY = ["store-catalog", "products"] as const;

/**
 * Nombres en versión legible para el cliente (ver `getDisplayProductName`).
 * Definido a nivel de módulo a propósito: react-query memoiza `select` por
 * referencia, y una flecha inline recrearía los productos en cada render
 * (invalidando el cache de búsqueda y los `useMemo` que dependen de ellos).
 */
function withDisplayNames(products: Product[]): Product[] {
  return products.map((p) => {
    const name = getDisplayProductName(p.name);
    return name === p.name ? p : { ...p, name };
  });
}

/**
 * Catálogo público compartido (navbar, inicio, catálogo, detalle, favoritos): una sola petición en caché.
 */
export function useStoreCatalog() {
  return useQuery({
    queryKey: STORE_CATALOG_QUERY_KEY,
    queryFn: () => tradexpar.getProducts(),
    select: withDisplayNames,
    staleTime: 2 * 60_000,
    gcTime: 20 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: (failureCount, err) => {
      if (failureCount >= 2) return false;
      const msg = err instanceof Error ? err.message : String(err);
      return /conexión|connection|fetch|network|timeout|502|503|504|agotado/i.test(msg);
    },
    retryDelay: (i) => Math.min(800 * 2 ** i, 4000),
  });
}
