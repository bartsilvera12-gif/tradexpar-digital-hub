/**
 * Crea el pedido en Dropi (bridge WordPress) solo tras pago confirmado (webhook Pagopar).
 * No invocar desde checkout ni create-payment.
 */

import { postDropiBridgeJson, dropiConfigured, resolveBridgeBaseUrl } from "./client.js";

function envTrim(key) {
  const v = process.env[key];
  if (v == null) return "";
  return String(v).trim();
}

function utcNowIso() {
  return new Date().toISOString();
}

/**
 * Bridge puede enviar { success, dropi_order_id, dropi_order_url } en raíz, u objetos anidados (PHP/Dropi antiguo).
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
  /** Misma prioridad que APIs Dropi antiguas: si no vino nido, usar la raíz. */
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
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} orderId
 * @returns {Promise<Record<string, unknown>>}
 */
export async function createDropiOrderForInternalOrder(sb, orderId) {
  const oid = String(orderId || "").trim();
  if (!oid) {
    return { ok: false, skipped: true, reason: "empty_order_id" };
  }

  const { data: mapExisting } = await sb.from("dropi_order_map").select("status, dropi_order_id").eq("order_id", oid).maybeSingle();
  if (mapExisting?.status === "succeeded" && mapExisting?.dropi_order_id) {
    return { ok: true, skipped: true, reason: "already_created", order_id: oid };
  }

  const { data: orderRow, error: orderErr } = await sb
    .from("orders")
    .select(
      "id, checkout_type, customer_name, customer_email, customer_phone, customer_document, customer_address, customer_city_code, customer_address_reference"
    )
    .eq("id", oid)
    .maybeSingle();

  if (orderErr) throw orderErr;
  if (!orderRow?.id) {
    return { ok: false, skipped: true, reason: "order_not_found" };
  }

  const { data: itemRows, error: itemsErr } = await sb
    .from("order_items")
    .select("id, product_id, product_name, quantity, unit_price, line_subtotal, line_index")
    .eq("order_id", oid)
    .order("line_index", { ascending: true });

  if (itemsErr) throw itemsErr;
  const items = /** @type {Record<string, unknown>[]} */ (Array.isArray(itemRows) ? itemRows : []);
  const productIds = [...new Set(items.map((i) => i && i.product_id).filter(Boolean).map(String))];
  if (productIds.length === 0) {
    return { ok: true, skipped: true, reason: "no_lines" };
  }

  const { data: prows, error: perr } = await sb
    .from("products")
    .select("id, sku, product_source_type, external_provider, external_product_id")
    .in("id", productIds);
  if (perr) throw perr;
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
    const pst = String(p.product_source_type ?? "");
    const prov = String(p.external_provider ?? "");
    const isDropi = pst === "dropi" || prov === "dropi";
    if (!isDropi) continue;
    const extP = p.external_product_id != null ? String(p.external_product_id).trim() : "";
    if (!extP) {
      anyDropiMissingExt = true;
      continue;
    }
    dropiForBridge.push({ line: li, product: p });
  }

  if (dropiForBridge.length === 0 && !anyDropiMissingExt) {
    return { ok: true, skipped: true, reason: "no_dropi_lines" };
  }
  if (anyDropiMissingExt) {
    const errText = "Un producto Dropi no tiene external_product_id en el catálogo; no se envió el pedido a Dropi";
    await sb.from("dropi_order_map").upsert(
      {
        order_id: oid,
        status: "failed",
        dropi_order_id: null,
        dropi_order_url: null,
        last_error: errText,
        updated_at: utcNowIso(),
      },
      { onConflict: "order_id" }
    );
    return { ok: false, skipped: false, order_id: oid, error: errText };
  }

  if (!dropiConfigured() || !resolveBridgeBaseUrl()) {
    const errText = "Dropi: bridge no configurado (DROPI_BRIDGE_URL / DROPI_BRIDGE_KEY)";
    await sb.from("dropi_order_map").upsert(
      {
        order_id: oid,
        status: "failed",
        dropi_order_id: null,
        dropi_order_url: null,
        last_error: errText,
        updated_at: utcNowIso(),
      },
      { onConflict: "order_id" }
    );
    return { ok: false, skipped: false, order_id: oid, error: errText };
  }

  await sb.from("dropi_order_map").upsert(
    {
      order_id: oid,
      status: "pending",
      last_error: null,
      updated_at: utcNowIso(),
    },
    { onConflict: "order_id" }
  );

  const pathSeg = envTrim("DROPI_BRIDGE_ORDER_PATH") || "order";
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
      const p = /** @type {Record<string, unknown>} */ (product);
      return {
        line_index: line.line_index,
        product_id: String(line.product_id),
        product_name: line.product_name != null ? String(line.product_name) : "",
        quantity: Math.max(1, Number(line.quantity) || 1),
        unit_price: Number(line.unit_price) || 0,
        line_subtotal: Number(line.line_subtotal) || 0,
        sku: p.sku != null ? String(p.sku) : "",
        dropi_product_id: p.external_product_id != null ? String(p.external_product_id) : "",
      };
    }),
  };

  try {
    const bridgeRes = await postDropiBridgeJson(pathSeg, payload);
    const { id: extId, url: extUrl } = pickDropiOrderIdAndUrl(bridgeRes);
    if (!extId) {
      const errText = "Bridge: respuesta sin id de pedido Dropi (revisá DROPI_BRIDGE_ORDER_PATH y el plugin)";
      await sb.from("dropi_order_map").update({ status: "failed", last_error: errText, updated_at: utcNowIso() }).eq("order_id", oid);
      return { ok: false, order_id: oid, error: errText };
    }

    await sb
      .from("dropi_order_map")
      .update({
        status: "succeeded",
        dropi_order_id: extId,
        dropi_order_url: extUrl,
        last_error: null,
        updated_at: utcNowIso(),
      })
      .eq("order_id", oid);

    const orderPatch = { external_order_url: extUrl || null };
    await sb.from("orders").update(orderPatch).eq("id", oid);

    for (const { line } of dropiForBridge) {
      const lid = line.id != null ? String(line.id) : "";
      if (!lid) continue;
      await sb
        .from("order_items")
        .update({
          external_provider: "dropi",
          external_order_id: extId,
          external_url: extUrl || null,
          line_status: "ordered_in_dropi",
        })
        .eq("id", lid);
    }

    console.info("[dropi/create-order]", { order_id: oid, dropi_order_id: extId, lines: dropiForBridge.length });
    return { ok: true, order_id: oid, dropi_order_id: extId, dropi_order_url: extUrl };
  } catch (e) {
    const errText = (e instanceof Error ? e.message : String(e)).slice(0, 2000);
    await sb
      .from("dropi_order_map")
      .update({
        status: "failed",
        last_error: errText,
        updated_at: utcNowIso(),
      })
      .eq("order_id", oid);
    console.error("[dropi/create-order]", { order_id: oid, error: errText });
    return { ok: false, order_id: oid, error: errText };
  }
}
