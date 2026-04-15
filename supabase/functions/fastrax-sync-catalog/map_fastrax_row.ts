/**
 * Mapeo JSON Fastrax (manual: ope 1/2/3/4/91–94/98/99) → campos locales.
 * No loguear ni persistir credenciales.
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

/** Doc ope=2: `nom` */
export function pickName(row: Record<string, unknown>): string {
  const keys = ["nom", "Nom", "nombre", "Nombre", "name", "titulo", "Titulo", "descripcion_corta", "descripcion", "Descripcion"];
  for (const k of keys) {
    const v = str(row[k]);
    if (v) return v.slice(0, 500);
  }
  return "";
}

/** Larga `des`, breve `bre` (se concatenan en la Edge si hace falta). */
export function pickDescription(row: Record<string, unknown>): string {
  const des = str(row.des ?? row.Des);
  const bre = str(row.bre ?? row.Bre);
  if (des.length > 0 && bre.length > 0 && des !== bre) {
    return `${des}\n\n${bre}`.slice(0, 8000);
  }
  if (des.length > 0) return des.slice(0, 8000);
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

/** Código o nombre crudo de categoría (ope=2 `cat`, `caw`). */
export function pickCategoryCode(row: Record<string, unknown>): string {
  return str(row.cat ?? row.Cat ?? row.categoria ?? row.Categoria);
}

/** Marca cruda o código (ope=2 `mar`). */
export function pickBrandCode(row: Record<string, unknown>): string {
  return str(row.mar ?? row.Mar ?? row.marca ?? row.Marca);
}

export type TaxonomyMaps = {
  catWeb: Map<string, string>;
  brands: Map<string, string>;
  catSys: Map<string, string>;
};

function resolveCode(maps: Map<string, string>[], code: string): string {
  const c = code.trim();
  if (!c) return "";
  for (const m of maps) {
    const x = m.get(c);
    if (x) return x;
  }
  return c;
}

/** Categoría legible para UI / columna `category` (sin mezclar marca). */
export function pickCategoryDisplay(row: Record<string, unknown>, tax?: TaxonomyMaps): string {
  const caw = str(row.caw ?? row.Caw);
  if (caw) return caw.slice(0, 200);
  const cat = pickCategoryCode(row);
  if (cat && tax) {
    const resolved = resolveCode([tax.catWeb, tax.catSys], cat);
    return resolved.slice(0, 200);
  }
  if (cat) return cat.slice(0, 200);
  const keys = ["rubro", "Rubro", "familia", "Familia"];
  for (const k of keys) {
    const v = str(row[k]);
    if (v) return v.slice(0, 200);
  }
  return "";
}

/** Marca legible para columna `brand`. */
export function pickBrandDisplay(row: Record<string, unknown>, tax?: TaxonomyMaps): string {
  const mar = pickBrandCode(row);
  if (mar && tax) {
    const r = resolveCode([tax.brands], mar);
    return r.slice(0, 200);
  }
  return mar.slice(0, 200);
}

/** Compat: categoría + marca en un solo string (p. ej. listados legacy). */
export function pickCategory(row: Record<string, unknown>, tax?: TaxonomyMaps): string {
  const c = pickCategoryDisplay(row, tax);
  const b = pickBrandDisplay(row, tax);
  if (c && b) return `${c} — ${b}`.slice(0, 240);
  return (c || b).slice(0, 240);
}

/**
 * Precio efectivo venta: manual ope=98 `promo` + `precopromo`; ope=2 `prm`, `pre`.
 */
export function pickPrice(row: Record<string, unknown>): number {
  const pre = num(row.pre ?? row.Pre);
  const prm = num(row.prm ?? row.Prm);
  const precopromo = num(row.precopromo ?? row.PrecioPromo ?? row.prc_promo);

  const promoOn = truthy(
    row.promo ??
      row.Promo ??
      row.pmp ??
      row.ppm ??
      row.pro ??
      row.prom ??
      row.promo_activa ??
      row.promoActiva ??
      row.en_promo
  );

  if (promoOn && precopromo > 0) return Math.max(0, precopromo);
  if (promoOn && prm > 0) return Math.max(0, prm);
  if (prm > 0 && pre <= 0) return Math.max(0, prm);
  if (pre > 0) return Math.max(0, pre);

  for (const k of ["precio_promo", "precio_promocional", "precio_oferta", "precio_especial"]) {
    const p = num(row[k]);
    if (p > 0) return Math.max(0, p);
  }
  for (const k of ["precio", "Precio", "precio_venta", "importe"]) {
    const p = num(row[k]);
    if (p > 0) return Math.max(0, p);
  }
  return 0;
}

/** Precio de lista (sin promo) para referencia en payload / CRC. */
export function pickListPrice(row: Record<string, unknown>): number {
  return Math.max(0, num(row.pre ?? row.Pre));
}

/** Precio promocional explícito si existe. */
export function pickPromoPrice(row: Record<string, unknown>): number {
  const n = num(row.precopromo ?? row.PrecioPromo ?? row.prm ?? row.Prm);
  return n > 0 ? n : 0;
}

export function pickStock(row: Record<string, unknown>): number {
  const keys = ["sal", "Sal", "saldo", "Saldo", "stock", "Stock", "cantidad", "existencia", "disponible"];
  for (const k of keys) {
    const n = Math.floor(num(row[k]));
    if (n >= 0) return n;
  }
  return 0;
}

/**
 * Manual: `blo` bloqueado; `sta`; `atv` (ope=98).
 */
export function pickActive(row: Record<string, unknown>): boolean {
  if (truthy(row.blo ?? row.Blo ?? row.bloqueado ?? row.Bloqueado ?? row.inactivo ?? row.Inactivo)) {
    return false;
  }
  const sta = str(row.sta ?? row.Sta ?? row.estado ?? row.Estado).toLowerCase();
  if (sta === "b" || sta === "i" || sta === "0" || sta === "n" || sta === "inactivo") return false;
  if ("atv" in row || "Atv" in row) return truthy(row.atv ?? row.Atv);
  if (sta === "a" || sta === "1" || sta === "v") return true;
  return truthy(row.activo ?? row.Activo ?? row.habilitado ?? row.vigente ?? true);
}

export function pickFastraxCrc(row: Record<string, unknown>): string | null {
  const c = str(row.crc ?? row.Crc ?? row.CRC);
  return c.length > 0 ? c.slice(0, 200) : null;
}

export function pickImageUrl(row: Record<string, unknown>): string {
  return str(
    row.img ?? row.Img ?? row.image ?? row.imagen ?? row.url_imagen ?? row.url ?? row.URL ?? row.ufa ?? row.uvi ?? ""
  );
}

/** Peso (manual `pes`, típico kg). */
export function pickWeightKg(row: Record<string, unknown>): number | null {
  const w = num(row.pes ?? row.Pes ?? row.peso ?? row.Peso);
  if (w <= 0) return null;
  return Math.round(w * 10_000) / 10_000;
}

/** Dimensiones legibles: lgr × car × alt, más pfd si viene. */
export function pickDimensionsLabel(row: Record<string, unknown>): string {
  const lgr = str(row.lgr ?? row.Lgr);
  const car = str(row.car ?? row.Car);
  const alt = str(row.alt ?? row.Alt);
  const pfd = str(row.pfd ?? row.Pfd);
  const parts = [lgr, car, alt].filter((x) => x.length > 0);
  let s = parts.join(" × ");
  if (pfd) s = s ? `${s} · ${pfd}` : pfd;
  return s.slice(0, 500);
}

/** Recorre JSON y arma mapas código→etiqueta (ope 91/92/93). */
export function extractLookupMap(root: unknown, depth = 0): Map<string, string> {
  const m = new Map<string, string>();
  if (depth > 10) return m;
  const visit = (x: unknown) => {
    if (Array.isArray(x)) {
      for (const el of x) visit(el);
      return;
    }
    if (!isPlainObject(x)) return;
    const code = str(
      x.cod ?? x.Cod ?? x.id ?? x.Id ?? x.codigo ?? x.Codigo ?? x.categoria ?? x.marca ?? x.sku_cat
    );
    const label = str(
      x.nom ?? x.Nom ?? x.nombre ?? x.Nombre ?? x.descripcion ?? x.Descripcion ?? x.den ?? x.Den
    );
    if (code && label && code !== label) m.set(code, label);
    for (const v of Object.values(x)) {
      if (Array.isArray(v) || isPlainObject(v)) visit(v);
    }
  };
  visit(root);
  return m;
}

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
