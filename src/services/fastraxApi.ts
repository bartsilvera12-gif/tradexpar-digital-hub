/**
 * Fastrax — cliente HTTP reusable (POST) y utilidades de formato.
 *
 * IMPORTANTE: las credenciales (`cod`, `pas`) y la URL **no** deben vivir en `VITE_*`.
 * En esta app la sync masiva corre en la Edge Function `fastrax-sync-catalog`, que mapea campos doc
 * Fastrax (ej. sku, sal, crc, sta, atv en ope=1; nom, pre, prm, des, bre, cat, mar, img en ope=2).
 *
 * Las funciones `buildFastrax*` y `parseFastraxResponseText` son seguras en el bundle (sin secretos).
 * `executeFastraxPost` está pensada para **entornos server-side** (Edge, Node); no la llames desde
 * componentes React con credenciales reales.
 */

export const FASTRAX_OPE = {
  PRODUCTS_LIST: 1,
  PRODUCT_DETAIL: 2,
  IMAGES_BASE64: 94,
  CATEGORIES_A: 91,
  BRANDS: 92,
  CATEGORIES_B: 93,
  BALANCES_PRICE_ACTIVE: 98,
  PRODUCTS_CHANGED: 99,
} as const;

export type FastraxOpe = (typeof FASTRAX_OPE)[keyof typeof FASTRAX_OPE];

export type FastraxCredentials = {
  apiUrl: string;
  cod: string;
  pas: string;
};

export type FastraxPostFormat = "json" | "form";

export type FastraxPostResult =
  | { ok: true; status: number; parsed: unknown }
  | { ok: false; status: number; message: string; parsed?: unknown };

/**
 * Cuerpo JSON estándar: `{ ope, cod, pas, ...extra }`.
 */
export function buildFastraxJsonPayload(
  ope: number,
  creds: Pick<FastraxCredentials, "cod" | "pas">,
  extra: Record<string, unknown> = {}
): string {
  return JSON.stringify({
    ope,
    cod: String(creds.cod ?? "").trim(),
    pas: String(creds.pas ?? "").trim(),
    ...extra,
  });
}

/**
 * Cuerpo `application/x-www-form-urlencoded` con ope, cod, pas y extras stringificados.
 */
export function buildFastraxFormBody(
  ope: number,
  creds: Pick<FastraxCredentials, "cod" | "pas">,
  extra: Record<string, unknown> = {}
): string {
  const params = new URLSearchParams();
  params.set("ope", String(ope));
  params.set("cod", String(creds.cod ?? "").trim());
  params.set("pas", String(creds.pas ?? "").trim());
  for (const [k, v] of Object.entries(extra)) {
    if (v == null || v === "") continue;
    params.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  return params.toString();
}

export function parseFastraxResponseText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { _raw: text.slice(0, 4000) };
  }
}

/**
 * POST a la API Fastrax. Usar solo en servidor (Edge Function, scripts Node), nunca en el browser con credenciales.
 */
export async function executeFastraxPost(
  creds: FastraxCredentials,
  ope: number,
  extra: Record<string, unknown> = {},
  options?: { format?: FastraxPostFormat; signal?: AbortSignal }
): Promise<FastraxPostResult> {
  const url = (creds.apiUrl ?? "").trim().replace(/\/$/, "");
  if (!url) return { ok: false, status: 0, message: "FASTRAX_API_URL vacía" };

  const fmt = options?.format ?? "json";
  let res: Response;
  try {
    if (fmt === "form") {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: buildFastraxFormBody(ope, creds, extra),
        signal: options?.signal,
      });
    } else {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: buildFastraxJsonPayload(ope, creds, extra),
        signal: options?.signal,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, message: `red:${msg}` };
  }

  const text = await res.text();
  const parsed = parseFastraxResponseText(text);
  if (!res.ok) {
    const msg =
      typeof parsed === "object" && parsed && "message" in parsed
        ? String((parsed as { message?: unknown }).message)
        : text.slice(0, 400);
    return { ok: false, status: res.status, message: msg || `HTTP ${res.status}`, parsed };
  }
  return { ok: true, status: res.status, parsed };
}

export type FastraxSyncStats = {
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  deactivated: number;
  images_fetched: number;
};

export type FastraxSyncSuccessResponse = {
  ok: true;
  mode: string;
  stats: FastraxSyncStats;
  products_seen: number;
  /** Primer error PostgREST (p. ej. check constraint sin fastrax o columnas faltantes). */
  db_error_sample?: string;
};

export type FastraxSyncErrorResponse = {
  ok?: false;
  error?: string;
  message?: string;
  ope?: number;
  stats?: FastraxSyncStats;
};
