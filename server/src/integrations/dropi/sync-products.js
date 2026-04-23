import { fetchDropiProductDetail, fetchDropiProductList } from "./client.js";
import { extractDropiProductRows, mapDropiProduct } from "./mapper.js";

/** @param {import('@supabase/supabase-js').SupabaseClient} sb */

function utcNowIso() {
  return new Date().toISOString();
}

function emptyStats() {
  return {
    total_read: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    duplicates_skipped: 0,
    failed: 0,
    images_queued: 0,
    errors_sample: [],
  };
}

function pushSample(arr, msg, limit = 8) {
  if (!msg || arr.length >= limit) return;
  arr.push(String(msg).slice(0, 400));
}

/**
 * Normaliza ids desde body JSON (strings o números).
 * @param {unknown} ids
 * @returns {string[]}
 */
function normalizeIncomingIds(ids) {
  if (!Array.isArray(ids)) return [];
  const out = [];
  for (const x of ids) {
    const s = String(x).trim();
    if (s) out.push(s);
  }
  return [...new Set(out)];
}

/**
 * Una fila producto desde respuesta GET /product/{id} (objeto raíz o objects[0]).
 */
function rawProductFromBridgeDetail(parsed, requestedId) {
  const rows = extractDropiProductRows(parsed);
  let raw = rows.length > 0 ? rows[0] : null;
  if (!raw && parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    raw = parsed;
  }
  if (!raw || typeof raw !== "object") {
    throw new Error(`Sin datos de producto en la respuesta del bridge (id ${requestedId})`);
  }
  const idStr = String(requestedId);
  if (raw.id == null && raw.ID == null) {
    return { ...raw, id: idStr };
  }
  return raw;
}

/**
 * Decide insert / update / colisión SKU con catálogo manual o Fastrax.
 */
async function resolveUpsert(sb, mapped) {
  const { data: byExt, error: e1 } = await sb
    .from("products")
    .select("id, external_sync_crc, product_source_type")
    .eq("external_provider", "dropi")
    .eq("external_product_id", mapped.externalId)
    .maybeSingle();
  if (e1) throw e1;
  if (byExt?.id) return { mode: "update", id: byExt.id, prevCrc: byExt.external_sync_crc ?? null };

  const { data: bySkuDropi, error: e2 } = await sb
    .from("products")
    .select("id, external_sync_crc")
    .eq("sku", mapped.sku)
    .eq("product_source_type", "dropi")
    .maybeSingle();
  if (e2) throw e2;
  if (bySkuDropi?.id) return { mode: "update", id: bySkuDropi.id, prevCrc: bySkuDropi.external_sync_crc ?? null };

  const { data: blocking, error: e3 } = await sb
    .from("products")
    .select("id")
    .eq("sku", mapped.sku)
    .in("product_source_type", ["tradexpar", "fastrax"])
    .limit(3);
  if (e3) throw e3;
  if (blocking?.length) return { mode: "collision" };

  return { mode: "insert" };
}

