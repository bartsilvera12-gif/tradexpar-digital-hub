import { useMemo, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { STORE_CATALOG_QUERY_KEY } from "@/hooks/useStoreCatalog";

/**
 * StoreLayout monta StoreNavbar (React Query). Precarga catálogo vacío para no pegarle a la red en tests.
 */
export function StoreTestQueryProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Infinity,
        },
      },
    });
    qc.setQueryData(STORE_CATALOG_QUERY_KEY, []);
    return qc;
  }, []);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
