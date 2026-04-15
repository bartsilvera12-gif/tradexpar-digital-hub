/**
 * Sincroniza catálogo Fastrax → tradexpar.products (solo lectura API Fastrax, upsert local).
 * Secretos: FASTRAX_API_URL, FASTRAX_COD, FASTRAX_PAS (secrets de Supabase, no VITE_).
 */
import {
  extractLookupMap,
  extractProductRows,
  isPlainObject,
  pickActive,
  pickBrandDisplay,
  pickCategoryDisplay,
  pickDescription,
  pickDimensionsLabel,
  pickFastraxCrc,
  pickImageUrl,
  pickListPrice,
  pickName,
  pickPrice,
  pickPromoPrice,
  pickSku,
  pickStock,
  pickWeightKg,
  type TaxonomyMaps,
  str,
} from "./map_fastrax_row.ts";

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
  /** Filas sin cambio de CRC (no se envió PATCH). */
  unchanged: number;
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

async function sha256Hex(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type FastraxCallResult =
  | { ok: true; parsed: unknown }
  | { ok: false; status: number; message: string };

function fastraxRequestTimeoutMs(): number {
  const raw = Number(Deno.env.get("FASTRAX_REQUEST_TIMEOUT_MS") ?? "90000");
  const n = Number.isFinite(raw) ? raw : 90000;
  return Math.max(5000, Math.min(180_000, n || 90000));
}

async function fastraxCall(
  ope: number,
  extra: Record<string, unknown> = {}
): Promise<FastraxCallResult> {
  const url = (Deno.env.get("FASTRAX_API_URL") ?? "").trim().replace(/\/$/, "");
  const cod = Deno.env.get("FASTRAX_COD") ?? "";
  const pas = Deno.env.get("FASTRAX_PAS") ?? "";
  if (!url || !str(cod) || !str(pas)) {
    return {
      ok: false,
      status: 500,
      message:
        "Faltan secretos en Supabase (Edge Function fastrax-sync-catalog): FASTRAX_API_URL, FASTRAX_COD y FASTRAX_PAS.",
    };
  }
  const fmt = (Deno.env.get("FASTRAX_REQUEST_FORMAT") ?? "json").toLowerCase();
  const signal = AbortSignal.timeout(fastraxRequestTimeoutMs());
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
        signal,
      });
    } else {
      const body = { ope, cod: str(cod), pas: str(pas), ...extra };
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("abort") || msg.includes("Timeout")) {
      return { ok: false, status: 504, message: `timeout:${fastraxRequestTimeoutMs()}ms` };
    }
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

/** ope=99: `dat` (fecha) y opcional `mod` (P|I|… según manual). */
function buildOpe99Extra(since: string): Record<string, unknown> {
  const e: Record<string, unknown> = {};
  if (since) {
    e.dat = since;
    const alt = (Deno.env.get("FASTRAX_CHANGED_SINCE_PARAM") ?? "").trim();
    if (alt) e[alt] = since;
  }
  const mod = (Deno.env.get("FASTRAX_CHANGED_MOD") ?? "").trim();
  if (mod) e.mod = mod;
  return e;
}

const skuExtra = (sku: string) => ({ sku, codigo: sku, cod_art: sku, articulo: sku });

