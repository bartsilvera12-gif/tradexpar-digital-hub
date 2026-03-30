import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { api } from "@/services/api";
import { tradexpar } from "@/services/tradexpar";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { deriveCheckoutTypeFromItems } from "@/lib/productHelpers";
import { useAffiliateBuyerDiscount } from "@/contexts/AffiliateBuyerDiscountContext";
import { getActiveAffiliateRef } from "@/lib/affiliate";
import { affiliatesAvailable, finalizeAffiliateAttribution } from "@/services/affiliateTradexparService";
import type { CustomerLocation } from "@/types";

export default function CheckoutPage() {
  const { items, clearCart } = useCart();
  const { lineUnitPrice, lineSubtotal, cartTotal } = useAffiliateBuyerDiscount();
  const totalPrice = cartTotal(items);
  const { user } = useCustomerAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", phone: "", locationUrl: "", locationLabel: "" });
  const [locations, setLocations] = useState<CustomerLocation[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      tradexpar.getCustomerLocations(user.id).then((res) => {
        setLocations(res.locations);
        const defaultLoc = res.locations.find((l) => l.is_default) || res.locations[0];
        if (defaultLoc) {
          setSelectedLocationId(defaultLoc.id);
          setForm((prev) => ({ ...prev, locationUrl: defaultLoc.location_url }));
        }
      }).catch(() => {});
      setForm((prev) => ({ ...prev, email: user.email, name: user.name }));
    }
  }, [user]);

  const checkoutType = useMemo(() => deriveCheckoutTypeFromItems(items), [items]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      if (checkoutType === null) {
        throw new Error(
          "No puedes combinar productos Tradexpar y Dropi en el mismo pedido. Quita ítems de un origen o vacía el carrito."
        );
      }
      if (!form.locationUrl.trim()) {
        throw new Error("La ubicación URL es obligatoria.");
      }
      if (!form.phone.trim()) {
        throw new Error("El teléfono es obligatorio.");
      }

      let customerLocationId = selectedLocationId || undefined;
      if (user && !customerLocationId && form.locationLabel.trim()) {
        const created = await tradexpar.createCustomerLocation(user.id, {
          label: form.locationLabel.trim(),
          location_url: form.locationUrl.trim(),
        });
        customerLocationId = created.id;
      }

      const order = await tradexpar.createOrder({
        items: items.map((i) => ({
          product_id: i.product.id,
          quantity: i.quantity,
          price: lineUnitPrice(i.product),
          product_name: i.product.name,
        })),
        customer: { name: form.name, email: form.email || undefined, phone: form.phone.trim() },
        location_url: form.locationUrl.trim(),
        customer_location_id: customerLocationId,
        checkout_type: checkoutType,
        affiliate_ref: getActiveAffiliateRef() || undefined,
      });

      if (affiliatesAvailable()) {
        void finalizeAffiliateAttribution(order.id);
      }

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
            <label className="block text-sm font-medium text-foreground mb-1">Email {user ? "*" : "(opcional)"}</label>
            <input
              type="email" required={Boolean(user)} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Teléfono *</label>
            <input
              type="tel"
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="Ej. 0981 123456"
              className="w-full px-4 py-2.5 rounded-xl border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          {user && locations.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Ubicaciones guardadas</label>
              <Select
                value={selectedLocationId || "__none"}
                onValueChange={(v) => {
                  if (v === "__none") {
                    setSelectedLocationId("");
                    return;
                  }
                  const selected = locations.find((l) => l.id === v);
                  setSelectedLocationId(v);
                  if (selected) setForm((prev) => ({ ...prev, locationUrl: selected.location_url }));
                }}
              >
                <SelectTrigger className="w-full rounded-xl border-border/80 py-2.5 h-auto min-h-10 text-foreground text-sm">
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Seleccionar…</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">URL de ubicación *</label>
            <input
              type="url"
              required
              value={form.locationUrl}
              onChange={(e) => setForm({ ...form, locationUrl: e.target.value })}
              placeholder="https://maps.google.com/..."
              className="w-full px-4 py-2.5 rounded-xl border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          {user && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Guardar ubicación como (opcional)</label>
              <input
                type="text"
                value={form.locationLabel}
                onChange={(e) => setForm({ ...form, locationLabel: e.target.value })}
                placeholder="Casa, Oficina, Depósito..."
                className="w-full px-4 py-2.5 rounded-xl border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}
        </div>

        {/* Order summary */}
        <div className="bg-card rounded-2xl border shadow-card p-6">
          <h2 className="font-semibold text-foreground mb-2">Resumen del pedido</h2>
          {checkoutType === null ? (
            <p className="text-sm text-destructive mb-4">
              Este carrito mezcla productos Tradexpar y Dropi. Deja solo un tipo de origen para continuar (ajusta cantidades o vacía el carrito).
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mb-4">
              {checkoutType === "dropi"
                ? "Pedido Dropi (todos los ítems son de catálogo Dropi)."
                : "Pedido Tradexpar (todos los ítems son propios)."}
            </p>
          )}
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.product.id} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{item.product.name} × {item.quantity}</span>
                <span className="text-foreground">₲{lineSubtotal(item.product, item.quantity).toLocaleString("es-PY")}</span>
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
          disabled={loading || checkoutType === null}
          className="w-full flex items-center justify-center gap-2 px-6 py-4 gradient-celeste text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {loading ? <><Loader2 className="h-5 w-5 animate-spin" /> Procesando...</> : "Confirmar y pagar"}
        </button>
      </form>
    </div>
  );
}
