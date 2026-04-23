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

function collectImageUrls(raw) {
  const urls = new Set();
  const add = (u) => {
    const s = str(u);
    if (s.startsWith("http://") || s.startsWith("https://")) urls.add(s);
  };

  const featured = raw?.featured_image ?? raw?.featuredImage ?? raw?.image;
  if (typeof featured === "string") add(featured);
  if (featured && typeof featured === "object") {
    add(featured.src);
    add(featured.url);
    add(featured.source_url);
  }

  const main = raw?.main_image ?? raw?.mainImage;
  if (typeof main === "string") add(main);
  if (main && typeof main === "object") {
    add(main.src);
    add(main.url);
  }

  const imgs = raw?.images ?? raw?.Images;
  if (Array.isArray(imgs)) {
    for (const it of imgs) {
      if (typeof it === "string") add(it);
      else if (it && typeof it === "object") {
        add(it.src);
        add(it.url);
        add(it.source_url);
        add(it.guid);
      }
    }
  }
  return [...urls];
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
