const AFFILIATE_STORAGE_KEY = "tradexpar_aff_ref";
const AFFILIATE_COOKIE_KEY = "tradexpar_aff_ref";
const TTL_DAYS = 30;

function setCookie(name: string, value: string, days: number) {
  const expires = new Date();
  expires.setDate(expires.getDate() + days);
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
}

function getCookie(name: string): string | null {
  const raw = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.split("=")[1];
  return raw ? decodeURIComponent(raw) : null;
}

/** Persiste ref en cookie y localStorage (30 días). Last-click: cada ?ref= válido sobrescribe. */
export function persistAffiliateRef(ref: string) {
  if (!ref || typeof window === "undefined") return;
  const v = ref.trim();
  if (!v) return;
  try {
    localStorage.setItem(
      AFFILIATE_STORAGE_KEY,
      JSON.stringify({ v, exp: Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000 })
    );
  } catch {
    /* ignore */
  }
  setCookie(AFFILIATE_COOKIE_KEY, v, TTL_DAYS);
}

function readRefFromLocalStorage(): string | null {
  try {
    const raw = localStorage.getItem(AFFILIATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: string; exp?: number };
    if (!parsed.v || !parsed.exp || Date.now() > parsed.exp) {
      localStorage.removeItem(AFFILIATE_STORAGE_KEY);
      return null;
    }
    return parsed.v;
  } catch {
    return null;
  }
}

/**
 * Ref activo para atribución (last-click, 30 días).
 * Prioridad: cookie → localStorage (y re-sincroniza cookie si hace falta).
 */
export function getActiveAffiliateRef(): string | null {
  if (typeof window === "undefined") return null;
  const fromCookie = getCookie(AFFILIATE_COOKIE_KEY);
  if (fromCookie?.trim()) return fromCookie.trim();
  const fromLs = readRefFromLocalStorage();
  if (fromLs) {
    setCookie(AFFILIATE_COOKIE_KEY, fromLs, TTL_DAYS);
    return fromLs;
  }
  return null;
}

/** Lee ?ref= de la query y persiste (layout tienda). */
export function captureAffiliateFromUrl(search: string) {
  if (typeof window === "undefined" || !search) return;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const ref = params.get("ref");
  if (ref) persistAffiliateRef(ref);
}

/** @deprecated Usar getActiveAffiliateRef */
export function getAffiliateCookie(): string | null {
  return getActiveAffiliateRef();
}

/** @deprecated Usar persistAffiliateRef */
export function setAffiliateCookie(ref: string) {
  persistAffiliateRef(ref);
}
