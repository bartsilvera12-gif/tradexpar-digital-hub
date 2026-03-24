import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { api } from "@/services/api";
import { Loader2 } from "lucide-react";

export default function CheckoutPage() {
  const { items, totalPrice, clearCart } = useCart();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      const order = await api.createOrder({
        items: items.map((i) => ({
          product_id: i.product.id,
          quantity: i.quantity,
          price: i.product.price,
        })),
        customer: { name: form.name, email: form.email, phone: form.phone || undefined },
      });

      const payment = await api.createPayment(order.id);

      clearCart();

      if (payment.paymentLink) {
        // Store orderId and ref for success page
        sessionStorage.setItem("tradexpar_order_id", order.id);
        sessionStorage.setItem("tradexpar_payment_ref", payment.ref);
        window.location.href = payment.paymentLink;
      } else {
        navigate(`/success?order_id=${order.id}&ref=${payment.ref}`);
      }
    } catch (err: any) {
      setError(err.message || "Error al procesar el pedido");
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <p className="text-muted-foreground">No hay productos en el carrito.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10 max-w-2xl">
      <h1 className="text-3xl font-bold text-foreground mb-8">Checkout</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-card rounded-2xl border shadow-card p-6 space-y-4">
          <h2 className="font-semibold text-foreground">Datos del cliente</h2>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Nombre *</label>
            <input
              type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Email *</label>
            <input
              type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Teléfono</label>
            <input
              type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        {/* Order summary */}
        <div className="bg-card rounded-2xl border shadow-card p-6">
          <h2 className="font-semibold text-foreground mb-4">Resumen del pedido</h2>
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.product.id} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{item.product.name} × {item.quantity}</span>
                <span className="text-foreground">₲{(item.product.price * item.quantity).toLocaleString("es-PY")}</span>
              </div>
            ))}
            <div className="border-t pt-3 flex justify-between font-semibold text-lg">
              <span>Total</span>
              <span>₲{totalPrice.toLocaleString("es-PY")}</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-destructive/10 text-destructive text-sm">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-6 py-4 gradient-celeste text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {loading ? <><Loader2 className="h-5 w-5 animate-spin" /> Procesando...</> : "Confirmar y pagar"}
        </button>
      </form>
    </div>
  );
}
