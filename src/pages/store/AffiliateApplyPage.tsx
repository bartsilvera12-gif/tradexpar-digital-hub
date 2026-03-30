import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useAffiliatePortalLinkVisible } from "@/hooks/useAffiliatePortalLinkVisible";
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
      toast.error("El programa de afiliados no está configurado (Supabase).");
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

  return (
    <div className="container mx-auto px-4 py-16 max-w-lg">
      <h1 className="text-3xl font-bold text-foreground mb-2">Ser afiliado</h1>
      <p className="text-muted-foreground text-sm mb-4">
        Completá el formulario. Revisamos cada solicitud y, si es aprobada, recibís un código único para compartir
        enlaces con <code className="text-xs bg-muted px-1 rounded">?ref=tu_codigo</code>.
      </p>
      <div className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground mb-6 space-y-2">
        <p>
          Este formulario <strong className="text-foreground font-medium">no crea una cuenta ni contraseña</strong> en la
          tienda. Para entrar al panel de afiliado después, necesitás{" "}
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
          ¿Tenés solicitud pendiente o ya sos afiliado?{" "}
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
  );
}
