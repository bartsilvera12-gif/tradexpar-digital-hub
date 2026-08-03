/**
 * Sincronización automática de catálogo Fastrax (ÚNICO flujo oficial).
 *
 * Reutiliza el cliente (ope=4 listado, ope=98 saldos, ope=99 cambios-desde), el
 * mapper y el upsert existentes. Dos modos:
 *  - `full`: recorre todo el catálogo (ope=4) + saldos (ope=98) y refresca el
 *    stock de los productos ya importados. Se usa en el arranque inicial. NO
 *    desactiva por ausencia en el escaneo (evita apagar productos por un ope=4
 *    incompleto); la baja se maneja solo por señal explícita de Fastrax.
 *  - `incremental`: solo los productos modificados desde la última corrida
 *    exitosa (ope=99) + saldos (ope=98) de esos SKU. Se usa cada N minutos.
 *
 * La actualización automática toca SOLO campos técnicos (stock, disponibilidad,
 * external_last_sync_at, CRC) — nunca nombre/categoría/imagen/descripción (ver
 * `upsertFastraxStockOnly`). Cada corrida queda auditada en
 * `tradexpar.fastrax_sync_runs`. Una falla de la API no deja el catálogo a medias
 * sin poder auditarlo: el run queda en estado `failed`/`partial` con el detalle.
 */

import {
  fastraxConfigured,
  fastraxEnabled,
  fastraxOpe4PageSize,
  listBalancesOpe98,
  listChangedProductsOpe99,
  listProductsPage,
} from "./client.js";
import { upsertFastraxStockOnly } from "./fastraxProductUpsert.js";
import { extractProductRows, fastraxRowHasStock, mapFastraxRowToProduct } from "./mapper.js";

const DEFAULT_MAX_PAGES = 200;
const RUNS_TABLE = "fastrax_sync_runs";

/** Candado en memoria: un solo proceso Node, evita que auto + manual se solapen. */
let SYNC_IN_PROGRESS = false;

/** ¿Hay una sincronización en curso ahora mismo? */
export function isFastraxSyncRunning() {
  return SYNC_IN_PROGRESS;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reintenta una llamada que devuelve `{ ok }` (el cliente Fastrax no lanza, ya
 * captura timeouts). Backoff exponencial. Devuelve el último resultado.
 * @template {{ ok?: boolean }} R
 * @param {() => Promise<R>} fn
 * @param {{ retries?: number, baseDelayMs?: number }} [opts]
 * @returns {Promise<R>}
 */
async function withRetries(fn, opts = {}) {
  const retries = opts.retries ?? 2;
  const baseDelayMs = opts.baseDelayMs ?? 800;
  let last;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    last = await fn();
    if (last && last.ok) return last;
    if (attempt < retries) await sleep(baseDelayMs * 2 ** attempt);
  }
  return /** @type {R} */ (last);
}

/**
 * Mezcla los saldos de ope=98 sobre el mapa `seen`. Solo pisa el stock cuando la
 * fila ope=98 informó saldo (no borra un saldo bueno con un 0 fantasma). Si
 * `onlyKnown`, ignora SKU que no estaban en `seen` (modo incremental).
 * @param {Map<string, any>} seen
 * @param {unknown} parsed98
 * @param {boolean} onlyKnown
 */
function mergeBalances(seen, parsed98, onlyKnown) {
  for (const raw of extractProductRows(parsed98)) {
    if (!raw || typeof raw !== "object") continue;
    const m = mapFastraxRowToProduct(/** @type {Record<string, unknown>} */ (raw));
    if (!m) continue;
    const prev = seen.get(m.external_sku);
    if (prev) {
      seen.set(m.external_sku, {
        ...prev,
        price: m.price || prev.price,
        stock: fastraxRowHasStock(/** @type {Record<string, unknown>} */ (raw)) ? m.stock : prev.stock,
        external_payload: m.external_payload,
      });
    } else if (!onlyKnown) {
      seen.set(m.external_sku, m);
    }
  }
}

