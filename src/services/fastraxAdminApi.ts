/** Fastrax → API Node `server/`: búsqueda ope=4/2 e import selectivo (Bearer admin). */

const RAW_PAYMENTS_API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");

/** Mismo criterio que `dropiCatalog` / `tradexpar` admin (AdminLoginPage guarda el token aquí). */
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

async function fastraxAdminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = adminBearer();
  const apiKey = (import.meta.env.VITE_API_KEY || "").trim();
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log("[fastrax-api] headers", { hasToken: !!token, hasApiKey: !!apiKey });
  }
  if (!token && !apiKey) {
    throw new Error("No hay sesión de administrador. Iniciá sesión en el panel o definí VITE_API_KEY en el build.");
  }
  const url = buildAdminApiUrl(path);
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers &&
      typeof init.headers === "object" &&
      !Array.isArray(init.headers) &&
      !(init.headers instanceof Headers)
        ? (init.headers as Record<string, string>)
        : {}),
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(apiKey ? { "x-api-key": apiKey } : {}),
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
 * Requiere `Authorization: Bearer` admin.
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
