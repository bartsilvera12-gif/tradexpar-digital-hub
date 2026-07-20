/**
 * Búsqueda "inteligente" del catálogo, compartida por la navbar y el catálogo
 * para un comportamiento idéntico en ambos lugares.
 *
 * Qué resuelve frente a un `includes()` literal:
 *  - Acentos y mayúsculas: "audífono" == "AUDIFONO".
 *  - Plurales ES: buscar "auriculares" encuentra "auricular", "cables" → "cable".
 *  - Sinónimos ES/EN: los productos de audio se llaman "AURI EARPHONE …" /
 *    "AURI HEADSET …", así que buscar "auricular"/"auriculares"/"audífonos"
 *    debe traerlos a todos (y viceversa).
 *  - Varias palabras: cada término del texto buscado debe aparecer (AND), no la
 *    frase exacta. Ej: "auriculares klip" filtra los Klip de audio.
 *  - Busca en nombre + categoría + SKU + marca + descripción.
 *
 * Para ampliar el buscador, editá `SYNONYM_GROUPS` (ver comentario abajo).
 */
import type { Product } from "@/types";

/** Minúsculas (es) + sin acentos/diacríticos + espacios colapsados. */
export function normalizeSearchText(input: string): string {
  return (input || "")
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Grupos de sinónimos (ya normalizados, sin acentos). Si el texto de un producto
 * contiene CUALQUIER término del grupo, se le agregan TODOS los demás como
 * "etiquetas" ocultas de búsqueda. Así "auriculares" encuentra productos cuyo
 * nombre dice "EARPHONE"/"HEADSET", y buscar "earbuds" encuentra los "auricular".
 *
 * Reglas para editar:
 *  - Escribir todo en minúsculas y sin acentos.
 *  - Incluir singular y plural (ej. "auricular" y "auriculares"): el disparo por
 *    término usa palabra completa, así que ambos ayudan.
 *  - Solo agrupar términos GENUINAMENTE equivalentes para no crear falsos
 *    positivos (cada producto solo hereda las etiquetas de los grupos a los que
 *    ya pertenece por su propio texto).
 */
const SYNONYM_GROUPS: string[][] = [
  // Audio / auriculares (el caso principal del catálogo AURI EARPHONE/HEADSET)
  [
    "auricular", "auriculares", "audifono", "audifonos", "auris",
    "earphone", "earphones", "earbud", "earbuds",
    "headset", "headsets", "headphone", "headphones", "headph",
    "manos libres", "handsfree", "airpods", "in ear", "inear",
  ],
  // Parlantes / altavoces
  ["parlante", "parlantes", "altavoz", "altavoces", "bocina", "bocinas", "speaker", "speakers", "soundbar", "sound bar"],
  // Cargadores
  ["cargador", "cargadores", "charger", "chargers"],
  // Relojes inteligentes
  ["reloj", "relojes", "smartwatch", "smartwatches", "smart watch", "smartband", "smart band"],
  // Mouse
  ["mouse", "mouses", "raton", "ratones"],
  // Teclados
  ["teclado", "teclados", "keyboard", "keyboards"],
  // Mochilas / bolsos
  ["mochila", "mochilas", "backpack", "backpacks", "bolso", "bolsos", "morral"],
  // Fundas / estuches
  ["funda", "fundas", "estuche", "estuches", "case", "cases", "cover", "covers"],
  // Ventiladores
  ["ventilador", "ventiladores", "fan", "fans", "cooler", "coolers"],
  // Aspiradoras
  ["aspiradora", "aspiradoras", "vacuum"],
  // Adaptadores (nombres del catálogo usan la abreviatura "ADAP")
  ["adaptador", "adaptadores", "adapter", "adapters", "adap"],
  // Notebooks / laptops
  ["notebook", "notebooks", "laptop", "laptops", "portatil", "portatiles"],
  // Cámaras
  ["camara", "camaras", "webcam", "webcams"],
];

/**
 * Cache del "haystack" (texto de búsqueda ya normalizado + sinónimos) por
 * producto. Como los productos vienen de react-query con referencia estable,
 * un `WeakMap` invalida solo cuando el catálogo se recarga (nuevos objetos).
 */
const haystackCache = new WeakMap<Product, string>();

function buildHaystack(product: Product): string {
  const base = normalizeSearchText(
    [product.name, product.category, product.sku, product.brand, product.description]
      .filter(Boolean)
      .join(" ")
  );
  // Palabras completas del texto: el disparo de sinónimos usa palabra exacta
  // (evita que "fan" dispare en "fantasía" o "elefante").
  const words = new Set(base.split(/[^a-z0-9]+/).filter(Boolean));

  const extra: string[] = [];
  for (const group of SYNONYM_GROUPS) {
    const belongs = group.some((term) =>
      term.includes(" ") ? base.includes(term) : words.has(term)
    );
    if (!belongs) continue;
    for (const term of group) {
      const present = term.includes(" ") ? base.includes(term) : words.has(term);
      if (!present) extra.push(term);
    }
  }

  return extra.length ? `${base} ${extra.join(" ")}` : base;
}

function getHaystack(product: Product): string {
  let hay = haystackCache.get(product);
  if (hay === undefined) {
    hay = buildHaystack(product);
    haystackCache.set(product, hay);
  }
  return hay;
}

/** Singular aproximado en español para que el plural buscado matchee el singular. */
function singularizeEs(word: string): string {
  if (word.length > 4 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/** True si el producto matchea TODOS los términos del texto buscado. */
export function productMatchesQuery(product: Product, rawQuery: string): boolean {
  const q = normalizeSearchText(rawQuery);
  if (!q) return true;
  const tokens = q.split(" ").filter(Boolean);
  if (tokens.length === 0) return true;

  const hay = getHaystack(product);
  return tokens.every((tok) => {
    if (hay.includes(tok)) return true;
    const singular = singularizeEs(tok);
    return singular !== tok && singular.length >= 3 && hay.includes(singular);
  });
}

/**
 * Relevancia para ordenar: los productos cuyo NOMBRE contiene el término pesan
 * más que los que solo matchean por sinónimo/categoría/descripción. Así la vista
 * previa de la navbar y el catálogo muestran primero lo más pertinente.
 */
function relevanceScore(normalizedName: string, tokens: string[]): number {
  let score = 0;
  for (const tok of tokens) {
    if (normalizedName.includes(tok)) score += 10;
    else if (normalizedName.includes(singularizeEs(tok))) score += 6;
  }
  return score;
}

/** Ordena (copia) por relevancia respecto al texto buscado; estable si empatan. */
export function sortByRelevance<T extends Product>(products: T[], rawQuery: string): T[] {
  const q = normalizeSearchText(rawQuery);
  if (!q) return products;
  const tokens = q.split(" ").filter(Boolean);
  return products
    .map((p, i) => ({ p, i, s: relevanceScore(normalizeSearchText(p.name), tokens) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.p);
}

/** Filtra + ordena por relevancia. Usado por la vista previa de la navbar. */
export function searchProducts(products: Product[], rawQuery: string): Product[] {
  const q = normalizeSearchText(rawQuery);
  if (!q) return [];
  return sortByRelevance(products.filter((p) => productMatchesQuery(p, rawQuery)), rawQuery);
}