async function enqueueImages(sb, productId, urls, syncRunId) {
  let n = 0;
  const uniq = [...new Set(urls.filter((u) => /^https?:\/\//i.test(u)))];
  let sortIndex = 0;
  for (const sourceUrl of uniq) {
    const { data: existing } = await sb
      .from("dropi_image_queue")
      .select("id")
      .eq("product_id", productId)
      .eq("source_url", sourceUrl)
      .eq("status", "pending")
      .maybeSingle();
    if (existing?.id) continue;

    const { error } = await sb.from("dropi_image_queue").insert({
      product_id: productId,
      source_url: sourceUrl,
      sort_index: sortIndex++,
      status: "pending",
      sync_run_id: syncRunId,
      updated_at: utcNowIso(),
    });
    if (!error) n++;
    else if (!String(error.message || "").includes("duplicate") && error.code !== "23505") {
      console.warn("[dropi/sync-products] cola imagen:", error.message || error);
    }
  }
  return n;
}

function buildProductRow(raw, mapped) {
  const imgs = mapped.imageUrls.length ? mapped.imageUrls : [];
  const primary = imgs[0] ?? "";
  /** jsonb: vacío como null para alinear con otros inserts del proyecto */
  const row = {
    name: mapped.name,
    sku: mapped.sku,
    description: mapped.description,
    category: mapped.category,
    price: mapped.price,
    stock: mapped.stock,
    image: primary,
    images: imgs.length ? imgs : null,
    product_source_type: "dropi",
    external_provider: "dropi",
    external_product_id: mapped.externalId,
    external_payload: raw,
    external_sync_crc: mapped.syncCrc,
    external_last_sync_at: utcNowIso(),
    external_active: true,
    updated_at: utcNowIso(),
    brand: mapped.brand || "",
  };
  if (mapped.weightKg != null) row.weight_kg = mapped.weightKg;
  if (mapped.dimensionsLabel) row.dimensions_label = mapped.dimensionsLabel;
  return row;
}

/**
 * Upsert un raw Dropi ya mapeable por `mapDropiProduct`.
 */
async function upsertDropiProductRow(sb, raw, syncRunId, stats) {
  try {
    const mapped = mapDropiProduct(raw);
    if (!mapped) {
      stats.failed++;
      pushSample(stats.errors_sample, "Producto sin id externo mapeable");
      return;
    }

    await sb.from("dropi_source_products_raw").insert({
      sync_run_id: syncRunId,
      external_product_id: mapped.externalId,
      raw,
      fetched_at: utcNowIso(),
    });

    const decision = await resolveUpsert(sb, mapped);
    if (decision.mode === "collision") {
      stats.duplicates_skipped++;
      return;
    }

    const baseRow = buildProductRow(raw, mapped);

    if (decision.mode === "update") {
      if (decision.prevCrc === mapped.syncCrc) {
        stats.unchanged++;
        const q = await enqueueImages(sb, decision.id, mapped.imageUrls, syncRunId);
        stats.images_queued += q;
        return;
      }
      const { error: upErr } = await sb.from("products").update(baseRow).eq("id", decision.id);
      if (upErr) throw upErr;
      stats.updated++;

      await sb.from("dropi_product_map").upsert(
        {
          external_product_id: mapped.externalId,
          product_id: decision.id,
          updated_at: utcNowIso(),
        },
        { onConflict: "external_product_id" }
      );

      const q = await enqueueImages(sb, decision.id, mapped.imageUrls, syncRunId);
      stats.images_queued += q;
    } else {
      const { data: ins, error: insErr } = await sb.from("products").insert(baseRow).select("id").single();
      if (insErr) throw insErr;
      const pid = ins?.id;
      if (!pid) throw new Error("Insert sin id");
      stats.created++;

      await sb.from("dropi_product_map").upsert(
        {
          external_product_id: mapped.externalId,
          product_id: pid,
          updated_at: utcNowIso(),
        },
        { onConflict: "external_product_id" }
      );

      const q = await enqueueImages(sb, pid, mapped.imageUrls, syncRunId);
      stats.images_queued += q;
    }
  } catch (e) {
    stats.failed++;
    pushSample(stats.errors_sample, e instanceof Error ? e.message : String(e));
  }
}

async function finalizeSyncRun(sb, syncRunId, stats) {
  const status =
    stats.failed > 0 && stats.created + stats.updated + stats.unchanged === 0
      ? "failed"
      : stats.failed > 0
        ? "partial"
        : "success";

  await sb
    .from("dropi_sync_runs")
    .update({
      finished_at: utcNowIso(),
      status,
      stats,
    })
    .eq("id", syncRunId);
}

/**
 * Importación por IDs (bridge GET /product/{id}).
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string[]} ids
 */
async function runDropiProductSyncByIds(sb, ids) {
  const stats = emptyStats();
  const modo = "ids";

  const { data: runRow, error: runErr } = await sb
    .from("dropi_sync_runs")
    .insert({
      status: "running",
      mode: "sync_test",
      stats: {},
      meta: { sync_mode: modo, ids },
      started_at: utcNowIso(),
    })
    .select("id")
    .single();

  if (runErr || !runRow?.id) {
    throw new Error(runErr?.message || "No se pudo crear dropi_sync_runs");
  }
  const syncRunId = runRow.id;

  try {
    console.info("[dropi/sync-products]", {
      modo,
      idsSolicitados: ids,
      cantidadIds: ids.length,
    });

    for (const id of ids) {
      stats.total_read++;
      try {
        const parsed = await fetchDropiProductDetail(id);
        const raw = rawProductFromBridgeDetail(parsed, id);
        await upsertDropiProductRow(sb, raw, syncRunId, stats);
      } catch (e) {
        stats.failed++;
        pushSample(stats.errors_sample, `[id ${id}] ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const importados = stats.created + stats.updated + stats.unchanged;
    console.info("[dropi/sync-products]", {
      modo,
      idsProcesados: ids,
      importadosExitosos: importados,
      creados: stats.created,
      actualizados: stats.updated,
      sinCambios: stats.unchanged,
      fallidos: stats.failed,
      imagenesEncoladas: stats.images_queued,
    });

    await finalizeSyncRun(sb, syncRunId, stats);
    return { ok: true, sync_run_id: syncRunId, stats, meta: { modo, ids } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    pushSample(stats.errors_sample, msg);
    await sb
      .from("dropi_sync_runs")
      .update({
        finished_at: utcNowIso(),
        status: "failed",
        stats,
        error_message: msg.slice(0, 2000),
      })
      .eq("id", syncRunId);
    throw e;
  }
}

/**
 * Importación Dropi → tradexpar.products (+ raw + map + cola imágenes).
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {{ limit?: number, ids?: string[] }} options
 */
export async function runDropiProductSync(sb, options = {}) {
  const ids = normalizeIncomingIds(options.ids);
  if (ids.length > 0) {
    return runDropiProductSyncByIds(sb, ids);
  }

  const limit = Math.max(1, Math.min(Number(options.limit) || 10, 500));
  const stats = emptyStats();
  const modo = "default";

  const { data: runRow, error: runErr } = await sb
    .from("dropi_sync_runs")
    .insert({
      status: "running",
      mode: limit <= 10 ? "sync_test" : "sync_full",
      stats: {},
      meta: { limit_requested: limit, sync_mode: modo },
      started_at: utcNowIso(),
    })
    .select("id")
    .single();

  if (runErr || !runRow?.id) {
    throw new Error(runErr?.message || "No se pudo crear dropi_sync_runs");
  }
  const syncRunId = runRow.id;

  try {
    console.info("[dropi/sync-products]", { modo, listado: "GET /products (bridge)", limit });

    const parsed = await fetchDropiProductList();
    if (String(process.env.DROPI_LIST_DEBUG ?? "").trim() === "1") {
      const objs = parsed && typeof parsed === "object" ? parsed.objects : undefined;
      let tipoObjects = "undefined";
      if (objs === null) tipoObjects = "null";
      else if (Array.isArray(objs)) tipoObjects = "array";
      else if (objs !== undefined) tipoObjects = typeof objs;
      console.info("[dropi/sync-products] respuesta listado", {
        cantidadObjetos: Array.isArray(objs) ? objs.length : "(no array)",
        tipoParsedObjects: tipoObjects,
        clavesJsonSuperior:
          parsed && typeof parsed === "object" ? Object.keys(parsed).slice(0, 30) : [],
      });
    }
    const rows = extractDropiProductRows(parsed);
    const slice = rows.slice(0, limit);
    stats.total_read = slice.length;

    for (const raw of slice) {
      await upsertDropiProductRow(sb, raw, syncRunId, stats);
    }

    const importados = stats.created + stats.updated + stats.unchanged;
    console.info("[dropi/sync-products]", {
      modo,
      productosLeidosLista: stats.total_read,
      importadosExitosos: importados,
      creados: stats.created,
      actualizados: stats.updated,
      fallidos: stats.failed,
      imagenesEncoladas: stats.images_queued,
    });

    await finalizeSyncRun(sb, syncRunId, stats);

    return { ok: true, sync_run_id: syncRunId, stats, meta: { modo } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    pushSample(stats.errors_sample, msg);
    await sb
      .from("dropi_sync_runs")
      .update({
        finished_at: utcNowIso(),
        status: "failed",
        stats,
        error_message: msg.slice(0, 2000),
      })
      .eq("id", syncRunId);
    throw e;
  }
}
