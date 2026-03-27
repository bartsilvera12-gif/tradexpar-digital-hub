import { Link } from "react-router-dom";
import type { Product } from "@/types";
import { ShoppingCart, Plus, Minus, Heart, MessageCircle } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { toastCartAdded } from "@/lib/cartToast";
import { useWishlist } from "@/contexts/WishlistContext";
import {
  getEffectivePrice,
  getDiscountPercentage,
  isNewProduct,
  getStockLabel,
  buildWhatsAppProductLink,
} from "@/lib/productHelpers";

interface ProductCardProps {
  product: Product;
  index?: number;
}

export function ProductCard({ product, index = 0 }: ProductCardProps) {
  const { addItem } = useCart();
  const { has, toggle } = useWishlist();
  const [showQty, setShowQty] = useState(false);
  const [qty, setQty] = useState(1);
  const discountPct = getDiscountPercentage(product);
  const effectivePrice = getEffectivePrice(product);

  const handleAddToCart = () => {
    if (addItem(product, qty)) {
      toastCartAdded(product.name, qty);
    }
    setShowQty(false);
    setQty(1);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="group relative bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-brand transition-all duration-300 border"
    >
      <Link to={`/products/${product.id}`} className="block">
        <div className="aspect-square bg-muted/30 flex items-center justify-center p-6 relative overflow-hidden">
          <div className="absolute top-3 left-0 z-10 flex flex-col gap-2">
            {discountPct > 0 && (
              <span className="px-3 py-1 text-xs rounded-r-md bg-[#E97A00] text-white font-bold shadow-sm">
                -{discountPct}%
              </span>
            )}
            {isNewProduct(product) && (
              <span className="px-3 py-1 text-xs rounded-r-md bg-[#E4002B] text-white font-bold shadow-sm uppercase">
                Nuevo!
              </span>
            )}
          </div>

          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void toggle(product.id);
            }}
            className={`absolute top-3 right-3 z-10 w-9 h-9 rounded-full border bg-card/90 backdrop-blur flex items-center justify-center transition-colors ${
              has(product.id)
                ? "text-primary border-primary/30 bg-primary/5"
                : "text-muted-foreground border-border hover:text-primary hover:bg-muted/40"
            }`}
            aria-label="Agregar a favoritos"
          >
            <Heart className={`h-4 w-4 ${has(product.id) ? "fill-current" : ""}`} />
          </button>

          {(product.images?.[0] || product.image) ? (
            <img src={product.images?.[0] || product.image} alt={product.name} className="w-full h-full object-contain" loading="lazy" />
          ) : (
            <div className="text-sm text-muted-foreground font-medium text-center">Sin imagen</div>
          )}
          {product.stock !== undefined && product.stock <= 0 && (
            <div className="absolute inset-0 bg-secondary/70 flex items-center justify-center">
              <span className="text-secondary-foreground font-semibold text-sm">Agotado</span>
            </div>
          )}
        </div>
      </Link>

      <div className="p-4 flex flex-col min-h-[170px]">
        {product.category && (
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">{product.category}</p>
        )}
        <Link to={`/products/${product.id}`}>
          <h3 className="font-semibold text-foreground line-clamp-2 min-h-[3rem] group-hover:text-primary transition-colors">{product.name}</h3>
        </Link>
        <div className="text-xs font-medium mt-2">
          <span className={product.stock > 0 ? "text-green-600" : "text-destructive"}>
            {getStockLabel(product)}
          </span>
        </div>
        <div className="flex items-end justify-between pt-2 mt-auto">
          <div className="flex flex-col">
            {discountPct > 0 && (
              <span className="text-xs text-muted-foreground line-through">
                Gs {(Number(product.price) || 0).toLocaleString("es-PY")}
              </span>
            )}
            <span className="text-2xl leading-none font-bold text-foreground whitespace-nowrap">
              Gs {effectivePrice.toLocaleString("es-PY")}
            </span>
          </div>
          <div className="relative flex items-center gap-2">
            <a
              href={buildWhatsAppProductLink(product)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-9 h-9 rounded-full border text-foreground flex items-center justify-center hover:bg-muted/40 transition-colors"
              aria-label="Consultar por WhatsApp"
            >
              <MessageCircle className="h-4 w-4" />
            </a>
            <button
              onClick={() => setShowQty(!showQty)}
              disabled={product.stock !== undefined && product.stock <= 0}
              className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ShoppingCart className="h-4 w-4" />
            </button>

            <AnimatePresence>
              {showQty && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full right-0 mb-2 bg-card border rounded-xl shadow-lg p-3 z-20 w-40"
                >
                  <p className="text-xs text-muted-foreground mb-2">Cantidad</p>
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={() => setQty(Math.max(1, qty - 1))}
                      className="w-7 h-7 rounded-lg border flex items-center justify-center text-foreground hover:bg-muted/50 transition-colors"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="flex-1 text-center text-sm font-semibold text-foreground">{qty}</span>
                    <button
                      onClick={() => setQty(Math.min((product.stock ?? Infinity), qty + 1))}
                      disabled={product.stock !== undefined && qty >= product.stock}
                      className="w-7 h-7 rounded-lg border flex items-center justify-center text-foreground hover:bg-muted/50 transition-colors disabled:opacity-40"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <button
                    onClick={handleAddToCart}
                    className="w-full py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
                  >
                    Añadir al carrito
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
