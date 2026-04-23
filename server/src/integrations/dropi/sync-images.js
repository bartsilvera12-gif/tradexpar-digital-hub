import crypto from "node:crypto";
import { publicStorageBaseUrl } from "./db.js";

function utcNowIso() {
  return new Date().toISOString();
}

function extFromMime(ct) {
  const c = (ct || "").toLowerCase();
  if (c.includes("png")) return "png";
  if (c.includes("webp")) return "webp";
  if (c.includes("gif")) return "gif";
  if (c.includes("jpeg") || c.includes("jpg")) return "jpg";
  return "bin";
}

function extFromUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.split("/").pop() || "";
    const m = /\.([a-zA-Z0-9]{2,5})$/.exec(path);
    if (m) return m[1].toLowerCase().slice(0, 5);
  } catch {
    /* ignore */
  }
  return null;
}

async function replaceUrlsOnProduct(sb, productId, sourceUrl, publicUrl) {
  const { data: row, error } = await sb.from("products").select("image, images").eq("id", productId).maybeSingle();
  if (error || !row) return;

  const imgsIn = Array.isArray(row.images) ? row.images : [];
  const nextImgs = imgsIn.map((u) => (String(u) === sourceUrl ? publicUrl : String(u)));

  let primary = String(row.image ?? "");
  if (primary === sourceUrl) primary = publicUrl;

  await sb
    .from("products")
    .update({
      image: primary,
      images: nextImgs.length ? nextImgs : [publicUrl],
      updated_at: utcNowIso(),
    })
    .eq("id", productId);
}

/**
 * Procesa filas pendientes en dropi_image_queue → storage.catalog-images
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {{ batchSize?: number }} opts
 */
export async function processDropiImageQueue(sb, opts = {}) {
  const batchSize = Math.max(1, Math.min(Number(opts.batchSize) || 35, 200));
  const bucket = String(process.env.DROPI_STORAGE_BUCKET || "catalog-images").trim() || "catalog-images";

  const stats = {
    downloaded: 0,
    failed: 0,
    skipped: 0,
    errors_sample: [],
  };

  const { data: pending, error: qErr } = await sb
    .from("dropi_image_queue")
    .select("id, product_id, source_url, attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(batchSize);

  if (qErr) throw qErr;
  const rows = pending ?? [];

  const base = publicStorageBaseUrl();

  for (const job of rows) {
    const id = job.id;
    const productId = job.product_id;
    const sourceUrl = job.source_url;
    const attemptsNext = (job.attempts ?? 0) + 1;

    await sb
      .from("dropi_image_queue")
      .update({
        status: "processing",
        attempts: attemptsNext,
        updated_at: utcNowIso(),
      })
      .eq("id", id);

    try {
      const res = await fetch(sourceUrl, {
        redirect: "follow",
        headers: {
          Accept: "image/*,*/*;q=0.8",
          "User-Agent": "TradexparDropiImageFetcher/1.0",
        },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} al descargar imagen`);
      }

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 64) {
        throw new Error("Respuesta demasiado pequeña para ser una imagen");
      }

      const mime = res.headers.get("content-type") || "application/octet-stream";
      const extGuess = extFromMime(mime);
      const ext =
        extGuess !== "bin" ? extGuess : extFromUrl(sourceUrl) || "jpg";
      const path = `dropi/${productId}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await sb.storage.from(bucket).upload(path, buf, {
        contentType: mime.includes("image") ? mime : `image/${ext === "jpg" ? "jpeg" : ext}`,
        upsert: true,
      });

      if (upErr) {
        throw new Error(upErr.message || String(upErr));
      }

      const { data: pub } = sb.storage.from(bucket).getPublicUrl(path);
      const publicUrl =
        pub?.publicUrl ||
        `${base.replace(/\/+$/, "")}/storage/v1/object/public/${bucket}/${path}`;

      await sb
        .from("dropi_image_queue")
        .update({
          status: "done",
          storage_path: path,
          public_url: publicUrl,
          error: null,
          updated_at: utcNowIso(),
        })
        .eq("id", id);

      await replaceUrlsOnProduct(sb, productId, sourceUrl, publicUrl);
      stats.downloaded++;
    } catch (e) {
      stats.failed++;
      const msg = e instanceof Error ? e.message : String(e);
      if (stats.errors_sample.length < 8) stats.errors_sample.push(msg.slice(0, 400));

      await sb
        .from("dropi_image_queue")
        .update({
          status: "failed",
          error: msg.slice(0, 1500),
          updated_at: utcNowIso(),
        })
        .eq("id", id);
    }
  }

  return stats;
}
