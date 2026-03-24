import { useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Trash2, Minus, Plus } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { motion } from "framer-motion";

interface CartDropdownProps {
  open: boolean;
  onClose: () => void;
}

export function CartDropdown({ open, onClose }: CartDropdownProps) {
  const { items, removeItem, updateQuantity, totalPrice, totalItems } = useCart();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15 }}
      className="absolute top-full right-0 mt-2 w-80 bg-card border rounded-2xl shadow-lg z-50 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <h3 className="text-sm font-semibold text-foreground">
          Mi carrito <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">{totalItems}</span>
        </h3>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
      </div>

      {/* Items */}
      <div className="max-h-64 overflow-y-auto divide-y">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Tu carrito está vacío</p>
        )}
        {items.map((item) => (
          <div key={item.product.id} className="flex items-center gap-3 px-4 py-3">
            <img
              src={item.product.images?.[0] || item.product.image}
              alt={item.product.name}
              className="w-12 h-12 rounded-lg object-contain bg-muted/20 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{item.product.name}</p>
              <p className="text-xs text-muted-foreground">
                ₲{item.product.price.toLocaleString("es-PY")} x {item.quantity}
              </p>
              {/* Quantity controls */}
              <div className="flex items-center gap-1 mt-1">
                <button
                  onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                  className="w-5 h-5 flex items-center justify-center rounded border text-muted-foreground hover:bg-muted/50 transition-colors"
                >
                  <Minus className="h-2.5 w-2.5" />
                </button>
                <span className="text-xs font-medium w-5 text-center">{item.quantity}</span>
                <button
                  onClick={() => updateQuantity(item.product.id, Math.min(item.product.stock ?? Infinity, item.quantity + 1))}
                  disabled={item.product.stock !== undefined && item.quantity >= item.product.stock}
                  className="w-5 h-5 flex items-center justify-center rounded border text-muted-foreground hover:bg-muted/50 transition-colors disabled:opacity-40"
                >
                  <Plus className="h-2.5 w-2.5" />
                </button>
              </div>
            </div>
            <button
              onClick={() => removeItem(item.product.id)}
              className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Footer */}
      {items.length > 0 && (
        <div className="border-t px-4 py-3 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal:</span>
            <span className="font-bold text-primary">${totalPrice.toLocaleString("es-PY")}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2.5 text-xs font-medium border rounded-xl text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center"
            >
              Seguir comprando
            </button>
            <Link
              to="/cart"
              onClick={onClose}
              className="px-3 py-2.5 text-xs font-medium text-center gradient-celeste text-primary-foreground rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center"
            >
              Finalizar compra
            </Link>
          </div>
        </div>
      )}
    </motion.div>
  );
}
