import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import type { CartItem, Product } from "@/types";
import { useCart } from "@/contexts/CartContext";
import { getActiveAffiliateRef } from "@/lib/affiliate";
import { getStoreLineUnitPrice } from "@/lib/productHelpers";
import { affiliatesAvailable, fetchStoreAffiliateBuyerDiscounts } from "@/services/affiliateTradexparService";

type DiscountMap = Record<string, number>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuidString(id: string): boolean {
  return UUID_RE.test(id.trim());
}

export interface AffiliateBuyerDiscountContextValue {
  discountPercentByProductId: DiscountMap;
  lineUnitPrice: (product: Product) => number;
  lineSubtotal: (product: Product, quantity: number) => number;
  cartTotal: (items: CartItem[]) => number;
  buyerPercentForProduct: (productId: string) => number;
  trackProductId: (id: string) => void;
  untrackProductId: (id: string) => void;
}

const AffiliateBuyerDiscountContext = createContext<AffiliateBuyerDiscountContextValue | null>(null);

export function AffiliateBuyerDiscountProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { items } = useCart();
  const [tracked, setTracked] = useState<Record<string, number>>({});
  const [discountMap, setDiscountMap] = useState<DiscountMap>({});

  const trackProductId = useCallback((id: string) => {
    setTracked((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  }, []);

  const untrackProductId = useCallback((id: string) => {
    setTracked((prev) => {
      const n = (prev[id] ?? 0) - 1;
      if (n <= 0) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: n };
    });
  }, []);

  const resolvedRef = useMemo(() => {
    const q = new URLSearchParams(location.search).get("ref");
    if (q?.trim()) return q.trim();
    return getActiveAffiliateRef();
  }, [location.search]);

  const mergedIdsKey = useMemo(() => {
    const s = new Set<string>();
    for (const i of items) {
      const id = i?.product?.id;
      if (typeof id === "string" && id.length > 0) s.add(id);
    }
    for (const id of Object.keys(tracked)) {
      if (id.length > 0) s.add(id);
    }
    return [...s].sort().join("|");
  }, [items, tracked]);

  useEffect(() => {
    if (!affiliatesAvailable() || !resolvedRef) {
      setDiscountMap({});
      return;
    }
    const ids = mergedIdsKey ? mergedIdsKey.split("|").filter((x) => x.length > 0 && isUuidString(x)) : [];
    if (ids.length === 0) {
      setDiscountMap({});
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void fetchStoreAffiliateBuyerDiscounts(resolvedRef, ids)
        .then((map) => {
          if (!cancelled) setDiscountMap(map);
        })
        .catch(() => {
          if (!cancelled) setDiscountMap({});
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [resolvedRef, mergedIdsKey]);

  const buyerPercentForProduct = useCallback(
    (productId: string) => discountMap[productId] ?? 0,
    [discountMap]
  );

  const lineUnitPrice = useCallback(
    (product: Product) => {
      const id = product?.id;
      const pct = typeof id === "string" ? (discountMap[id] ?? 0) : 0;
      return getStoreLineUnitPrice(product, pct);
    },
    [discountMap]
  );

  const lineSubtotal = useCallback(
    (product: Product, quantity: number) => lineUnitPrice(product) * Math.max(0, quantity),
    [lineUnitPrice]
  );

  const cartTotal = useCallback(
    (cartItems: CartItem[]) =>
      cartItems.reduce((sum, i) => {
        if (!i?.product?.id || i.quantity <= 0) return sum;
        return sum + lineUnitPrice(i.product) * i.quantity;
      }, 0),
    [lineUnitPrice]
  );

  const value = useMemo(
    () => ({
      discountPercentByProductId: discountMap,
      lineUnitPrice,
      lineSubtotal,
      cartTotal,
      buyerPercentForProduct,
      trackProductId,
      untrackProductId,
    }),
    [discountMap, lineUnitPrice, lineSubtotal, cartTotal, buyerPercentForProduct, trackProductId, untrackProductId]
  );

  return (
    <AffiliateBuyerDiscountContext.Provider value={value}>{children}</AffiliateBuyerDiscountContext.Provider>
  );
}

/** Sin lanzar: útil en fichas de catálogo si el árbol aún no envolvió el provider (caché/HMR). */
export function useAffiliateBuyerDiscountOptional(): AffiliateBuyerDiscountContextValue | null {
  return useContext(AffiliateBuyerDiscountContext);
}

export function useAffiliateBuyerDiscount() {
  const ctx = useAffiliateBuyerDiscountOptional();
  if (!ctx) throw new Error("useAffiliateBuyerDiscount must be used within AffiliateBuyerDiscountProvider");
  return ctx;
}

export function useTrackAffiliateBuyerProduct(productId: string | undefined) {
  const ctx = useContext(AffiliateBuyerDiscountContext);
  useEffect(() => {
    if (!ctx || !productId) return;
    ctx.trackProductId(productId);
    return () => ctx.untrackProductId(productId);
  }, [ctx, productId]);
}
