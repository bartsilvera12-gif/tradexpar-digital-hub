import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Send, Percent, CalendarClock, Package, LayoutDashboard, Gift, Flame, ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useAffiliatePortalLinkVisible } from "@/hooks/useAffiliatePortalLinkVisible";
import { DDI } from "@/lib/ddiLabels";
import { affiliatesAvailable, submitAffiliateRequest } from "@/services/affiliateTradexparService";

/** Estilo de los <select> nativos, alineado al Input de la UI. */
const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export default function AffiliateApplyPage() {
  const { user } = useCustomerAuth();
  const showAffiliatePanel = useAffiliatePortalLinkVisible(user?.id);
  const [loading, setLoading] = useState(false);
  const emptyForm = {
    razon_social: "",
    email: "",
    phone: "",
    cedula: "",
    ruc: "",
    ciudad: "",
    instagram: "",
    como_vende: "",
    motivo: "",
  };
  const [form, setForm] = useState(emptyForm);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!affiliatesAvailable()) {
      toast.error(`El ${DDI.programa} no está configurado (Supabase).`);
      return;
    }
    if (!form.razon_social.trim() || !form.email.trim()) {
      toast.error("Razón social y correo son obligatorios.");
      return;
    }
    setLoading(true);
    try {
      const fullName = form.razon_social.trim();
      // Los campos extra (que el backend aún no guarda por columna) van en el mensaje,
      // así el admin los recibe sin necesidad de migrar la base.
      const extras = [
        form.ruc.trim() && `RUC: ${form.ruc.trim()}`,
        form.ciudad.trim() && `Ciudad: ${form.ciudad.trim()}`,
        form.instagram.trim() && `Instagram: ${form.instagram.trim()}`,
        form.como_vende && `¿Cómo planea vender?: ${form.como_vende}`,
        "Método de cobro: Transferencia bancaria",
        form.motivo.trim() && `Motivo: ${form.motivo.trim()}`,
      ]
        .filter(Boolean)
        .join("\n");
      await submitAffiliateRequest({
        full_name: fullName,
        email: form.email,
        phone: form.phone || undefined,
        document_id: form.cedula || undefined,
        message: extras || undefined,
      });
      toast.success(
        "Solicitud enviada. Cuando te aprueben, creá cuenta o entrá con el mismo correo en la tienda para abrir el panel."
      );
      setForm(emptyForm);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No se pudo enviar la solicitud.");
    } finally {
      setLoading(false);
    }
  };

  const beneficios = [
    {
      icon: Percent,
      title: "Bonificación de hasta 10%",
      desc: "Ganás hasta el 10% por cada venta efectiva con tu enlace, según la categoría del producto. Sin tope.",
    },
    {
      icon: CalendarClock,
      title: "Pagos quincenales",
      desc: "Cobrás tus bonificaciones 2 veces al mes, por transferencia a tu cuenta bancaria.",
    },
    {
      icon: Package,
      title: "+1.000 productos seleccionados",
      desc: "Catálogo curado respaldado por +28.000 unidades en stock, con descuentos exclusivos para tus clientes.",
    },
    {
      icon: LayoutDashboard,
      title: "Panel D2",
      desc: "Seguí tus ventas, bonificaciones y tu ranking D2 en tiempo real.",
    },
    {
      icon: Gift,
      title: "Caja TRADEXPAR Selection",
      desc: "Los D2 seleccionados reciben cada mes una caja con un producto nuevo que se suma a su catálogo.",
    },
    {
      icon: Flame,
      title: "Productos virales",
      desc: "Acceso a la sección de productos en tendencia en redes, listos para que los promociones.",
    },
  ];

  const pasos = [
    { n: 1, title: "Solicitá tu acceso", desc: "Completá el formulario. Revisamos y aprobamos tu solicitud para activarte como D2." },
    { n: 2, title: "Recibí tu enlace", desc: "Obtenés un enlace único con seguimiento automático sobre +1.000 productos." },
    { n: 3, title: "Compartí y vendé", desc: "Promocioná los productos en tus redes y contactos." },
    { n: 4, title: "Cobrá tu bonificación", desc: "Recibí hasta el 10% por cada venta confirmada, quincenalmente." },
  ];

  const bonificacion = [
    "Hasta 10% por venta efectiva y pagada (según categoría)",
    "Pagos quincenales (2 veces al mes) por transferencia",
    "Panel D2 con el detalle de tus bonificaciones",
    "Sin tope de ganancias",
    "12 cuotas sin intereses para tus clientes (ueno bank)",
    "Requisito: emitir factura legal electrónica para cobrar",
  ];

  return (
    <div className="container mx-auto px-4 py-12 sm:py-16 max-w-5xl">
      {/* Intro */}
      <div className="text-center max-w-2xl mx-auto">
        <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[0.7rem] sm:text-xs font-semibold tracking-widest uppercase gradient-celeste text-primary-foreground mb-4">
          ⚡ Powered by ueno bank · 12 cuotas sin intereses
        </span>
        <h1 className="text-[clamp(1.6rem,4vw+0.4rem,3rem)] font-bold text-foreground leading-tight [text-wrap:balance] mb-3">
          D2 by Tradexpar — <span className="text-gradient">Ingresos al cuadrado</span>
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base [text-wrap:balance]">
          D2 (D al cuadrado) = Distribuidores Digitales. Ganá hasta el <strong className="text-foreground">10% de bonificación</strong> por
          cada venta con tu enlace personalizado. No es colaboración, es negocio: promocioná
          tecnología premium y generá ingresos reales desde cualquier lugar.
        </p>
        <a
          href="#solicitud"
          className="mt-6 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-primary-foreground gradient-celeste shadow-brand transition-opacity hover:opacity-90"
        >
          Quiero ser D2
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>

      {/* Beneficios */}
      <div className="mt-12 sm:mt-16">
        <h2 className="text-center text-xl sm:text-2xl font-bold text-foreground mb-6 sm:mb-8">
          ¿Por qué ser D2?
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {beneficios.map((b) => (
            <div
              key={b.title}
              className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-xl gradient-celeste text-primary-foreground mb-4">
                <b.icon className="h-6 w-6" />
              </span>
              <h3 className="font-bold text-foreground mb-1.5">{b.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Cómo funciona */}
      <div className="mt-12 sm:mt-16">
        <h2 className="text-center text-xl sm:text-2xl font-bold text-foreground mb-6 sm:mb-8">
          Cómo funciona
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pasos.map((p) => (
            <div key={p.n} className="relative rounded-2xl border border-border bg-muted/20 p-5 sm:p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold mb-3">
                {p.n}
              </span>
              <h3 className="font-bold text-foreground mb-1.5">{p.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Bonificación + ejemplo */}
      <div className="mt-12 sm:mt-16 grid gap-5 lg:grid-cols-[1fr,auto] lg:items-stretch">
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-7 shadow-sm">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-1">
            Bonificación de hasta <span className="text-gradient">10%</span>
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Por cada venta efectiva y pagada a través de tu enlace. El porcentaje varía según la
            categoría del producto.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {bonificacion.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Ejemplo de monetización */}
        <div className="rounded-2xl gradient-hero text-primary-foreground p-6 sm:p-7 flex flex-col justify-center lg:min-w-[260px]">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-foreground/60 mb-3">
            Ejemplo de monetización
          </p>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-primary-foreground/60">Venta mensual</p>
              <p className="text-lg font-bold">₲ 30.000.000</p>
            </div>
            <div>
              <p className="text-xs text-primary-foreground/60">Tu bonificación (hasta 10%)</p>
              <p className="text-2xl font-extrabold text-gradient">₲ 3.000.000</p>
            </div>
            <div>
              <p className="text-xs text-primary-foreground/60">Estimado anual</p>
              <p className="text-lg font-bold">₲ 36.000.000</p>
            </div>
          </div>
          <p className="mt-4 text-[0.7rem] text-primary-foreground/50 leading-relaxed">
            Cifras de ejemplo, no garantizadas. Dependen de tus ventas y de la categoría.
          </p>
        </div>
      </div>

      {/* Formulario */}
      <div id="solicitud" className="mt-12 sm:mt-16 max-w-lg mx-auto scroll-mt-24">
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Completá tu solicitud</h2>
        <p className="text-muted-foreground text-sm mb-4">
          Revisamos cada solicitud y, si es aprobada, recibís un código único para compartir
          enlaces con <code className="text-xs bg-muted px-1 rounded">?ref=tu_codigo</code>.
        </p>
      <div className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground mb-6 space-y-2">
        <p>
          Este formulario <strong className="text-foreground font-medium">no crea una cuenta ni contraseña</strong> en la
          tienda. Para entrar al panel del {DDI.singularLower} después, necesitás{" "}
          <Link to="/register" className="text-primary font-medium underline-offset-4 hover:underline">
            registrarte
          </Link>{" "}
          o{" "}
          <Link to="/login" className="text-primary font-medium underline-offset-4 hover:underline">
            iniciar sesión
          </Link>{" "}
          con el <strong className="text-foreground font-medium">mismo correo</strong> que pongas acá (así el sistema te
          reconoce).
        </p>
      </div>
      {showAffiliatePanel ? (
        <p className="text-sm text-muted-foreground mb-8">
          {`¿Tenés solicitud pendiente o ya sos ${DDI.singularLower}? `}
          <Link to="/afiliados/panel" className="text-primary font-medium underline-offset-4 hover:underline">
            Ir al panel
          </Link>
        </p>
      ) : null}

      {!affiliatesAvailable() ? (
        <p className="text-sm text-destructive">Por el momento no se aceptan solicitudes en línea.</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="razon_social">Razón social</Label>
            <Input
              id="razon_social"
              placeholder="Nombre y apellido tal como figura en tu registro legal"
              value={form.razon_social}
              onChange={(e) => setForm({ ...form, razon_social: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">WhatsApp / Teléfono</Label>
            <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cedula">Cédula de identidad</Label>
              <Input
                id="cedula"
                value={form.cedula}
                onChange={(e) => setForm({ ...form, cedula: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ruc">RUC</Label>
              <Input id="ruc" value={form.ruc} onChange={(e) => setForm({ ...form, ruc: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ciudad">Ciudad (Paraguay)</Label>
            <Input id="ciudad" value={form.ciudad} onChange={(e) => setForm({ ...form, ciudad: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="instagram">Link de perfil de Instagram</Label>
            <Input
              id="instagram"
              placeholder="https://instagram.com/tu_usuario"
              value={form.instagram}
              onChange={(e) => setForm({ ...form, instagram: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="como_vende">¿Cómo planeás vender?</Label>
            <select
              id="como_vende"
              value={form.como_vende}
              onChange={(e) => setForm({ ...form, como_vende: e.target.value })}
              className={selectClass}
            >
              <option value="">Seleccioná una opción</option>
              <option>Redes sociales</option>
              <option>WhatsApp</option>
              <option>Sitio web propio</option>
              <option>Presencial</option>
              <option>Otro</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Método de cobro</Label>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              Los pagos a los D2 se realizan únicamente por{" "}
              <strong className="text-foreground font-medium">transferencia bancaria</strong>.
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="motivo">¿Por qué querés ser D2? (opcional)</Label>
            <Textarea
              id="motivo"
              rows={3}
              value={form.motivo}
              onChange={(e) => setForm({ ...form, motivo: e.target.value })}
            />
          </div>
          <Button type="submit" className="w-full gradient-celeste" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Quiero ser D2
          </Button>
        </form>
      )}
      </div>
    </div>
  );
}
