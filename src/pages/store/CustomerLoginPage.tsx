import { useLayoutEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { toast } from "@/hooks/use-toast";
import { OAuthProviderButtons } from "@/components/store/OAuthProviderButtons";

export default function CustomerLoginPage() {
  const navigate = useNavigate();
  const { login, loading, initializing, unlockInteractiveAuth } = useCustomerAuth();
  /** Si venís de otra ruta con `initializing` en true, la pantalla de clientes no debe quedar bloqueada por hidratación global. */
  useLayoutEffect(() => {
    unlockInteractiveAuth();
  }, [unlockInteractiveAuth]);
  const authBusy = loading || initializing;
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const email = form.email.trim();
    const password = form.password;
    if (!email || !password) {
      setError("Completá el correo y la contraseña; son obligatorios.");
      return;
    }
    if (initializing) {
      toast({
        variant: "default",
        title: "Esperá un momento",
        description: "Se está comprobando tu sesión en segundo plano. Intentá de nuevo en unos segundos.",
      });
      return;
    }
    try {
      await login(email, password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "No se pudo iniciar sesión";
      setError(msg);
      toast({
        variant: "destructive",
        title: "No se pudo iniciar sesión",
        description: msg,
      });
      return;
    }
    try {
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
            <span className="text-base font-bold leading-snug tracking-tight text-foreground">Sesión iniciada</span>
          </span>
        ),
        description: "Sesión iniciada con éxito",
      });
    } catch {
      /* El toast no debe impedir entrar a la cuenta */
    }
    navigate("/account");
  };

  return (
    <div className="container mx-auto px-4 py-10 max-w-md">
      <h1 className="text-2xl font-bold text-foreground mb-2">Iniciar sesión</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Podés entrar con Google o Facebook, o con correo y contraseña (campos obligatorios en ese caso).
      </p>
      {initializing && (
        <p className="text-sm text-muted-foreground mb-4 flex items-center gap-2" role="status" aria-live="polite">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          Comprobando si ya tenés una sesión abierta…
        </p>
      )}

      <div className="bg-card border rounded-2xl p-6 space-y-5">
        <OAuthProviderButtons disabled={initializing} />
        <div className="relative flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">o con correo</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="login-email" className="block text-sm font-medium text-foreground">
              Correo electrónico <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <input
              id="login-email"
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
            <label htmlFor="login-password" className="block text-sm font-medium text-foreground">
              Contraseña <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <input
              id="login-password"
              className="w-full px-4 py-2.5 rounded-xl border bg-background text-sm"
              type="password"
              autoComplete="current-password"
              required
              aria-required="true"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              disabled={authBusy}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button disabled={authBusy} className="w-full py-3 gradient-celeste text-white rounded-xl font-semibold">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Ingresando...
              </span>
            ) : initializing ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Preparando…
              </span>
            ) : (
              "Ingresar"
            )}
          </button>
        </form>
      </div>

      <p className="text-sm text-muted-foreground mt-4">
        ¿No tienes cuenta? <Link to="/register" className="text-primary">Regístrate</Link>
      </p>
    </div>
  );
}
