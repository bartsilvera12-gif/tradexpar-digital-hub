import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Send, Wallet, Tag, Rocket, LayoutDashboard, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useAffiliatePortalLinkVisible } from "@/hooks/useAffiliatePortalLinkVisible";
import { DDI } from "@/lib/ddiLabels";
import { affiliatesAvailable, submitAffiliateRequest } from "@/services/affiliateTradexparService";

export default function AffiliateApplyPage() {
  const { user } = useCustomerAuth();
  const showAffiliatePanel = useAffiliatePortalLinkVisible(user?.id);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    document_id: "",
    message: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!affiliatesAvailable()) {
      toast.error(`El ${DDI.programa} no está configurado (Supabase).`);
      return;
    }
    if (!form.full_name.trim() || !form.email.trim()) {
      toast.error("Nombre y correo son obligatorios.");
      return;
    }
    setLoading(true);
    try {
      await submitAffiliateRequest({
        full_name: form.full_name,
        email: form.email,
        phone: form.phone || undefined,
        document_id: form.document_id || undefined,
        message: form.message || undefined,
      });
      toast.success(
        "Solicitud enviada. Cuando te aprueben, creá cuenta o entrá con el mismo correo en la tienda para abrir el panel."
      );
      setForm({ full_name: "", email: "", phone: "", document_id: "", message: "" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No se pudo enviar la solicitud.");
    } finally {
      setLoading(false);
    }
  };

  const beneficios = [
    {
      icon: Wallet,
      title: "Ganá comisiones",
      desc: "Cobrás una comisión por cada venta que llegue con tu enlace. Sin tope.",
    },
    {
      icon: Tag,
      title: "Beneficio para tus clientes",
      desc: "Quien compra con tu enlace accede a un precio especial. Todos ganan.",
    },
    {
      icon: Rocket,
      title: "Sin inversión ni stock",
      desc: "No comprás mercadería ni manejás envíos. Trabajás 100% online.",
    },
    {
      icon: LayoutDashboard,
      title: "Tu propio panel",
      desc: "Seguí tus ventas, comisiones y enlaces desde un panel personal.",
    },
  ];

  const pasos = [
    { n: 1, title: "Completá el formulario", desc: "Dejanos tus datos acá abajo. Toma un minuto." },
    { n: 2, title: "Te aprobamos", desc: "Revisamos tu solicitud y te damos tu código único." },
    { n: 3, title: "Compartí tus enlaces", desc: "Usás tu enlace con ?ref=tu_codigo en redes, WhatsApp, donde quieras." },
    { n: 4, title: "Ganá por cada compra", desc: "Cada venta con tu enlace suma tu comisión." },
  ];

  return (
    <div className="container mx-auto px-4 py-12 sm:py-16 max-w-5xl">
      {/* Intro */}
      <div className="text-center max-w-2xl mx-auto">
        <span className="inline-block px-3.5 py-1.5 rounded-full text-[0.7rem] sm:text-xs font-semibold tracking-widest uppercase gradient-celeste text-primary-foreground mb-4">
          {DDI.singular}
        </span>
        <h1 className="text-[clamp(1.6rem,4vw+0.4rem,3rem)] font-bold text-foreground leading-tight [text-wrap:balance] mb-3">
          Sumate y ganá compartiendo lo que ya te gusta
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base [text-wrap:balance]">
          Convertite en Distribuidor Digital Independiente de Tradexpar: compartís tus enlaces y
          cobrás una comisión por cada venta. Sin invertir ni manejar stock.
        </p>
        <a
          href="#solicitud"
          className="mt-6 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-primary-foreground gradient-celeste shadow-brand transition-opacity hover:opacity-90"
        >
          Quiero sumarme
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>

      {/* Beneficios */}
      <div className="mt-12 sm:mt-16">
        <h2 className="text-center text-xl sm:text-2xl font-bold text-foreground mb-6 sm:mb-8">
          ¿Por qué sumarte?
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <Label htmlFor="full_name">Nombre completo</Label>
            <Input
              id="full_name"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Correo</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Teléfono</Label>
            <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="document_id">Documento de identidad</Label>
            <Input
              id="document_id"
              value={form.document_id}
              onChange={(e) => setForm({ ...form, document_id: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="message">Mensaje (opcional)</Label>
            <Textarea
              id="message"
              rows={3}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />
          </div>
          <Button type="submit" className="w-full gradient-celeste" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Enviar solicitud
          </Button>
        </form>
      )}
      </div>
    </div>
  );
}
