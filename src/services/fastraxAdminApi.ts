/** Fastrax → API Node `server/`: misma auth que curls técnicos (`x-api-key`); Bearer opcional si hay sesión admin. */

const RAW_PAYMENTS_API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");

/** Opcional: si hay sesión admin, el servidor puede aceptar también Bearer (no requerido para el buscador). */
function adminBearer(): string {
  if (typeof sessionStorage === "undefined") return "";
  return sessionStorage.getItem("tradexpar_admin_token")?.trim() ?? "";
}

function buildAdminApiUrl(path: string): string {
  const rel = path.startsWith("/") ? path : `/${path}`;
  if (RAW_PAYMENTS_API_BASE) {
    return `${RAW_PAYMENTS_API_BASE}${rel}`;
  }
  if (import.meta.env.DEV) {
    return rel;
  }
  throw new Error("Falta VITE_API_BASE_URL para llamar al servidor Node (Fastrax).");
}

/** Cabeceras planas de `init` sin `x-api-key` (no puede pisar la clave obligatoria). */
function fastraxInitHeadersWithoutApiKey(init?: RequestInit): Record<string, string> {
  const h = init?.headers;
  if (!h || typeof h !== "object" || Array.isArray(h) || h instanceof Headers) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h as Record<string, string>)) {
    if (String(k).toLowerCase() === "x-api-key") continue;
    if (v != null && String(v) !== "") out[k] = String(v);
  }
  return out;
}

async function fastraxAdminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = adminBearer();
  const viteKey = import.meta.env.VITE_API_KEY;
  const apiKey = (typeof viteKey === "string" && viteKey.trim() ? viteKey.trim() : null) ?? "neura123";
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log("[fastrax-api] headers", { hasToken: !!token, apiKeyFromEnv: !!(viteKey && String(viteKey).trim()) });
  }
  const url = buildAdminApiUrl(path);
  const res = await fetch(url, {
    ...init,
    headers: {
      ...fastraxInitHeadersWithoutApiKey(init),
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "x-api-key": apiKey,
    },
  });
  const text = await res.text().catch(() => "");
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    const o = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const msg =
      (typeof o.message === "string" && o.message) ||
      (typeof o.error === "string" && o.error) ||
      text.slice(0, 400) ||
      res.statusText;
    throw new Error(msg || "Error Fastrax API");
  }
  return data as T;
}

export type FastraxAdminListItem = {
  sku: string;
  name: string;
  price: number;
  stock: number;
  /** ope=2: cantidad o equivalente. */
  images_count: number;
  /** Si `raw_detail.img` > 0, número de imágenes en Fastrax. */
  image_count?: number;
  /** Ruta relativa; anteponer `VITE_API_BASE_URL` para el `<img src>`. */
  preview_image_url?: string;
  /** p. ej. Fastrax `sit`. */
  status: number;
  /** Fila ope=2 (sin tocar), o `_ope2_error` si falló ope=2. */
  raw_detail?: Record<string, unknown> | null;
  /** "ope4_ok" | "pendiente_detalle" | undefined (modo rápido). */
  detail_state?: string;
};

/** Respuesta búsqueda: el backend puede enviar u omitir `page` / `size` / `total_pages` / `source_count`. */
export type FastraxSearchOk = {
  ok: true;
  page?: number;
  size?: number;
  total_pages?: number;
  source_count?: number;
  items: FastraxAdminListItem[];
  data?: unknown;
};

export type FastraxSearchResult = FastraxSearchOk | { ok: false; ope?: number; message?: string; error?: string; parsed?: unknown };

export type FastraxImportResult = {
  ok: boolean;
  source?: string;
  inserted: number;
  updated: number;
  failed: number;
  results: { sku: string; ok: boolean; action?: string; id?: string; error?: string }[];
};

/** `POST /api/admin/fastrax/import` (desde el buscador, sin re-ope=2). */
export type FastraxImportByItemsResult = {
  ok: boolean;
  inserted: number;
  updated: number;
  failed: number;
};

export type FastraxImportItemInput = {
  sku: string;
  name: string;
  price: number;
  stock: number;
  raw_detail?: Record<string, unknown> | null;
};

export type FastraxSyncMassiveResult = {
  ok: boolean;
  products_seen?: number;
  stats?: {
    total_seen: number;
    inserted: number;
    updated: number;
    failed: number;
    errors: string[];
  };
  error?: string;
};

