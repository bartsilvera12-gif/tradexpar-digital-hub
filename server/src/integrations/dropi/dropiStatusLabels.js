/**
 * Normaliza cadenas de estado de Dropi / bridge a etiqueta en español.
 * @param {string | null | undefined} raw
 * @returns {string}
 */
export function dropiStatusToCustomerLabel(raw) {
  if (raw == null) return "—";
  const s = String(raw).trim().toLowerCase();
  if (!s) return "—";
  if (/(pendiente|pending|pend)/.test(s)) return "Pendiente";
  if (/(confirmad|confirmed|aprobado)/.test(s)) return "Confirmado";
  if (/(process|proceso|en\s*proceso)/.test(s)) return "En proceso";
  if (/(shipp?ed|enviad|despach)/.test(s)) return "Enviado";
  if (/(deliver|entregad)/.test(s)) return "Entregado";
  if (/(cancel|anulad)/.test(s)) return "Cancelado";
  if (/(fail|error|fallid)/.test(s)) return "Error";
  return String(raw).trim();
}

/**
 * @param {unknown} v
 * @returns {string | null}
 */
function strOrNull(v) {
  if (v == null) return null;
  const t = String(v).trim();
  return t || null;
}

/**
 * Prueba múltiples claves anidadas para el estado de un pedido en el JSON del bridge.
 * @param {Record<string, unknown> | null} root
 * @returns {{ code: string | null, name: string | null }}
 */
export function extractDropiOrderStatusFromResponse(root) {
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    return { code: null, name: null };
  }
  const o = /** @type {Record<string, unknown>} */ (root);
  const tryVal = (x) => {
    if (x == null) return null;
    if (typeof x === "string" || typeof x === "number") return strOrNull(x);
    if (typeof x === "object" && !Array.isArray(x)) {
      const r = /** @type {Record<string, unknown>} */ (x);
      for (const k of ["name", "label", "title", "status", "state"]) {
        const t = strOrNull(r[k]);
        if (t) return t;
      }
    }
    return null;
  };

  const direct = tryVal(
    o.status_name ?? o.statusName ?? o.state_name ?? o.status_label ?? o.status ?? o.state
  );
  if (direct) {
    return { code: strOrNull(o.status_code ?? o.statusCode ?? o.status) ?? direct, name: direct };
  }

  const objs = o.objects;
  if (Array.isArray(objs) && objs[0] && typeof objs[0] === "object" && !Array.isArray(objs[0])) {
    const o0 = /** @type {Record<string, unknown>} */ (objs[0]);
    const c = strOrNull(
      o0.status ?? o0.state ?? o0.order_status ?? o0.orderStatus ?? o0.name
    );
    if (c) {
      return {
        code: strOrNull(o0.status_code ?? o0.id) ?? c,
        name: c,
      };
    }
  }

  const d = o.data;
  if (d && typeof d === "object" && !Array.isArray(d)) {
    const d0 = /** @type {Record<string, unknown>} */ (d);
    const c2 = strOrNull(d0.status ?? d0.state ?? d0.name);
    if (c2) return { code: c2, name: c2 };
  }

  const ord = o.order;
  if (ord && typeof ord === "object" && !Array.isArray(ord)) {
    const o2 = /** @type {Record<string, unknown>} */ (ord);
    const c3 = strOrNull(o2.status ?? o2.state);
    if (c3) return { code: c3, name: c3 };
  }

  return { code: null, name: null };
}
