/**
 * Scheduler in-process de la sincronización automática de catálogo Fastrax.
 *
 * Vive en el mismo proceso Express (sin dependencias nuevas). En el arranque
 * hace una sincronización inicial y luego repite cada `FASTRAX_SYNC_INTERVAL_MS`.
 * El estado (última corrida exitosa) se persiste en `fastrax_sync_runs`, así que
 * un reinicio del proceso retoma correctamente. Se recomienda correr el proceso
 * bajo systemd/pm2 para reinicio automático (ver docs de deploy).
 *
 * Variables:
 *  - FASTRAX_AUTO_SYNC_ENABLED  (default on; "0" apaga el scheduler)
 *  - FASTRAX_SYNC_INTERVAL_MS   (default 600000 = 10 min; clamp 60s–60min)
 *  - FASTRAX_SYNC_BOOT_DELAY_MS (default 15000; espera antes del primer tick)
 *  - FASTRAX_FULL_EVERY         (default 144; cada N ticks hace un full para
 *                                detectar bajas. 10 min * 144 ≈ 1 vez/día. 0 = nunca)
 */

import { fastraxConfigured, fastraxEnabled } from "./client.js";
import { supabaseService } from "./db.js";
import { getLastSuccessfulSyncAt, runFastraxCatalogSync } from "./sync-catalog.js";

let timer = null;
let ticks = 0;

function clamp(n, lo, hi) {
  const v = Number(n);
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

/** Arranca el scheduler (idempotente: no crea dos timers). */
export function startFastraxAutoSync() {
  if (timer) return;
  if (process.env.FASTRAX_AUTO_SYNC_ENABLED === "0") {
    console.log("[fastrax/scheduler] deshabilitado (FASTRAX_AUTO_SYNC_ENABLED=0)");
    return;
  }
  if (!fastraxEnabled() || !fastraxConfigured()) {
    console.log("[fastrax/scheduler] Fastrax no habilitado o sin credenciales; scheduler inactivo");
    return;
  }

  const intervalMs = clamp(process.env.FASTRAX_SYNC_INTERVAL_MS || 600_000, 60_000, 3_600_000);
  const bootDelay = clamp(process.env.FASTRAX_SYNC_BOOT_DELAY_MS || 15_000, 0, 300_000);
  const fullEvery = clamp(process.env.FASTRAX_FULL_EVERY || 144, 0, 100_000);

  const tick = async () => {
    try {
      const sb = supabaseService();
      const since = await getLastSuccessfulSyncAt(sb);
      const periodicFull = fullEvery > 0 && ticks > 0 && ticks % fullEvery === 0;
      // Primera corrida de la historia (sin marca previa) o full periódico → full.
      const mode = !since || periodicFull ? "full" : "incremental";
      ticks += 1;
      const r = await runFastraxCatalogSync(sb, { mode, trigger: "auto" });
      if (r.busy) return; // corrida manual en curso; saltamos este tick
      console.log(`[fastrax/scheduler] ${mode} → ${r.status || "?"}`, r.stats || {});
    } catch (e) {
      console.error("[fastrax/scheduler] error en tick:", e);
    }
  };

  setTimeout(() => {
    void tick();
    timer = setInterval(() => void tick(), intervalMs);
    // El timer no debe, por sí solo, impedir que el proceso termine.
    if (timer && typeof timer.unref === "function") timer.unref();
  }, bootDelay);

  console.log(
    `[fastrax/scheduler] activo: primer tick en ${Math.round(bootDelay / 1000)}s, ` +
      `luego cada ${Math.round(intervalMs / 1000)}s (full cada ${fullEvery || "∞"} ticks)`
  );
}

/** Detiene el scheduler (para tests / shutdown ordenado). */
export function stopFastraxAutoSync() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
