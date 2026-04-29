/**
 * Evita que el bridge/Dropi reciba `variation_id` vacío o listas vacías → SQL inválido (`IN ()`).
 * Productos simples: no enviar claves de variación; opcionalmente `product_type: "SIMPLE"`.
 *
 * Reversibilidad: dejar de llamar a esta función en `createOrderForInternal.js` y devolver el objeto crudo.
 */

/** Claves que no deben llegar al bridge si están vacías / triviales. */
const VARIATION_RELATED_KEYS = [
  "variation_id",
  "variation_ids",
  "variations",
  "variationId",
  "selected_variation_id",
];

/**
 * @param {unknown} v
 * @returns {string | null} id estable para Dropi, o null si no aplica
 */
function coerceMeaningfulVariationId(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return v.length > 0 ? coerceMeaningfulVariationId(v[0]) : null;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return String(Math.trunc(v));
  const s = String(v).trim();
  if (s === "" || s === "0" || /^null$/i.test(s) || /^undefined$/i.test(s)) return null;
  return s;
}

/**
 * @param {Record<string, unknown> | null | undefined} payload
 * @returns {string | null}
 */
function pickVariationIdFromExternalPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const o = /** @type {Record<string, unknown>} */ (payload);
  const direct = coerceMeaningfulVariationId(
    o.variation_id ?? o.variationId ?? o.selected_variation_id ?? o.variationID
  );
  if (direct) return direct;

  const typeRaw = o.product_type ?? o.productType ?? o.type ?? o.Type;
  const typeStr = typeRaw != null ? String(typeRaw).trim().toUpperCase() : "";
  if (typeStr.includes("SIMPLE") || typeStr === "PRODUCT" || typeStr === "STANDARD") {
    return null;
  }

  const vars = o.variations ?? o.warehouse_product_variation;
  if (Array.isArray(vars) && vars.length > 0) {
    const first = vars[0];
    if (first && typeof first === "object" && !Array.isArray(first)) {
      const id = coerceMeaningfulVariationId(
        /** @type {Record<string, unknown>} */ (first).id ??
          /** @type {Record<string, unknown>} */ (first).variation_id
      );
      if (id) return id;
    }
  }

  return null;
}

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown> | null}
 */
function parseExternalPayloadObject(raw) {
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return /** @type {Record<string, unknown>} */ (raw);
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t || t === "null") return null;
    try {
      const p = JSON.parse(t);
      return p && typeof p === "object" && !Array.isArray(p) ? /** @type {Record<string, unknown>} */ (p) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * @param {Record<string, unknown>} line
 * @param {Record<string, unknown>} product
 * @returns {string | null}
 */
export function resolveDropiVariationIdForBridge(line, product) {
  const fromLine = coerceMeaningfulVariationId(
    line.dropi_variation_id ?? line.variation_id ?? line.variationId
  );
  if (fromLine) return fromLine;

  const ep = parseExternalPayloadObject(product.external_payload);
  const fromEp = pickVariationIdFromExternalPayload(ep);
  return fromEp;
}

/**
 * Quita ruido de variación vacío para que JSON no serialice `""` ni `[]` hacia el bridge.
 * @param {Record<string, unknown>} obj
 */
function stripEmptyVariationFields(obj) {
  for (const k of VARIATION_RELATED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
    const v = obj[k];
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) {
      delete obj[k];
    }
  }
}

/**
 * @param {Record<string, unknown>} item - línea ya armada para el bridge (precios, sku, dropi_product_id, …)
 * @param {{ line: Record<string, unknown>, product: Record<string, unknown> }} ctx
 * @returns {Record<string, unknown>}
 */
export function normalizeDropiItemForBridge(item, ctx) {
  const { line, product } = ctx;
  /** Copia superficial; no queremos mutar el objeto fuente si se reutiliza. */
  const draft = { ...item };
  stripEmptyVariationFields(draft);

  const resolved = resolveDropiVariationIdForBridge(line, product);

  for (const k of VARIATION_RELATED_KEYS) {
    delete draft[k];
  }
  delete draft.product_type;

  if (resolved != null && resolved !== "") {
    draft.variation_id = resolved;
    return draft;
  }

  draft.product_type = "SIMPLE";
  return draft;
}
