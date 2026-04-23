import crypto from "node:crypto";

function str(v) {
  if (v == null) return "";
  return String(v).trim();
}

function num(v, fallback = 0) {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pickString(obj, keys, fallback = "") {
  if (!obj || typeof obj !== "object") return fallback;
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).trim() !== "") return String(obj[k]).trim();
  }
  return fallback;
}

/** @returns {string} */
function envTrim(key) {
  if (typeof process === "undefined" || !process.env) return "";
  const v = process.env[key];
  return v != null ? String(v).trim() : "";
}

/**
 * Convierte path o URL de imagen del bridge a URL absoluta (https).
 * - Ya absoluta → sin cambios.
 * - Campo tipo Dropi `url` (relativo) → `DROPI_BRIDGE_IMG_URL` + path (estilo IMG_URL + url).
 * - `urlS3` relativo → `DROPI_BRIDGE_CDN_URL` + path (CloudFront/CDN); si no hay CDN, fallback a IMG base.
 * @param {string} raw
 * @param {"s3" | "img"} kind
 * @returns {string | null}
 */
function toAbsoluteImageUrl(raw, kind) {
  const s = str(raw);
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  const path = s.startsWith("/") ? s : `/${s}`;
  const imgBase = envTrim("DROPI_BRIDGE_IMG_URL").replace(/\/+$/, "");
  const cdnBase = envTrim("DROPI_BRIDGE_CDN_URL").replace(/\/+$/, "");
  if (kind === "s3") {
    if (cdnBase) return `${cdnBase}${path}`;
    if (imgBase) return `${imgBase}${path}`;
    return null;
  }
  if (imgBase) return `${imgBase}${path}`;
  return null;
}

/**
 * Intenta obtener URL https desde un fragmento (string u objeto con url/urlS3).
 */
function pushResolvedFromFragment(frag, kindFallback, seen, out) {
  if (frag == null) return;
  if (typeof frag === "string") {
    const abs = toAbsoluteImageUrl(frag, kindFallback);
    if (abs && !seen.has(abs)) {
      seen.add(abs);
      out.push(abs);
    }
    return;
  }
  if (typeof frag === "object") {
    const o = frag;
    const s3 = o.urlS3 ?? o.urls3 ?? o.s3_url ?? o.UrlS3;
    const u = o.url ?? o.URL ?? o.link ?? o.src;
    if (s3) {
      const abs = toAbsoluteImageUrl(String(s3), "s3");
      if (abs && !seen.has(abs)) {
        seen.add(abs);
        out.push(abs);
      }
    }
    if (u) {
      const abs = toAbsoluteImageUrl(String(u), "img");
      if (abs && !seen.has(abs)) {
        seen.add(abs);
        out.push(abs);
      }
    }
  }
}

/**
 * Aplana respuestas tipo WooCommerce / Dropi.
 * @param {unknown} parsed
 * @returns {Record<string, unknown>[]}
 */
export function extractDropiProductRows(parsed) {
  if (Array.isArray(parsed)) return parsed.filter((x) => x && typeof x === "object");
  if (!parsed || typeof parsed !== "object") return [];
  const o = parsed;
  const candidates = ["data", "products", "objects", "results", "items", "records", "rows"];
  for (const k of candidates) {
    const v = o[k];
    if (Array.isArray(v)) return v.filter((x) => x && typeof x === "object");
  }
  /** Algunas APIs envuelven en data.data */
  const inner = o.data;
  if (inner && typeof inner === "object") {
    for (const k of candidates) {
      const v = inner[k];
      if (Array.isArray(v)) return v.filter((x) => x && typeof x === "object");
    }
  }
  return [];
}

/**
 * Galería desde payload bridge / Dropi: `photos`, `url`, `urlS3`, `images`, etc.
 * Orden estable: principal (url/urlS3) → photos[] → resto.
 */