function buildFastraxSearchQueryString(args: {
  page?: number;
  size?: number;
  sku?: string;
  q?: string;
  search?: string;
  only_stock?: boolean;
}): string {
  const params = new URLSearchParams();
  params.set("page", String(args.page ?? 1));
  const size = Math.max(1, Math.min(20, Math.floor(Number(args.size) || 20)));
  params.set("size", String(size));
  const text = (args.q || args.search)?.trim() ?? "";
  if (text) params.set("q", String(text));
  if (args.sku != null) {
    const s = String(args.sku).trim();
    if (s) params.set("sku", s);
  }
  if (typeof args.only_stock === "boolean") {
    params.set("only_stock", args.only_stock ? "true" : "false");
  }
  return params.toString();
}

/**
 * ope=4 (lista) o ope=2 (detalle) sin persistir; query con `q` (no `search`); `only_stock` true|false.
 */
export async function searchFastraxProductsForAdmin(args: {
  page?: number;
  size?: number;
  sku?: string;
  q?: string;
  /** Alias de `q` (compat). */
  search?: string;
  only_stock?: boolean;
}): Promise<FastraxSearchResult> {
  const qs = buildFastraxSearchQueryString(args);
  return fastraxAdminJson<FastraxSearchResult>(`/api/admin/fastrax/products/search?${qs}`, { method: "GET" });
}

/**
 * Importa al catálogo local con los datos del buscador (upsert; mismo proveedor Fastrax).
 * Auth vía `x-api-key` (igual que el resto de llamadas Fastrax admin); Bearer opcional.
 */
