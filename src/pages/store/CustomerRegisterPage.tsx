import { useLayoutEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { toast } from "@/hooks/use-toast";
import { OAuthProviderButtons } from "@/components/store/OAuthProviderButtons";

export default function CustomerRegisterPage() {
  const navigate = useNavigate();
  const { register, loading, initializing, unlockInteractiveAuth } = useCustomerAuth();
  useLayoutEffect(() => {
    unlockInteractiveAuth();
  }, [unlockInteractiveAuth]);
  const authBusy = loading || initializing;
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const name = form.name.trim();
    const email = form.email.trim();
    const password = form.password;
    if (!name || !email || !password) {
      setError("Todos los campos son obligatorios. Completá nombre, correo y contraseña.");
      return;
    }
    if (initializing) {
      setError("Esperá a que termine de comprobarse la sesión (unos segundos) e intentá de nuevo.");
      return;
    }
    try {
      await register(name, email, password);
      toast({
        variant: "success",
        duration: 6500,
        title: (
          <span className="flex items-center gap-3 text-left">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)] ring-2 ring-primary/20 dark:shadow-none dark:ring-primary/30"
              aria-hidden
            >
              <CheckCircle2 className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <span className="text-base font-bold leading-snug tracking-tight text-foreground">
              ¡Listo! Tu cuenta está creada
            </span>
          </span>
        ),
        description:
          "Bienvenido a Tradexpar. Ya podés explorar el catálogo, comprar con confianza y guardar tus favoritos en un solo lugar.",
      });
      navigate("/account");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo registrar");
    }
  };

  return (
    <div className="container mx-auto px-4 py-10 max-w-md">
      <h1 className="text-2xl font-bold text-foreground mb-2">Registrarse</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Creá la cuenta con Google o Facebook, o completá el formulario (todos los campos son obligatorios en ese caso).
      </p>
      {initializing && (
        <p className="text-sm text-muted-foreground mb-4 flex items-center gap-2" role="status" aria-live="polite">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          Comprobando si ya tenés una sesión abierta…
        </p>
      )}

      <div className="bg-card border rounded-2xl p-6 space-y-5">
        <OAuthProviderButtons
          disabled={initializing}
          googleLabel="Registrarse con Google"
          facebookLabel="Registrarse con Facebook"
        />
        <div className="relative flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">o con correo</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <form
          onSubmit={handleSubmit}
          className="space-y-4"
          aria-describedby="register-required-hint"
        >
          <p id="register-required-hint" className="text-xs text-muted-foreground">
            Si elegís correo y contraseña, completá los tres campos; son obligatorios.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="register-name" className="block text-sm font-medium text-foreground">
              Nombre completo <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <input
              id="register-name"
              name="name"
              className="w-full px-4 py-2.5 rounded-xl border bg-background text-sm"
              type="text"
              autoComplete="name"
              required
              aria-required="true"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              disabled={authBusy}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="register-email" className="block text-sm font-medium text-foreground">
              Correo electrónico <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <input
              id="register-email"
              name="email"
              className="w-full px-4 py-2.5 rounded-xl border bg-background text-sm"
              type="email"
              autoComplete="email"
              required
              aria-required="true"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={authBusy}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="register-password" className="block text-sm font-medium text-foreground">
              Contraseña <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <input
              id="register-password"
              name="password"
              className="w-full px-4 py-2.5 rounded-xl border bg-background text-sm"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              aria-required="true"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              disabled={authBusy}
            />
            <p className="text-xs text-muted-foreground">Mínimo 6 caracteres (requisito habitual de seguridad).</p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button disabled={authBusy} className="w-full py-3 gradient-celeste text-white rounded-xl font-semibold">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Creando...
              </span>
            ) : initializing ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Preparando…
              </span>
            ) : (
              "Crear cuenta"
            )}
          </button>
        </form>
      </div>

      <p className="text-sm text-muted-foreground mt-4">
        ¿Ya tienes cuenta? <Link to="/login" className="text-primary">Inicia sesión</Link>
      </p>
    </div>
  );
}
