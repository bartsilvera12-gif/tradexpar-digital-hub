import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { Loader } from "@/components/shared/Loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseAuth, runAuthExclusive } from "@/lib/supabaseClient";
import { isOAuthCallbackUrl, isOAuthReturnPending, tradexpar } from "@/services/tradexpar";

import type { CustomerUser } from "@/types";
import { allowsPasswordFromCustomerProvider } from "@/lib/customerPasswordPolicy";

/** Si no hay `provider` en fila customers, inferir desde identidades de Auth (OAuth sin identity `email`). */
function allowsPasswordFromAuthIdentities(user: User | null): boolean {
  const ids = user?.identities ?? [];
  if (ids.length === 0) return true;
  const hasEmail = ids.some((i) => i.provider === "email");
  if (hasEmail) return true;
  const oauthOnly = ids.some((i) => i.provider === "google" || i.provider === "facebook");
  return !oauthOnly;
}

const CUSTOMER_STORAGE_KEY = "tradexpar_customer_user";

function readStoredCustomer(): CustomerUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CUSTOMER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CustomerUser;
  } catch {
    return null;
  }
}

function formatCooldownRemaining(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min ${s} s`;
  return `${s} s`;
}

export default function CustomerAccountPage() {
  const { user, logout, initializing } = useCustomerAuth();
  /** Respaldo si hubo carrera entre navigate y el estado del contexto. */
  const effectiveUser = user ?? readStoredCustomer();

  /** Si ya hay usuario (p. ej. login recién hecho), no bloquear por la hidratación en segundo plano. */
  if (effectiveUser) {
    return (
      <AccountContent user={effectiveUser} onLogout={() => void logout()} authHydrating={initializing} />
    );
  }

  /**
   * No redirigir a /login mientras la URL sigue siendo el callback OAuth: si Navigate corre antes
   * de que GoTrue procese el hash, se pierde el token y la sesión nunca se registra.
   */
  if (isOAuthCallbackUrl() || isOAuthReturnPending()) {
    return (
      <div className="container mx-auto px-4 py-10 max-w-2xl">
        <Loader text="Completando inicio de sesión..." />
      </div>
    );
  }

  if (initializing) {
    return (
      <div className="container mx-auto px-4 py-10 max-w-2xl">
        <Loader text="Comprobando tu sesión..." />
      </div>
    );
  }

  return <Navigate to="/login" replace />;
}

function AccountContent({
  user,
  onLogout,
  authHydrating,
}: {
  user: CustomerUser;
  onLogout: () => void;
  /** Evita competir con `syncStoreCustomer` por el lock de GoTrue al cargar estado de contraseña. */
  authHydrating: boolean;
}) {
  const [pwStatus, setPwStatus] = useState<{
    can_change: boolean;
    reason?: string;
    next_change_after?: string;
  } | null>(null);
  const [pwLoading, setPwLoading] = useState(true);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [tick, setTick] = useState(0);
  const [allowsPasswordSection, setAllowsPasswordSection] = useState<boolean | null>(() =>
    allowsPasswordFromCustomerProvider(user.provider)
  );

  /** Sin `provider` en customers (o valor desconocido): inferir desde JWT. Usa cola exclusiva + getSession (evita getUser colgado por lock de GoTrue). */
  useEffect(() => {
    if (allowsPasswordSection !== null) return;
    let cancelled = false;
    const SESSION_TIMEOUT_MS = 12_000;

    void runAuthExclusive(async () => {
      try {
        const { data, error } = await Promise.race([
          getSupabaseAuth().auth.getSession(),
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error("session_timeout")), SESSION_TIMEOUT_MS)
          ),
        ]);
        if (cancelled) return;
        if (error) {
          setAllowsPasswordSection(allowsPasswordFromCustomerProvider(user.provider) ?? true);
          return;
        }
        setAllowsPasswordSection(allowsPasswordFromAuthIdentities(data.session?.user ?? null));
      } catch {
        if (!cancelled) {
          setAllowsPasswordSection(allowsPasswordFromCustomerProvider(user.provider) ?? true);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [allowsPasswordSection, user.id, user.provider]);

  const loadPwStatus = useCallback(() => {
    setPwLoading(true);
    tradexpar
      .customerPasswordChangeStatus()
      .then(setPwStatus)
      .catch((e) => {
        const msg = e instanceof Error ? e.message : "Error";
        if (/PGRST202|does not exist|Could not find|schema cache|customer_password_change_status/i.test(msg)) {
          setPwStatus({ can_change: false, reason: "rpc_missing" });
        } else {
          toast.error(msg);
          setPwStatus({ can_change: false, reason: "load_error" });
        }
      })
      .finally(() => setPwLoading(false));
  }, []);

  useEffect(() => {
    if (authHydrating) return;
    if (allowsPasswordSection !== true) {
      if (allowsPasswordSection === false) setPwLoading(false);
      return;
    }
    void loadPwStatus();
  }, [loadPwStatus, user.id, authHydrating, allowsPasswordSection]);

  const inCooldown =
    pwStatus?.can_change === false &&
    pwStatus?.reason === "cooldown" &&
    Boolean(pwStatus?.next_change_after);

  useEffect(() => {
    if (!inCooldown || !pwStatus?.next_change_after) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [inCooldown, pwStatus?.next_change_after]);

  useEffect(() => {
    if (!inCooldown || !pwStatus?.next_change_after) return;
    const ms = new Date(pwStatus.next_change_after).getTime() - Date.now();
    if (ms <= 0) void loadPwStatus();
  }, [tick, inCooldown, pwStatus?.next_change_after, loadPwStatus]);

  const savePassword = async () => {
    const a = pw1.trim();
    const b = pw2.trim();
    if (a.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (a !== b) {
      toast.error("Las contraseñas no coinciden.");
      return;
    }
    setPwSaving(true);
    try {
      await tradexpar.customerChangeOwnPassword(a);
      toast.success("Contraseña actualizada. Recordá usarla en el próximo inicio de sesión.");
      setPw1("");
      setPw2("");
      await loadPwStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar.");
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-10 max-w-2xl">
      <h1 className="text-3xl font-bold text-foreground mb-6">Mi cuenta</h1>
      <div className="bg-card border rounded-2xl p-6 space-y-3">
        <p className="text-sm text-muted-foreground">Nombre</p>
        <p className="font-semibold text-foreground">{user.name}</p>
        <p className="text-sm text-muted-foreground mt-3">Email</p>
        <p className="font-semibold text-foreground">{user.email}</p>

        {allowsPasswordSection === null && (
          <p className="text-sm text-muted-foreground border-t border-border pt-6 mt-6">
            Comprobando si podés usar contraseña en esta cuenta…
          </p>
        )}

        {allowsPasswordSection === false && (
          <div className="border-t border-border pt-6 mt-6 space-y-2">
            <h2 className="text-lg font-semibold text-foreground">Contraseña</h2>
            <p className="text-sm text-muted-foreground">
              Esta cuenta inició sesión con <span className="font-medium text-foreground">Google o Facebook</span> (o no
              tiene contraseña propia en la tienda). El cambio de clave se hace desde la seguridad de esa cuenta (Google /
              Meta), no desde esta página.
            </p>
          </div>
        )}

        {allowsPasswordSection === true && (
          <div className="border-t border-border pt-6 mt-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Contraseña</h2>
            {pwLoading ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : pwStatus?.reason === "rpc_missing" ? (
              <p className="text-sm text-muted-foreground">
                El cambio de contraseña con cooldown no está disponible hasta que se ejecute en la base el archivo{" "}
                <code className="text-xs rounded bg-muted px-1">supabase/tradexpar_customer_own_password.sql</code>.
              </p>
            ) : pwStatus?.reason === "no_customer" ? (
              <p className="text-sm text-muted-foreground">
                No encontramos tu perfil de tienda vinculado a esta sesión.
              </p>
            ) : pwStatus?.reason === "not_authenticated" ? (
              <p className="text-sm text-muted-foreground">
                La sesión de acceso no llegó al servidor. Cerrá sesión y volvé a iniciar sesión. Si sigue igual, probá en
                una ventana privada solo para este sitio.
              </p>
            ) : pwStatus?.reason === "load_error" ? (
              <p className="text-sm text-muted-foreground">
                Hubo un error de red o del servidor al consultar el estado. Reintentá en unos segundos o recargá la
                página.
              </p>
            ) : pwStatus?.reason === "unknown_response" ? (
              <p className="text-sm text-muted-foreground">
                La respuesta del servidor no es la esperada. Recargá la página o contactá soporte si sigue igual.
              </p>
            ) : inCooldown && pwStatus?.next_change_after ? (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Por seguridad, solo podés cambiar la contraseña{" "}
                  <span className="font-medium text-foreground">una vez cada 24 horas</span>.
                </p>
                <p>
                  Próximo cambio posible:{" "}
                  <span className="font-medium text-foreground">
                    {new Date(pwStatus.next_change_after).toLocaleString("es-PY")}
                  </span>
                </p>
                <p className="text-xs">
                  Tiempo restante:{" "}
                  <span className="font-mono text-foreground tabular-nums">
                    {formatCooldownRemaining(pwStatus.next_change_after) || "…"}
                  </span>
                </p>
              </div>
            ) : pwStatus?.can_change ? (
              <div className="space-y-3 max-w-md">
                <p className="text-xs text-muted-foreground">
                  Elegí una contraseña segura. Después de guardar, tendrás que esperar 24 horas para volver a
                  cambiarla.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="acct-pw1">Nueva contraseña</Label>
                  <Input
                    id="acct-pw1"
                    type="password"
                    autoComplete="new-password"
                    value={pw1}
                    onChange={(e) => setPw1(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acct-pw2">Repetir contraseña</Label>
                  <Input
                    id="acct-pw2"
                    type="password"
                    autoComplete="new-password"
                    value={pw2}
                    onChange={(e) => setPw2(e.target.value)}
                  />
                </div>
                <Button type="button" onClick={() => void savePassword()} disabled={pwSaving}>
                  {pwSaving ? "Guardando…" : "Actualizar contraseña"}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No se pudo cargar el estado del cambio de contraseña.</p>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onLogout}
          className="mt-6 px-4 py-2 rounded-lg border text-sm hover:bg-muted/50"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
