/**
 * Determina si el pedido puede enviarse a Fastrax (líneas con producto Fastrax).
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} orderId
 */
export async function orderCanFulfillFastraxTest(sb, orderId) {
  const oid = String(orderId || "").trim();
  if (!oid) return { ok: false, reason: "no_order" };

  const { data: itemRows, error: itemsErr } = await sb
    .from("order_items")
    .select("id, product_id, quantity, unit_price")
    .eq("order_id", oid);
  if (itemsErr) return { ok: false, reason: "order_items_error", error: itemsErr };
  const items = Array.isArray(itemRows) ? itemRows : [];
  const productIds = [...new Set(items.map((i) => (i && i.product_id != null ? String(i.product_id) : "")).filter(Boolean))];
  if (productIds.length === 0) return { ok: false, reason: "no_line_items" };

  const { data: prows, error: perr } = await sb
    .from("products")
    .select("id, product_source_type, external_provider, external_product_id, sku")
    .in("id", productIds);
  if (perr) return { ok: false, reason: "products_error", error: perr };

  for (const p of prows ?? []) {
    const st = p && p.product_source_type != null ? String(p.product_source_type) : "";
    const prov = p && p.external_provider != null ? String(p.external_provider).toLowerCase() : "";
    const ext = p && p.external_product_id != null ? String(p.external_product_id).trim() : "";
    if (st === "fastrax" && ext) {
      return { ok: true, reason: null };
    }
    if (prov === "fastrax" && ext) {
      return { ok: true, reason: null };
    }
  }
  return { ok: false, reason: "no_fastrax_lines" };
}