import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { api } from "@/services/api";
import { tradexpar } from "@/services/tradexpar";
import { Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { deriveCheckoutTypeFromItems } from "@/lib/productHelpers";
import { useAffiliateBuyerDiscount } from "@/contexts/AffiliateBuyerDiscountContext";
import { getActiveAffiliateRef } from "@/lib/affiliate";
import { affiliatesAvailable, finalizeAffiliateAttribution } from "@/services/affiliateTradexparService";
import type { CustomerLocation, ParaguayCity } from "@/types";
import { PAGOPAR_CIUDADES_PY } from "@/config/pagoparCiudadesPy";

const fieldCls =
  "w-full min-h-11 px-4 py-2.5 rounded-xl border bg-background text-foreground text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

type CheckoutForm = {
  firstName: string;
  lastName: string;
  email: string;
  document: string;
  phone: string;
  address: string;
  /** Entre calles, piso, timbre, etc. (opcional). */
  addressReference: string;
  /** id UUID de `paraguay_cities` o `legacy-{code}` si falla la carga desde la base. */
  cityId: string;
  locationUrl: string;
};

function legacyParaguayCityOptions(): ParaguayCity[] {
  return PAGOPAR_CIUDADES_PY.map((c, i) => ({
    id: `legacy-${c.code}`,
    name: c.label,
    department: "Lista corta PagoPar",
    pagopar_city_code: c.code,
    sort_order: i,
  }));
}

export default function CheckoutPage() {
  const { items, clearCart } = useCart();
  const { lineUnitPrice, lineSubtotal, cartTotal } = useAffiliateBuyerDiscount();
  const totalPrice = cartTotal(items);
  const { user } = useCustomerAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [form, setForm] = useState<CheckoutForm>({
    firstName: "",
    lastName: "",
    email: "",
    document: "",
    phone: "",
    address: "",
    addressReference: "",
    cityId: "",
    locationUrl: "",
  });
  const [cities, setCities] = useState<ParaguayCity[]>([]);
  const [citiesFromDb, setCitiesFromDb] = useState(true);
  const [locations, setLocations] = useState<CustomerLocation[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Pedido creado, pendiente de iniciar pago con PagoPar. */
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void tradexpar
      .listParaguayCities()
      .then((rows) => {
        if (cancelled) return;
        if (rows.length > 0) {
          setCities(rows);
          setCitiesFromDb(true);
        } else {
          setCities(legacyParaguayCityOptions());
          setCitiesFromDb(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCities(legacyParaguayCityOptions());
          setCitiesFromDb(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const citiesByDepartment = useMemo(() => {
    const m = new Map<string, ParaguayCity[]>();
    for (const c of cities) {
      const arr = m.get(c.department) ?? [];
      arr.push(c);
      m.set(c.department, arr);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, "es"));
  }, [cities]);

  useEffect(() => {
    if (!user) return;
    const raw = (user.name || "").trim();
    const parts = raw ? raw.split(/\s+/) : [];
    const fn = parts[0] ?? "";
    const ln = parts.slice(1).join(" ");
    setForm((prev) => ({
      ...prev,
      email: user.email,
      firstName: fn || prev.firstName,
      lastName: ln || prev.lastName,
    }));
    const LOC_MS = 14_000;
    let cancelled = false;
    void Promise.race([
      tradexpar.getCustomerLocations(user.id),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("locations_timeout")), LOC_MS)),
    ])
      .then((res) => {
        if (cancelled) return;
        const locs = (res as { locations: CustomerLocation[] }).locations;
        setLocations(locs);
        const defaultLoc = locs.find((l) => l.is_default) || locs[0];
        if (defaultLoc) {
          setSelectedLocationId(defaultLoc.id);
          setForm((prev) => ({ ...prev, locationUrl: defaultLoc.location_url }));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  const checkoutType = useMemo(() => deriveCheckoutTypeFromItems(items), [items]);

  /**
   * Sin `forma_pago`, el POST usa el default del servidor (`PAGOPAR_FORMA_PAGO`, típicamente 9).
   */
  const runCreatePaymentAndRedirect = async (opts: {
    orderId?: string;
    forma_pago?: number;
  }): Promise<boolean> => {
    const oid = opts.orderId ?? pendingOrderId;
    if (!oid) return false;
    setPaying(true);
    setError(null);
    try {
      const useForma = opts.forma_pago != null && Number.isFinite(opts.forma_pago);
      const payment = useForma
        ? await api.createPayment(oid, { pagopar: { forma_pago: Math.floor(opts.forma_pago) } })
        : await api.createPayment(oid);
      clearCart();
      setPendingOrderId(null);
      if (payment.paymentLink) {
        sessionStorage.setItem("tradexpar_order_id", oid);
        sessionStorage.setItem("tradexpar_payment_ref", payment.ref);
        window.location.href = payment.paymentLink;
        return true;
      }
      navigate(`/success?order_id=${oid}&ref=${payment.ref}`);
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar el pago con PagoPar");
      return false;
    } finally {
      setPaying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;
    if (pendingOrderId) {
      setLoading(true);
      setError(null);
      try {
        await runCreatePaymentAndRedirect({ orderId: pendingOrderId });
      } finally {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    setError(null);

    try {
      if (!form.email.trim()) {
        throw new Error("El email es obligatorio.");
      }
      const firstName = form.firstName.trim();
      const lastName = form.lastName.trim();
      if (firstName.length < 2) {
        throw new Error("El nombre es obligatorio.");
      }
      if (lastName.length < 2) {
        throw new Error("El apellido es obligatorio.");
      }
      const fullName = `${firstName} ${lastName}`.trim();
      if (!form.document.trim()) {
        throw new Error("El número de CI / RUC es obligatorio.");
      }
      if (!form.phone.trim()) {
        throw new Error("El teléfono es obligatorio.");
      }
      if (!form.address.trim()) {
        throw new Error("La dirección es obligatoria.");
      }
      if (!form.cityId) {
        throw new Error("Seleccioná una ciudad.");
      }
      const cityRow = cities.find((c) => c.id === form.cityId);
      if (!cityRow) {
        throw new Error("Ciudad no válida. Recargá la página.");
      }
      const cityLabel = `${cityRow.name}, ${cityRow.department}`;
      const cityCode = cityRow.pagopar_city_code;
      const location_url =
        form.locationUrl.trim() ||
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${form.address.trim()}, ${cityLabel}, Paraguay`)}`;

      const customerLocationId = selectedLocationId || undefined;

      const order = await tradexpar.createOrder({
        items: items.map((i) => ({
          product_id: i.product.id,
          quantity: i.quantity,
          price: lineUnitPrice(i.product),
          product_name: i.product.name,
        })),
        customer: {
          name: fullName,
          email: form.email.trim(),
          phone: form.phone.trim(),
          document: form.document.trim(),
          address: form.address.trim(),
          city_code: cityCode,
          address_reference: form.addressReference.trim() || undefined,
        },
        location_url,
        customer_location_id: customerLocationId,
        checkout_type: checkoutType ?? "tradexpar",
        affiliate_ref:
          (() => {
            const fromUrl = new URLSearchParams(location.search).get("ref")?.trim();
            if (fromUrl) return fromUrl;
            return getActiveAffiliateRef() || undefined;
          })(),
      });

      if (affiliatesAvailable()) {
        void finalizeAffiliateAttribution(order.id);
      }

      const orderId = order.id;
      setPendingOrderId(orderId);

      /**
       * Sin listar medios desde `/payment-methods` (evita «Failed to fetch» si esa ruta falla).
       * El servidor Node usa `PAGOPAR_FORMA_PAGO` (env, por defecto 9) cuando no se envía `forma_pago`.
       */
      await runCreatePaymentAndRedirect({ orderId });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al procesar el pedido");
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="container mx-auto py-12 sm:py-20 text-center min-w-0 max-w-full px-2">
        <p className="text-sm sm:text-base text-muted-foreground [text-wrap:balance]">No hay productos en el carrito.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-5 sm:py-8 md:py-10 max-w-6xl min-w-0 w-full">
      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-4 sm:mb-6 md:mb-8 pr-1 [text-wrap:balance]">
        Checkout
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
        <div className="grid lg:grid-cols-3 gap-5 sm:gap-7 lg:gap-8 items-start max-w-5xl mx-auto lg:max-w-none">
          <div className="lg:col-span-2 min-w-0">
            <div className="bg-card rounded-2xl border shadow-card p-3.5 sm:p-5 md:p-6 space-y-4 sm:space-y-5">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold text-foreground">Datos del cliente</h2>
                <p className="text-xs text-muted-foreground">
                  Completá los datos para el envío, la facturación y el pago con PagoPar.
                </p>
                {!citiesFromDb && (
                  <p className="text-xs text-amber-700 dark:text-amber-400/90">
                    No se cargaron las ciudades desde la base: usando lista corta PagoPar. Ejecutá en Supabase{" "}
                    <code className="text-[0.7rem] rounded bg-muted px-1">tradexpar_paraguay_cities.sql</code> y el seed.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Nombre <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    autoComplete="given-name"
                    className={fieldCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Apellido <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    autoComplete="family-name"
                    className={fieldCls}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Email <span className="text-destructive">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  autoComplete="email"
                  className={fieldCls}
                />
                <p className="text-xs text-muted-foreground mt-1.5">Podés crear una cuenta después de comprar.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Teléfono <span className="text-destructive">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="0981123456"
                  autoComplete="tel"
                  inputMode="tel"
                  className={fieldCls}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Documento (CI / RUC) <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.document}
                  onChange={(e) => setForm({ ...form, document: e.target.value })}
                  autoComplete="off"
                  className={fieldCls}
                />
              </div>

              <div className="w-full sm:max-w-[50%]">
                <label className="block text-sm font-medium text-foreground mb-1">
                  Ciudad <span className="text-destructive">*</span>
                </label>
                <Select
                  value={form.cityId || "__none"}
                  onValueChange={(v) => setForm({ ...form, cityId: v === "__none" ? "" : v })}
                >
                  <SelectTrigger className="w-full rounded-xl border-border/80 py-2.5 h-auto min-h-11 text-foreground text-sm">
                    <SelectValue placeholder="Seleccionar ciudad" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[min(22rem,50vh)]">
                    <SelectItem value="__none">Seleccionar ciudad</SelectItem>
                    {citiesByDepartment.map(([dept, list]) => (
                      <SelectGroup key={dept}>
                        <SelectLabel className="text-xs font-semibold text-muted-foreground px-2 py-1.5">
                          {dept}
                        </SelectLabel>
                        {list.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Dirección <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  autoComplete="street-address"
                  className={fieldCls}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Referencia de dirección <span className="text-muted-foreground font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={form.addressReference}
                  onChange={(e) => setForm({ ...form, addressReference: e.target.value })}
                  placeholder="Ej.: entre calles X e Y, 2º piso, timbre 2B"
                  autoComplete="address-line2"
                  className={fieldCls}
                />
              </div>

              {user && locations.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Ubicaciones guardadas <span className="text-muted-foreground font-normal">(opcional)</span>
                  </label>
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
                <label className="block text-sm font-medium text-foreground mb-1">
                  URL de ubicación <span className="text-muted-foreground font-normal">(opcional)</span>
                </label>
                <input
                  type="url"
                  value={form.locationUrl}
                  onChange={(e) => setForm({ ...form, locationUrl: e.target.value })}
                  placeholder="https://maps.google.com/..."
                  autoComplete="url"
                  className={fieldCls}
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Si lo dejás vacío, armamos el enlace con tu dirección y ciudad.
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-1 lg:row-span-2">
            <div className="bg-card rounded-2xl border shadow-card p-4 sm:p-6 lg:sticky lg:top-24 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold text-foreground">Resumen del pedido</h2>
                {!user && (
                  <Link
                    to="/login"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline shrink-0"
                  >
                    <User className="h-4 w-4" aria-hidden />
                    Iniciá sesión
                  </Link>
                )}
              </div>

              <p className="text-sm text-muted-foreground">
                {items.reduce((n, i) => n + i.quantity, 0)} producto
                {items.reduce((n, i) => n + i.quantity, 0) === 1 ? "" : "s"} en el carrito
              </p>

              <div className="space-y-3">
                {items.map((item) => (
                  <div key={item.product.id} className="flex justify-between gap-3 text-sm">
                    <span className="text-muted-foreground min-w-0">
                      {item.product.name} × {item.quantity}
                    </span>
                    <span className="text-foreground shrink-0">
                      ₲{lineSubtotal(item.product, item.quantity).toLocaleString("es-PY")}
                    </span>
                  </div>
                ))}
                <div className="border-t pt-3 flex justify-between font-semibold text-lg">
                  <span>Total</span>
                  <span>₲{totalPrice.toLocaleString("es-PY")}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            {error && (
              <div className="p-4 rounded-xl bg-destructive/10 text-destructive text-sm">{error}</div>
            )}
            <button
              type="submit"
              disabled={loading || paying || items.length === 0}
              className="w-full min-h-12 flex items-center justify-center gap-2 px-6 py-3.5 sm:py-4 gradient-celeste text-white font-semibold rounded-xl hover:opacity-90 active:opacity-95 transition-opacity disabled:opacity-60 touch-manipulation"
            >
              {loading || paying ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> {paying ? "Abriendo PagoPar…" : "Procesando..."}
                </>
              ) : (
                "Confirmar y pagar"
              )}
            </button>
          </div>
        </div>
      </form>

      {pendingOrderId && (
        <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground max-w-5xl mx-auto lg:mx-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="min-w-0">
            El pedido ya está registrado. Si no se abrió PagoPar, podés reintentar el enlace de pago.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={paying}
            onClick={() => void runCreatePaymentAndRedirect({ orderId: pendingOrderId })}
          >
            {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Ir a PagoPar
          </Button>
        </div>
      )}
    </div>
  );
}