/**
 * Recorre TODO el catálogo por ope=4 (paginado) y mezcla ope=98.
 * @param {{ maxPages?: number }} [opts]
 * @returns {Promise<{ ok: boolean, seen: Map<string, any>, error?: string, meta: Record<string, unknown> }>}
 */
async function collectFull(opts = {}) {
  const maxPages = Math.max(1, Math.min(500, Number(opts.maxPages) || DEFAULT_MAX_PAGES));
  const pageSize = fastraxOpe4PageSize();
  const seen = new Map();
  let pagesScanned = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    const r = await withRetries(() => listProductsPage(page));
    if (!r.ok) {
      return { ok: false, seen, error: r.message || "ope=4 falló", meta: { ope4_page: page } };
    }
    const rows = extractProductRows(r.parsed);
    if (rows.length === 0) break;
    for (const raw of rows) {
      if (!raw || typeof raw !== "object") continue;
      const m = mapFastraxRowToProduct(/** @type {Record<string, unknown>} */ (raw));
      if (m) seen.set(m.external_sku, m);
    }
    pagesScanned = page;
    if (rows.length < pageSize) break;
  }

  const b = await withRetries(() => listBalancesOpe98());
  if (b.ok && b.parsed) mergeBalances(seen, b.parsed, false);

  return { ok: true, seen, meta: { pages_scanned: pagesScanned, ope98_ok: !!b.ok } };
}

/**
 * Solo los productos modificados desde `since` (ope=99) + saldos (ope=98) de esos
 * SKU. Si ope=99 falla, devuelve ok:false para que el orquestador caiga a full.
 * @param {Date | string | number} since
 * @returns {Promise<{ ok: boolean, seen: Map<string, any>, error?: string, meta: Record<string, unknown> }>}
 */
async function collectChanged(since) {
  const seen = new Map();
  const r = await withRetries(() => listChangedProductsOpe99(since));
  if (!r.ok) {
    return { ok: false, seen, error: r.message || "ope=99 falló", meta: {} };
  }
  for (const raw of extractProductRows(r.parsed)) {
    if (!raw || typeof raw !== "object") continue;
    const m = mapFastraxRowToProduct(/** @type {Record<string, unknown>} */ (raw));
    if (m) seen.set(m.external_sku, m);
  }
  // Saldos frescos solo para los SKU que cambiaron.
  if (seen.size > 0) {
    const b = await withRetries(() => listBalancesOpe98());
    if (b.ok && b.parsed) mergeBalances(seen, b.parsed, true);
  }
  return { ok: true, seen, meta: { ope99_changed: seen.size } };
}

/**
 * Aplica los upserts stock-only. Nunca lanza: acumula fallos por fila.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {Map<string, any>} seen
 */
async function applyUpserts(sb, seen) {
  // skipped = SKU de Fastrax que no está importado en el catálogo local (no se
  // inserta desde el sync automático; el alta es manual por el panel).
  const stats = { reviewed: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 };
  const errors = [];
  for (const m of seen.values()) {
    stats.reviewed += 1;
    const u = await upsertFastraxStockOnly(sb, m, { skipUnchanged: true });
    if (!u.ok) {
      stats.failed += 1;
      if (errors.length < 20) errors.push(`${m.external_sku}: ${String(u.error || "upsert")}`);
    } else if (u.action === "updated") stats.updated += 1;
    else if (u.action === "skipped") stats.skipped += 1;
    else stats.unchanged += 1;
  }
  return { stats, errors };
}

/**
 * Marca de la última sincronización exitosa (o parcial) para el modo incremental.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @returns {Promise<Date | null>}
 */
export async function getLastSuccessfulSyncAt(sb) {
  const { data, error } = await sb
    .from(RUNS_TABLE)
    .select("finished_at")
    .in("status", ["success", "partial"])
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.finished_at) return null;
  const d = new Date(data.finished_at);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Última corrida (para el panel: estado, contadores, fecha/hora). */
export async function getLastSyncRun(sb) {
  const { data, error } = await sb
    .from(RUNS_TABLE)
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, run: data ?? null };
}

