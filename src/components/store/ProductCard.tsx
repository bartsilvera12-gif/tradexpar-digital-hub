import { Link } from "react-router-dom";
import type { Product } from "@/types";
import { ShoppingCart, Plus, Minus, Heart, MessageCircle } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { toastCartAdded } from "@/lib/cartToast";
import { useWishlist } from "@/contexts/WishlistContext";
import {
  useAffiliateBuyerDiscountOptional,
  useTrackAffiliateBuyerProduct,
} from "@/contexts/AffiliateBuyerDiscountContext";
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
  useTrackAffiliateBuyerProduct(product.id);
  const aff = useAffiliateBuyerDiscountOptional();
  const [showQty, setShowQty] = useState(false);
  const [qty, setQty] = useState(1);
  const discountPct = getDiscountPercentage(product);
  const effectivePrice = getEffectivePrice(product);
  const affiliateBuyerPct = aff ? aff.buyerPercentForProduct(product.id) : 0;
  const displayUnitPrice = aff ? aff.lineUnitPrice(product) : effectivePrice;

  const handleAddToCart = () => {
    if (addItem(product, qty)) {
      toastCartAdded(product.name, qty);
    }
    setShowQty(false);
    setQty(1);
  };

  const soldOut = product.stock !== undefined && product.stock <= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
      className="group relative bg-card rounded-xl overflow-hidden border hover:shadow-card-hover transition-shadow duration-300"
    >
      {/* Image area */}
      <Link to={`/products/${product.id}`} className="block relative">
        <div className="aspect-square bg-muted/20 flex items-center justify-center p-5 relative overflow-hidden">
          {/* Badges */}
          <div className="absolute top-2.5 left-0 z-10 flex flex-col gap-1.5">
            {discountPct > 0 && (
              <span className="px-2.5 py-0.5 text-[11px] rounded-r-md bg-destructive text-destructive-foreground font-bold">
                -{discountPct}%
              </span>
            )}
            {affiliateBuyerPct > 0 && (
              <span className="px-2.5 py-0.5 text-[11px] rounded-r-md bg-primary/90 text-primary-foreground font-bold">
                -{Math.round(affiliateBuyerPct)}% ref
              </span>
            )}
            {isNewProduct(product) && (
              <span className="px-2.5 py-0.5 text-[11px] rounded-r-md bg-primary text-primary-foreground font-bold uppercase">
                Nuevo
              </span>
            )}
          </div>

          {/* Wishlist */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void toggle(product.id);
            }}
            className={`absolute top-2.5 right-2.5 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
              has(product.id)
                ? "bg-primary/10 text-primary"
                : "bg-card/80 backdrop-blur text-muted-foreground opacity-0 group-hover:opacity-100"
            }`}
            aria-label="Agregar a favoritos"
          >
            <Heart className={`h-4 w-4 ${has(product.id) ? "fill-current" : ""}`} />
          </button>

          {(product.images?.[0] || product.image) ? (
            <img
              src={product.images?.[0] || product.image}
              alt={product.name}
              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
          ) : (
            <div className="text-sm text-muted-foreground font-medium text-center">Sin imagen</div>
          )}

          {soldOut && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
              <span className="text-foreground font-semibold text-sm px-4 py-1.5 rounded-full border">Agotado</span>
            </div>
          )}
        </div>
      </Link>

      {/* Info */}
      <div className="p-3.5 flex flex-col gap-1.5 min-h-[140px]">
        {product.category && (
          <p className="text-[11px] text-muted-foreground uppercase tracking-widest font-medium">{product.category}</p>
        )}
        <Link to={`/products/${product.id}`}>
          <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">
            {product.name}
          </h3>
        </Link>
        <span className={`text-[11px] font-medium ${product.stock > 0 ? "text-green-600" : "text-destructive"}`}>
          {getStockLabel(product)}
        </span>

        <div className="flex items-end justify-between mt-auto pt-1">
          <div className="flex flex-col">
            {discountPct > 0 && (
              <span className="text-[11px] text-muted-foreground line-through">
                ₲ {(Number(product.price) || 0).toLocaleString("es-PY")}
              </span>
            )}
            {affiliateBuyerPct > 0 && displayUnitPrice < effectivePrice && (
              <span className="text-[11px] text-muted-foreground line-through">
                ₲ {effectivePrice.toLocaleString("es-PY")}
              </span>
            )}
            <span className="text-lg font-bold text-foreground leading-none">
              ₲ {displayUnitPrice.toLocaleString("es-PY")}
            </span>
          </div>
          <div className="relative flex items-center gap-1.5">
            <a
              href={buildWhatsAppProductLink(product)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-8 h-8 rounded-full border text-muted-foreground flex items-center justify-center hover:text-primary hover:border-primary/30 transition-colors"
              aria-label="Consultar por WhatsApp"
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </a>
            <button
              onClick={() => setShowQty(!showQty)}
              disabled={soldOut}
              className="w-8 h-8 rounded-full gradient-celeste text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed shadow-brand"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
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
                      className="w-7 h-7 rounded-lg border flex items-center justify-center text-foreground hover:bg-muted transition-colors"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="flex-1 text-center text-sm font-semibold text-foreground">{qty}</span>
                    <button
                      onClick={() => setQty(Math.min((product.stock ?? Infinity), qty + 1))}
                      disabled={product.stock !== undefined && qty >= product.stock}
                      className="w-7 h-7 rounded-lg border flex items-center justify-center text-foreground hover:bg-muted transition-colors disabled:opacity-40"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <button
                    onClick={handleAddToCart}
                    className="w-full py-1.5 rounded-lg gradient-celeste text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
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
