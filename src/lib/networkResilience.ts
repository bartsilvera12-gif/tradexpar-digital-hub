/** Utilidades para timeouts, reintentos y mensajes legibles ante fallos de red / PostgREST. */

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function isTransientNetworkOrServerError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("network request failed") ||
    m.includes("load failed") ||
    m.includes("aborted") ||
    m.includes("abort") ||
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("502") ||
    m.includes("503") ||
    m.includes("504") ||
    m.includes("bad gateway") ||
    m.includes("service unavailable") ||
    m.includes("econnreset") ||
    m.includes("socket")
  );
}

export function isInvalidRefreshTokenError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("invalid refresh token") ||
    m.includes("refresh token not found") ||
    m.includes("refresh_token_already_used") ||
    m.includes("invalid_grant")
  );
}

export function isTransientAuthSdkError(message: string): boolean {
  return isTransientNetworkOrServerError(message);
}

/**
 * Mensajes amigables para la UI; evita mostrar detalles crudos de PostgREST al usuario final.
 */
export function formatSupabaseErrorForUser(raw: string): string {
  const m = raw.trim();
  const low = m.toLowerCase();
  if (!m) return "No se pudo completar la operación. Intentá de nuevo.";
  if (low.includes("jwt expired") || low.includes("token expired") || low.includes("pgrst301")) {
    return "La sesión caducó. Volvé a iniciar sesión.";
  }
  if (low.includes("invalid api key") || low.includes("invalid jwt")) {
    return "Error de configuración o sesión inválida. Volvé a iniciar sesión o contactá soporte.";
  }
  if (isTransientNetworkOrServerError(m)) {
    return "Problema de conexión con el servidor. Revisá tu red e intentá de nuevo en unos segundos.";
  }
  return m;
}
