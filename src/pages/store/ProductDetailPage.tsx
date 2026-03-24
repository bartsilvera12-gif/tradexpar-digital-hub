import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, ShoppingCart, Minus, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/services/api";
import { useCart } from "@/contexts/CartContext";
import { Loader, ErrorState } from "@/components/shared/Loader";
import type { Product } from "@/types";

function getProductImages(product: Product): string[] {
  if (product.images && product.images.length > 0) return product.images;
  if (product.image) return [product.image];
  return [];
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [activeImg, setActiveImg] = useState(0);
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

  const images = getProductImages(product);

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
        {/* Image Gallery */}
        <div className="space-y-3">
          <div className="relative aspect-square bg-muted/30 rounded-3xl flex items-center justify-center border overflow-hidden">
            {images.length > 0 ? (
              <>
                <AnimatePresence mode="wait">
                  <motion.img
                    key={activeImg}
                    src={images[activeImg]}
                    alt={`${product.name} - imagen ${activeImg + 1}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="w-full h-full object-contain p-4"
                  />
                </AnimatePresence>
                {images.length > 1 && (
                  <>
                    <button
                      onClick={() => setActiveImg((prev) => (prev - 1 + images.length) % images.length)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-background/80 border flex items-center justify-center hover:bg-background transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setActiveImg((prev) => (prev + 1) % images.length)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-background/80 border flex items-center justify-center hover:bg-background transition-colors"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </>
                )}
              </>
            ) : (
              <span className="text-muted-foreground text-sm">Sin imagen</span>
            )}
          </div>

          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImg(i)}
                  className={`shrink-0 w-16 h-16 rounded-xl border-2 overflow-hidden transition-all ${
                    i === activeImg ? "border-primary ring-2 ring-primary/20" : "border-transparent opacity-60 hover:opacity-100"
                  }`}
                >
                  <img src={img} alt={`Miniatura ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
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
