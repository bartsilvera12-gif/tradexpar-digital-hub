/**
 * @param {unknown} e
 * @returns {string}
 */
export function serializeError(e) {
  if (e == null) return "unknown_error";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/**
 * Estructura estable para API / logs (PostgREST, Error, cadenas, objetos planos).
 * @param {unknown} e
 * @returns {{
 *   error: string;
 *   error_message: string;
 *   error_code: string | null;
 *   error_details: unknown;
 *   raw_error: unknown;
 * }}
 */
export function shapeError(e) {
  if (e == null) {
    return {
      error: "unknown_error",
      error_message: "unknown_error",
      error_code: null,
      error_details: null,
      raw_error: null,
    };
  }
  if (typeof e === "string") {
    return {
      error: e,
      error_message: e,
      error_code: null,
      error_details: null,
      raw_error: null,
    };
  }
  if (e instanceof Error) {
    const c = "code" in e ? /** @type {{ code?: string }} */ (e).code : undefined;
    return {
      error: e.message,
      error_message: e.message,
      error_code: c != null ? String(c) : null,
      error_details: "cause" in e ? /** @type {Error} */ (e).cause : null,
      raw_error: { name: e.name, message: e.message, stack: e.stack },
    };
  }
  if (typeof e === "object" && e !== null) {
    const o = /** @type {Record<string, unknown>} */ (e);
    const code =
      o.code != null
        ? String(o.code)
        : o.statusCode != null
          ? String(o.statusCode)
          : null;
    const message =
      o.message != null
        ? String(o.message)
        : o.error != null && typeof o.error === "string"
          ? o.error
          : o.error_description != null
            ? String(o.error_description)
            : o.details != null
              ? String(o.details)
              : serializeError(e);
    return {
      error: message,
      error_message: message,
      error_code: code,
      error_details: o.details !== undefined ? o.details : o.hint !== undefined ? o.hint : null,
      raw_error: e,
    };
  }
  return {
    error: serializeError(e),
    error_message: serializeError(e),
    error_code: null,
    error_details: null,
    raw_error: e,
  };
}

/**
 * @param {unknown} e
 * @returns {string} Para `error` en JSON (compat. con PostgREST / supabase-js)
 */
export function pickErrorMessageString(e) {
  if (e == null) return "unknown_error";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null) {
    const o = /** @type {Record<string, unknown>} */ (e);
    if (o.message != null) return String(o.message);
    if (o.error_description != null) return String(o.error_description);
    if (o.details != null) return String(o.details);
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
