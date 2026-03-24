import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, ShoppingCart, Minus, Plus } from "lucide-react";
import { motion } from "framer-motion";
import { api } from "@/services/api";
import { useCart } from "@/contexts/CartContext";
import { Loader, ErrorState } from "@/components/shared/Loader";
import type { Product } from "@/types";

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const { addItem } = useCart();

  const fetchProduct = () => {
    setLoading(true);
    setError(null);
    api.getProducts()
      .then((data) => {
        const found = data.find((p) => String(p.id) === id);
        if (found) setProduct(found);
        else setError("Producto no encontrado");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchProduct(); }, [id]);

  if (loading) return <div className="container mx-auto px-4 py-10"><Loader /></div>;
  if (error || !product) return <div className="container mx-auto px-4 py-10"><ErrorState message={error || "Producto no encontrado"} onRetry={fetchProduct} /></div>;

  return (
    <div className="container mx-auto px-4 py-10">
      <Link to="/products" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-8">
        <ArrowLeft className="h-4 w-4" /> Volver al catálogo
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-12"
      >
        {/* Image */}
        <div className="aspect-square bg-muted/30 rounded-3xl flex items-center justify-center border overflow-hidden">
          {product.image ? (
            <img src={product.image} alt={product.name} className="w-full h-full object-contain p-4" />
          ) : (
            <span className="text-muted-foreground text-sm">Sin imagen</span>
          )}
        </div>

        {/* Details */}
        <div className="flex flex-col justify-center">
          <p className="text-xs uppercase tracking-wider text-primary font-semibold mb-2">{product.category}</p>
          <h1 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">{product.name}</h1>
          <p className="text-muted-foreground mb-6 leading-relaxed">{product.description}</p>

          <div className="flex items-center gap-3 mb-2 text-sm text-muted-foreground">
            <span>SKU: {product.sku}</span>
            <span>•</span>
            <span className={product.stock > 0 ? "text-green-600" : "text-destructive"}>
              {product.stock > 0 ? `${product.stock} en stock` : "Agotado"}
            </span>
          </div>

          <p className="text-4xl font-bold text-foreground mb-8">
            ${product.price.toLocaleString("es-PY")}
          </p>

          <div className="flex items-center gap-4">
            <div className="flex items-center border rounded-xl overflow-hidden">
              <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-10 h-10 flex items-center justify-center hover:bg-muted/50 transition-colors">
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-12 text-center font-medium text-sm">{qty}</span>
              <button onClick={() => setQty(qty + 1)} className="w-10 h-10 flex items-center justify-center hover:bg-muted/50 transition-colors">
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <button
              onClick={() => { addItem(product, qty); }}
              disabled={product.stock <= 0}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 gradient-celeste text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ShoppingCart className="h-5 w-5" />
              Agregar al carrito
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
