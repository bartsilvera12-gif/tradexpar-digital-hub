/** Fastrax → API Node `server/`: búsqueda ope=4/2 e import selectivo (Bearer admin). */

const RAW_PAYMENTS_API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");

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
  if (!token) {
    throw new Error("No hay sesión de administrador. Iniciá sesión en el panel.");
  }
  const url = buildAdminApiUrl(path);
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      ...(init?.method === "POST" || init?.method === "PUT" || init?.method === "PATCH"
        ? { "Content-Type": "application/json" }
        : {}),
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
  state: string;
};

export type FastraxSearchOk =
  | {
      ok: true;
      mode: "list";
      ope: 4;
      page: number;
      size: number;
      count_source: number;
      count_filtered: number;
      items: FastraxAdminListItem[];
      data?: unknown;
    }
  | {
      ok: true;
      mode: "detail";
      ope: 2;
      page: number;
      size: number;
      item: FastraxAdminListItem;
      data?: unknown;
    };

export type FastraxSearchResult = FastraxSearchOk | { ok: false; ope?: number; message?: string; parsed?: unknown };

export type FastraxImportResult = {
  ok: boolean;
  source?: string;
  inserted: number;
  updated: number;
  failed: number;
  results: { sku: string; ok: boolean; action?: string; id?: string; error?: string }[];
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

const searchParams = (o: {
  page?: number;
  size?: number;
  sku?: string;
  search?: string;
  only_stock?: boolean;
}) => {
  const s = new URLSearchParams();
  if (o.page != null) s.set("page", String(o.page));
  if (o.size != null) s.set("size", String(o.size));
  if (o.sku?.trim()) s.set("sku", o.sku.trim());
  if (o.search?.trim()) s.set("search", o.search.trim());
  if (o.only_stock === true) s.set("only_stock", "1");
  return s.toString();
};

/**
 * ope=4 (lista) o ope=2 (detalle) sin persistir; los filtros de texto/stock son sobre la página listada.
 */
export async function searchFastraxProductsForAdmin(args: {
  page?: number;
  size?: number;
  sku?: string;
  search?: string;
  only_stock?: boolean;
}): Promise<FastraxSearchResult> {
  const q = searchParams(args);
  return fastraxAdminJson<FastraxSearchResult>(`/api/admin/fastrax/products/search?${q}`, { method: "GET" });
}

/**
 * Importa solo los SKUs indicados (ope=2 + upsert en `products` como fastrax).
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
