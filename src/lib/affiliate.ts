const LEGACY_LOCAL_KEY = "tradexpar_aff_ref";
const LEGACY_COOKIE_KEY = "tradexpar_aff_ref";
/** Último ?ref= visto en la pestaña (p. ej. atribución en checkout). */
const VISIT_REF_SESSION_KEY = "tradexpar_aff_visit_ref";

/** Elimina persistencia heredada (localStorage 30d + cookie con nombre legado). */
function clearLegacyStorageAndCookie() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LEGACY_LOCAL_KEY);
  } catch {
    /* ignore */
  }
  document.cookie = `${LEGACY_COOKIE_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
}

/**
 * Sincroniza el ref con la **URL actual** (query):
 * - Si hay `?ref=`, se guarda solo en `sessionStorage` (pestaña).
 * - Si **no** hay `?ref=`, se borra la sesión de afiliado: el sitio “limpio” no aplica descuentos ni reutiliza el ref anterior.
 *
 * Así se puede abrir en la misma pestaña la URL pública y la con `?ref=…` y comportarse de forma distinta, sin dejar 30d en disco.
 */
export function syncAffiliateWithUrlSearch(search: string) {
  if (typeof window === "undefined") return;
  clearLegacyStorageAndCookie();
  if (!search || !search.replace(/^\?/, "").length) {
    try {
      sessionStorage.removeItem(VISIT_REF_SESSION_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const ref = params.get("ref")?.trim() ?? "";
  if (ref) {
    try {
      sessionStorage.setItem(VISIT_REF_SESSION_KEY, ref);
    } catch {
      /* ignore */
    }
  } else {
    try {
      sessionStorage.removeItem(VISIT_REF_SESSION_KEY);
    } catch {
      /* ignore */
    }
  }
}

/** @deprecated Usar `syncAffiliateWithUrlSearch` */
export function captureAffiliateFromUrl(search: string) {
  syncAffiliateWithUrlSearch(search);
}

/** Limpia sesión, cookie y restos del modo antiguo (local 30d). */
export function clearAffiliateRef() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(VISIT_REF_SESSION_KEY);
  } catch {
    /* ignore */
  }
  clearLegacyStorageAndCookie();
}

let legacyCleared = false;
function clearLegacyIfNeeded() {
  if (typeof window === "undefined" || legacyCleared) return;
  legacyCleared = true;
  clearLegacyStorageAndCookie();
}

/** Uso: checkout; lee el ref de la visita bajo `?ref=…` (misma pestaña). */
export function getActiveAffiliateRef(): string | null {
  if (typeof window === "undefined") return null;
  clearLegacyIfNeeded();
  try {
    const v = sessionStorage.getItem(VISIT_REF_SESSION_KEY)?.trim();
    return v || null;
  } catch {
    return null;
  }
}

/**
 * Añade `?ref=…` a un path de React Router si aún no existe (para no perder el enlace al navegar en la misma visita).
 */
export function withAffiliateRef(pathWithQueryAndMaybeHash: string, ref: string | null | undefined): string {
  const r = ref?.trim();
  if (!r) return pathWithQueryAndMaybeHash;
  if (/[?&]ref=/.test(pathWithQueryAndMaybeHash)) return pathWithQueryAndMaybeHash;
  const hashIdx = pathWithQueryAndMaybeHash.indexOf("#");
  const p = hashIdx >= 0 ? pathWithQueryAndMaybeHash.slice(0, hashIdx) : pathWithQueryAndMaybeHash;
  const hash = hashIdx >= 0 ? pathWithQueryAndMaybeHash.slice(hashIdx) : "";
  const q = p.indexOf("?");
  if (q < 0) return `${p}?ref=${encodeURIComponent(r)}${hash}`;
  const sp = new URLSearchParams(p.slice(q + 1));
  if (sp.get("ref")?.trim()) return pathWithQueryAndMaybeHash;
  sp.set("ref", r);
  return `${p.slice(0, q)}?${sp.toString()}${hash}`;
}

/**
 * @deprecated Se mantuvo el nombre: ya no se persiste 30 días. Solo ajusta `sessionStorage` en esta pestaña.
 */
export function persistAffiliateRef(ref: string) {
  if (typeof window === "undefined" || !ref?.trim()) return;
  const v = ref.trim();
  clearLegacyIfNeeded();
  try {
    sessionStorage.setItem(VISIT_REF_SESSION_KEY, v);
  } catch {
    /* ignore */
  }
}

/** @deprecated Usar getActiveAffiliateRef */
export function getAffiliateCookie(): string | null {
  return getActiveAffiliateRef();
}

/** @deprecated Usar syncAffiliateWithUrlSearch o persistAffiliateRef */
export function setAffiliateCookie(ref: string) {
  persistAffiliateRef(ref);
}
