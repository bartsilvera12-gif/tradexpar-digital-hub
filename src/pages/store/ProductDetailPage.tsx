import { useMemo, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, ShoppingCart, Minus, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "@/contexts/CartContext";
import { useStoreCatalog } from "@/hooks/useStoreCatalog";
import { ProductPromoBadge } from "@/components/store/ProductPromoBadge";
import { DDI } from "@/lib/ddiLabels";
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
import { resolveProductImageSrc } from "@/lib/productImageUrl";
import { productDescriptionPlainText } from "@/lib/productDescriptionText";

function getProductImages(product: Product): string[] {
  const raw =
    product.images && product.images.length > 0
      ? product.images
      : product.image
        ? [product.image]
        : [];
  return raw.map((u) => resolveProductImageSrc(u)).filter(Boolean);
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  useTrackAffiliateBuyerProduct(id);
  const aff = useAffiliateBuyerDiscount();
  const { data: catalog = [], isPending: loading, error: queryError, refetch, isFetched } = useStoreCatalog();
  const product = useMemo(
    () => catalog.find((p) => String(p.id) === id) ?? null,
    [catalog, id]
  );
  const error =
    queryError instanceof Error
      ? queryError.message
      : queryError
        ? String(queryError)
        : isFetched && !loading && id && !product
          ? "Producto no encontrado"
          : null;
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
    void refetch();
  };

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
  if (error || !product) {
    return (
      <div className="container mx-auto px-4 py-10">
        <ErrorState message={error || "Producto no encontrado"} onRetry={fetchProduct} />
      </div>
    );
  }

  const images = getProductImages(product);
  const maxQty = product.stock > 0 ? product.stock : 1;
  const descriptionText = productDescriptionPlainText(product.description);
  const discountPct = getDiscountPercentage(product);
  const effectivePrice = getEffectivePrice(product);
  const affiliateBuyerPct = aff.buyerPercentForProduct(product.id);
  const displayUnitPrice = aff.lineUnitPrice(product);

  return (
    <div className="container mx-auto px-3 sm:px-4 py-8 sm:py-10 min-w-0">
      <Link to="/products" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-6 sm:mb-8 touch-manipulation">
        <ArrowLeft className="h-4 w-4" /> Volver al catálogo
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-12"
      >
        {/* Image Gallery */}
        <div className="space-y-3">
          <div className="relative flex gap-4 min-w-0">
            {/* Main image container */}
            <div
              ref={imgContainerRef}
              onMouseEnter={() => setZooming(true)}
              onMouseLeave={() => setZooming(false)}
              onMouseMove={handleMouseMove}
              className="relative aspect-square rounded-3xl flex items-center justify-center border overflow-hidden flex-1 max-lg:cursor-default lg:cursor-crosshair touch-pan-y"
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
                      className="hidden lg:block absolute border-2 border-primary/40 bg-primary/5 pointer-events-none z-20 rounded-sm"
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
                        type="button"
                        onClick={() => setActiveImg((prev) => (prev - 1 + images.length) % images.length)}
                        className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 sm:w-10 sm:h-10 rounded-full bg-background/90 border shadow-md flex items-center justify-center hover:bg-background active:bg-background transition-colors z-10 touch-manipulation"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveImg((prev) => (prev + 1) % images.length)}
                        className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 sm:w-10 sm:h-10 rounded-full bg-background/90 border shadow-md flex items-center justify-center hover:bg-background active:bg-background transition-colors z-10 touch-manipulation"
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
            <span className="inline-flex w-fit mb-2 items-center rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/15 via-primary/10 to-transparent px-3 py-1.5 text-xs font-bold uppercase tracking-[0.15em] text-primary shadow-sm backdrop-blur-sm">
              Nuevo
            </span>
          )}
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground mb-4 break-words">{product.name}</h1>
          {descriptionText ? (
            <p className="text-muted-foreground mb-6 leading-relaxed whitespace-pre-line">{descriptionText}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 text-sm text-muted-foreground">
            <span className="break-all">SKU: {product.sku}</span>
            <span className="hidden sm:inline" aria-hidden>•</span>
            <span className={product.stock > 0 ? "text-green-600" : "text-destructive"}>{getStockLabel(product)}</span>
          </div>

          <div className="mb-8">
            {discountPct > 0 && (
              <>
                <p className="text-sm text-muted-foreground line-through">₲{(Number(product.price) || 0).toLocaleString("es-PY")}</p>
                <div className="mb-2">
                  <ProductPromoBadge variant="sale" percent={discountPct} shape="pill" />
                </div>
              </>
            )}
            {affiliateBuyerPct > 0 && displayUnitPrice < effectivePrice && (
              <p className="text-sm text-muted-foreground line-through">₲{effectivePrice.toLocaleString("es-PY")}</p>
            )}
            {affiliateBuyerPct > 0 && (
              <div className="mb-2 space-y-1.5">
                <ProductPromoBadge variant="referral" percent={affiliateBuyerPct} shape="pill" />
                <p className="text-xs text-muted-foreground">
                  Precio final con beneficio por enlace de {DDI.singularLower}.
                </p>
              </div>
            )}
            <p className="text-3xl sm:text-4xl font-bold text-foreground tabular-nums break-all sm:break-normal">₲{displayUnitPrice.toLocaleString("es-PY")}</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-nowrap sm:items-center sm:gap-4">
            <div className="flex items-center border rounded-xl overflow-hidden self-start">
              <button
                type="button"
                onClick={() => setQty(Math.max(1, qty - 1))}
                className="min-h-11 min-w-11 sm:min-h-10 sm:min-w-10 flex items-center justify-center hover:bg-muted/50 active:bg-muted/70 transition-colors touch-manipulation"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-12 text-center font-medium text-sm tabular-nums">{qty}</span>
              <button
                type="button"
                onClick={() => setQty(Math.min(maxQty, qty + 1))}
                className="min-h-11 min-w-11 sm:min-h-10 sm:min-w-10 flex items-center justify-center hover:bg-muted/50 active:bg-muted/70 transition-colors disabled:opacity-40 touch-manipulation"
                disabled={qty >= maxQty}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                if (addItem(product, qty)) {
                  toastCartAdded(product.name, qty);
                }
              }}
              disabled={product.stock <= 0}
              className="w-full sm:flex-1 min-h-12 flex items-center justify-center gap-2 px-6 py-3.5 sm:py-3 gradient-celeste text-white font-semibold rounded-xl hover:opacity-90 active:opacity-95 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
            >
              <ShoppingCart className="h-5 w-5 shrink-0" />
              Agregar al carrito
            </button>
            <a
              href={buildWhatsAppProductLink(product)}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-12 min-w-12 sm:h-12 sm:px-4 rounded-xl border border-border flex items-center justify-center text-[#25D366] hover:bg-[#25D366]/10 hover:border-[#25D366]/35 active:bg-[#25D366]/15 transition-colors touch-manipulation self-center sm:self-auto"
              aria-label="Consultar este producto por WhatsApp"
            >
              <WhatsAppIcon className="h-5 w-5" />
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