async function fetchImageDataUrl94(sku: string): Promise<string | null> {
  const r = await fastraxCall(94, skuExtra(sku));
  if (!r.ok) return null;
  const rows = extractProductRows(r.parsed);
  const row = rows[0] ?? (isPlainObject(r.parsed) ? r.parsed : {});
  const b64Keys = ["base64", "Base64", "img", "Img", "imagen", "Imagen", "foto", "data", "binario", "contenido", "b64"];
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

/** ope=3 imagen vinculada; si no hay URL útil, ope=94 Base64. */
async function fetchImageForSku(sku: string): Promise<{ image: string; images: string[] } | null> {
  const r3 = await fastraxCall(3, skuExtra(sku));
  if (r3.ok) {
    const rows = extractProductRows(r3.parsed);
    const row = (rows[0] ?? (isPlainObject(r3.parsed) ? r3.parsed : {})) as Record<string, unknown>;
    const u = pickImageUrl(row);
    if (u && (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("data:"))) {
      return { image: u, images: [u] };
    }
  }
  const dataUrl = await fetchImageDataUrl94(sku);
  if (dataUrl) return { image: dataUrl, images: [dataUrl] };
  return null;
}

type FastraxProductRowMeta = {
  id: string;
  external_product_id: string;
  external_sync_crc: string | null;
  image: string | null;
};

async function restListFastraxProducts(
  projectUrl: string,
  serviceKey: string
): Promise<FastraxProductRowMeta[]> {
  const u = new URL(`${projectUrl}/rest/v1/products`);
  u.searchParams.set("select", "id,external_product_id,external_sync_crc,image");
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
  const rows = (await res.json()) as {
    id?: string;
    external_product_id?: string;
    external_sync_crc?: string | null;
    image?: string | null;
  }[];
  return (rows ?? [])
    .filter((x) => str(x.external_product_id))
    .map((x) => ({
      id: String(x.id),
      external_product_id: str(x.external_product_id),
      external_sync_crc: x.external_sync_crc != null ? String(x.external_sync_crc) : null,
      image: x.image != null && String(x.image).trim() ? String(x.image).trim() : null,
    }));
}

async function restFindFastraxProductId(
  projectUrl: string,
  serviceKey: string,
  sku: string
): Promise<string | null> {
  const u = new URL(`${projectUrl}/rest/v1/products`);
  u.searchParams.set("select", "id");
  u.searchParams.set("external_provider", `eq.${PROVIDER}`);
  u.searchParams.set("external_product_id", `eq.${sku}`);
  u.searchParams.set("limit", "1");
  const res = await fetch(u.toString(), {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
      "Accept-Profile": PROFILE,
    },
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as { id?: string }[];
  const id = Array.isArray(rows) && rows[0]?.id != null ? String(rows[0].id) : null;
  return id;
}

async function restUpsertProduct(
  projectUrl: string,
  serviceKey: string,
  row: Record<string, unknown>,
  mode: "insert" | "update"
): Promise<{ ok: boolean; id?: string; dbError?: string; status?: number }> {
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
    const st = res.status;
    if (!res.ok) {
      const errText = (await res.text()).slice(0, 800);
      console.error("[fastrax-sync-catalog] POST products failed", st);
      return { ok: false, dbError: errText || `HTTP ${st}`, status: st };
    }
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
  const st = res.status;
  if (!res.ok) {
    const errText = (await res.text()).slice(0, 800);
    console.error("[fastrax-sync-catalog] PATCH products failed", st);
    return { ok: false, dbError: errText || `HTTP ${st}`, status: st };
  }
  return { ok: true, status: st };
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

  /**
   * Por defecto solo `is_super_admin` puede sincronizar (evita abuso con JWT de usuario normal).
   * En desarrollo local: `FASTRAX_REQUIRE_SUPER=false` en secrets o `.env` de `supabase functions serve`.
   */
  const requireSuper = Deno.env.get("FASTRAX_REQUIRE_SUPER") !== "false";
  if (requireSuper) {
    const ok = await isSuperAdmin(adminUserId, projectUrl, service);
    if (!ok) {
      return new Response(
        JSON.stringify({
          error: "forbidden",
          message: "Sincronización Fastrax reservada a super administradores.",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  }

  let body: { mode?: string; since?: string; probe?: string; sku?: string };
  try {
    body = (await req.json()) as { mode?: string; since?: string; probe?: string; sku?: string };
  } catch {
    body = {};
  }

  const skuProbe = typeof body.sku === "string" ? body.sku.trim() : "";
  const sinceForProbe = typeof body.since === "string" ? body.since.trim() : "";

  if (body.probe === "products") {
    const r = await fastraxCall(1, {});
    if (!r.ok) {
      return new Response(
        JSON.stringify({ ok: false, ope: 1, message: r.message }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ ok: true, ope: 1, data: r.parsed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (body.probe === "changed") {
    const extra = buildOpe99Extra(sinceForProbe);
    const r = await fastraxCall(99, extra);
    if (!r.ok) {
      return new Response(
        JSON.stringify({ ok: false, ope: 99, message: r.message }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ ok: true, ope: 99, data: r.parsed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (body.probe === "detail" && skuProbe) {
    const r = await fastraxCall(2, skuExtra(skuProbe));
    if (!r.ok) {
      return new Response(
        JSON.stringify({ ok: false, ope: 2, message: r.message }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ ok: true, ope: 2, data: r.parsed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (body.probe === "images" && skuProbe) {
    const r = await fastraxCall(94, skuExtra(skuProbe));
    if (!r.ok) {
      return new Response(
        JSON.stringify({ ok: false, ope: 94, message: r.message }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ ok: true, ope: 94, data: r.parsed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const mode = body.mode === "changed" ? "changed" : "full";
  const sinceParam = typeof body.since === "string" ? body.since.trim() : "";

  let syncModeUsed: "full" | "changed" = mode;
  let changedFallbackUsed = false;
  let catalogListOpe: string | undefined;

  const stats: SyncStats = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    unchanged: 0,
    failed: 0,
    deactivated: 0,
    images_fetched: 0,
  };

  const merged = new Map<string, Record<string, unknown>>();
  const tax: TaxonomyMaps = { catWeb: new Map(), brands: new Map(), catSys: new Map() };

  async function loadTaxonomy(): Promise<void> {
    const mergeMap = (into: Map<string, string>, from: Map<string, string>) => {
      for (const [k, v] of from) into.set(k, v);
    };
    const r91 = await fastraxCall(91, {});
    if (r91.ok) mergeMap(tax.catWeb, extractLookupMap(r91.parsed));
    const r92 = await fastraxCall(92, {});
    if (r92.ok) mergeMap(tax.brands, extractLookupMap(r92.parsed));
    const r93 = await fastraxCall(93, {});
    if (r93.ok) mergeMap(tax.catSys, extractLookupMap(r93.parsed));
  }

  /**
   * Listado masivo: intenta ope=4 por páginas (manual); si no devuelve filas con SKU, ope=1.
   * Luego ope=98 para saldos/precios/activos.
   */
  async function runFullListAndBalances(): Promise<{ ok: boolean; message?: string; list_ope?: string }> {
    await loadTaxonomy();
    const prefer4 = (Deno.env.get("FASTRAX_USE_OPE4_PAGINATION") ?? "true").toLowerCase() !== "false";
    const pageKey = (Deno.env.get("FASTRAX_OPE4_PAGE_PARAM") ?? "pag").trim() || "pag";
    const maxPages = Math.max(1, Math.min(500, Number(Deno.env.get("FASTRAX_MAX_LIST_PAGES") ?? "100") || 100));
    const stopBelow = Math.max(1, Math.min(10_000, Number(Deno.env.get("FASTRAX_OPE4_STOP_BELOW_ROWS") ?? "400") || 400));

    if (prefer4) {
      let total = 0;
      for (let p = 1; p <= maxPages; p++) {
        const r = await fastraxCall(4, { [pageKey]: p });
        if (!r.ok) {
          if (p === 1) break;
          return { ok: false, message: r.message, list_ope: "4" };
        }
        const rows = extractProductRows(r.parsed);
        if (rows.length === 0) break;
        mergeBySku(merged, rows);
        total += rows.length;
        if (rows.length < stopBelow) {
          const bal = await fastraxCall(98, {});
          if (bal.ok) mergeBySku(merged, extractProductRows(bal.parsed));
          return { ok: true, list_ope: "4" };
        }
      }
      if (total > 0) {
        const bal = await fastraxCall(98, {});
        if (bal.ok) mergeBySku(merged, extractProductRows(bal.parsed));
        return { ok: true, list_ope: "4" };
      }
    }

    const list = await fastraxCall(1, {});
    if (!list.ok) return { ok: false, message: list.message };
    mergeBySku(merged, extractProductRows(list.parsed));
    const bal = await fastraxCall(98, {});
    if (bal.ok) mergeBySku(merged, extractProductRows(bal.parsed));
    return { ok: true, list_ope: "1" };
  }

  if (mode === "changed") {
    await loadTaxonomy();
    const extra = buildOpe99Extra(sinceParam);
    const ch = await fastraxCall(99, extra);
    if (!ch.ok) {
      changedFallbackUsed = true;
      syncModeUsed = "full";
      const fr = await runFullListAndBalances();
      if (!fr.ok) {
        return new Response(
          JSON.stringify({
            error: "fastrax_api_error",
            ope: 99,
            message: ch.message,
            fallback_full_error: fr.message,
            stats,
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      catalogListOpe = fr.list_ope;
    } else {
      const rows = extractProductRows(ch.parsed);
      if (rows.length === 0) {
        return new Response(
          JSON.stringify({
            ok: true,
            mode: "changed",
            sync_mode_used: "changed",
            changed_fallback_used: false,
            message: "Sin productos alterados (ope=99 vacío).",
            stats,
            products_seen: 0,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      mergeBySku(merged, rows);
      const bal = await fastraxCall(98, {});
      if (bal.ok) mergeBySku(merged, extractProductRows(bal.parsed));
    }
  } else {
    const fr = await runFullListAndBalances();
    if (!fr.ok) {
      return new Response(
        JSON.stringify({ error: "fastrax_api_error", ope: 1, message: fr.message, stats }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    catalogListOpe = fr.list_ope;
  }

  const fetchImages = (Deno.env.get("FASTRAX_FETCH_IMAGES") ?? "").toLowerCase() === "true";
  const imageMax = Math.max(0, Math.min(80, Number(Deno.env.get("FASTRAX_IMAGE_MAX") ?? "25") || 25));
  const skipUnchanged = (Deno.env.get("FASTRAX_SKIP_UNCHANGED") ?? "true").toLowerCase() !== "false";

  if (merged.size === 0) {
    const fmt = (Deno.env.get("FASTRAX_REQUEST_FORMAT") ?? "json").toLowerCase();
    return new Response(
      JSON.stringify({
        ok: false,
        error: "empty_catalog",
        message:
          "La API respondió pero no se encontraron filas con SKU reconocible (ope=1/98/99 u operaciones auxiliares con FASTRAX_MERGE_AUX_OPERATIONS). Probá FASTRAX_REQUEST_FORMAT=form si la API usa form-urlencoded.",
        stats,
        sync_mode_used: syncModeUsed,
        changed_fallback_used: changedFallbackUsed,
        hint_request_format: fmt,
      }),
      { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const existing = await restListFastraxProducts(projectUrl, service);
  const skuToId = new Map(existing.map((e) => [e.external_product_id, e.id]));
  const skuToMeta = new Map(
    existing.map((e) => [e.external_product_id, { crc: e.external_sync_crc, image: e.image }])
  );
  const activeSkus = new Set<string>();
  let imageBudget = imageMax;
  let firstDbError: string | undefined;

  for (const [sku, raw0] of merged) {
    if (!sku) {
      stats.skipped += 1;
      continue;
    }
    let raw: Record<string, unknown> = { ...raw0 };
    const hasTitle = pickName(raw).length > 0;
    if (!hasTitle) {
      const detail = await fastraxCall(2, skuExtra(sku));
      if (detail.ok) {
        const dr = extractProductRows(detail.parsed)[0] ??
          (isPlainObject(detail.parsed) ? detail.parsed : {});
        raw = { ...raw, ...dr };
      }
    }

    let name2 = pickName(raw);
    if (!name2) name2 = `Producto ${sku}`;
    const desc2 = pickDescription(raw);
    const categoryDisp = pickCategoryDisplay(raw, tax);
    const brandDisp = pickBrandDisplay(raw, tax);
    const price = pickPrice(raw);
    const listPrice = pickListPrice(raw);
    const promoPrice = pickPromoPrice(raw);
    const stock = pickStock(raw);
    const active = pickActive(raw);
    const wkg = pickWeightKg(raw);
    const dimLbl = pickDimensionsLabel(raw);

    const crcPayload = JSON.stringify({
      sku,
      n: name2,
      p: price,
      pl: listPrice,
      pp: promoPrice,
      s: stock,
      a: active,
      cat: categoryDisp,
      br: brandDisp,
      w: wkg,
      d: dimLbl,
    });
    const crcFromApi = pickFastraxCrc(raw);
    const crc = crcFromApi ?? await sha256Hex(crcPayload);
    const existingId = skuToId.get(sku);
    const prev = skuToMeta.get(sku);
    const needsImageFill =
      fetchImages &&
      imageBudget > 0 &&
      active &&
      !pickImageUrl(raw) &&
      !(prev?.image && String(prev.image).trim().length > 0);

    if (skipUnchanged && existingId && prev?.crc != null && prev.crc === crc && !needsImageFill) {
      stats.unchanged += 1;
      activeSkus.add(sku);
      continue;
    }

    activeSkus.add(sku);
    let image = "";
    let images: string[] = [];
    if (fetchImages && imageBudget > 0 && active) {
      imageBudget -= 1;
      const imgSet = await fetchImageForSku(sku);
      if (imgSet) {
        image = imgSet.image;
        images = imgSet.images;
        stats.images_fetched += 1;
      }
    }

    const now = new Date().toISOString();

    const external_active = active;
    const dbRow: Record<string, unknown> = {
      name: name2.slice(0, 500),
      sku,
      description: desc2,
      category: categoryDisp.slice(0, 500),
      brand: brandDisp.slice(0, 300),
      weight_kg: wkg,
      dimensions_label: dimLbl || null,
      price,
      stock: external_active ? stock : 0,
      image: image || pickImageUrl(raw),
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

    try {
      if (existingId) {
        dbRow.id = existingId;
        const { ok, dbError } = await restUpsertProduct(projectUrl, service, dbRow, "update");
        if (ok) stats.updated += 1;
        else {
          stats.failed += 1;
          if (!firstDbError && dbError) firstDbError = dbError.slice(0, 500);
        }
      } else {
        dbRow.created_at = now;
        let ins = await restUpsertProduct(projectUrl, service, dbRow, "insert");
        if (ins.ok) {
          stats.inserted += 1;
          if (ins.id) skuToId.set(sku, ins.id);
        } else if (ins.status === 409) {
          const raceId = await restFindFastraxProductId(projectUrl, service, sku);
          if (raceId) {
            skuToId.set(sku, raceId);
            dbRow.id = raceId;
            const up = await restUpsertProduct(projectUrl, service, dbRow, "update");
            if (up.ok) stats.updated += 1;
            else {
              stats.failed += 1;
              if (!firstDbError && up.dbError) firstDbError = up.dbError.slice(0, 500);
            }
          } else {
            stats.failed += 1;
            if (!firstDbError && ins.dbError) firstDbError = ins.dbError.slice(0, 500);
          }
        } else {
          stats.failed += 1;
          if (!firstDbError && ins.dbError) firstDbError = ins.dbError.slice(0, 500);
        }
      }
    } catch {
      stats.failed += 1;
    }
  }

  if (syncModeUsed === "full" && activeSkus.size > 0) {
    stats.deactivated = await restDeactivateMissing(projectUrl, service, activeSkus);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      mode,
      sync_mode_used: syncModeUsed,
      changed_fallback_used: changedFallbackUsed,
      stats,
      products_seen: merged.size,
      ...(catalogListOpe ? { catalog_list_ope: catalogListOpe } : {}),
      ...(firstDbError && stats.failed > 0 ? { db_error_sample: firstDbError } : {}),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
