import { getTradexparSupabase, isTradexparSupabaseConfigured } from "@/lib/supabaseTradexpar";
import { productDescriptionForClient } from "@/lib/productDescriptionText";
import type { Product } from "@/types";

export function isCatalogSupabaseReady(): boolean {
  return isTradexparSupabaseConfigured();
}

function assertConfigured() {
  if (!isTradexparSupabaseConfigured()) {
    throw new Error("Configurá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para el catálogo.");
  }
}

export function mapProductRow(row: Record<string, unknown>): Product {
  const imgs = row.images;
  const pstRaw = String(row.product_source_type ?? "tradexpar");
  const product_source_type: Product["product_source_type"] =
    pstRaw === "dropi" ? "dropi" : pstRaw === "fastrax" ? "fastrax" : "tradexpar";
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    price: Number(row.price ?? 0),
    stock: Number(row.stock ?? 0),
    stock_min: row.stock_min != null ? Number(row.stock_min) : null,
    stock_max: row.stock_max != null ? Number(row.stock_max) : null,
    image: String(row.image ?? ""),
    images: Array.isArray(imgs) ? (imgs as string[]) : undefined,
    sku: String(row.sku ?? ""),
    description: productDescriptionForClient(String(row.description ?? "")),
    category: String(row.category ?? ""),
    created_at: row.created_at as string | undefined,
    product_source_type,
    external_provider: row.external_provider != null ? String(row.external_provider) : null,
    external_product_id: row.external_product_id != null ? String(row.external_product_id) : null,
    external_payload: row.external_payload,
    external_sync_crc: row.external_sync_crc != null ? String(row.external_sync_crc) : null,
    external_last_sync_at: row.external_last_sync_at != null ? String(row.external_last_sync_at) : null,
    external_active:
      row.external_active === null || row.external_active === undefined
        ? null
        : Boolean(row.external_active),
    discount_type: (row.discount_type as Product["discount_type"]) ?? null,
    discount_value: row.discount_value != null ? Number(row.discount_value) : null,
    discount_starts_at: (row.discount_starts_at as string) ?? null,
    discount_ends_at: (row.discount_ends_at as string) ?? null,
  };
}

export async function listProducts(): Promise<Product[]> {
  assertConfigured();
  const sb = getTradexparSupabase();
  const { data, error } = await sb.from("products").select("*").order("name");
  if (error) throw error;
  return (data ?? []).map((r) => mapProductRow(r as Record<string, unknown>));
}

function toDbPatch(p: Partial<Product>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (p.name !== undefined) out.name = p.name;
  if (p.sku !== undefined) out.sku = p.sku;
  if (p.description !== undefined) out.description = p.description;
  if (p.category !== undefined) out.category = p.category;
  if (p.price !== undefined) out.price = p.price;
  if (p.stock !== undefined) out.stock = p.stock;
  if (p.stock_min !== undefined) out.stock_min = p.stock_min;
  if (p.stock_max !== undefined) out.stock_max = p.stock_max;
  if (p.image !== undefined) out.image = p.image;
  if (p.images !== undefined) out.images = p.images;
  if (p.product_source_type !== undefined) out.product_source_type = p.product_source_type;
  if (p.discount_type !== undefined) out.discount_type = p.discount_type;
  if (p.discount_value !== undefined) out.discount_value = p.discount_value;
  if (p.discount_starts_at !== undefined) {
    out.discount_starts_at = p.discount_starts_at === "" ? null : p.discount_starts_at;
  }
  if (p.discount_ends_at !== undefined) {
    out.discount_ends_at = p.discount_ends_at === "" ? null : p.discount_ends_at;
  }
  out.updated_at = new Date().toISOString();
  return out;
}

export async function insertProduct(p: Partial<Product>): Promise<Product> {
  assertConfigured();
  const sb = getTradexparSupabase();
  const row = {
    name: p.name?.trim() || "Sin nombre",
    sku: p.sku ?? "",
    description: p.description ?? "",
    category: p.category ?? "",
    price: Number(p.price ?? 0),
    stock: Number(p.stock ?? 0),
    stock_min: p.stock_min ?? null,
    stock_max: p.stock_max ?? null,
    image: p.image ?? "",
    images: p.images ?? null,
    product_source_type: p.product_source_type ?? "tradexpar",
    discount_type: p.discount_type ?? null,
    discount_value: p.discount_value ?? 0,
    discount_starts_at: p.discount_starts_at === "" ? null : p.discount_starts_at ?? null,
    discount_ends_at: p.discount_ends_at === "" ? null : p.discount_ends_at ?? null,
  };
  const { data, error } = await sb.from("products").insert(row).select("*").single();
  if (error) throw error;
  return mapProductRow(data as Record<string, unknown>);
}

export async function updateProduct(id: string, p: Partial<Product>): Promise<Product> {
  assertConfigured();
  const sb = getTradexparSupabase();
  const { data, error } = await sb.from("products").update(toDbPatch(p)).eq("id", id).select("*").single();
  if (error) throw error;
  return mapProductRow(data as Record<string, unknown>);
}

export async function removeProduct(id: string): Promise<void> {
  assertConfigured();
  const sb = getTradexparSupabase();
  const { error } = await sb.from("products").delete().eq("id", id);
  if (error) throw error;
}
