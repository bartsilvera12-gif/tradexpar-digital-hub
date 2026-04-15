import { resolveSupabaseAnonKey, resolveSupabaseUrl } from "@/lib/supabaseClient";
import type { FastraxSyncErrorResponse, FastraxSyncStats, FastraxSyncSuccessResponse } from "@/services/fastraxApi";

export type FastraxCatalogSyncOptions = {
  mode?: "full" | "changed";
  /** Ej.: fecha para ope=99 (nombre del campo configurable en servidor con FASTRAX_CHANGED_SINCE_PARAM). */
  since?: string;
};

export type FastraxCatalogSyncResult = FastraxSyncSuccessResponse;

function adminToken(): string {
  if (typeof sessionStorage === "undefined") return "";
  return sessionStorage.getItem("tradexpar_admin_token")?.trim() ?? "";
}

type FastraxProbe = "detail" | "images" | "products" | "changed";

/**
 * Lectura vía Edge (sin persistir): detalle, imágenes, listado ope=1, alterados ope=99.
 */
async function invokeFastraxProbe(
  probe: FastraxProbe,
  opts?: { sku?: string; since?: string }
): Promise<unknown> {
  const base = resolveSupabaseUrl().replace(/\/$/, "");
  const anon = resolveSupabaseAnonKey().trim();
  const token = adminToken();
  if (!token) {
    throw new Error("No hay sesión de administrador. Iniciá sesión en el panel.");
  }
  const url = `${base}/functions/v1/fastrax-sync-catalog`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anon,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        probe,
        sku: opts?.sku?.trim() || undefined,
        since: opts?.since?.trim() || undefined,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`No se pudo contactar al servidor Fastrax: ${msg}`);
  }

  let data: { ok?: boolean; data?: unknown; message?: string; error?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    const msg =
      (typeof data.message === "string" && data.message) ||
      (typeof data.error === "string" && data.error) ||
      res.statusText ||
      "Error Fastrax";
    throw new Error(msg);
  }
  if (data.ok === false) {
    throw new Error(typeof data.message === "string" ? data.message : "Respuesta inválida de Fastrax");
  }
  return data.data ?? data;
}

/**
 * Invoca la Edge Function que llama a Fastrax (ope 1, 2, 91–94, 98, 99) y hace upsert en `tradexpar.products`.
 */
export async function invokeFastraxCatalogSync(
  options?: FastraxCatalogSyncOptions
): Promise<FastraxCatalogSyncResult> {
  const base = resolveSupabaseUrl().replace(/\/$/, "");
  const anon = resolveSupabaseAnonKey().trim();
  const token = adminToken();
  if (!token) {
    throw new Error("No hay sesión de administrador. Iniciá sesión en el panel.");
  }
  const url = `${base}/functions/v1/fastrax-sync-catalog`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anon,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: options?.mode ?? "full",
        since: options?.since?.trim() || undefined,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`No se pudo contactar al servidor de sincronización: ${msg}`);
  }

  let data: FastraxSyncSuccessResponse & FastraxSyncErrorResponse = {} as FastraxSyncSuccessResponse;
  try {
    data = (await res.json()) as FastraxSyncSuccessResponse & FastraxSyncErrorResponse;
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    const msg =
      (typeof data.message === "string" && data.message) ||
      (typeof data.error === "string" && data.error) ||
      res.statusText ||
      "Error al sincronizar Fastrax";
    throw new Error(msg);
  }

  if (!data.ok) {
    throw new Error(
      typeof data.message === "string" ? data.message : "La sincronización no finalizó correctamente."
    );
  }

  return data as FastraxCatalogSyncResult;
}

/** Listado crudo Fastrax (ope=1), sin escribir en la base. */
export async function fetchFastraxProducts(): Promise<unknown> {
  return invokeFastraxProbe("products");
}

/** Detalle por SKU (ope=2), sin escribir en la base. */
export async function fetchFastraxProductDetail(sku: string): Promise<unknown> {
  return invokeFastraxProbe("detail", { sku });
}

/** Imágenes/base64 u ope=94 según API, sin escribir en la base. */
export async function fetchFastraxImages(sku: string): Promise<unknown> {
  return invokeFastraxProbe("images", { sku });
}

/** Productos alterados (ope=99). `since` según FASTRAX_CHANGED_SINCE_PARAM en el servidor. */
export async function fetchFastraxChangedProducts(since?: string): Promise<unknown> {
  return invokeFastraxProbe("changed", { since });
}

/** Sincronización completa (lista + saldos/precios/activos, enriquecido en servidor). */
export async function syncFastraxProducts(): Promise<FastraxCatalogSyncResult> {
  return invokeFastraxCatalogSync({ mode: "full" });
}

/** Solo productos alterados (ope=99 en servidor). */
export async function syncChangedFastraxProducts(since?: string): Promise<FastraxCatalogSyncResult> {
  return invokeFastraxCatalogSync({ mode: "changed", since });
}

/**
 * Estadísticas vacías (útil para UI antes de correr sync).
 */
export function emptyFastraxSyncStats(): FastraxSyncStats {
  return {
    inserted: 0,
    updated: 0,
    skipped: 0,
    unchanged: 0,
    failed: 0,
    deactivated: 0,
    images_fetched: 0,
  };
}