/**
 * Ejecuta una sincronización completa del catálogo Fastrax y la audita.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {{
 *   mode?: 'full' | 'incremental',
 *   trigger?: 'auto' | 'manual',
 *   since?: Date | string | number | null,
 *   maxPages?: number,
 * }} [options]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function runFastraxCatalogSync(sb, options = {}) {
  if (SYNC_IN_PROGRESS) {
    return { ok: false, busy: true, error: "SYNC_IN_PROGRESS" };
  }
  if (!fastraxEnabled()) return { ok: false, error: "FASTRAX_DISABLED" };
  if (!fastraxConfigured()) return { ok: false, error: "Fastrax no configurado (FASTRAX_* en .env)" };

  const trigger = options.trigger === "manual" ? "manual" : "auto";
  let mode = options.mode === "full" ? "full" : "incremental";
  // Sin marca previa no hay "desde": arrancamos con un full.
  let since = options.since ? new Date(options.since) : null;
  if (mode === "incremental" && (!since || Number.isNaN(since.getTime()))) {
    since = await getLastSuccessfulSyncAt(sb);
    if (!since) mode = "full";
  }

  SYNC_IN_PROGRESS = true;
  const startedAt = new Date().toISOString();
  let runId = null;
  const meta = {};

  // Registrar la corrida (best-effort: si falla el insert, igual sincronizamos).
  try {
    const { data, error } = await sb
      .from(RUNS_TABLE)
      .insert([{ started_at: startedAt, status: "running", mode, trigger, since: since ? since.toISOString() : null }])
      .select("id")
      .maybeSingle();
    if (!error && data?.id) runId = data.id;
  } catch (e) {
    console.error("[fastrax/sync] no se pudo registrar el run:", e);
  }

  const finish = async (status, stats, errorMessage) => {
    SYNC_IN_PROGRESS = false;
    if (runId) {
      try {
        await sb
          .from(RUNS_TABLE)
          .update({
            finished_at: new Date().toISOString(),
            status,
            stats: stats || {},
            error_message: errorMessage || null,
            meta,
          })
          .eq("id", runId);
      } catch (e) {
        console.error("[fastrax/sync] no se pudo cerrar el run:", e);
      }
    }
    return { ok: status !== "failed", status, mode, trigger, run_id: runId, stats: stats || {}, error: errorMessage || undefined, meta };
  };

  try {
    // 1) Recolectar (incremental con fallback a full si ope=99 falla).
    let collected;
    if (mode === "incremental" && since) {
      collected = await collectChanged(since);
      if (!collected.ok) {
        meta.incremental_fallback = collected.error || "ope=99 falló";
        mode = "full";
        collected = await collectFull({ maxPages: options.maxPages });
      }
    } else {
      collected = await collectFull({ maxPages: options.maxPages });
    }
    Object.assign(meta, collected.meta || {});

    if (!collected.ok) {
      // La API no respondió: no tocamos el catálogo (sin estado parcial silencioso).
      return finish("failed", { reviewed: 0 }, collected.error || "fallo al leer Fastrax");
    }

    // 2) Aplicar cambios de stock/estado.
    const { stats, errors } = await applyUpserts(sb, collected.seen);
    if (errors.length) meta.upsert_errors = errors;

    // NOTA: NO se desactivan productos por "no aparecer en el escaneo". Un ope=4
    // incompleto (cap de páginas, respuesta parcial) apagaría productos buenos y
    // les pondría stock 0 —justo la "falla temporal" que hay que evitar—. La baja
    // de disponibilidad se maneja SOLO por señal explícita de Fastrax (bloqueo /
    // precio 0), dentro de upsertFastraxStockOnly (external_active).

    const hadFailures = stats.failed > 0;
    const status = hadFailures ? "partial" : "success";
    const errMsg = hadFailures ? (errors[0] || "fallos parciales") : null;
    return finish(status, stats, errMsg);
  } catch (e) {
    console.error("[fastrax/sync] excepción:", e);
    return finish("failed", { reviewed: 0 }, e instanceof Error ? e.message : String(e));
  }
}
