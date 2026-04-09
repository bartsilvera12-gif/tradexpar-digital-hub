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
    failed: 0,
    deactivated: 0,
    images_fetched: 0,
  };
}
