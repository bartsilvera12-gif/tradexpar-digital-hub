/**
 * Fastrax: muchas operaciones responden vector/array — el primer nodo aporta estatus/cestatus.
 * estatus === 0 → OK; en caso contrario, error de negocio. No loguear secretos.
 */

const PREFIX = "[fastrax]";

function isPlainObject(x) {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function str(v) {
  if (v == null) return "";
  return String(v).trim();
}

/**
 * Recorre JSON buscando claves; devuelve la primera no vacía.
 * @param {unknown} root
 * @param {string[]} keys
 * @returns {string | null}
 */
export function findFirstStringKeyDeep(root, keys) {
  const set = new Set(keys.map((k) => k.toLowerCase()));
  const walk = (n) => {
    if (n == null) return null;
    if (Array.isArray(n)) {
      for (const el of n) {
        const f = walk(el);
        if (f) return f;
      }
      return null;
    }
    if (isPlainObject(n)) {
      for (const [k, v] of Object.entries(n)) {
        if (set.has(k.toLowerCase()) && v != null) {
          const s = str(v);
          if (s) return s;
        }
      }
      for (const v of Object.values(n)) {
        const f = walk(v);
        if (f) return f;
      }
    }
    return null;
  };
  return walk(root);
}

/**
 * @param {unknown} head
 * @returns {{ businessOk: boolean, estatus: number | null, cestatus: string }}
 */
export function parseFastraxVectorHeader(head) {
  if (head == null) {
    return { businessOk: true, estatus: 0, cestatus: "" };
  }
  if (Array.isArray(head)) {
    if (head.length === 0) {
      return { businessOk: true, estatus: 0, cestatus: "" };
    }
    return parseFastraxVectorHeader(head[0]);
  }
  if (!isPlainObject(head)) {
    return { businessOk: true, estatus: 0, cestatus: "" };
  }
  const o = /** @type {Record<string, unknown>} */ (head);
  const cest = str(
    o.cestatus ?? o.CEstatus ?? o.cEst ?? o.mensaje ?? o.Mensaje ?? o.msg ?? o.Msg ?? o.motivo ?? o.error
  );
  const rawE =
    o.estatus ?? o.Estatus ?? o.status ?? o.Status ?? o.st ?? o.ST ?? o.cest ?? o.codigo ?? o.cEst;
  if (rawE === undefined || rawE === null || rawE === "") {
    return { businessOk: true, estatus: 0, cestatus: cest };
  }
  // ope=2/4: a veces `estatus` viene como "0" (string); nunca tratarlo como error.
  const rawStr = str(rawE);
  if (rawStr === "0") {
    return { businessOk: true, estatus: 0, cestatus: cest };
  }
  const n = Number(rawE);
  if (Number.isFinite(n)) {
    if (n === 0) {
      return { businessOk: true, estatus: 0, cestatus: cest };
    }
    return { businessOk: false, estatus: n, cestatus: cest || `estatus ${n}` };
  }
  const t = str(rawE).toLowerCase();
  if (t === "0" || t === "ok") {
    return { businessOk: true, estatus: 0, cestatus: cest };
  }
  return { businessOk: false, estatus: null, cestatus: cest || str(rawE) };
}

function looksLikeFastraxStatusRow(n) {
  if (!isPlainObject(n)) return false;
  const o = /** @type {Record<string, unknown>} */ (n);
  return (
    Object.prototype.hasOwnProperty.call(o, "estatus") ||
    Object.prototype.hasOwnProperty.call(o, "Estatus") ||
    Object.prototype.hasOwnProperty.call(o, "cestatus") ||
    Object.prototype.hasOwnProperty.call(o, "CEstatus")
  );
}

/**
 * Aplica comprobación de encabezado: solo si [0] u objeto suelta parece fila estatus/cestatus.
 * Listas de productos ope=4 u otras sin esas claves se dejan en businessOk: true.
 * @param {unknown} parsed
 * @returns {{ businessOk: boolean, estatus: number | null, cestatus: string, head: unknown, dataRoot: unknown }}
 */
export function evaluateFastraxBusinessEnvelope(parsed) {
  if (parsed == null) {
    return { businessOk: true, estatus: 0, cestatus: "", head: null, dataRoot: null };
  }
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      return { businessOk: true, estatus: 0, cestatus: "", head: null, dataRoot: [] };
    }
    const first = parsed[0];
    if (looksLikeFastraxStatusRow(first)) {
      const h = parseFastraxVectorHeader(first);
      return { ...h, head: first, dataRoot: parsed.slice(1) };
    }
    return { businessOk: true, estatus: 0, cestatus: "", head: null, dataRoot: parsed };
  }
  if (isPlainObject(parsed) && looksLikeFastraxStatusRow(/** @type {Record<string, unknown>} */ (parsed))) {
    const h = parseFastraxVectorHeader(/** @type {Record<string, unknown>} */ (parsed));
    return { ...h, head: parsed, dataRoot: /** @type {Record<string, unknown>} */ (parsed) };
  }
  return { businessOk: true, estatus: 0, cestatus: "", head: null, dataRoot: parsed };
}

/**
 * Tras ope=12, localizar ped (ecommerce) y pdc (Fastrax).
 * @param {unknown} parsed
 * @param {string} sentPed
 */
export function extractFastraxPedPdc(parsed, sentPed) {
  const pdc = findFirstStringKeyDeep(parsed, ["pdc", "Pdc", "nPdc", "nro_pdc", "id_pdc", "PDC"]) || null;
  const ped = findFirstStringKeyDeep(parsed, ["ped", "Ped", "nro_ped", "nPed", "id_ped", "nroext"]) || sentPed;
  return {
    pdc: pdc || null,
    ped: str(ped) || str(sentPed) || null,
  };
}

/**
 * @param {Record<string, unknown> & { ok: boolean, parsed: unknown, message?: string, status?: number }} r
 * @param {{ ope: number, label?: string } | undefined} ctx
 */
export function withFastraxBusinessGate(r, ctx) {
  if (!r || r.ok === false) {
    return r;
  }
  const { businessOk, cestatus, estatus, head, dataRoot } = evaluateFastraxBusinessEnvelope(r.parsed);
  if (businessOk) {
    return {
      ...r,
      ok: true,
      businessOk: true,
      _fastrax_head: head,
      _fastrax_data: dataRoot,
    };
  }
  const errMsg = cestatus && cestatus.length > 0 ? cestatus : `Fastrax estatus distinto de 0${estatus != null ? ` (${estatus})` : ""} (ope=${ctx?.ope})`;
  console.error(PREFIX, {
    ope: ctx?.ope,
    label: ctx?.label,
    estatus: estatus ?? r?.estatus,
    cestatus: cestatus?.slice?.(0, 500),
  });
  return {
    ...r,
    ok: false,
    businessOk: false,
    businessError: true,
    message: errMsg,
    cestatus: cestatus || errMsg,
    _fastrax_head: head,
    _fastrax_data: dataRoot,
  };
}

/**
 * @param {string} part
 * @param {{ ope: number, label?: string } | undefined} ctx
 */
export function logFastraxInfo(part, ctx) {
  console.info(PREFIX, { ...ctx, part });
}

/**
 * Nunca pases cuerpo crudo (contiene `pas`); si logueás ope, está bien.
 */
export function logFastraxOpe(ope) {
  console.info(PREFIX, { ope });
}