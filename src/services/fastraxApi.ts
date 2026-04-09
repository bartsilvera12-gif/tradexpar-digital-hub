/**
 * Fastrax — tipos y constantes de catálogo.
 *
 * Las credenciales y las llamadas HTTP a Fastrax **no** deben ir al bundle del navegador.
 * La sincronización se ejecuta en la Edge Function `fastrax-sync-catalog`, con secretos
 * `FASTRAX_API_URL`, `FASTRAX_COD`, `FASTRAX_PAS` en Supabase.
 */

/** Operaciones de catálogo permitidas (documentación alineada al servidor). */
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
};

export type FastraxSyncErrorResponse = {
  ok?: false;
  error?: string;
  message?: string;
  ope?: number;
  stats?: FastraxSyncStats;
};
