/**
 * Sincronización de stock/catálogo Dropi + Fastrax → `tradexpar.products`.
 * Reutiliza `runDropiProductSync` y `runFastraxProductSync` sin duplicar lógica.
 */

import { dropiConfigured } from "../integrations/dropi/client.js";
import { supabaseService } from "../integrations/dropi/db.js";
import { runDropiProductSync } from "../integrations/dropi/sync-products.js";
import { runFastraxProductSync } from "../integrations/fastrax/sync-products.js";

function envInt(key, fallback) {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Máximo de filas del listado Dropi por corrida (bridge GET /products). Default 500 (máx. del sync). */
const dropiListLimit = () => Math.min(500, Math.max(1, envInt("STOCK_SYNC_DROPI_LIMIT", 500)));

/**
 * @returns {Promise<{ ok: boolean, dropi_updated: number, fastrax_updated: number, errors: string[] }>}
 */
export async function syncAllStock() {
  const errors = [];
  let dropi_updated = 0;
  let fastrax_updated = 0;

  const sb = supabaseService();

  if (dropiConfigured()) {
    try {
      const r = await runDropiProductSync(sb, { limit: dropiListLimit() });
      const st = r?.stats;
      if (st) {
        dropi_updated = (Number(st.updated) || 0) + (Number(st.created) || 0);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`dropi: ${msg}`);
    }
  }

  try {
    const fr = await runFastraxProductSync(sb);
    if (fr.ok && fr.stats) {
      fastrax_updated = (Number(fr.stats.inserted) || 0) + (Number(fr.stats.updated) || 0);
    } else {
      const err = String(fr.error ?? "unknown");
      if (err !== "FASTRAX_DISABLED") {
        errors.push(`fastrax: ${err}`);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`fastrax: ${msg}`);
  }

  const ok = errors.length === 0;

  console.log("[CRON SYNC STOCK]", {
    dropi_updated,
    fastrax_updated,
    errors,
  });

  return { ok, dropi_updated, fastrax_updated, errors };
}
