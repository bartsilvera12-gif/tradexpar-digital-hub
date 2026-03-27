import React, { createContext, useContext, useState, useCallback } from "react";
import type { Product, CartItem } from "@/types";
import { getEffectivePrice, normalizeProductSource } from "@/lib/productHelpers";
import { toastCartSourceConflict } from "@/lib/cartToast";

interface CartContextType {
  items: CartItem[];
  /** Devuelve `true` si se agregó o actualizó cantidad; `false` si se rechazó por mezclar orígenes. */
  addItem: (product: Product, quantity?: number) => boolean;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

function parseStoredCart(raw: string | null): CartItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      localStorage.removeItem("tradexpar_cart");
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
      localStorage.setItem("tradexpar_cart", JSON.stringify(valid));
    }
    return valid;
  } catch {
    localStorage.removeItem("tradexpar_cart");
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => parseStoredCart(localStorage.getItem("tradexpar_cart")));

  const persist = (next: CartItem[]) => {
    setItems(next);
    localStorage.setItem("tradexpar_cart", JSON.stringify(next));
  };

  const addItem = useCallback((product: Product, quantity = 1): boolean => {
    let rejected = false;
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        const next = prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + quantity } : i
        );
        localStorage.setItem("tradexpar_cart", JSON.stringify(next));
        return next;
      }
      if (prev.length > 0) {
        const cartSource = normalizeProductSource(prev[0].product);
        const newSource = normalizeProductSource(product);
        if (cartSource !== newSource) {
          rejected = true;
          return prev;
        }
      }
      const next = [...prev, { product, quantity }];
      localStorage.setItem("tradexpar_cart", JSON.stringify(next));
      return next;
    });
    if (rejected) {
      toastCartSourceConflict();
      return false;
    }
    return true;
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.product.id !== productId);
      localStorage.setItem("tradexpar_cart", JSON.stringify(next));
      return next;
    });
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => {
        const next = prev.filter((i) => i.product.id !== productId);
        localStorage.setItem("tradexpar_cart", JSON.stringify(next));
        return next;
      });
      return;
    }
    setItems((prev) =>
      {
        const next = prev.map((i) => (i.product.id === productId ? { ...i, quantity } : i));
        localStorage.setItem("tradexpar_cart", JSON.stringify(next));
        return next;
      }
    );
  }, []);

  const clearCart = useCallback(() => persist([]), []);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalPrice = items.reduce((sum, i) => sum + getEffectivePrice(i.product) * i.quantity, 0);

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
