/**
 * Crea el pedido en Dropi (bridge WordPress) — webhook PagoPar o admin.
 * Tras SQL manual, la tabla guarda `dropi_status`, `payload`, `response`, `error`, `last_sync_at`, etc.
 */

import { postDropiBridgeJson, dropiConfigured, resolveBridgeBaseUrl } from "./client.js";
import { shapeError, pickErrorMessageString } from "./dropiErrors.js";

function envTrim(key) {
  const v = process.env[key];
  if (v == null) return "";
  return String(v).trim();
}

function utcNowIso() {
  return new Date().toISOString();
}

/**
 * Precio unitario en la línea del pedido Tradexpar (`order_items.unit_price`), antes de la regla Dropi.
 * @param {Record<string, unknown>} line
 * @returns {number}
 */
function lineSaleUnitPriceGuaranies(line) {
  const n = Number(line.unit_price);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

function dropiMinProfitGs() {
  const n = Number(process.env.DROPI_MIN_PROFIT_GS || 30000);
  if (!Number.isFinite(n) || n < 0) return 30000;
  return n;
}

/** @param {unknown} v */
function numberForMax(v) {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Mínimo piso de venta para el bridge: Dropi descuenta envío/comisión; no basta con unit_price + costo crudo.
 * @param {Record<string, unknown>} line
 * @param {Record<string, unknown>} product
 * @param {number} dropiCost
 * @param {number} minProfit
 */
function resolveDropiSellingPriceGuaranies(line, product, dropiCost, minProfit) {
  const originalUnitPrice = lineSaleUnitPriceGuaranies(line);
  const saleP = numberForMax(product.sale_price);
  const listP = numberForMax(product.price);
  const floor = dropiCost + minProfit;
  const finalDropiPrice = Math.round(Math.max(originalUnitPrice, saleP, listP, floor));
  return { finalDropiPrice, originalUnitPrice };
}

/**
 * `dropi_cost_price` tiene prioridad; si no hay, `cost`. Si faltan ambos o no son numéricos, null.
 * @param {Record<string, unknown>} product
 * @returns {{ cost: number, fallback_used: boolean } | null}
 */
function resolveProductUnitCost(product) {
  const dropi = product.dropi_cost_price;
  const base = product.cost;
  if (dropi != null && dropi !== "") {
    const n = Number(dropi);
    if (Number.isFinite(n)) {
      return { cost: n, fallback_used: false };
    }
  }
  if (base != null && base !== "") {
    const n = Number(base);
    if (Number.isFinite(n)) {
      return { cost: n, fallback_used: true };
    }
  }
  return null;
}

/** @param {unknown} v */
function isNoCostPricingSourceOk(v) {
  const s = String(v ?? "").trim();
  return s === "suggested_price" || s === "sale_price";
}

/**
 * Misma noción que en import Dropi: unit_price ?? sale_price ?? price (0 cuenta como definido vía coalesce).
 * @param {Record<string, unknown>} line
 * @param {Record<string, unknown>} product
 * @returns {number | null} null = todos vacíos, sin número; número = ya redondeado
 */
function pickSellingCoalescedForBridge(line, product) {
  const a = line.unit_price;
  const b = product.sale_price;
  const c = product.price;
  const v =
    a != null && a !== ""
      ? a
      : b != null && b !== ""
        ? b
        : c != null && c !== ""
          ? c
          : null;
  if (v == null) return null;
  const n = Math.max(0, Math.round(Number(v)));
  return Number.isFinite(n) ? n : null;
}

/**
 * Bloquea solo sin costo, sin `suggested_price`/`sale_price` en import, y sin unit/sale/price estricto > 0.
 * @param {Record<string, unknown>} line
 * @param {Record<string, unknown>} product
 */
function lineFulfillsDropiMarginPolicy(line, product) {
  if (resolveProductUnitCost(product) != null) return true;
  if (isNoCostPricingSourceOk(product.pricing_source)) return true;
  const u = numberForMax(line.unit_price) > 0;
  if (u) return true;
  if (numberForMax(product.sale_price) > 0) return true;
  if (numberForMax(product.price) > 0) return true;
  return false;
}

/** @param {Record<string, unknown> | null | undefined} r */
function mapStatus(r) {
  if (!r || typeof r !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (r);
  if (o.dropi_status != null) return String(o.dropi_status);
  if (o.status != null) return String(o.status);
  return null;
}

/**
 * @param {Record<string, unknown>} parsed
 * @returns {{ id: string | null, url: string | null }}
 */
function pickDropiOrderIdAndUrl(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { id: null, url: null };
  }
  const root = /** @type {Record<string, unknown>} */ (parsed);
  const idRoot = root.dropi_order_id;
  if (idRoot != null && String(idRoot).trim() !== "") {
    const u =
      root.dropi_order_url ?? root.url ?? root.order_url ?? root.panel_url ?? root.external_url;
    return {
      id: String(idRoot).trim(),
      url: u != null && String(u).trim() !== "" ? String(u).trim() : null,
    };
  }

  const objs = Array.isArray(root.objects) ? root.objects : null;
  const o = objs && objs[0] && typeof objs[0] === "object" && !Array.isArray(objs[0])
    ? objs[0]
    : root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? root.data
      : root.order && typeof root.order === "object"
        ? root.order
        : null;
  const body = o != null && !Array.isArray(o) && typeof o === "object" ? o : root;
  if (Array.isArray(body) || typeof body !== "object") {
    return { id: null, url: null };
  }
  const orec = /** @type {Record<string, unknown>} */ (body);
  const id =
    orec.id ?? orec.order_id ?? orec.ID ?? orec.dropi_order_id ?? orec.external_id;
  const url =
    orec.dropi_order_url ??
    orec.url ??
    orec.order_url ??
    orec.panel_url ??
    orec.external_url;
  return {
    id: id != null && String(id).trim() ? String(id).trim() : null,
    url: url != null && String(url).trim() ? String(url).trim() : null,
  };
}

/**
 * @param {Record<string, unknown> | null | undefined} bridge
 * @returns {{ id: string | null, url: string | null, code: string | null, statusLabel: string | null, dropiStatus: string | null, raw: Record<string, unknown> | null }}
 */
function pickDropiOrderMeta(bridge) {
  const raw =
    bridge && typeof bridge === "object" && !Array.isArray(bridge)
      ? /** @type {Record<string, unknown>} */ (bridge)
      : null;
  const { id, url } = pickDropiOrderIdAndUrl(/** @type {Record<string, unknown>} */ (bridge) || {});
  if (!raw) {
    return { id, url, code: null, statusLabel: null, dropiStatus: null, raw: null };
  }
  const c =
    raw.dropi_order_code != null
      ? String(raw.dropi_order_code).trim()
      : raw.code != null
        ? String(raw.code).trim()
        : "";
  const code = c.length > 0 ? c : null;
  const statusLabel =
    raw.dropi_status_label != null
      ? String(raw.dropi_status_label)
      : raw.status_label != null
        ? String(raw.status_label)
        : null;
  const dropiStatus =
    raw.dropi_status != null
      ? String(raw.dropi_status)
      : raw.order_status != null
        ? String(raw.order_status)
        : null;
  return { id, url, code, statusLabel, dropiStatus, raw };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} orderId
 * @param {{ context?: "webhook" | "admin_create" | "admin_test", force?: boolean, echoBridgePayload?: boolean }} [options]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function createDropiOrderForInternalOrder(sb, orderId, options = {}) {
  const { context = "webhook", echoBridgePayload = false } = options;
  /** Fijado al armar el body del POST; en respuestas (p. ej. test-create) replica lo enviado. */
  let lastPayload = /** @type {Record<string, unknown> | null} */ (null);
  const withEcho = (o) => {
    if (echoBridgePayload && lastPayload != null) {
      return { ...o, bridge_payload: lastPayload };
    }
    return o;
  };
  const oid = String(orderId || "").trim();
  if (!oid) {
    console.info("[dropi/order-create] start", { order_id: null, context, skipped: "empty_order_id" });
    return { ok: false, skipped: true, reason: "empty_order_id" };
  }
  console.info("[dropi/order-create] start", { order_id: oid, context });

  const { data: mapExisting, error: mapLoadErr } = await sb.from("dropi_order_map").select("*").eq("order_id", oid).maybeSingle();
  if (mapLoadErr) {
    return { ok: false, order_id: oid, skipped: false, ...shapeError(mapLoadErr) };
  }

  const mStatus = mapStatus(mapExisting);
  const mDropiId = mapExisting && typeof mapExisting === "object"
    ? (() => {
        const v = (/** @type {Record<string, unknown>} */ (mapExisting)).dropi_order_id;
        return v != null && String(v).trim() !== "" ? String(v).trim() : "";
      })()
    : "";
  if (mStatus === "succeeded" && mDropiId) {
    console.info("[dropi/order-create] order loaded", { order_id: oid, map_skip: "already_succeeded" });
    return {
      ok: true,
      skipped: true,
      reason: "already_created",
      order_id: oid,
      map_id: mapIdFromRow(mapExisting),
      dropi_order_id: mDropiId,
    };
  }

  const { data: orderRow, error: orderErr } = await sb
    .from("orders")
    .select(
      "id, checkout_type, customer_name, customer_email, customer_phone, customer_document, customer_address, customer_city_code, customer_address_reference"
    )
    .eq("id", oid)
    .maybeSingle();

  if (orderErr) {
    return { ok: false, order_id: oid, skipped: false, reason: "orders_query", ...shapeError(orderErr) };
  }
  console.info("[dropi/order-create] order loaded", { order_id: oid, found: Boolean(orderRow?.id) });
  if (!orderRow?.id) {
    return { ok: false, skipped: true, reason: "order_not_found" };
  }

  const { data: itemRows, error: itemsErr } = await sb
    .from("order_items")
    .select("id, product_id, product_name, quantity, unit_price, line_subtotal, line_index")
    .eq("order_id", oid)
    .order("line_index", { ascending: true });

  if (itemsErr) {
    return { ok: false, order_id: oid, skipped: false, reason: "order_items_query", ...shapeError(itemsErr) };
  }
  const items = /** @type {Record<string, unknown>[]} */ (Array.isArray(itemRows) ? itemRows : []);
  const productIds = [...new Set(items.map((i) => i && i.product_id).filter(Boolean).map(String))];
  if (productIds.length === 0) {
    return { ok: true, skipped: true, reason: "no_lines" };
  }

  const { data: prows, error: perr } = await sb
    .from("products")
    .select(
      "id, name, sku, product_source_type, external_provider, external_product_id, price, sale_price, cost, dropi_cost_price, pricing_source, external_payload"
    )
    .in("id", productIds);
  if (perr) {
    return { ok: false, order_id: oid, skipped: false, reason: "products_query", ...shapeError(perr) };
  }
  const pmap = new Map();
  for (const p of prows ?? []) {
    const r = /** @type {Record<string, unknown>} */ (p);
    pmap.set(String(r.id), r);
  }

  const dropiForBridge = [];
  let anyDropiMissingExt = false;
  for (const li of items) {
    if (!li || typeof li !== "object") continue;
    const rid = li.product_id != null ? String(li.product_id) : "";
    const p = pmap.get(rid);
    if (!p || typeof p !== "object") continue;
    const prov = String(p.external_provider ?? "");
    if (prov !== "dropi") continue;
    const extP = p.external_product_id != null ? String(p.external_product_id).trim() : "";
    if (!extP) {
      anyDropiMissingExt = true;
      continue;
    }
    dropiForBridge.push({ line: li, product: p });
  }

  if (anyDropiMissingExt) {
    const errText = "Un producto con external_provider=dropi no tiene external_product_id; no se envió el pedido a Dropi";
    const mapErr1 = await upsertMap(sb, {
      order_id: oid,
      status: "failed",
      dropi_status: "failed",
      last_error: errText,
      error: errText,
      updated_at: utcNowIso(),
    });
    if (mapErr1) {
      return { ok: false, skipped: false, order_id: oid, context: "missing_ext_map_upsert", ...shapeError(mapErr1) };
    }
    console.error("[dropi/order-create] bridge error", { order_id: oid, err: errText });
    return { ok: false, skipped: false, order_id: oid, ...shapeError(errText) };
  }

  if (dropiForBridge.length === 0) {
    console.info("[dropi/order-create] dropi items found", { order_id: oid, n: 0, skipped: "no_dropi_lines" });
    return { ok: true, skipped: true, reason: "no_dropi_lines" };
  }
  console.info("[dropi/order-create] dropi items found", { order_id: oid, n: dropiForBridge.length });

  for (const { line, product } of dropiForBridge) {
    const pl = /** @type {Record<string, unknown>} */ (line);
    const p = /** @type {Record<string, unknown>} */ (product);
    const pid = pl.product_id != null ? String(pl.product_id) : "";
    if (lineFulfillsDropiMarginPolicy(pl, p)) continue;
    const errText =
      "Un producto Dropi no reúne: coste/dropi_cost_price, o import con pricing_source en suggested_price|sale_price, o precio en línea/sale/price; no se envió el pedido a Dropi";
    const mapErrC = await upsertMap(sb, {
      order_id: oid,
      status: "failed",
      dropi_status: "failed",
      last_error: errText,
      error: errText,
      updated_at: utcNowIso(),
    });
    if (mapErrC) {
      return { ok: false, skipped: false, order_id: oid, context: "missing_pricing_map_upsert", ...shapeError(mapErrC) };
    }
    console.error("[dropi/order-create] bridge error", { order_id: oid, err: errText, product_id: pid });
    return { ok: false, skipped: false, order_id: oid, ...shapeError(errText) };
  }

  if (!dropiConfigured() || !resolveBridgeBaseUrl()) {
    const errText = "Dropi: bridge no configurado (DROPI_BRIDGE_URL / DROPI_BRIDGE_KEY)";
    const me = await upsertMap(sb, {
      order_id: oid,
      status: "failed",
      dropi_status: "failed",
      last_error: errText,
      error: errText,
      updated_at: utcNowIso(),
    });
    if (me) {
      return { ok: false, skipped: false, order_id: oid, context: "bridge_env_map_upsert", ...shapeError(me) };
    }
    console.error("[dropi/order-create] bridge error", { order_id: oid, err: errText });
    return { ok: false, skipped: false, order_id: oid, ...shapeError(errText) };
  }

  const pathSeg = envTrim("DROPI_BRIDGE_ORDER_PATH") || "order";
  const minProfit = dropiMinProfitGs();
  const payload = {
    tradexpar_order_id: oid,
    payment_confirmed: true,
    customer: {
      name: orderRow.customer_name != null ? String(orderRow.customer_name) : "",
      email: orderRow.customer_email != null ? String(orderRow.customer_email) : "",
      phone: orderRow.customer_phone != null ? String(orderRow.customer_phone) : "",
      document: orderRow.customer_document != null ? String(orderRow.customer_document) : "",
      address: orderRow.customer_address != null ? String(orderRow.customer_address) : "",
      city_code: orderRow.customer_city_code != null ? String(orderRow.customer_city_code) : "",
      address_reference:
        orderRow.customer_address_reference != null ? String(orderRow.customer_address_reference) : "",
    },
    items: dropiForBridge.map(({ line, product }) => {
      const pl = /** @type {Record<string, unknown>} */ (line);
      const p = /** @type {Record<string, unknown>} */ (product);
      const idStr = pl.product_id != null ? String(pl.product_id) : "";
      const costRow = resolveProductUnitCost(p);
      const qty = Math.max(1, Number(pl.quantity) || 1);
      const ps = p.pricing_source != null ? String(p.pricing_source).trim() : "";

      if (costRow != null) {
        const { finalDropiPrice, originalUnitPrice } = resolveDropiSellingPriceGuaranies(
          pl,
          p,
          costRow.cost,
          minProfit
        );
        console.info("[dropi/order-create] cost_resolved", {
          product_id: idStr,
          cost: costRow.cost,
          dropi_cost_price: p.dropi_cost_price,
          fallback_used: costRow.fallback_used,
        });
        console.info("[dropi/order-create] price_resolved", {
          cost: costRow.cost,
          original_unit_price: originalUnitPrice,
          min_profit: minProfit,
          final_dropi_price: finalDropiPrice,
        });
        const sub = Math.round(finalDropiPrice * qty * 100) / 100;
        return {
          line_index: pl.line_index,
          product_id: pl.product_id != null ? String(pl.product_id) : "",
          product_name: pl.product_name != null ? String(pl.product_name) : "",
          quantity: qty,
          price: finalDropiPrice,
          sale_price: finalDropiPrice,
          suggested_price: finalDropiPrice,
          unit_price: finalDropiPrice,
          cost: costRow.cost,
          pricing_source: ps || "cost",
          line_subtotal: sub,
          sku: p.sku != null ? String(p.sku) : "",
          dropi_product_id: p.external_product_id != null ? String(p.external_product_id) : "",
        };
      }

      const originalUnit = lineSaleUnitPriceGuaranies(pl);
      const selling = pickSellingCoalescedForBridge(pl, p) ?? 0;
      const finalNoCost = Math.round(selling);
      const sub2 = Math.round(finalNoCost * qty * 100) / 100;
      console.info("[dropi/order-create] margin_check_skipped_no_cost", {
        product_id: idStr,
        pricing_source: ps || null,
        selling: finalNoCost,
      });
      console.info("[dropi/order-create] price_resolved", {
        cost: null,
        original_unit_price: originalUnit,
        min_profit: 0,
        final_dropi_price: finalNoCost,
      });
      return {
        line_index: pl.line_index,
        product_id: pl.product_id != null ? String(pl.product_id) : "",
        product_name: pl.product_name != null ? String(pl.product_name) : "",
        quantity: qty,
        price: finalNoCost,
        sale_price: finalNoCost,
        suggested_price: finalNoCost,
        unit_price: finalNoCost,
        cost: null,
        pricing_source: ps || null,
        line_subtotal: sub2,
        sku: p.sku != null ? String(p.sku) : "",
        dropi_product_id: p.external_product_id != null ? String(p.external_product_id) : "",
      };
    }),
  };
  lastPayload = payload;

  const ts0 = utcNowIso();
  const pErr = await upsertMap(sb, {
    order_id: oid,
    status: "pending",
    dropi_status: "pending",
    payload,
    last_error: null,
    error: null,
    updated_at: ts0,
  });
  if (pErr) {
    return withEcho({ ok: false, order_id: oid, skipped: false, context: "pending_map_upsert", ...shapeError(pErr) });
  }
  console.info("[dropi/order-create] bridge request", { order_id: oid, path: pathSeg, lines: dropiForBridge.length });
  console.info("[dropi/order-create] bridge request payload", JSON.stringify(payload, null, 2));

  let bridgeRes;
  try {
    bridgeRes = await postDropiBridgeJson(pathSeg, payload);
  } catch (e) {
    const sh = shapeError(e);
    const errText = pickErrorMessageString(e).slice(0, 2000);
    const mu = await upsertMap(sb, {
      order_id: oid,
      status: "failed",
      dropi_status: "failed",
      last_error: errText,
      error: errText,
      payload,
      response: null,
      updated_at: utcNowIso(),
    });
    if (mu) {
      return withEcho({ ok: false, order_id: oid, context: "bridge_ex_map_upsert", ...shapeError(mu) });
    }
    console.error("[dropi/order-create] bridge error", { order_id: oid, error_message: sh.error_message, error_code: sh.error_code, raw: e });
    return withEcho({ ok: false, order_id: oid, ...sh });
  }

  const meta = pickDropiOrderMeta(/** @type {Record<string, unknown>} */ (bridgeRes));
  if (!meta.id) {
    const errText = "Bridge: respuesta sin id de pedido Dropi (revisá DROPI_BRIDGE_ORDER_PATH y el plugin)";
    const mFail = await upsertMap(sb, {
      order_id: oid,
      status: "failed",
      dropi_status: "failed",
      last_error: errText,
      error: errText,
      payload,
      response: /** @type {Record<string, unknown>} */ (bridgeRes),
      updated_at: utcNowIso(),
    });
    if (mFail) {
      return withEcho({ ok: false, order_id: oid, context: "no_dropi_id_map_upsert", ...shapeError(mFail) });
    }
    console.error("[dropi/order-create] bridge error", { order_id: oid, err: errText });
    return withEcho({ ok: false, order_id: oid, ...shapeError(errText) });
  }

  const syncTs = utcNowIso();
  const ds = meta.dropiStatus || "succeeded";
  const okMap = await upsertMap(sb, {
    order_id: oid,
    status: "succeeded",
    dropi_status: ds,
    dropi_order_id: meta.id,
    dropi_order_code: meta.code,
    dropi_status_label: meta.statusLabel,
    dropi_order_url: meta.url,
    payload,
    response: /** @type {Record<string, unknown>} */ (bridgeRes),
    last_error: null,
    error: null,
    last_sync_at: syncTs,
    updated_at: syncTs,
  });
  if (okMap) {
    return withEcho({ ok: false, order_id: oid, context: "success_map_upsert", ...shapeError(okMap) });
  }
  const { data: afterWrite } = await sb.from("dropi_order_map").select("id, order_id").eq("order_id", oid).maybeSingle();
  console.info("[dropi/order-create] map saved", {
    order_id: oid,
    map_id: mapIdFromRow(afterWrite),
    dropi_order_id: meta.id,
  });
  const orderPatch = { external_order_url: meta.url || null };
  await sb.from("orders").update(orderPatch).eq("id", oid);

  for (const { line } of dropiForBridge) {
    const lid = line.id != null ? String(line.id) : "";
    if (!lid) continue;
    await sb
      .from("order_items")
      .update({
        external_provider: "dropi",
        external_order_id: meta.id,
        external_url: meta.url || null,
        line_status: "ordered_in_dropi",
      })
      .eq("id", lid);
  }

  console.info("[dropi/order-create] bridge success", { order_id: oid, dropi_order_id: meta.id });
  return withEcho({
    ok: true,
    order_id: oid,
    dropi_order_id: meta.id,
    dropi_order_code: meta.code,
    dropi_order_url: meta.url,
    map_id: mapIdFromRow(afterWrite),
    bridge_response: /** @type {Record<string, unknown>} */ (bridgeRes),
  });
}

/** @param {unknown} row */
function mapIdFromRow(row) {
  if (!row || typeof row !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (row);
  return o.id != null ? o.id : o.order_id != null ? o.order_id : null;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {Record<string, unknown>} row
 * @returns {Promise<unknown | null>} Error de PostgREST si falla (full + intento legado)
 */
async function upsertMap(sb, row) {
  const payload = { ...row, updated_at: row.updated_at || utcNowIso() };
  const { error: e1 } = await sb.from("dropi_order_map").upsert(payload, { onConflict: "order_id" });
  if (!e1) return null;
  const legacy = {
    order_id: row.order_id,
    status: row.status ?? (typeof row.dropi_status === "string" ? row.dropi_status : "pending"),
    dropi_order_id: row.dropi_order_id ?? null,
    dropi_order_url: row.dropi_order_url ?? null,
    last_error: (row.error ?? row.last_error) != null ? String(row.error ?? row.last_error) : null,
    updated_at: row.updated_at || utcNowIso(),
  };
  const { error: e2 } = await sb.from("dropi_order_map").upsert(legacy, { onConflict: "order_id" });
  if (e2) return e1;
  return null;
}
