import React, { createContext, useContext, useState, useCallback } from "react";
import type { Product, CartItem } from "@/types";
import { getEffectivePrice } from "@/lib/productHelpers";

interface CartContextType {
  items: CartItem[];
  /** Devuelve `true` si se agregó o actualizó cantidad. */
  addItem: (product: Product, quantity?: number) => boolean;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_LS_KEY = "tradexpar_cart";

function cartStorageGet(): string | null {
  try {
    return localStorage.getItem(CART_LS_KEY);
  } catch {
    return null;
  }
}

function cartStorageSet(raw: string): void {
  try {
    localStorage.setItem(CART_LS_KEY, raw);
  } catch {
    /* cuota llena o storage bloqueado */
  }
}

function cartStorageRemove(): void {
  try {
    localStorage.removeItem(CART_LS_KEY);
  } catch {
    /* ignore */
  }
}

function parseStoredCart(raw: string | null): CartItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      cartStorageRemove();
      return [];
    }
    const valid = parsed.filter(
      (entry): entry is CartItem =>
        entry != null &&
        typeof entry === "object" &&
        typeof (entry as CartItem).quantity === "number" &&
        (entry as CartItem).quantity > 0 &&
        typeof (entry as CartItem).product === "object" &&
        (entry as CartItem).product != null &&
        typeof (entry as CartItem).product.id === "string"
    );
    if (valid.length !== parsed.length) {
      cartStorageSet(JSON.stringify(valid));
    }
    return valid;
  } catch {
    cartStorageRemove();
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => parseStoredCart(cartStorageGet()));

  const persist = (next: CartItem[]) => {
    setItems(next);
    cartStorageSet(JSON.stringify(next));
  };

  const addItem = useCallback((product: Product, quantity = 1): boolean => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        const next = prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + quantity } : i
        );
        cartStorageSet(JSON.stringify(next));
        return next;
      }
      const next = [...prev, { product, quantity }];
      cartStorageSet(JSON.stringify(next));
      return next;
    });
    return true;
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.product.id !== productId);
      cartStorageSet(JSON.stringify(next));
      return next;
    });
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => {
        const next = prev.filter((i) => i.product.id !== productId);
        cartStorageSet(JSON.stringify(next));
        return next;
      });
      return;
    }
    setItems((prev) =>
      {
        const next = prev.map((i) => (i.product.id === productId ? { ...i, quantity } : i));
        cartStorageSet(JSON.stringify(next));
        return next;
      }
    );
  }, []);

  const clearCart = useCallback(() => persist([]), []);

  const totalItems = items.reduce((sum, i) => sum + (i?.product && i.quantity > 0 ? i.quantity : 0), 0);
  const totalPrice = items.reduce(
    (sum, i) => sum + (i?.product ? getEffectivePrice(i.product) * i.quantity : 0),
    0
  );

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, totalItems, totalPrice }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
