import { Link } from "react-router-dom";
import { Trash2, Minus, Plus, ShoppingBag } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { EmptyState } from "@/components/shared/Loader";
import { motion } from "framer-motion";

export default function CartPage() {
  const { items, removeItem, updateQuantity, totalPrice } = useCart();

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
                <p className="text-sm text-muted-foreground">₲{item.product.price.toLocaleString("es-PY")}</p>
              </div>
              <div className="flex items-center border rounded-lg overflow-hidden">
                <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)} className="w-8 h-8 flex items-center justify-center hover:bg-muted/50">
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                <button onClick={() => updateQuantity(item.product.id, item.quantity + 1)} className="w-8 h-8 flex items-center justify-center hover:bg-muted/50">
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              <p className="font-semibold text-foreground w-24 text-right">
                ${(item.product.price * item.quantity).toLocaleString("es-PY")}
              </p>
              <button onClick={() => removeItem(item.product.id)} className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </div>

        {/* Summary */}
        <div className="bg-card rounded-2xl border shadow-card p-6 h-fit sticky top-24">
          <h2 className="text-lg font-semibold text-foreground mb-6">Resumen</h2>
          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-foreground">${totalPrice.toLocaleString("es-PY")}</span>
            </div>
            <div className="border-t my-4" />
            <div className="flex justify-between font-semibold text-lg">
              <span className="text-foreground">Total</span>
              <span className="text-foreground">${totalPrice.toLocaleString("es-PY")}</span>
            </div>
          </div>
          <Link
            to="/checkout"
            className="block w-full text-center px-6 py-3.5 gradient-celeste text-white font-semibold rounded-xl hover:opacity-90 transition-opacity"
          >
            Proceder al pago
          </Link>
        </div>
      </div>
    </div>
  );
}
