import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { CustomerUser } from "@/types";
import {
  clearOAuthReturnPending,
  isAdminLoginPath,
  isAdminPanelSignInBusy,
  isOAuthCallbackUrl,
  isOAuthReturnPending,
  tradexpar,
} from "@/services/tradexpar";
import { getSupabaseAuth, runAuthExclusive, setDataClientAccessToken } from "@/lib/supabaseClient";

interface CustomerAuthContextType {
  user: CustomerUser | null;
  loading: boolean;
  /** Hasta sincronizar la sesión de Supabase (p. ej. tras volver de Google/Facebook) */
  initializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const STORAGE_KEY = "tradexpar_customer_user";

/** Login/registro en la tienda (cliente): redes lentas u operaciones de Auth encoladas en el mismo navegador. No es el acceso al panel administrador. */
const CUSTOMER_CREDENTIAL_FLOW_TIMEOUT_MS = 45_000;

/** Evita iniciar signIn/signUp mientras `syncStoreCustomer` sigue en `initialize`/`getSession` (bloqueo mutuo del lock de GoTrue). */
const HYDRATE_WAIT_BEFORE_CREDENTIAL_MS = 22_000;

async function waitUntilInitialHydrateDone(
  initializingRef: React.MutableRefObject<boolean>,
  maxMs: number
): Promise<void> {
  const start = Date.now();
  while (initializingRef.current && Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 45));
  }
}

const CustomerAuthContext = createContext<CustomerAuthContextType | undefined>(undefined);

function loadStoredUser(): CustomerUser | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CustomerUser;
  } catch {
    return null;
  }
}

export function CustomerAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CustomerUser | null>(() => loadStoredUser());
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const initializingRef = useRef(true);
  useEffect(() => {
    initializingRef.current = initializing;
  }, [initializing]);
  /** Evita que onAuthStateChange vuelva a ejecutar syncStoreCustomer con sesión aún válida durante signOut(). */
  const logoutInProgressRef = useRef(false);
  /** Login/registro con email+contraseña: si syncStoreCustomer corre en paralelo con signIn/signUp, GoTrue puede bloquearse. */
  const credentialAuthInProgressRef = useRef(false);

  const persistUser = (next: CustomerUser | null) => {
    setUser(next);
    if (!next) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  };

  useEffect(() => {
    let cancelled = false;
    /** Si syncStoreCustomer o getSession colgaban, el catch hacía await getSession otra vez y nunca se ejecutaba finally → "Comprobando tu sesión" eterno. */
    const hydrateTimeoutMs = 12000;
    /** OAuth puede tardar (PKCE, red); si no hay tope, initialize/getSession puede colgar la UI. */
    const oauthHydrateTimeoutMs = 45000;

    const trySync = async () => {
      /** Misma pestaña en /admin/login: no llamar initialize/getSession de tienda (bloquea login del panel). */
      if (typeof window !== "undefined" && isAdminLoginPath()) {
        if (!cancelled) setInitializing(false);
        return;
      }
      const oauthFlow =
        typeof window !== "undefined" && (isOAuthCallbackUrl() || isOAuthReturnPending());
      const timeoutMs = oauthFlow ? oauthHydrateTimeoutMs : hydrateTimeoutMs;
      try {
        const synced = await Promise.race([
          tradexpar.syncStoreCustomer(),
          new Promise<CustomerUser | null>((_, rej) =>
            setTimeout(() => rej(new Error("hydrate_timeout")), timeoutMs)
          ),
        ]);
        if (cancelled) return;
        if (synced) persistUser(synced);
      } catch {
        clearOAuthReturnPending();
        /* timeout u error: onAuthStateChange puede completar el sync después. */
      } finally {
        if (!cancelled) setInitializing(false);
      }
    };

    void trySync();

    const { data: { subscription } } = getSupabaseAuth().auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        persistUser(null);
        return;
      }
      if (logoutInProgressRef.current) return;
      if (!session?.user) return;
      /** No competir con signInWithPassword / signUp: el flujo ya persiste el usuario al terminar. */
      if (credentialAuthInProgressRef.current && event === "SIGNED_IN") {
        return;
      }
      if (typeof window !== "undefined" && isAdminLoginPath()) return;
      if (isAdminPanelSignInBusy()) return;
      /** USER_UPDATED: metadatos/identidades OAuth tras redirect. */
      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "USER_UPDATED"
      ) {
        try {
          const synced = await tradexpar.syncStoreCustomer();
          if (synced) persistUser(synced);
        } catch {
          /* RLS u otro error: el usuario puede seguir en Auth sin fila customers */
        }
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    await waitUntilInitialHydrateDone(initializingRef, HYDRATE_WAIT_BEFORE_CREDENTIAL_MS);
    credentialAuthInProgressRef.current = true;
    setLoading(true);
    try {
      const response = await Promise.race([
        tradexpar.customerLogin({ email, password }),
        new Promise<never>((_, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(
                  "El inicio de sesión tardó demasiado. Revisá tu conexión; si tenés esta tienda abierta en varias pestañas, cerrá las demás y volvé a intentar."
                )
              ),
            CUSTOMER_CREDENTIAL_FLOW_TIMEOUT_MS
          );
        }),
      ]);
      /** Evita carrera: navigate(/account) antes de que exista user en contexto → redirect a /login. */
      flushSync(() => {
        persistUser(response.user);
      });
    } finally {
      credentialAuthInProgressRef.current = false;
      setLoading(false);
    }
  };

  const register = async (name: string, email: string, password: string) => {
    await waitUntilInitialHydrateDone(initializingRef, HYDRATE_WAIT_BEFORE_CREDENTIAL_MS);
    credentialAuthInProgressRef.current = true;
    setLoading(true);
    try {
      const response = await Promise.race([
        tradexpar.customerRegister({ name, email, password }),
        new Promise<never>((_, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(
                  "El registro tardó demasiado. Revisá tu conexión; si tenés esta tienda abierta en varias pestañas, cerrá las demás y volvé a intentar."
                )
              ),
            CUSTOMER_CREDENTIAL_FLOW_TIMEOUT_MS
          );
        }),
      ]);
      flushSync(() => {
        persistUser(response.user);
      });
    } finally {
      credentialAuthInProgressRef.current = false;
      setLoading(false);
    }
  };

  const logout = async () => {
    logoutInProgressRef.current = true;
    clearOAuthReturnPending();
    setDataClientAccessToken(null);
    flushSync(() => {
      persistUser(null);
    });
    /**
     * Encolar con el mismo `runAuthExclusive` que `signInWithOAuth`: evita carrera con un nuevo
     * inicio (p. ej. Facebook) justo después de cerrar sesión, que dejaba el flujo colgado.
     * No await: la UI ya quedó limpia; signOut sigue en la cola.
     */
    void runAuthExclusive(() => getSupabaseAuth().auth.signOut({ scope: "local" })).finally(() => {
      logoutInProgressRef.current = false;
    });
  };

  const value = useMemo(
    () => ({ user, loading, initializing, login, register, logout }),
    [user, loading, initializing]
  );

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth() {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error("useCustomerAuth must be used within CustomerAuthProvider");
  return ctx;
}
