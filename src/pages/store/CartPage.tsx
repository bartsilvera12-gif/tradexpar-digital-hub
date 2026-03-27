import { useState } from "react";
import { Link } from "react-router-dom";
import { Trash2, Minus, Plus, ShoppingBag, MessageCircle, X } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { EmptyState } from "@/components/shared/Loader";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getEffectivePrice } from "@/lib/productHelpers";

export default function CartPage() {
  const { items, removeItem, updateQuantity, totalPrice } = useCart();
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
          `• ${item.product.name} x${item.quantity} — ₲${(getEffectivePrice(item.product) * item.quantity).toLocaleString("es-PY")}`,
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

    const waNumber = import.meta.env.VITE_WHATSAPP_NUMBER || "595982487844";
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`, "_blank");
    setShowWhatsApp(false);
  };

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-20">
        <EmptyState
          title="Tu carrito está vacío"
          description="Explora nuestros productos y agrega lo que necesites."
          icon={<ShoppingBag className="h-12 w-12" />}
        />
        <div className="text-center mt-6">
          <Link to="/products" className="inline-flex px-6 py-3 gradient-celeste text-white font-semibold rounded-xl hover:opacity-90 transition-opacity">
            Explorar productos
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-foreground mb-8">Carrito de compras</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => (
            <motion.div
              key={item.product.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-4 p-4 bg-card rounded-2xl border shadow-card"
            >
              {(item.product.images?.[0] || item.product.image) ? (
                <img src={item.product.images?.[0] || item.product.image} alt={item.product.name} className="w-20 h-20 rounded-xl object-cover shrink-0" />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-muted/30 flex items-center justify-center shrink-0">
                  <span className="text-[10px] text-muted-foreground text-center">[imagen producto]</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground truncate">{item.product.name}</h3>
                <p className="text-sm text-muted-foreground">₲{getEffectivePrice(item.product).toLocaleString("es-PY")}</p>
              </div>
              <div className="flex items-center border rounded-lg overflow-hidden">
                <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)} className="w-8 h-8 flex items-center justify-center hover:bg-muted/50">
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                <button onClick={() => updateQuantity(item.product.id, Math.min(item.product.stock ?? Infinity, item.quantity + 1))} disabled={item.product.stock !== undefined && item.quantity >= item.product.stock} className="w-8 h-8 flex items-center justify-center hover:bg-muted/50 disabled:opacity-40">
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              <p className="font-semibold text-foreground w-24 text-right">
                ₲{(getEffectivePrice(item.product) * item.quantity).toLocaleString("es-PY")}
              </p>
              <button onClick={() => removeItem(item.product.id)} className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </div>

        {/* Summary */}
        <div className="bg-card rounded-2xl border shadow-card p-6 h-fit sticky top-24 space-y-4">
          <h2 className="text-lg font-semibold text-foreground mb-6">Resumen</h2>
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
            to="/checkout"
            className="block w-full text-center px-6 py-3.5 gradient-celeste text-white font-semibold rounded-xl hover:opacity-90 transition-opacity"
          >
            Proceder al pago
          </Link>

          {/* WhatsApp Button */}
          <button
            onClick={() => setShowWhatsApp(true)}
            className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-[#25D366] hover:bg-[#20bd5a] text-white font-semibold rounded-xl transition-colors"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={() => setShowWhatsApp(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-2xl border shadow-xl w-full max-w-md mx-4 p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center">
                    <MessageCircle className="h-4 w-4 text-white" />
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
                      <span className="text-foreground font-medium shrink-0">₲{(getEffectivePrice(item.product) * item.quantity).toLocaleString("es-PY")}</span>
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
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Enviar por WhatsApp
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
