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
 * Estado Dropi → `order_items.line_status` (vocabulario de `src/lib/adminOrdersUtils.ts`).
 * `null` = el estado remoto no aporta información nueva y la línea se deja como está.
 * @param {string | null | undefined} raw
 * @returns {string | null}
 */
export function dropiStatusToLineStatus(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (/(deliver|entregad)/.test(s)) return "delivered";
  if (/(cancel|anulad|rechaz|devuelt)/.test(s)) return "cancelled";
  if (/(fail|fallid)/.test(s)) return "failed";
  if (/(shipp?ed|enviad|despach|transito|tránsito|reparto)/.test(s)) return "shipped_by_dropi";
  if (/(confirmad|confirmed|aprobado|process|proceso)/.test(s)) return "confirmed_by_dropi";
  if (/(pendiente|pending|pend)/.test(s)) return "ordered_in_dropi";
  return null;
}

/**
 * Orden de avance del flujo Dropi. Sirve para no retroceder una línea ni pisar un
 * estado terminal puesto a mano por el operador (p. ej. Dropi devuelve «enviado»
 * cuando el admin ya marcó «entregado»).
 * @param {string | null | undefined} lineStatus
 * @returns {number}
 */
export function dropiLineStatusRank(lineStatus) {
  switch (String(lineStatus ?? "").trim().toLowerCase()) {
    case "delivered":
    case "cancelled":
    case "failed":
      return 4;
    case "shipped_by_dropi":
      return 3;
    case "confirmed_by_dropi":
      return 2;
    case "ordered_in_dropi":
      return 1;
    default:
      return 0;
  }
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
 * @param {unknown} x
 * @returns {string | null}
 */
function tryVal(x) {
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
}

/**
 * El bridge responde `{ isSuccess, status, message, ip, objects: [...] }`. Ahí `status` es el
 * estado del sobre (200 / "SUCCESS"), NO el del pedido: si se lee desde la raíz se persiste
 * `dropi_status = "200"` y el panel muestra un estado sin sentido.
 * @param {Record<string, unknown>} o
 * @returns {boolean}
 */
function isBridgeEnvelope(o) {
  return "isSuccess" in o || Array.isArray(o.objects);
}

/**
 * Busca el estado dentro de los contenedores anidados del sobre (`objects[0]`, `data`, `order`).
 * @param {Record<string, unknown>} o
 * @returns {{ code: string | null, name: string | null } | null}
 */
function extractNestedStatus(o) {
  const objs = o.objects;
  if (Array.isArray(objs) && objs[0] && typeof objs[0] === "object" && !Array.isArray(objs[0])) {
    const o0 = /** @type {Record<string, unknown>} */ (objs[0]);
    const c = tryVal(
      o0.status_name ?? o0.statusName ?? o0.status ?? o0.state ?? o0.order_status ?? o0.orderStatus ?? o0.name
    );
    if (c) {
      return { code: strOrNull(o0.status_code ?? o0.statusCode ?? o0.id) ?? c, name: c };
    }
  }

  const d = o.data;
  if (d && typeof d === "object" && !Array.isArray(d)) {
    const d0 = /** @type {Record<string, unknown>} */ (d);
    const c2 = tryVal(d0.status_name ?? d0.status ?? d0.state ?? d0.name);
    if (c2) return { code: strOrNull(d0.status_code ?? d0.statusCode) ?? c2, name: c2 };
  }

  const ord = o.order;
  if (ord && typeof ord === "object" && !Array.isArray(ord)) {
    const o2 = /** @type {Record<string, unknown>} */ (ord);
    const c3 = tryVal(o2.status_name ?? o2.status ?? o2.state);
    if (c3) return { code: strOrNull(o2.status_code ?? o2.statusCode) ?? c3, name: c3 };
  }

  return null;
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
  const envelope = isBridgeEnvelope(o);

  // Con sobre, el pedido real vive en `objects` / `data` / `order`: se busca ahí primero.
  const nested = extractNestedStatus(o);
  if (envelope && nested) return nested;

  // `status` / `state` sueltos en la raíz solo son fiables si NO es un sobre del bridge.
  const direct = tryVal(
    o.status_name ?? o.statusName ?? o.state_name ?? o.status_label ?? (envelope ? null : (o.status ?? o.state))
  );
  if (direct) {
    const code = strOrNull(o.status_code ?? o.statusCode ?? (envelope ? null : o.status)) ?? direct;
    return { code, name: direct };
  }

  return nested ?? { code: null, name: null };
}
