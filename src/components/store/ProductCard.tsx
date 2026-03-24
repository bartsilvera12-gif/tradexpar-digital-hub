import { Link } from "react-router-dom";
import type { Product } from "@/types";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { motion } from "framer-motion";

interface ProductCardProps {
  product: Product;
  index?: number;
}

export function ProductCard({ product, index = 0 }: ProductCardProps) {
  const { addItem } = useCart();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="group relative bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-brand transition-all duration-300 border"
    >
      <Link to={`/products/${product.id}`} className="block">
        <div className="aspect-square bg-muted/30 flex items-center justify-center p-6 relative overflow-hidden">
          {product.image ? (
            <img src={product.image} alt={product.name} className="w-full h-full object-contain" loading="lazy" />
          ) : (
            <div className="text-sm text-muted-foreground font-medium text-center">
              Sin imagen
            </div>
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
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
            {product.category}
          </p>
        )}
        <Link to={`/products/${product.id}`}>
          <h3 className="font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors">
            {product.name}
          </h3>
        </Link>
        <div className="flex items-center justify-between pt-2">
          <span className="text-lg font-bold text-foreground">
            ${typeof product.price === "number" ? product.price.toLocaleString("es-PY") : product.price}
          </span>
          <button
            onClick={() => addItem(product)}
            disabled={product.stock !== undefined && product.stock <= 0}
            className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ShoppingCart className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
