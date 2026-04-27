import { useLayoutEffect, useRef, useState, useCallback, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Trash2, Minus, Plus } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useAffiliateBuyerDiscount } from "@/contexts/AffiliateBuyerDiscountContext";
import { resolveProductPrimaryImageSrc } from "@/lib/productImageUrl";

const PANEL_W = 320;
const GAP = 8;

interface CartDropdownProps {
  open: boolean;
  onClose: () => void;
  /** Botón del carrito visible (desktop o móvil) para alinear el panel. */
  anchorRef: RefObject<HTMLButtonElement | null>;
}

export function CartDropdown({ open, onClose, anchorRef }: CartDropdownProps) {
  const { items, removeItem, updateQuantity, totalItems } = useCart();
  const { lineUnitPrice, cartTotal } = useAffiliateBuyerDiscount();
  const totalPrice = cartTotal(items);
  const [pos, setPos] = useState({ top: 0, left: 0, width: PANEL_W });
  /** Ignora cierre por capa justo después de abrir (mismo gesto / doble evento / click fantasma táctil). */
  const ignoreBackdropCloseUntilRef = useRef(0);

  useLayoutEffect(() => {
    if (!open) return;
    ignoreBackdropCloseUntilRef.current = Date.now() + 500;
  }, [open]);

  const updatePosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const w = Math.min(PANEL_W, vw - 16);
    let left = r.right - w;
    left = Math.max(GAP, Math.min(left, vw - w - GAP));
    setPos({ top: r.bottom + GAP, left, width: w });
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, updatePosition]);

  useLayoutEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const tryCloseFromBackdrop = useCallback(() => {
    if (Date.now() < ignoreBackdropCloseUntilRef.current) return;
    onClose();
  }, [onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      {/*
        z-40 < header sticky z-50: el navbar sigue clickeable (toggle carrito).
        Solo mouseup/click en la capa cierran (evita que pointerdown del gesto de apertura cierre).
      */}
      <div
        className="fixed inset-0 z-40 bg-transparent"
        aria-hidden
        onClick={(e) => {
          e.stopPropagation();
          tryCloseFromBackdrop();
        }}
      />
      <div
        role="dialog"
        aria-label="Carrito de compras"
        className="fixed z-[100] max-h-[min(85dvh,32rem)] flex flex-col rounded-2xl border bg-card shadow-lg overflow-hidden"
        style={{ top: pos.top, left: pos.left, width: pos.width }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 shrink-0">
          <h3 className="text-sm font-semibold text-foreground">
            Mi carrito{" "}
            <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
              {totalItems}
            </span>
          </h3>
          <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>

        <div className="max-h-64 overflow-y-auto divide-y min-h-0">
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Tu carrito está vacío</p>
          )}
          {items.map((item) => {
            const thumb = resolveProductPrimaryImageSrc(item.product);
            return (
            <div key={item.product.id} className="flex items-center gap-3 px-4 py-3">
              {thumb ? (
                <img
                  src={thumb}
                  alt={item.product.name}
                  className="w-12 h-12 rounded-lg object-contain bg-muted/20 shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-muted/30 flex items-center justify-center shrink-0">
                  <span className="text-[8px] text-muted-foreground">[img]</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{item.product.name}</p>
                <p className="text-xs text-muted-foreground">
                  ₲{lineUnitPrice(item.product).toLocaleString("es-PY")} x {item.quantity}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                    className="w-5 h-5 flex items-center justify-center rounded border text-muted-foreground hover:bg-muted/50 transition-colors"
                  >
                    <Minus className="h-2.5 w-2.5" />
                  </button>
                  <span className="text-xs font-medium w-5 text-center">{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() =>
                      updateQuantity(item.product.id, Math.min(item.product.stock ?? Infinity, item.quantity + 1))
                    }
                    disabled={item.product.stock !== undefined && item.quantity >= item.product.stock}
                    className="w-5 h-5 flex items-center justify-center rounded border text-muted-foreground hover:bg-muted/50 transition-colors disabled:opacity-40"
                  >
                    <Plus className="h-2.5 w-2.5" />
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeItem(item.product.id)}
                className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            );
          })}
        </div>

        {items.length > 0 && (
          <div className="border-t px-4 py-3 space-y-3 shrink-0">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal:</span>
              <span className="font-bold text-primary">₲{totalPrice.toLocaleString("es-PY")}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
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
      </div>
    </>,
    document.body
  );
}
