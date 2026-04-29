import { useState } from "react";
import { Loader2 } from "lucide-react";
import { tradexpar } from "@/services/tradexpar";
import { toast } from "@/hooks/use-toast";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

type Props = {
  /** Texto del botón de Google */
  googleLabel?: string;
  /** Texto del botón de Facebook */
  facebookLabel?: string;
  /** p. ej. mientras `CustomerAuth` hidrata la sesión: evita competir con getSession/initialize de GoTrue */
  disabled?: boolean;
};

export function OAuthProviderButtons({
  googleLabel = "Continuar con Google",
  facebookLabel = "Continuar con Facebook",
  disabled: hydrateDisabled = false,
}: Props) {
  const [busy, setBusy] = useState<"google" | "facebook" | null>(null);

  const start = async (provider: "google" | "facebook") => {
    setBusy(provider);
    /** Red lenta o cold start del Auth en api.neura.com.py; la cola ya no bloquea OAuth. */
    const timeoutMs = 45_000;
    try {
      const { url } = await Promise.race([
        tradexpar.customerOAuthStart(provider),
        new Promise<{ url: string }>((_, rej) =>
          setTimeout(() => rej(new Error("La solicitud tardó demasiado. Revisá tu conexión.")), timeoutMs)
        ),
      ]);
      if (!url) throw new Error("No se recibió la URL de inicio de sesión.");
      window.location.assign(url);
    } catch (e: unknown) {
      setBusy(null);
      const msg = e instanceof Error ? e.message : "Intentá de nuevo en unos segundos.";
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const fbMetaHint =
        provider === "facebook"
          ? " En Meta (developers.facebook.com): Casos de uso → Autenticación y creación de cuenta → que public_profile y email estén «Listos para pruebas». Sin email, Facebook muestra «Invalid Scopes: email»."
          : "";
      toast({
        title: "No se pudo conectar con el proveedor",
        description: `${msg} En Supabase (Authentication → Providers) activá ${provider === "google" ? "Google" : "Facebook"} y en Redirect URLs incluí ${origin}/account.${fbMetaHint}`,
      });
    }
  };

  return (
    <div className="grid grid-cols-1 gap-3">
      <button
        type="button"
        disabled={hydrateDisabled || busy !== null}
        onClick={() => void start("google")}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#747775] bg-white px-4 py-3 text-sm font-medium text-[#1f1f1f] shadow-sm transition-colors hover:bg-[#f8f9fa] disabled:opacity-60"
      >
        {busy === "google" ? (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#5f6368]" />
        ) : (
          <GoogleIcon className="h-5 w-5 shrink-0" />
        )}
        {googleLabel}
      </button>
      <button
        type="button"
        disabled={hydrateDisabled || busy !== null}
        onClick={() => void start("facebook")}
        className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#1877F2] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#166fe5] disabled:opacity-60"
      >
        {busy === "facebook" ? (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-white" />
        ) : (
          <FacebookIcon className="h-5 w-5 shrink-0 text-white" />
        )}
        {facebookLabel}
      </button>
    </div>
  );
}
