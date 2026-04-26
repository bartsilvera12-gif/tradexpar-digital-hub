/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} orderId
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function orderCanFulfillDropiTest(sb, orderId) {
  const { data: items, error: ie } = await sb
    .from("order_items")
    .select("product_id")
    .eq("order_id", orderId);
  if (ie) throw ie;
  const rows = Array.isArray(items) ? items : [];
  if (rows.length === 0) {
    return { ok: false, reason: "no_line_items" };
  }
  const pids = [...new Set(rows.map((r) => r && r.product_id).filter(Boolean).map(String))];
  if (pids.length === 0) {
    return { ok: false, reason: "no_product_ids" };
  }
  const { data: prows, error: pe } = await sb
    .from("products")
    .select("id, product_source_type, external_provider, external_product_id")
    .in("id", pids);
  if (pe) throw pe;
  let hasDropiWithExt = false;
  let hasDropiMissingExt = false;
  for (const p of prows ?? []) {
    const r = p && typeof p === "object" ? p : {};
    const prov = String(r.external_provider ?? "");
    const isDropi = prov === "dropi";
    if (!isDropi) continue;
    const extP = r.external_product_id != null ? String(r.external_product_id).trim() : "";
    if (extP) {
      hasDropiWithExt = true;
    } else {
      hasDropiMissingExt = true;
    }
  }
  if (hasDropiMissingExt) {
    return { ok: false, reason: "dropi_missing_external_product_id" };
  }
  if (!hasDropiWithExt) {
    return { ok: false, reason: "no_fulfillable_dropi" };
  }
  return { ok: true };
}
