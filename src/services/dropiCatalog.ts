/** Integración Dropi → Node `/api/admin/dropi/*` (Bearer admin, mismo host que pasarela si aplica). */

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
  throw new Error(
    "Falta VITE_API_BASE_URL: el sync Dropi usa el servidor Node (`server/`) igual que pagos; definí la URL base pública del backend."
  );
}

export type DropiSyncStats = {
  total_read: number;
  created: number;
  updated: number;
  unchanged: number;
  duplicates_skipped: number;
  failed: number;
  images_queued: number;
  errors_sample: string[];
};

export type DropiSyncTestResult = {
  ok: boolean;
  sync_run_id?: string;
  stats: DropiSyncStats;
};

export type DropiImageStats = {
  downloaded: number;
  failed: number;
  skipped: number;
  errors_sample: string[];
};

export type DropiStatusResult = {
  ok: boolean;
  configured: boolean;
  queue_pending: number;
  queue_failed: number;
  last_run: Record<string, unknown> | null;
};

async function dropiFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
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
    const hint =
      res.status === 500 &&
      typeof o.message === "string" &&
      o.message.includes("SUPABASE_ANON_KEY")
        ? " En el proceso Node (`server/`): definí SUPABASE_ANON_KEY o usá `.env` en la raíz del repo con VITE_SUPABASE_ANON_KEY."
        : "";
    throw new Error((msg || "Error Dropi API") + hint);
  }
  return data as T;
}

/** Importa hasta 10 productos de prueba desde Dropi. */
export async function syncDropiTest(): Promise<DropiSyncTestResult> {
  return dropiFetchJson<DropiSyncTestResult>("/api/admin/dropi/sync-test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

export type SyncDropiImagesOptions = {
  retryFailed?: boolean;
  batchSize?: number;
};

/** Procesa cola de imágenes (y opcionalmente reintenta fallidas). */
export async function syncDropiImages(opts?: SyncDropiImagesOptions): Promise<{
  ok: boolean;
  stats: DropiImageStats;
  retry_failed_applied?: boolean;
}> {
  return dropiFetchJson("/api/admin/dropi/sync-images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      retry_failed: opts?.retryFailed === true,
      batch_size: opts?.batchSize,
    }),
  });
}

export async function getDropiStatus(): Promise<DropiStatusResult> {
  return dropiFetchJson<DropiStatusResult>("/api/admin/dropi/status", { method: "GET" });
}

export async function getDropiLogs(limit = 20): Promise<{ ok: boolean; runs: Record<string, unknown>[] }> {
  return dropiFetchJson(`/api/admin/dropi/logs?limit=${encodeURIComponent(String(limit))}`, { method: "GET" });
}