export async function importFastraxItemsToCatalog(
  items: FastraxImportItemInput[]
): Promise<FastraxImportByItemsResult> {
  return fastraxAdminJson<FastraxImportByItemsResult>("/api/admin/fastrax/import", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

/**
 * Vía ope=2 en servidor por cada SKU (legacy / compat).
 */
export async function importFastraxSkusToCatalog(skus: string[]): Promise<FastraxImportResult> {
  return fastraxAdminJson<FastraxImportResult>("/api/admin/fastrax/products/import", {
    method: "POST",
    body: JSON.stringify({ skus }),
  });
}

/**
 * Sincronización completa (todas las páginas) — solo uso técnico / avanzado; no se llama al cargar el admin.
 */
export async function syncFastraxAllProductsOnServer(args?: { max_pages?: number; merge_ope_98?: boolean }): Promise<FastraxSyncMassiveResult> {
  return fastraxAdminJson<FastraxSyncMassiveResult>("/api/admin/fastrax/sync-products", {
    method: "POST",
    body: JSON.stringify({ max_pages: args?.max_pages, merge_ope_98: args?.merge_ope_98 }),
  });
}

/** Listado rápido: solo ope=4, sin per-SKU ope=2. */
export type FastraxFastListResult =
  | {
      ok: true;
      mode?: "list_fast";
      page?: number;
      size?: number;
      total_pages?: number;
      source_count?: number;
      items: FastraxAdminListItem[];
      duration_ms?: number;
    }
  | { ok: false; message?: string; error?: string };

export async function listFastraxProductsFastForAdmin(args: {
  page?: number;
  size?: number;
  q?: string;
  only_stock?: boolean;
}): Promise<FastraxFastListResult> {
  const params = new URLSearchParams();
  params.set("page", String(args.page ?? 1));
  params.set("size", String(Math.max(1, Math.min(500, Math.floor(Number(args.size) || 50)))));
  if (args.q && args.q.trim()) params.set("q", args.q.trim());
  if (typeof args.only_stock === "boolean") params.set("only_stock", args.only_stock ? "true" : "false");
  return fastraxAdminJson<FastraxFastListResult>(`/api/admin/fastrax/products/list-fast?${params.toString()}`, {
    method: "GET",
  });
}

/** Carga detalles ope=2 en lote para una lista de SKUs. */
export type FastraxBatchDetailsResult =
  | {
      ok: true;
      items: FastraxAdminListItem[];
      missing: string[];
      failed: string[];
      stats: {
        skus: number;
        batches: number;
        batches_split: number;
        ok_rows: number;
        missing: number;
        failed: number;
        duration_ms: number;
      };
      duration_ms?: number;
    }
  | { ok: false; message?: string; error?: string };

export async function loadFastraxDetailsBatch(skus: string[], opts?: {
  batch_size?: number;
  concurrency?: number;
}): Promise<FastraxBatchDetailsResult> {
  return fastraxAdminJson<FastraxBatchDetailsResult>(`/api/admin/fastrax/products/details-batch`, {
    method: "POST",
    body: JSON.stringify({
      skus,
      batch_size: opts?.batch_size,
      concurrency: opts?.concurrency,
    }),
  });
}

/** Búsqueda global: recorre páginas ope=4 y enriquece con un único batch ope=2. */
export type FastraxSearchGlobalResult =
  | {
      ok: true;
      mode?: "global" | "global_exact_sku";
      q?: string | null;
      pages_scanned?: number;
      total_pages?: number | null;
      source_count?: number;
      items: FastraxAdminListItem[];
      duration_ms?: number;
    }
  | { ok: false; message?: string; error?: string };

export async function searchFastraxAllPagesForAdmin(args: {
  q?: string;
  sku?: string;
  only_stock?: boolean;
  max_pages?: number;
  page_size?: number;
  max_results?: number;
}): Promise<FastraxSearchGlobalResult> {
  const params = new URLSearchParams();
  if (args.q && args.q.trim()) params.set("q", args.q.trim());
  if (args.sku && args.sku.trim()) params.set("sku", args.sku.trim());
  if (typeof args.only_stock === "boolean") params.set("only_stock", args.only_stock ? "true" : "false");
  if (Number.isFinite(args.max_pages)) params.set("max_pages", String(args.max_pages));
  if (Number.isFinite(args.page_size)) params.set("page_size", String(args.page_size));
  if (Number.isFinite(args.max_results)) params.set("max_results", String(args.max_results));
  return fastraxAdminJson<FastraxSearchGlobalResult>(
    `/api/admin/fastrax/products/search-global?${params.toString()}`,
    { method: "GET" }
  );
}

/** Importación eficiente de una página completa (ope=4 + ope=2 batch + upsert). */
export type FastraxImportPageStats = {
  skus_found: number;
  blocked: number;
  detail_batches: number;
  detail_failed: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  duration_ms: number;
};
export type FastraxImportPageResult =
  | {
      ok: true;
      page: number;
      size: number;
      total_pages?: number;
      stats: FastraxImportPageStats;
      results: { sku: string; ok: boolean; action?: string; id?: string; skipped?: boolean; reason?: string; error?: string; used_ope2?: boolean }[];
    }
  | { ok: false; page?: number; size?: number; error?: string; message?: string };

export async function importFastraxPageOnServer(args: {
  page: number;
  size?: number;
  batch_size?: number;
  concurrency?: number;
}): Promise<FastraxImportPageResult> {
  return fastraxAdminJson<FastraxImportPageResult>(`/api/admin/fastrax/products/import-page`, {
    method: "POST",
    body: JSON.stringify({
      page: args.page,
      size: args.size,
      batch_size: args.batch_size,
      concurrency: args.concurrency,
    }),
  });
}

/** Importación de un rango de páginas con tope duro. */
export type FastraxImportRangeResult =
  | {
      ok: true;
      from_page: number;
      to_page: number;
      size: number;
      totals: {
        pages_processed: number;
        skus_found: number;
        detail_batches: number;
        detail_failed: number;
        imported: number;
        updated: number;
        skipped: number;
        failed: number;
      };
      pages: { page: number; ok: boolean; stats?: FastraxImportPageStats; error?: string }[];
      duration_ms: number;
    }
  | { ok: false; error?: string; message?: string };

export async function importFastraxPageRangeOnServer(args: {
  from_page: number;
  to_page: number;
  size?: number;
  batch_size?: number;
  concurrency?: number;
  max_pages?: number;
}): Promise<FastraxImportRangeResult> {
  return fastraxAdminJson<FastraxImportRangeResult>(`/api/admin/fastrax/products/import-range`, {
    method: "POST",
    body: JSON.stringify({
      from_page: args.from_page,
      to_page: args.to_page,
      size: args.size,
      batch_size: args.batch_size,
      concurrency: args.concurrency,
      max_pages: args.max_pages,
    }),
  });
}
