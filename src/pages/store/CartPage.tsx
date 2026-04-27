import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Trash2, Minus, Plus, ShoppingBag, X } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { useCart } from "@/contexts/CartContext";
import { EmptyState } from "@/components/shared/Loader";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAffiliateBuyerDiscount } from "@/contexts/AffiliateBuyerDiscountContext";
import { resolveProductPrimaryImageSrc } from "@/lib/productImageUrl";
import { withAffiliateRef } from "@/lib/affiliate";
import { getWhatsAppDigits } from "@/config/whatsapp";

export default function CartPage() {
  const [searchParams] = useSearchParams();
  const refForLink = searchParams.get("ref");
  const { items, removeItem, updateQuantity } = useCart();
  const { lineUnitPrice, lineSubtotal, cartTotal } = useAffiliateBuyerDiscount();
  const totalPrice = cartTotal(items);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [waForm, setWaForm] = useState({ name: "", phone: "", message: "" });

  const handleWhatsAppSubmit = () => {
    const baseUrl =
      import.meta.env.VITE_PUBLIC_SITE_URL ||
      (typeof window !== "undefined" ? window.location.origin : "");

    const productLines = items
      .map((item) => {
        const productUrl = `${baseUrl}/products/${item.product.id}`;
        return [
          `• ${item.product.name} x${item.quantity} — ₲${lineSubtotal(item.product, item.quantity).toLocaleString("es-PY")}`,
          `  ${productUrl}`,
        ].filter(Boolean).join("\n");
      })
      .join("\n");

    const text = [
      `Hola, soy ${waForm.name || "un cliente"}.`,
      waForm.phone ? `Mi teléfono: ${waForm.phone}` : "",
      "",
      "Productos de interés:",
      productLines,
      "",
      `Total: ₲${totalPrice.toLocaleString("es-PY")}`,
      waForm.message ? `\nMensaje: ${waForm.message}` : "",
    ].filter(Boolean).join("\n");

    const waNumber = getWhatsAppDigits();
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`, "_blank");
    setShowWhatsApp(false);
  };

  if (items.length === 0) {
    return (
      <div className="container mx-auto py-12 sm:py-20 min-w-0 max-w-full text-center">
        <EmptyState
          title="Tu carrito está vacío"
          description="Explora nuestros productos y agrega lo que necesites."
          icon={<ShoppingBag className="h-10 w-10 sm:h-12 sm:w-12" />}
        />
        <div className="text-center mt-6 sm:mt-8">
          <Link
            to={withAffiliateRef("/products", refForLink)}
            className="inline-flex min-h-12 items-center justify-center px-6 py-3 text-[15px] sm:text-base gradient-celeste text-white font-semibold rounded-xl hover:opacity-90 transition-opacity touch-manipulation w-full max-w-sm sm:w-auto"
          >
            Explorar productos
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 sm:py-10 min-w-0 max-w-full">
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-5 sm:mb-8 [text-wrap:balance] pr-1">
        Carrito de compras
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => {
            const lineImg = resolveProductPrimaryImageSrc(item.product);
            return (
            <motion.div
              key={item.product.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-3 p-3.5 sm:p-4 sm:flex-row sm:items-center sm:gap-4 bg-card rounded-2xl border shadow-card"
            >
              <div className="flex gap-3 flex-1 min-w-0">
                {lineImg ? (
                  <img
                    src={lineImg}
                    alt={item.product.name}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg sm:rounded-xl object-cover shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg sm:rounded-xl bg-muted/30 flex items-center justify-center shrink-0">
                    <span className="text-[10px] text-muted-foreground text-center">[imagen producto]</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground line-clamp-2 sm:truncate">{item.product.name}</h3>
                  <p className="text-sm text-muted-foreground">₲{lineUnitPrice(item.product).toLocaleString("es-PY")}</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 sm:justify-end sm:shrink-0">
                <div className="flex items-center border rounded-lg overflow-hidden touch-manipulation">
                  <button type="button" onClick={() => updateQuantity(item.product.id, item.quantity - 1)} className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 flex items-center justify-center hover:bg-muted/50 active:bg-muted/70">
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-10 sm:w-8 text-center text-sm font-medium tabular-nums">{item.quantity}</span>
                  <button type="button" onClick={() => updateQuantity(item.product.id, Math.min(item.product.stock ?? Infinity, item.quantity + 1))} disabled={item.product.stock !== undefined && item.quantity >= item.product.stock} className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 flex items-center justify-center hover:bg-muted/50 active:bg-muted/70 disabled:opacity-40">
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <p className="font-semibold text-foreground text-right tabular-nums sm:w-28 shrink-0">
                  ₲{lineSubtotal(item.product, item.quantity).toLocaleString("es-PY")}
                </p>
                <button type="button" onClick={() => removeItem(item.product.id)} className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 flex items-center justify-center text-muted-foreground hover:text-destructive active:text-destructive transition-colors touch-manipulation shrink-0" aria-label="Quitar del carrito">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="bg-card rounded-2xl border shadow-card p-4 sm:p-5 md:p-6 h-fit lg:sticky lg:top-24 space-y-4 min-w-0">
          <h2 className="text-base sm:text-lg font-semibold text-foreground mb-4 sm:mb-6">Resumen</h2>
          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-foreground">₲{totalPrice.toLocaleString("es-PY")}</span>
            </div>
            <div className="border-t my-4" />
            <div className="flex justify-between font-semibold text-lg">
              <span className="text-foreground">Total</span>
              <span className="text-foreground">₲{totalPrice.toLocaleString("es-PY")}</span>
            </div>
          </div>
          <Link
            to={withAffiliateRef("/checkout", refForLink)}
            className="inline-flex w-full min-h-12 sm:min-h-11 text-center px-5 py-3.5 sm:py-3 text-[15px] sm:text-base gradient-celeste text-white font-semibold rounded-xl hover:opacity-90 transition-opacity touch-manipulation items-center justify-center"
          >
            Proceder al pago
          </Link>

          {/* WhatsApp Button */}
          <button
            onClick={() => setShowWhatsApp(true)}
            className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-[#25D366] hover:bg-[#20bd5a] text-white font-semibold rounded-xl transition-colors"
          >
            <WhatsAppIcon className="h-5 w-5 text-white" />
            Solicitar a un Asesor
          </button>
        </div>
      </div>

      {/* WhatsApp Form Modal */}
      <AnimatePresence>
        {showWhatsApp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
            onClick={() => setShowWhatsApp(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-t-2xl sm:rounded-2xl border shadow-xl w-full max-w-md max-h-[min(92dvh,36rem)] overflow-y-auto mx-0 sm:mx-4 p-5 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center">
                    <WhatsAppIcon className="h-4 w-4 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Solicitar a un Asesor</h3>
                </div>
                <button onClick={() => setShowWhatsApp(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Product list */}
              <div className="mb-4 space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Productos seleccionados:</p>
                <div className="bg-muted/30 rounded-xl p-3 space-y-2 max-h-40 overflow-y-auto">
                  {items.map((item) => (
                    <div key={item.product.id} className="flex justify-between text-sm">
                      <span className="text-foreground truncate mr-2">{item.product.name} x{item.quantity}</span>
                      <span className="text-foreground font-medium shrink-0">₲{lineSubtotal(item.product, item.quantity).toLocaleString("es-PY")}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 flex justify-between font-semibold text-sm">
                    <span className="text-foreground">Total</span>
                    <span className="text-foreground">₲{totalPrice.toLocaleString("es-PY")}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="wa-name">Nombre</Label>
                  <Input
                    id="wa-name"
                    placeholder="Tu nombre"
                    value={waForm.name}
                    onChange={(e) => setWaForm({ ...waForm, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="wa-phone">Teléfono</Label>
                  <Input
                    id="wa-phone"
                    placeholder="Tu número de teléfono"
                    value={waForm.phone}
                    onChange={(e) => setWaForm({ ...waForm, phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="wa-message">Mensaje (opcional)</Label>
                  <Textarea
                    id="wa-message"
                    placeholder="¿Algún comentario adicional?"
                    rows={3}
                    value={waForm.message}
                    onChange={(e) => setWaForm({ ...waForm, message: e.target.value })}
                  />
                </div>
              </div>

              <button
                onClick={handleWhatsAppSubmit}
                className="w-full mt-6 flex items-center justify-center gap-2 px-6 py-3.5 bg-[#25D366] hover:bg-[#20bd5a] text-white font-semibold rounded-xl transition-colors"
              >
                <WhatsAppIcon className="h-5 w-5 text-white" />
                Enviar por WhatsApp
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
