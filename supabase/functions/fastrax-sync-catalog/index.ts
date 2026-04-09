/**
 * Sincroniza catálogo Fastrax → tradexpar.products (solo lectura API Fastrax, upsert local).
 * Secretos: FASTRAX_API_URL, FASTRAX_COD, FASTRAX_PAS (secrets de Supabase, no VITE_).
 */
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROFILE = "tradexpar";
const PROVIDER = "fastrax";
const SOURCE_TYPE = "fastrax";

type SyncStats = {
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  deactivated: number;
  images_fetched: number;
};

async function authGetUserId(jwt: string, projectUrl: string, anonKey: string): Promise<string | null> {
  const res = await fetch(`${projectUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { id?: string };
  return typeof data.id === "string" ? data.id : null;
}

async function isSuperAdmin(
  userId: string,
  projectUrl: string,
  serviceKey: string
): Promise<boolean> {
  const u = new URL(`${projectUrl}/rest/v1/profiles`);
  u.searchParams.set("select", "is_super_admin");
  u.searchParams.set("id", `eq.${userId}`);
  const res = await fetch(u.toString(), {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
      "Accept-Profile": PROFILE,
    },
  });
  if (!res.ok) return false;
  const rows = (await res.json()) as { is_super_admin?: boolean }[];
  return Array.isArray(rows) && rows.length > 0 && rows[0]?.is_super_admin === true;
}

function num(v: unknown): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function str(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  return s;
}

function truthy(v: unknown): boolean {
  if (v === true) return true;
  if (v === false || v == null) return false;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    return t === "1" || t === "true" || t === "s" || t === "si" || t === "yes";
  }
  if (typeof v === "number") return v !== 0;
  return false;
}

function pickSku(row: Record<string, unknown>): string {
  const keys = [
    "sku", "SKU", "codigo", "Codigo", "cod_art", "CodArt", "COD_ART", "articulo", "Articulo",
    "codigo_articulo", "id_articulo",
  ];
  for (const k of keys) {
    const v = str(row[k]);
    if (v) return v;
  }
  return "";
}

function pickName(row: Record<string, unknown>): string {
  const keys = ["nombre", "Nombre", "name", "titulo", "Titulo", "descripcion_corta", "descripcion", "Descripcion"];
  for (const k of keys) {
    const v = str(row[k]);
    if (v) return v.slice(0, 500);
  }
  return "";
}

function pickDescription(row: Record<string, unknown>): string {
  const longKeys = ["descripcion_larga", "detalle", "observacion", "DescripcionLarga", "descripcion_web"];
  for (const k of longKeys) {
    const v = str(row[k]);
    if (v.length > 3) return v.slice(0, 8000);
  }
  const short = str(row.descripcion ?? row.Descripcion ?? row.descripcion_corta);
  if (short) return short.slice(0, 8000);
  return pickName(row);
}

function pickCategory(row: Record<string, unknown>): string {
  const keys = ["categoria", "Categoria", "rubro", "Rubro", "marca", "Marca", "familia", "Familia"];
  for (const k of keys) {
    const v = str(row[k]);
    if (v) return v.slice(0, 200);
  }
  return "";
}

/** Precio efectivo: promo si aplica, si no normal. */
function pickPrice(row: Record<string, unknown>): number {
  const promoKeys = [
    "precio_promo", "precio_promocional", "PrecioPromo", "precio_oferta", "PrecioOferta", "precio_especial",
  ];
  const normalKeys = ["precio", "Precio", "precio_venta", "PrecioVenta", "precio_lista", "importe"];
  const promoActive = truthy(row.promo_activa ?? row.promoActiva ?? row.en_promo ?? row.EnPromo);
  for (const k of promoKeys) {
    const p = num(row[k]);
    if (p > 0 && (promoActive || promoKeys.includes(k))) return Math.max(0, p);
  }
  for (const k of promoKeys) {
    const p = num(row[k]);
    if (p > 0) return Math.max(0, p);
  }
  for (const k of normalKeys) {
    const p = num(row[k]);
    if (p > 0) return Math.max(0, p);
  }
  return 0;
}

function pickStock(row: Record<string, unknown>): number {
  const keys = ["saldo", "Saldo", "stock", "Stock", "cantidad", "existencia", "disponible"];
  for (const k of keys) {
    const n = Math.floor(num(row[k]));
    if (n >= 0) return n;
  }
  return 0;
}

function pickActive(row: Record<string, unknown>): boolean {
  if (truthy(row.bloqueado ?? row.Bloqueado ?? row.inactivo ?? row.Inactivo)) return false;
  if (str(row.estado).toLowerCase() === "b") return false;
  return truthy(row.activo ?? row.Activo ?? row.habilitado ?? row.vigente ?? true);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

/** Extrae filas tipo producto de respuestas anidadas habituales en APIs ERP. */
function extractProductRows(root: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 8) return [];
  if (root == null) return [];
  if (Array.isArray(root)) {
    if (root.length === 0) return [];
    const first = root[0];
    if (isPlainObject(first) && pickSku(first as Record<string, unknown>)) {
      return root.filter(isPlainObject) as Record<string, unknown>[];
    }
    const merged: Record<string, unknown>[] = [];
    for (const el of root) {
      merged.push(...extractProductRows(el, depth + 1));
    }
    return merged;
  }
  if (!isPlainObject(root)) return [];
  const preferredKeys = [
    "productos", "Productos", "datos", "Datos", "data", "Data", "result", "Result", "rows", "items",
    "lista", "Table", "articulos", "Articulos",
  ];
  for (const k of preferredKeys) {
    if (k in root) {
      const inner = extractProductRows(root[k], depth + 1);
      if (inner.length) return inner;
    }
  }
  if (pickSku(root)) return [root];
  const merged: Record<string, unknown>[] = [];
  for (const v of Object.values(root)) {
    if (Array.isArray(v) || isPlainObject(v)) {
      merged.push(...extractProductRows(v, depth + 1));
    }
  }
  return merged;
}

async function sha256Hex(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type FastraxCallResult =
  | { ok: true; parsed: unknown }
  | { ok: false; status: number; message: string };

async function fastraxCall(
  ope: number,
  extra: Record<string, unknown> = {}
): Promise<FastraxCallResult> {
  const url = (Deno.env.get("FASTRAX_API_URL") ?? "").trim().replace(/\/$/, "");
  const cod = Deno.env.get("FASTRAX_COD") ?? "";
  const pas = Deno.env.get("FASTRAX_PAS") ?? "";
  if (!url || !str(cod) || !str(pas)) {
    return { ok: false, status: 500, message: "fastrax_env_missing" };
  }
  const fmt = (Deno.env.get("FASTRAX_REQUEST_FORMAT") ?? "json").toLowerCase();
  let res: Response;
  try {
    if (fmt === "form" || fmt === "urlencoded") {
      const params = new URLSearchParams();
      params.set("ope", String(ope));
      params.set("cod", str(cod));
      params.set("pas", str(pas));
      for (const [k, v] of Object.entries(extra)) {
        if (v == null || v === "") continue;
        params.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
      }
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
    } else {
      const body = { ope, cod: str(cod), pas: str(pas), ...extra };
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 502, message: `network:${msg}` };
  }
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    parsed = { _raw: text.slice(0, 2000) };
  }
  if (!res.ok) {
    const msg = typeof parsed === "object" && parsed && "message" in parsed
      ? str((parsed as { message?: unknown }).message)
      : text.slice(0, 500);
    return { ok: false, status: res.status, message: msg || `HTTP ${res.status}` };
  }
  return { ok: true, parsed };
}

function mergeBySku(
  base: Map<string, Record<string, unknown>>,
  rows: Record<string, unknown>[]
): void {
  for (const r of rows) {
    const sku = pickSku(r);
    if (!sku) continue;
    const cur = base.get(sku) ?? {};
    base.set(sku, { ...cur, ...r });
  }
}

async function fetchImageDataUrl(
  sku: string
): Promise<string | null> {
  const r = await fastraxCall(94, { sku, codigo: sku, cod_art: sku, articulo: sku });
  if (!r.ok) return null;
  const rows = extractProductRows(r.parsed);
  const row = rows[0] ?? (isPlainObject(r.parsed) ? r.parsed : {});
  const b64Keys = ["imagen", "Imagen", "base64", "foto", "data", "binario", "contenido"];
  for (const k of b64Keys) {
    const raw = str((row as Record<string, unknown>)[k]);
    if (raw.length > 40) {
      const clean = raw.replace(/^data:image\/\w+;base64,/, "").replace(/\s/g, "");
      if (/^[A-Za-z0-9+/=]+$/.test(clean.slice(0, 100))) {
        return `data:image/jpeg;base64,${clean}`;
      }
    }
  }
  return null;
}

async function restListFastraxProducts(
  projectUrl: string,
  serviceKey: string
): Promise<{ id: string; external_product_id: string }[]> {
  const u = new URL(`${projectUrl}/rest/v1/products`);
  u.searchParams.set("select", "id,external_product_id");
  u.searchParams.set("external_provider", `eq.${PROVIDER}`);
  const res = await fetch(u.toString(), {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
      "Accept-Profile": PROFILE,
    },
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as { id?: string; external_product_id?: string }[];
  return (rows ?? [])
    .filter((x) => str(x.external_product_id))
    .map((x) => ({ id: String(x.id), external_product_id: str(x.external_product_id) }));
}

async function restUpsertProduct(
  projectUrl: string,
  serviceKey: string,
  row: Record<string, unknown>,
  mode: "insert" | "update"
): Promise<{ ok: boolean; id?: string }> {
  const baseHeaders: Record<string, string> = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Profile": PROFILE,
  };
  if (mode === "insert") {
    const { id: _drop, ...insertRow } = row;
    const res = await fetch(`${projectUrl}/rest/v1/products`, {
      method: "POST",
      headers: { ...baseHeaders, Prefer: "return=representation" },
      body: JSON.stringify(insertRow),
    });
    if (!res.ok) return { ok: false };
    try {
      const arr = (await res.json()) as { id?: string }[];
      const id = Array.isArray(arr) && arr[0]?.id != null ? String(arr[0].id) : undefined;
      return { ok: true, id };
    } catch {
      return { ok: true };
    }
  }
  const id = str(row.id);
  if (!id) return { ok: false };
  const { id: _id, ...patch } = row;
  const res = await fetch(`${projectUrl}/rest/v1/products?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...baseHeaders, Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  return { ok: res.ok };
}

async function restDeactivateMissing(
  projectUrl: string,
  serviceKey: string,
  activeSkus: Set<string>
): Promise<number> {
  const existing = await restListFastraxProducts(projectUrl, serviceKey);
  let n = 0;
  const headers: Record<string, string> = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Profile": PROFILE,
    Prefer: "return=minimal",
  };
  for (const ex of existing) {
    if (activeSkus.has(ex.external_product_id)) continue;
    const res = await fetch(`${projectUrl}/rest/v1/products?id=eq.${encodeURIComponent(ex.id)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        external_active: false,
        stock: 0,
        external_last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
    if (res.ok) n += 1;
  }
  return n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const projectUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!projectUrl || !anon || !service) {
    return new Response(JSON.stringify({ error: "server_misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminUserId = await authGetUserId(jwt, projectUrl, anon);
  if (!adminUserId) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const requireSuper = Deno.env.get("ADMIN_REQUIRE_SUPER") === "true";
  if (requireSuper) {
    const ok = await isSuperAdmin(adminUserId, projectUrl, service);
    if (!ok) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  let body: { mode?: string; since?: string };
  try {
    body = (await req.json()) as { mode?: string; since?: string };
  } catch {
    body = {};
  }
  const mode = body.mode === "changed" ? "changed" : "full";
  const sinceParam = typeof body.since === "string" ? body.since.trim() : "";

  const stats: SyncStats = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    deactivated: 0,
    images_fetched: 0,
  };

  const merged = new Map<string, Record<string, unknown>>();

  if (mode === "changed") {
    const extra: Record<string, unknown> = {};
    if (sinceParam) {
      const paramName = (Deno.env.get("FASTRAX_CHANGED_SINCE_PARAM") ?? "fecha").trim() || "fecha";
      extra[paramName] = sinceParam;
    }
    const ch = await fastraxCall(99, extra);
    if (!ch.ok) {
      return new Response(
        JSON.stringify({
          error: "fastrax_api_error",
          ope: 99,
          message: ch.message,
          stats,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const rows = extractProductRows(ch.parsed);
    mergeBySku(merged, rows);
  } else {
    const list = await fastraxCall(1, {});
    if (!list.ok) {
      return new Response(
        JSON.stringify({ error: "fastrax_api_error", ope: 1, message: list.message, stats }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    mergeBySku(merged, extractProductRows(list.parsed));

    const bal = await fastraxCall(98, {});
    if (bal.ok) {
      mergeBySku(merged, extractProductRows(bal.parsed));
    }

    const cat = await fastraxCall(91, {});
    if (cat.ok) {
      mergeBySku(merged, extractProductRows(cat.parsed));
    }
    const brands = await fastraxCall(92, {});
    if (brands.ok) {
      mergeBySku(merged, extractProductRows(brands.parsed));
    }
    const cat2 = await fastraxCall(93, {});
    if (cat2.ok) {
      mergeBySku(merged, extractProductRows(cat2.parsed));
    }
  }

  const fetchImages = (Deno.env.get("FASTRAX_FETCH_IMAGES") ?? "").toLowerCase() === "true";
  const imageMax = Math.max(0, Math.min(80, Number(Deno.env.get("FASTRAX_IMAGE_MAX") ?? "25") || 25));

  if (mode === "full" && merged.size === 0) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "empty_catalog",
        message: "La API no devolvió productos reconocibles (ope=1/98). Revisá credenciales o formato de respuesta.",
        stats,
      }),
      { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const existing = await restListFastraxProducts(projectUrl, service);
  const skuToId = new Map(existing.map((e) => [e.external_product_id, e.id]));
  const activeSkus = new Set<string>();
  let imageBudget = imageMax;

  for (const [sku, raw0] of merged) {
    if (!sku) {
      stats.skipped += 1;
      continue;
    }
    let raw: Record<string, unknown> = { ...raw0 };
    const hasTitle = pickName(raw).length > 0;
    if (!hasTitle) {
      const detail = await fastraxCall(2, { sku, codigo: sku, cod_art: sku, articulo: sku });
      if (detail.ok) {
        const dr = extractProductRows(detail.parsed)[0] ??
          (isPlainObject(detail.parsed) ? detail.parsed : {});
        raw = { ...raw, ...dr };
      }
    }

    activeSkus.add(sku);
    let name2 = pickName(raw);
    if (!name2) name2 = `Producto ${sku}`;
    const desc2 = pickDescription(raw);
    const cat2 = pickCategory(raw);
    const price = pickPrice(raw);
    const stock = pickStock(raw);
    const active = pickActive(raw);

    let image = "";
    let images: string[] = [];
    if (fetchImages && imageBudget > 0 && active) {
      imageBudget -= 1;
      const dataUrl = await fetchImageDataUrl(sku);
      if (dataUrl) {
        image = dataUrl;
        images = [dataUrl];
        stats.images_fetched += 1;
      }
    }

    const crcPayload = JSON.stringify({
      sku,
      n: name2,
      p: price,
      s: stock,
      a: active,
      c: cat2,
    });
    const crc = await sha256Hex(crcPayload);
    const now = new Date().toISOString();

    const external_active = active;
    const dbRow: Record<string, unknown> = {
      name: name2.slice(0, 500),
      sku,
      description: desc2,
      category: cat2,
      price,
      stock: external_active ? stock : 0,
      image: image || str(raw.image ?? raw.imagen ?? raw.url_imagen ?? ""),
      images: images.length ? images : null,
      product_source_type: SOURCE_TYPE,
      external_provider: PROVIDER,
      external_product_id: sku,
      external_payload: raw,
      external_sync_crc: crc,
      external_last_sync_at: now,
      external_active,
      updated_at: now,
    };

    const existingId = skuToId.get(sku);
    try {
      if (existingId) {
        dbRow.id = existingId;
        const { ok } = await restUpsertProduct(projectUrl, service, dbRow, "update");
        if (ok) stats.updated += 1;
        else stats.failed += 1;
      } else {
        dbRow.created_at = now;
        const { ok, id: newId } = await restUpsertProduct(projectUrl, service, dbRow, "insert");
        if (ok) {
          stats.inserted += 1;
          if (newId) skuToId.set(sku, newId);
        } else stats.failed += 1;
      }
    } catch {
      stats.failed += 1;
    }
  }

  if (mode === "full" && activeSkus.size > 0) {
    stats.deactivated = await restDeactivateMissing(projectUrl, service, activeSkus);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      mode,
      stats,
      products_seen: merged.size,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
