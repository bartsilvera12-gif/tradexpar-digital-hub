import { Link } from "react-router-dom";
import type { Product } from "@/types";
import { ShoppingCart, Plus, Minus } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

interface ProductCardProps {
  product: Product;
  index?: number;
}

export function ProductCard({ product, index = 0 }: ProductCardProps) {
  const { addItem } = useCart();
  const [showQty, setShowQty] = useState(false);
  const [qty, setQty] = useState(1);

  const handleAddToCart = () => {
    addItem(product, qty);
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

      <div className="p-4 space-y-2">
        {product.category && (
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{product.category}</p>
        )}
        <Link to={`/products/${product.id}`}>
          <h3 className="font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors">{product.name}</h3>
        </Link>
        <div className="flex items-center justify-between pt-2">
          <span className="text-lg font-bold text-foreground">
            ₲{typeof product.price === "number" ? product.price.toLocaleString("es-PY") : product.price}
          </span>
          <div className="relative">
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
                      onClick={() => setQty(qty + 1)}
                      className="w-7 h-7 rounded-lg border flex items-center justify-center text-foreground hover:bg-muted/50 transition-colors"
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
