import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { api, type PagoparPaymentMethod } from "@/services/api";
import { tradexpar } from "@/services/tradexpar";
import { Loader2, User, Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

function isPagoQrMethod(m: PagoparPaymentMethod | null | undefined) {
  if (!m) return false;
  const t = `${m.title} ${m.description}`.toLowerCase();
  if (/\bpago\s*qr\b/.test(t) || (/\bqr\b/.test(t) && t.includes("pago"))) return true;
  if (m.title.toLowerCase().trim() === "pago qr") return true;
  return false;
}

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
  const [showPaymentMethodDialog, setShowPaymentMethodDialog] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PagoparPaymentMethod[]>([]);
  const [loadMethodsError, setLoadMethodsError] = useState<string | null>(null);
  const [loadingMethods, setLoadingMethods] = useState(false);
  const [selectedFormaPago, setSelectedFormaPago] = useState<number | null>(null);
  const [showQrIntroDialog, setShowQrIntroDialog] = useState(false);
  const [paying, setPaying] = useState(false);
  const [methodFetchNonce, setMethodFetchNonce] = useState(0);

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

  useEffect(() => {
    if (!showPaymentMethodDialog || !pendingOrderId) return;
    let cancelled = false;
    setLoadingMethods(true);
    setLoadMethodsError(null);
    setPaymentMethods([]);
    void (async () => {
      try {
        const r = await api.getPagoparPaymentMethods();
        if (cancelled) return;
        if (!r.ok || !Array.isArray(r.methods)) {
          throw new Error((r as { error?: string }).error || "No se pudo cargar medios de pago");
        }
        setPaymentMethods(r.methods);
        if (r.methods.length > 0) {
          setSelectedFormaPago(r.methods[0].id);
        } else {
          setSelectedFormaPago(null);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadMethodsError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoadingMethods(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showPaymentMethodDialog, pendingOrderId, methodFetchNonce]);

  const selectedMethod: PagoparPaymentMethod | null = useMemo(() => {
    if (selectedFormaPago == null) return null;
    return paymentMethods.find((m) => m.id === selectedFormaPago) ?? null;
  }, [paymentMethods, selectedFormaPago]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;
    if (pendingOrderId) {
      setShowPaymentMethodDialog(true);
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

      setPendingOrderId(order.id);
      setShowPaymentMethodDialog(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al procesar el pedido");
    } finally {
      setLoading(false);
    }
  };

  const runCreatePaymentAndRedirect = async (formaPago: number) => {
    const oid = pendingOrderId;
    if (!oid) return;
    setPaying(true);
    setError(null);
    try {
      const payment = await api.createPayment(oid, { pagopar: { forma_pago: formaPago } });
      clearCart();
      setShowPaymentMethodDialog(false);
      setShowQrIntroDialog(false);
      setPendingOrderId(null);
      if (payment.paymentLink) {
        sessionStorage.setItem("tradexpar_order_id", oid);
        sessionStorage.setItem("tradexpar_payment_ref", payment.ref);
        window.location.href = payment.paymentLink;
      } else {
        navigate(`/success?order_id=${oid}&ref=${payment.ref}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar el pago con PagoPar");
    } finally {
      setPaying(false);
    }
  };

  const onClickContinuarPago = () => {
    if (selectedFormaPago == null || !selectedMethod) return;
    if (isPagoQrMethod(selectedMethod)) {
      setShowPaymentMethodDialog(false);
      setShowQrIntroDialog(true);
      return;
    }
    void runCreatePaymentAndRedirect(selectedFormaPago);
  };

  const onConfirmQrAndPay = () => {
    if (selectedFormaPago == null) return;
    void runCreatePaymentAndRedirect(selectedFormaPago);
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
              disabled={loading || items.length === 0}
              className="w-full min-h-12 flex items-center justify-center gap-2 px-6 py-3.5 sm:py-4 gradient-celeste text-white font-semibold rounded-xl hover:opacity-90 active:opacity-95 transition-opacity disabled:opacity-60 touch-manipulation"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Procesando...
                </>
              ) : (
                "Confirmar y pagar"
              )}
            </button>
          </div>
        </div>
      </form>

      {pendingOrderId && !showPaymentMethodDialog && (
        <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground max-w-5xl mx-auto lg:mx-0">
          <p>
            El pedido ya fue registrado. Completá el pago con PagoPar o{" "}
            <button
              type="button"
              className="text-primary font-semibold underline"
              onClick={() => setShowPaymentMethodDialog(true)}
            >
              abrí de nuevo el selector de medios
            </button>
            .
          </p>
        </div>
      )}

      <Dialog open={showPaymentMethodDialog} onOpenChange={setShowPaymentMethodDialog}>
        <DialogContent className="max-w-md max-h-[min(90vh,560px)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Cómo querés pagar
            </DialogTitle>
            <DialogDescription>
              Elegí un medio. Serás redirigido a PagoPar con el monto y datos del pedido.
            </DialogDescription>
          </DialogHeader>
          {loadingMethods ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground text-sm">
              <Loader2 className="h-5 w-5 animate-spin" />
              Cargando medios de pago…
            </div>
          ) : loadMethodsError ? (
            <div className="space-y-3">
              <p className="text-sm text-destructive">{loadMethodsError}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setLoadMethodsError(null);
                  setMethodFetchNonce((n) => n + 1);
                }}
              >
                Reintentar
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <ul className="space-y-2" role="radiogroup" aria-label="Método de pago PagoPar">
                {paymentMethods.map((m) => {
                  const active = selectedFormaPago === m.id;
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setSelectedFormaPago(m.id)}
                        className={`w-full text-left rounded-xl border p-3 transition-colors ${
                          active ? "border-primary ring-1 ring-primary/30 bg-primary/5" : "border-border/80 hover:bg-muted/40"
                        }`}
                      >
                        <p className="font-medium text-foreground">{m.title}</p>
                        {m.description ? <p className="text-xs text-muted-foreground mt-1 [text-wrap:balance]">{m.description}</p> : null}
                        <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
                          {m.min_amount != null && m.min_amount > 0 && <span>Mín. ₲{m.min_amount.toLocaleString("es-PY")}</span>}
                          {m.commission_percent != null && m.commission_percent > 0 && (
                            <span>Comisión: {m.commission_percent}%</span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {paymentMethods.length === 0 && (
                <p className="text-sm text-muted-foreground">No se recibieron medios de pago desde PagoPar.</p>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowPaymentMethodDialog(false)}
              disabled={paying}
            >
              Más tarde
            </Button>
            <Button
              type="button"
              className="gradient-celeste text-white"
              disabled={paying || selectedFormaPago == null || paymentMethods.length === 0}
              onClick={onClickContinuarPago}
            >
              {paying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin inline" />
                  Iniciando…
                </>
              ) : (
                "Continuar al pago"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showQrIntroDialog} onOpenChange={setShowQrIntroDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Finalizá tu transacción pagando con QR</DialogTitle>
            <DialogDescription className="text-foreground/90 [text-wrap:balance]">
              Vamos a abrir PagoPar para que completes el pago. Tené lista la app de tu billetera o banco para
              escanear el QR en la siguiente pantalla.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowQrIntroDialog(false);
                setShowPaymentMethodDialog(true);
              }}
              disabled={paying}
            >
              Volver
            </Button>
            <Button
              type="button"
              className="gradient-celeste text-white"
              onClick={onConfirmQrAndPay}
              disabled={paying}
            >
              {paying ? <Loader2 className="h-4 w-4 mr-2 animate-spin inline" /> : null}
              Ir a PagoPar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
