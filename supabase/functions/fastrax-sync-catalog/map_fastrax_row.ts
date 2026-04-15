/**
 * Mapeo de filas JSON Fastrax (documentación: ope 1/2/98/99) → campos locales.
 * Campos típicos: sku, sta, sal, crc (ope=1); nom, pre, prm, des, bre, cat, mar, img (ope=2); atv activo.
 */

export function num(v: unknown): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

export function truthy(v: unknown): boolean {
  if (v === true) return true;
  if (v === false || v == null) return false;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    return t === "1" || t === "true" || t === "s" || t === "si" || t === "yes";
  }
  if (typeof v === "number") return v !== 0;
  return false;
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

export function pickSku(row: Record<string, unknown>): string {
  const keys = [
    "sku", "SKU",
    "codigo", "Codigo", "cod_art", "CodArt", "COD_ART", "articulo", "Articulo",
    "codigo_articulo", "id_articulo", "CODIGO", "CodigoArticulo", "codigoArt", "ref", "Ref",
  ];
  for (const k of keys) {
    const v = str(row[k]);
    if (v) return v;
  }
  return "";
}

/** Doc Fastrax ope=2: `nom` */
export function pickName(row: Record<string, unknown>): string {
  const keys = ["nom", "Nom", "nombre", "Nombre", "name", "titulo", "Titulo", "descripcion_corta", "descripcion", "Descripcion"];
  for (const k of keys) {
    const v = str(row[k]);
    if (v) return v.slice(0, 500);
  }
  return "";
}

/** Doc: `des` o `bre` */
export function pickDescription(row: Record<string, unknown>): string {
  const des = str(row.des ?? row.Des);
  if (des.length > 0) return des.slice(0, 8000);
  const bre = str(row.bre ?? row.Bre);
  if (bre.length > 0) return bre.slice(0, 8000);
  const longKeys = ["descripcion_larga", "detalle", "observacion", "DescripcionLarga", "descripcion_web"];
  for (const k of longKeys) {
    const v = str(row[k]);
    if (v.length > 3) return v.slice(0, 8000);
  }
  const short = str(row.descripcion ?? row.Descripcion ?? row.descripcion_corta);
  if (short) return short.slice(0, 8000);
  return pickName(row);
}

/** Doc: `cat`, `mar` */
export function pickCategory(row: Record<string, unknown>): string {
  const cat = str(row.cat ?? row.Cat ?? row.categoria ?? row.Categoria);
  const mar = str(row.mar ?? row.Mar ?? row.marca ?? row.Marca);
  if (cat && mar) return `${cat.slice(0, 100)} — ${mar.slice(0, 100)}`.slice(0, 200);
  if (cat) return cat.slice(0, 200);
  if (mar) return mar.slice(0, 200);
  const keys = ["rubro", "Rubro", "familia", "Familia"];
  for (const k of keys) {
    const v = str(row[k]);
    if (v) return v.slice(0, 200);
  }
  return "";
}

/**
 * Doc: `pre` lista, precio promo `prm` / `precopromo` si promo activa (`pmp`, `ppm`, `pro`, etc.).
 */
export function pickPrice(row: Record<string, unknown>): number {
  const pre = num(row.pre ?? row.Pre);
  const prm = num(row.prm ?? row.Prm ?? row.precopromo ?? row.PrecioPromo);
  /** Promo solo con bandera explícita (doc: si hay promo activa), no inferir solo comparando prm y pre. */
  const promoOn = truthy(
    row.pmp ?? row.ppm ?? row.pro ?? row.prom ?? row.promo_activa ?? row.promoActiva ?? row.en_promo
  );
  if (promoOn && prm > 0) return Math.max(0, prm);
  if (prm > 0 && pre <= 0) return Math.max(0, prm);
  if (pre > 0) return Math.max(0, pre);

  const promoKeys = ["precio_promo", "precio_promocional", "precio_oferta", "precio_especial"];
  const normalKeys = ["precio", "Precio", "precio_venta", "importe"];
  for (const k of promoKeys) {
    const p = num(row[k]);
    if (p > 0) return Math.max(0, p);
  }
  for (const k of normalKeys) {
    const p = num(row[k]);
    if (p > 0) return Math.max(0, p);
  }
  return 0;
}

/** Doc ope=1/98: `sal` saldo */
export function pickStock(row: Record<string, unknown>): number {
  const keys = ["sal", "Sal", "saldo", "Saldo", "stock", "Stock", "cantidad", "existencia", "disponible"];
  for (const k of keys) {
    const n = Math.floor(num(row[k]));
    if (n >= 0) return n;
  }
  return 0;
}

/**
 * Doc: `atv` activo; `sta` estado; bloqueos genéricos.
 * Si no hay señal, se considera activo salvo bloqueo explícito.
 */
export function pickActive(row: Record<string, unknown>): boolean {
  if (truthy(row.bloqueado ?? row.Bloqueado ?? row.inactivo ?? row.Inactivo)) return false;
  const sta = str(row.sta ?? row.Sta ?? row.estado ?? row.Estado).toLowerCase();
  if (sta === "b" || sta === "i" || sta === "0" || sta === "n" || sta === "inactivo") return false;
  if ("atv" in row || "Atv" in row) return truthy(row.atv ?? row.Atv);
  if (sta === "a" || sta === "1" || sta === "v") return true;
  return truthy(row.activo ?? row.Activo ?? row.habilitado ?? row.vigente ?? true);
}

/** CRC devuelto por Fastrax (ope=1 lista); si no hay, el caller puede generar hash local. */
export function pickFastraxCrc(row: Record<string, unknown>): string | null {
  const c = str(row.crc ?? row.Crc ?? row.CRC);
  return c.length > 0 ? c.slice(0, 200) : null;
}

export function pickImageUrl(row: Record<string, unknown>): string {
  return str(row.img ?? row.Img ?? row.image ?? row.imagen ?? row.url_imagen ?? "");
}

/** Extrae filas con `sku` de respuestas JSON Fastrax (arrays o objetos con listas). */
export function extractProductRows(root: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 8) return [];
  if (root == null) return [];
  if (Array.isArray(root)) {
    if (root.length === 0) return [];
    const first = root[0];
    if (isPlainObject(first) && pickSku(first as Record<string, unknown>)) {
      return root.filter(isPlainObject) as Record<string, unknown>[];
    }
    const merged: Record<string, unknown>[] = [];
    for (const el of root) {
      merged.push(...extractProductRows(el, depth + 1));
    }
    return merged;
  }
  if (!isPlainObject(root)) return [];
  const preferredKeys = [
    "productos", "Productos", "datos", "Datos", "data", "Data", "result", "Result", "rows", "items",
    "lista", "Table", "articulos", "Articulos", "lineas", "Lineas", "detalle", "Detalle",
    "registros", "Registros", "d", "D",
  ];
  for (const k of preferredKeys) {
    if (k in root) {
      const inner = extractProductRows(root[k], depth + 1);
      if (inner.length) return inner;
    }
  }
  if (pickSku(root)) return [root];
  const merged: Record<string, unknown>[] = [];
  for (const v of Object.values(root)) {
    if (Array.isArray(v) || isPlainObject(v)) {
      merged.push(...extractProductRows(v, depth + 1));
    }
  }
  return merged;
}
