import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { tradexpar } from "@/services/tradexpar";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";

interface WishlistContextType {
  productIds: string[];
  count: number;
  has: (productId: string) => boolean;
  toggle: (productId: string) => Promise<void>;
  syncing: boolean;
}

const LOCAL_KEY = "tradexpar_guest_wishlist";
const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const { user } = useCustomerAuth();
  const [productIds, setProductIds] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!user) {
      const local = localStorage.getItem(LOCAL_KEY);
      try {
        setProductIds(local ? (JSON.parse(local) as string[]) : []);
      } catch {
        setProductIds([]);
        localStorage.removeItem(LOCAL_KEY);
      }
      return;
    }
    setSyncing(true);
    tradexpar.getWishlist(user.id)
      .then((res) => {
        const dbIds = (res.items ?? []).map((i) => i.product_id);
        const local = localStorage.getItem(LOCAL_KEY);
        let localIds: string[] = [];
        try {
          localIds = local ? (JSON.parse(local) as string[]) : [];
        } catch {
          localStorage.removeItem(LOCAL_KEY);
        }
        const merged = Array.from(new Set([...dbIds, ...localIds]));
        setProductIds(merged);
        return Promise.all(
          localIds.filter((id) => !dbIds.includes(id)).map((id) => tradexpar.addWishlistItem(user.id, id))
        );
      })
      .catch(() => {
        try {
          const local = localStorage.getItem(LOCAL_KEY);
          setProductIds(local ? (JSON.parse(local) as string[]) : []);
        } catch {
          setProductIds([]);
        }
      })
      .finally(() => {
        localStorage.removeItem(LOCAL_KEY);
        setSyncing(false);
      });
  }, [user]);

  const persistGuest = (ids: string[]) => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(ids));
    setProductIds(ids);
  };

  const toggle = async (productId: string) => {
    const exists = productIds.includes(productId);
    const next = exists ? productIds.filter((id) => id !== productId) : [...productIds, productId];

    if (!user) {
      persistGuest(next);
      return;
    }

    setProductIds(next);
    if (exists) {
      await tradexpar.removeWishlistItem(user.id, productId);
    } else {
      await tradexpar.addWishlistItem(user.id, productId);
    }
  };

  const has = (productId: string) => productIds.includes(productId);
  const value = useMemo(
    () => ({ productIds, count: productIds.length, has, toggle, syncing }),
    [productIds, syncing]
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used within WishlistProvider");
  return ctx;
}
