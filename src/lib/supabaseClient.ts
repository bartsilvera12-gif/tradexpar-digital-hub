import { createClient, type SupabaseClient } from "@supabase/supabase-js";



/**

 * Dos clientes:

 * - Auth: GoTrue (sesión en localStorage, OAuth, login tienda/admin).

 * - Datos: PostgREST sobre `tradexpar` con JWT explícito (RLS); sin depender solo del storage de Auth.

 *

 * Un solo createClient para ambos rompía el panel: el admin guarda JWT en sessionStorage y antes se inyectaba

 * en el cliente de datos; con un único cliente, las peticiones podían ir sin el token correcto.

 */

let authClient: SupabaseClient | null = null;

let dataClient: SupabaseClient | null = null;

let dataAccessToken: string | null = null;

/**
 * Storage aislado para el cliente PostgREST: si usa el mismo localStorage que el cliente Auth,
 * GoTrue crea dos instancias que compiten por el mismo lock → getSession() puede colgar y el panel afiliado hace timeout.
 */
function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
  } as Storage;
}

function strEnv(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(strEnv(import.meta.env.VITE_SUPABASE_URL) && strEnv(import.meta.env.VITE_SUPABASE_ANON_KEY));
}

/**
 * Serializa llamadas de la app que mezclan GoTrue con otras esperas (p. ej. signOut + sync).
 * GoTrue usa el lock del navegador (`navigator.locks`) por defecto; `lockAcquireTimeout` alto
 * reduce errores por «steal» cuando hay varias pestañas o sync + login a la vez.
 */
let authExclusiveChain: Promise<unknown> = Promise.resolve();

export function runAuthExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = authExclusiveChain.then(() => fn());
  authExclusiveChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** GoTrue: sin forzar schema en tablas de auth. */

export function getSupabaseAuth(): SupabaseClient {

  if (!isSupabaseConfigured()) {

    throw new Error("Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY");

  }

  if (!authClient) {
    const url = strEnv(import.meta.env.VITE_SUPABASE_URL);
    const key = strEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);
    if (!url || !key) throw new Error("Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY");

    authClient = createClient(url, key, {

      auth: {

        persistSession: true,

        autoRefreshToken: true,

        detectSessionInUrl: true,

        lockAcquireTimeout: 120_000,

        storage: typeof window !== "undefined" ? window.localStorage : undefined,

      },

    });

  }

  return authClient;

}



/**

 * PostgREST sobre schema `tradexpar`. El JWT se envía en Authorization (sesión tienda/admin o token en sessionStorage).

 */

export function setDataClientAccessToken(token: string | null) {

  dataAccessToken = token?.trim() || null;

  dataClient = null;

}

/**
 * Lee `access_token` ya guardado por GoTrue en localStorage (clave `sb-*-auth-token`).
 * Evita `getSession()` cuando hay lock entre varios clientes y la llamada no termina.
 */
export function tryReadAuthAccessTokenFromStorage(): string | null {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  const minExpMs = Date.now() + 60_000;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!parsed || typeof parsed !== "object") continue;
      const o = parsed as Record<string, unknown>;
      const at = o.access_token;
      if (typeof at !== "string" || !at.trim()) continue;
      const expAt = o.expires_at;
      if (typeof expAt === "number" && expAt * 1000 < minExpMs) continue;
      return at.trim();
    }
  } catch {
    return null;
  }
  return null;
}



export function getSupabaseData(): SupabaseClient {

  if (!isSupabaseConfigured()) {

    throw new Error("Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY");

  }

  if (!dataClient) {
    const url = strEnv(import.meta.env.VITE_SUPABASE_URL);
    const key = strEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);
    if (!url || !key) throw new Error("Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY");

    dataClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storage: createMemoryStorage(),
      },
      db: { schema: "tradexpar" },
      global: dataAccessToken ? { headers: { Authorization: `Bearer ${dataAccessToken}` } } : {},
    });

  }

  return dataClient;

}



/** Si el JWT guardado para el panel sigue vigente, no llamamos a getSession/refresh (evita esperas de red y locks). */

const ADMIN_JWT_COMFORT_MS = 90_000;



function tryApplyCachedAdminJwt(): boolean {

  if (typeof sessionStorage === "undefined") return false;

  const t = sessionStorage.getItem("tradexpar_admin_token");

  if (!t) return false;

  try {

    const p = JSON.parse(atob(t.split(".")[1])) as { exp?: number };

    if (!p.exp) return false;

    const expMs = p.exp * 1000;

    if (expMs < Date.now() + ADMIN_JWT_COMFORT_MS) return false;

    setDataClientAccessToken(t);

    return true;

  } catch {

    return false;

  }

}



/**

 * Alinea el JWT del cliente PostgREST con la sesión de Auth (localStorage + refresh automático).

 * Ruta rápida: token en sessionStorage aún válido → sin round-trip a GoTrue.

 */

export async function syncDataClientTokenFromAuthSession(): Promise<void> {

  if (!isSupabaseConfigured()) return;

  if (tryApplyCachedAdminJwt()) return;

  await runAuthExclusive(async () => {
    const auth = getSupabaseAuth();

    const { data: { session }, error } = await auth.auth.getSession();

    if (error) throw new Error(error.message);

    let token = session?.access_token ?? null;

    const expMs = (() => {
      const sec = session?.expires_at;
      if (sec != null) return sec * 1000;
      if (!token) return 0;
      try {
        const p = JSON.parse(atob(token.split(".")[1])) as { exp?: number };
        return p.exp != null ? p.exp * 1000 : 0;
      } catch {
        return 0;
      }
    })();

    const stale = !token || (expMs > 0 && expMs < Date.now() + 60_000);

    if (stale) {
      const { data, error: rErr } = await auth.auth.refreshSession();
      if (rErr || !data.session?.access_token) {
        throw new Error("Sesión expirada. Volvé a iniciar sesión en el panel.");
      }
      token = data.session.access_token;
    }

    if (!token) throw new Error("Sesión expirada. Volvé a iniciar sesión en el panel.");
    sessionStorage.setItem("tradexpar_admin_token", token);
    setDataClientAccessToken(token);
  });
}