function collectImageUrls(raw) {
  const seen = new Set();
  const out = [];

  const addString = (s, kind) => {
    const abs = toAbsoluteImageUrl(str(s), kind);
    if (abs && /^https?:\/\//i.test(abs) && !seen.has(abs)) {
      seen.add(abs);
      out.push(abs);
    }
  };

  const addHttp = (s) => {
    const t = str(s);
    if ((t.startsWith("http://") || t.startsWith("https://")) && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  };

  // Bridge / plugin: raíz urlS3 (CDN) y url (IMG_URL + path)
  const rootS3 = raw?.urlS3 ?? raw?.urls3;
  if (rootS3 != null) addString(rootS3, "s3");
  const rootUrl = raw?.url;
  if (typeof rootUrl === "string" && rootUrl.trim() !== "") addString(rootUrl, "img");

  // Galería `photos` (objetos o strings)
  const photos = raw?.photos ?? raw?.Photos;
  if (Array.isArray(photos)) {
    for (const p of photos) {
      if (typeof p === "string" || typeof p === "number") {
        addString(String(p), "img");
      } else {
        pushResolvedFromFragment(p, "img", seen, out);
      }
    }
  }

  const featured = raw?.featured_image ?? raw?.featuredImage ?? raw?.image;
  if (typeof featured === "string") addString(featured, "img");
  else if (featured && typeof featured === "object") {
    pushResolvedFromFragment(featured, "img", seen, out);
    addHttp(featured.src);
    addHttp(featured.url);
    addHttp(featured.source_url);
  }

  const main = raw?.main_image ?? raw?.mainImage;
  if (typeof main === "string") addString(main, "img");
  else if (main && typeof main === "object") {
    pushResolvedFromFragment(main, "img", seen, out);
    addHttp(main.src);
    addHttp(main.url);
  }

  const imgs = raw?.images ?? raw?.Images;
  if (Array.isArray(imgs)) {
    for (const it of imgs) {
      if (typeof it === "string") addString(it, "img");
      else if (it && typeof it === "object") {
        pushResolvedFromFragment(it, "img", seen, out);
        addHttp(it.src);
        addHttp(it.url);
        addHttp(it.source_url);
        addHttp(it.guid);
      }
    }
  }

  const thumb = raw?.thumbnail ?? raw?.thumb ?? raw?.thumbnail_url;
  if (thumb != null) addString(String(thumb), "img");

  return out;
}

function pickCategory(raw) {
  const c = raw?.category ?? raw?.categories;
  if (typeof c === "string") return c.slice(0, 200);
  if (Array.isArray(c) && c.length > 0) {
    const first = c[0];
    if (typeof first === "string") return String(first).slice(0, 200);
    if (first && typeof first === "object") {
      return str(first.name || first.title || first.nombre).slice(0, 200);
    }
  }
  if (c && typeof c === "object") return str(c.name || c.title).slice(0, 200);
  return "";
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {import('./types.js').DropiNormalizedProduct | null}
 */
export function mapDropiProduct(raw) {
  if (!raw || typeof raw !== "object") return null;

  const externalId = pickString(raw, ["id", "ID", "product_id", "productId", "Id", "codigo", "external_id"]);
  if (!externalId) return null;

  let sku = pickString(raw, ["sku", "SKU", "reference", "referencia", "code"]);
  if (!sku) sku = `dropi-${externalId}`;

  const name =
    pickString(raw, ["name", "nombre", "title", "descripcion_corta"]) || `Producto Dropi ${externalId}`;

  const description =
    pickString(raw, ["description", "descripcion", "content", "short_description"]) ||
    "(Sin descripción — importado desde Dropi)";

  const category = pickCategory(raw) || "Dropi";

  const price =
    num(
      raw.sale_price ??
        raw.price_sale ??
        raw.price ??
        raw.precio ??
        raw.Price ??
        raw.public_price ??
        raw.suggested_price,
      0
    );

  const stock = Math.max(
    0,
    Math.round(
      num(
        raw.stock ?? raw.quantity ?? raw.qty ?? raw.inventory ?? raw.inventories ?? raw.stock_quantity,
        0
      )
    )
  );

  const brand = pickString(raw, ["brand", "marca", "Brand"]);

  const imageUrls = collectImageUrls(raw);
  const weightKgRaw = raw.weight ?? raw.weight_kg ?? raw.peso;
  const weightKg =
    weightKgRaw != null && String(weightKgRaw).trim() !== ""
      ? Math.max(0, num(weightKgRaw, NaN))
      : null;
  const weightKgOut = Number.isFinite(weightKg) ? weightKg : null;

  const dims = pickString(raw, ["dimensions", "dimensiones", "size_label"]);

  const crcPayload = JSON.stringify({
    externalId,
    sku,
    name,
    description: description.slice(0, 120),
    category,
    price: Math.round(price * 100) / 100,
    stock,
    brand,
    imgs: imageUrls.slice(0, 12),
  });
  const syncCrc = crypto.createHash("sha256").update(crcPayload).digest("hex").slice(0, 32);

  return {
    externalId,
    sku: sku.slice(0, 200),
    name: name.slice(0, 500),
    description: description.slice(0, 20000),
    category: category.slice(0, 300),
    price,
    stock,
    brand: brand.slice(0, 200),
    imageUrls,
    weightKg: weightKgOut,
    dimensionsLabel: dims ? dims.slice(0, 300) : null,
    syncCrc,
  };
}
