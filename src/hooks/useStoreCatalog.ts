import { useQuery } from "@tanstack/react-query";
import { tradexpar } from "@/services/tradexpar";

export const STORE_CATALOG_QUERY_KEY = ["store-catalog", "products"] as const;

/**
 * Catálogo público compartido (navbar, inicio, catálogo, detalle, favoritos): una sola petición en caché.
 */
export function useStoreCatalog() {
  return useQuery({
    queryKey: STORE_CATALOG_QUERY_KEY,
    queryFn: () => tradexpar.getStoreCatalog(),
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
