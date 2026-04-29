/**
 * Validación de productos Dropi antes de checkout (precio mínimo 80% sugerido, stock, id, cotización envío opcional).
 * Feature flag servidor: DROPI_ENFORCE_PRODUCT_VALIDATION=true para persistir dropi_sellable=false y errores.
 */

import { postDropiBridgeJson } from "./client.js";
import { pickErrorMessageString } from "./dropiErrors.js";

function envTrim(key, fallback = "") {
  const v = process.env[key];
  if (v == null) return fallback;
  return String(v).trim();
}

/** @returns {boolean} */
export function isDropiProductValidationEnforced() {
  return envTrim("DROPI_ENFORCE_PRODUCT_VALIDATION").toLowerCase() === "true";
}

/**
 * @param {unknown} v
 * @returns {number | null}
 */
function numOrNullPos(v) {
  if (v == null || v === "" || (typeof v === "string" && v.trim() === "")) return null;
  if (Array.isArray(v) || (typeof v === "object" && v !== null)) return null;
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return n;
  return null;
}

/**
 * Precio sugerido Dropi (base para regla 80%).
 * @param {Record<string, unknown>} raw
 * @param {{ salePrice: number }} mapped
 */
export function pickDropiSuggestedPriceGs(raw, mapped) {
  const fromSuggested = numOrNullPos(
    raw.suggested_price ??
      raw.suggested_selling_price ??
      raw.suggested_public_price ??
      raw.precio_sugerido
  );
  if (fromSuggested != null) return Math.round(fromSuggested);
  const fromSale = numOrNullPos(raw.sale_price ?? raw.price_sale ?? raw.price ?? raw.precio ?? raw.public_price);
  if (fromSale != null) return Math.round(fromSale);
  if (Number.isFinite(mapped.salePrice) && mapped.salePrice > 0) return Math.round(mapped.salePrice);
  return null;
}

/**
 * Intenta cotización/envío con ciudad Dropi por defecto (Fernando/Central = 11). Sin path → no llama al bridge.
 * @param {string} externalProductId
 * @returns {Promise<{ ok: boolean, skipped?: boolean, error?: string }>}
 */
export async function tryDropiShippingQuotePreview(externalProductId) {
  const pathSeg = envTrim("DROPI_BRIDGE_SHIPPING_QUOTE_PATH");
  if (!pathSeg) {
    return { ok: true, skipped: true };
  }
  const cityCode = envTrim("DROPI_VALIDATION_DROPICITY_CODE") || "11";
  try {
    await postDropiBridgeJson(pathSeg, {
      dropi_product_id: String(externalProductId).trim(),
      city_code: cityCode,
      quantity: 1,
      calculate_costs_and_shiping: true,
      preview_only: true,
    });
    return { ok: true };
  } catch (e) {
    const msg = pickErrorMessageString(e).slice(0, 800);
    return { ok: false, error: msg };
  }
}

/**
 * @param {Record<string, unknown>} raw
 * @param {{ externalId: string, salePrice: number, stock: number }} mapped
 * @param {number} listPriceGs Precio de lista en Gs. guardado en `products.price` / `sale_price`
 * @param {string | null} internalProductId UUID interno para logs
 */
export async function computeDropiProductValidationPatch(raw, mapped, listPriceGs, internalProductId) {
  const enforce = isDropiProductValidationEnforced();
  /** @type {string[]} */
  const errors = [];

  const extId = mapped.externalId != null ? String(mapped.externalId).trim() : "";
  if (!extId) {
    errors.push("MISSING_DROPI_PRODUCT_ID");
  }

  const stock = Number(mapped.stock);
  if (!Number.isFinite(stock) || stock <= 0) {
    errors.push("NO_STOCK");
  }

  const suggestedGs = pickDropiSuggestedPriceGs(
    /** @type {Record<string, unknown>} */ (raw && typeof raw === "object" ? raw : {}),
    mapped
  );
  let minSaleGs = null;
  if (suggestedGs != null && suggestedGs > 0) {
    minSaleGs = Math.ceil(suggestedGs * 0.8);
    const list = Math.round(Number(listPriceGs) || 0);
    if (minSaleGs > 0 && list < minSaleGs) {
      errors.push("PRICE_BELOW_DROPI_MINIMUM");
    }
  }

  let shippingErr = null;
  const shipTry = extId ? await tryDropiShippingQuotePreview(extId) : { ok: true, skipped: true };
  if (!shipTry.skipped && !shipTry.ok) {
    errors.push("SHIPPING_QUOTE_FAILED");
    shippingErr = shipTry.error ?? "unknown";
  }

  let sellable = errors.length === 0;
  if (!enforce) {
    sellable = true;
  }

  const patch = {
    dropi_suggested_price: suggestedGs,
    dropi_min_sale_price: minSaleGs,
    dropi_validation_errors: errors,
    dropi_validation_status: errors.length > 0 ? "invalid" : "ok",
    dropi_last_validated_at: new Date().toISOString(),
    dropi_sellable: sellable,
  };

  console.log("[DROPI PRODUCT VALIDATION]", {
    product_id: internalProductId,
    dropi_product_id: extId || null,
    sellable,
    errors,
    min_sale_price: minSaleGs,
    current_price: Math.round(Number(listPriceGs) || 0),
    enforce,
    shipping_quote: shipTry.skipped ? "skipped_no_path" : shipTry.ok ? "ok" : shippingErr?.slice(0, 200),
  });

  if (!enforce && errors.length > 0) {
    console.warn("[DROPI PRODUCT VALIDATION] enforcement off — sellable left true; fix errors:", errors.join(", "));
  }

  return patch;
}
