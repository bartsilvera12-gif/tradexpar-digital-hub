import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, ShoppingCart, Minus, Plus, ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { tradexpar } from "@/services/tradexpar";
import { useCart } from "@/contexts/CartContext";
import { Loader, ErrorState } from "@/components/shared/Loader";
import type { Product } from "@/types";
import { toastCartAdded } from "@/lib/cartToast";
import { useAffiliateBuyerDiscount, useTrackAffiliateBuyerProduct } from "@/contexts/AffiliateBuyerDiscountContext";
import {
  getDiscountPercentage,
  getEffectivePrice,
  getStockLabel,
  buildWhatsAppProductLink,
  isNewProduct,
} from "@/lib/productHelpers";

function getProductImages(product: Product): string[] {
  if (product.images && product.images.length > 0) return product.images;
  if (product.image) return [product.image];
  return [];
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  useTrackAffiliateBuyerProduct(id);
  const aff = useAffiliateBuyerDiscount();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [activeImg, setActiveImg] = useState(0);
  const { addItem } = useCart();

  // Zoom lens state (nissei-style: lens on image + zoomed panel to the right)
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const [zooming, setZooming] = useState(false);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
  const [lensPos, setLensPos] = useState({ left: 0, top: 0 });

  const LENS_SIZE = 150; // px
  const ZOOM_FACTOR = 2.5;

  const fetchProduct = () => {
    setLoading(true);
    setError(null);
    tradexpar.getProducts()
      .then((data) => {
        const found = data.find((p) => String(p.id) === id);
        if (found) setProduct(found);
        else setError("Producto no encontrado");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchProduct(); }, [id]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imgContainerRef.current) return;
    const rect = imgContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPos({ x, y });

    // Position the lens centered on cursor, clamped inside the container
    const lensHalf = LENS_SIZE / 2;
    const left = Math.max(0, Math.min(e.clientX - rect.left - lensHalf, rect.width - LENS_SIZE));
    const top = Math.max(0, Math.min(e.clientY - rect.top - lensHalf, rect.height - LENS_SIZE));
    setLensPos({ left, top });
  };

  if (loading) return <div className="container mx-auto px-4 py-10"><Loader /></div>;
  if (error || !product) return <div className="container mx-auto px-4 py-10"><ErrorState message={error || "Producto no encontrado"} onRetry={fetchProduct} /></div>;

  const images = getProductImages(product);
  const maxQty = product.stock > 0 ? product.stock : 1;
  const discountPct = getDiscountPercentage(product);
  const effectivePrice = getEffectivePrice(product);
  const affiliateBuyerPct = aff.buyerPercentForProduct(product.id);
  const displayUnitPrice = aff.lineUnitPrice(product);

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
          <div className="relative flex gap-4">
            {/* Main image container */}
            <div
              ref={imgContainerRef}
              onMouseEnter={() => setZooming(true)}
              onMouseLeave={() => setZooming(false)}
              onMouseMove={handleMouseMove}
              className="relative aspect-square rounded-3xl flex items-center justify-center border overflow-hidden cursor-crosshair flex-1"
              style={{
                background: "linear-gradient(145deg, hsl(var(--muted) / 0.4), hsl(var(--muted) / 0.15))",
              }}
            >
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
                      className="w-full h-full object-contain p-6"
                      draggable={false}
                    />
                  </AnimatePresence>

                  {/* Lens overlay */}
                  {zooming && (
                    <div
                      className="absolute border-2 border-primary/40 bg-primary/5 pointer-events-none z-20 rounded-sm"
                      style={{
                        width: LENS_SIZE,
                        height: LENS_SIZE,
                        left: lensPos.left,
                        top: lensPos.top,
                      }}
                    />
                  )}

                  {images.length > 1 && (
                    <>
                      <button
                        onClick={() => setActiveImg((prev) => (prev - 1 + images.length) % images.length)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-background/90 border shadow-md flex items-center justify-center hover:bg-background transition-colors z-10"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setActiveImg((prev) => (prev + 1) % images.length)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-background/90 border shadow-md flex items-center justify-center hover:bg-background transition-colors z-10"
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

            {/* Zoom preview panel (appears on hover, to the right) */}
            {zooming && images.length > 0 && (
              <div
                className="hidden lg:block absolute left-[calc(100%+16px)] top-0 w-[400px] h-[400px] border rounded-2xl overflow-hidden bg-background shadow-xl z-30"
              >
                <div
                  className="w-full h-full"
                  style={{
                    backgroundImage: `url(${images[activeImg]})`,
                    backgroundSize: `${ZOOM_FACTOR * 100}%`,
                    backgroundPosition: `${zoomPos.x}% ${zoomPos.y}%`,
                    backgroundRepeat: "no-repeat",
                  }}
                />
              </div>
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
          {isNewProduct(product) && (
            <span className="inline-flex w-fit mb-2 px-2.5 py-1 text-xs rounded-full bg-primary text-primary-foreground font-semibold">
              Nuevo
            </span>
          )}
          <h1 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">{product.name}</h1>
          <p className="text-muted-foreground mb-6 leading-relaxed">{product.description}</p>

          <div className="flex items-center gap-3 mb-2 text-sm text-muted-foreground">
            <span>SKU: {product.sku}</span>
            <span>•</span>
            <span className={product.stock > 0 ? "text-green-600" : "text-destructive"}>{getStockLabel(product)}</span>
          </div>

          <div className="mb-8">
            {discountPct > 0 && (
              <>
                <p className="text-sm text-muted-foreground line-through">₲{(Number(product.price) || 0).toLocaleString("es-PY")}</p>
                <p className="text-sm text-destructive font-semibold">-{discountPct}%</p>
              </>
            )}
            {affiliateBuyerPct > 0 && displayUnitPrice < effectivePrice && (
              <p className="text-sm text-muted-foreground line-through">₲{effectivePrice.toLocaleString("es-PY")}</p>
            )}
            {affiliateBuyerPct > 0 && (
              <p className="text-sm text-primary font-semibold mb-1">-{Math.round(affiliateBuyerPct)}% con enlace de afiliado</p>
            )}
            <p className="text-4xl font-bold text-foreground">₲{displayUnitPrice.toLocaleString("es-PY")}</p>
          </div>

          <div className="flex items-center gap-3 md:gap-4">
            <div className="flex items-center border rounded-xl overflow-hidden">
              <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-10 h-10 flex items-center justify-center hover:bg-muted/50 transition-colors">
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-12 text-center font-medium text-sm">{qty}</span>
              <button onClick={() => setQty(Math.min(maxQty, qty + 1))} className="w-10 h-10 flex items-center justify-center hover:bg-muted/50 transition-colors disabled:opacity-40" disabled={qty >= maxQty}>
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <button
              onClick={() => {
                if (addItem(product, qty)) {
                  toastCartAdded(product.name, qty);
                }
              }}
              disabled={product.stock <= 0}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 gradient-celeste text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ShoppingCart className="h-5 w-5" />
              Agregar al carrito
            </button>
            <a
              href={buildWhatsAppProductLink(product)}
              target="_blank"
              rel="noopener noreferrer"
              className="h-12 px-4 rounded-xl border flex items-center justify-center text-foreground hover:bg-muted/50 transition-colors"
              aria-label="Consultar este producto por WhatsApp"
            >
              <MessageCircle className="h-5 w-5" />
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
