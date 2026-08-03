/**
 * Búsqueda "inteligente" del catálogo, compartida por la navbar y el catálogo
 * para un comportamiento idéntico en ambos lugares (escritorio y móvil).
 *
 * Qué resuelve frente a un `includes()` literal:
 *  - Acentos y mayúsculas: "audífono" == "AUDIFONO".
 *  - Coincidencia parcial: "conserv" encuentra "conservadora" y "conservadoras".
 *  - Plurales ES: buscar "auriculares" encuentra "auricular", "cables" → "cable".
 *  - Sinónimos ES/EN: los productos de audio se llaman "AURI EARPHONE …" /
 *    "AURI HEADSET …", así que buscar "auricular"/"auriculares"/"audífonos"
 *    debe traerlos a todos (y viceversa).
 *  - Errores de tipeo (fuzzy): "conservdora" (falta una letra) o "conservadroa"
 *    (letras intercambiadas) igual encuentran "conservadora". Usa distancia de
 *    edición Damerau-Levenshtein (inserción, borrado, sustitución y transposición).
 *  - Varias palabras: cada término del texto buscado debe aparecer (AND), no la
 *    frase exacta. Ej: "auriculares klip" filtra los Klip de audio.
 *  - Busca en nombre + categoría + SKU + marca + descripción (+ sinónimos).
 *
 * Orden de relevancia (de mayor a menor):
 *  1. Coincidencia exacta en el nombre.
 *  2. Nombre que comienza con el término.
 *  3. Coincidencia parcial (substring) en el nombre.
 *  4. Singular / plural / sinónimo.
 *  5. Coincidencia aproximada por error de escritura (fuzzy).
 *
 * Regla de ruido: para coincidencia PARCIAL (substring) y fuzzy se exige un
 * mínimo de 3 caracteres en el término; términos más cortos solo matchean como
 * palabra completa, para no traer resultados irrelevantes.
 *
 * Para ampliar el buscador, editá `SYNONYM_GROUPS` (ver comentario abajo).
 */
import type { Product } from "@/types";

/** Longitud mínima de un término para habilitar match parcial (substring) y fuzzy. */
export const MIN_PARTIAL_LEN = 3;

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
  // Conservadoras / hieleras (el catálogo abrevia "CONSERV"). Sin "cooler":
  // es ambiguo con los cooler/ventiladores de PC y traía falsos positivos.
  ["conservadora", "conservadoras", "conserv", "hielera", "hieleras", "nevera", "neveras"],
  // Adaptadores (nombres del catálogo usan la abreviatura "ADAP")
  ["adaptador", "adaptadores", "adapter", "adapters", "adap"],
  // Notebooks / laptops
  ["notebook", "notebooks", "laptop", "laptops", "portatil", "portatiles"],
  // Cámaras
  ["camara", "camaras", "webcam", "webcams"],
];

/**
 * Índice de búsqueda por producto (texto normalizado + sinónimos, ya troceado en
 * palabras, y el nombre normalizado para la relevancia). Como los productos
 * vienen de react-query con referencia estable, un `WeakMap` invalida solo cuando
 * el catálogo se recarga (nuevos objetos).
 */
interface SearchIndex {
  /** Texto completo (nombre+categoría+sku+marca+descripción+sinónimos), normalizado. */
  hay: string;
  /** Palabras únicas del `hay` (incluye las etiquetas de sinónimos). */
  words: string[];
  /** Nombre normalizado (para los tramos de relevancia). */
  name: string;
  /** Palabras del nombre (para prefijo por palabra). */
  nameWords: Set<string>;
}

const indexCache = new WeakMap<Product, SearchIndex>();

function buildIndex(product: Product): SearchIndex {
  const name = normalizeSearchText(product.name || "");
  const base = normalizeSearchText(
    [product.name, product.category, product.sku, product.brand, product.description]
      .filter(Boolean)
      .join(" ")
  );
  // Palabras del texto PROPIO del producto (nunca las etiquetas heredadas): la
  // pertenencia a un grupo de sinónimos debe decidirse solo con lo que el producto
  // realmente dice. Si se mezclaran las etiquetas, un producto podría "saltar" de
  // un grupo a otro por un término compartido (ej. "cooler" ventilador → conservadora).
  const baseWords = new Set(base.split(/[^a-z0-9]+/).filter(Boolean));

  const belongsTo = (term: string) =>
    term.includes(" ") ? base.includes(term) : baseWords.has(term);

  const extra: string[] = [];
  for (const group of SYNONYM_GROUPS) {
    if (!group.some(belongsTo)) continue;
    for (const term of group) {
      if (!belongsTo(term)) extra.push(term);
    }
  }

  const hay = extra.length ? `${base} ${extra.join(" ")}` : base;
  // Conjunto de palabras para matchear/fuzzy: las propias + las de sinónimos
  // heredados (aquí sí, porque esto ya no decide pertenencia, solo coincidencia).
  const words = new Set(baseWords);
  for (const term of extra) for (const w of term.split(" ")) words.add(w);

  return {
    hay,
    words: Array.from(words),
    name,
    nameWords: new Set(name.split(/[^a-z0-9]+/).filter(Boolean)),
  };
}

function getIndex(product: Product): SearchIndex {
  let idx = indexCache.get(product);
  if (idx === undefined) {
    idx = buildIndex(product);
    indexCache.set(product, idx);
  }
  return idx;
}

/** Singular aproximado en español para que el plural buscado matchee el singular. */
function singularizeEs(word: string): string {
  if (word.length > 4 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/**
 * Distancia de edición Damerau-Levenshtein (con transposición de adyacentes),
 * acotada por `max`: si se supera, corta y devuelve `max + 1`. Así un typo de una
 * o dos letras se detecta barato y las palabras muy distintas se descartan rápido.
 */
function boundedDamerauLevenshtein(a: string, b: string, max: number): number {
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  if (al === 0) return bl;
  if (bl === 0) return al;

  // Filas de programación dinámica: d0 = i-2, d1 = i-1, d2 = fila actual.
  let d0: number[] = [];
  let d1: number[] = new Array<number>(bl + 1);
  for (let j = 0; j <= bl; j++) d1[j] = j;

  for (let i = 1; i <= al; i++) {
    const d2 = new Array<number>(bl + 1);
    d2[0] = i;
    let rowMin = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(
        d1[j] + 1, // borrado
        d2[j - 1] + 1, // inserción
        d1[j - 1] + cost // sustitución
      );
      // Transposición de dos adyacentes (Damerau).
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, d0[j - 2] + 1);
      }
      d2[j] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > max) return max + 1; // toda la fila supera el umbral → sin match
    d0 = d1;
    d1 = d2;
  }
  return d1[bl];
}

/** Umbral de tolerancia a typos según el largo del término (0 = sin fuzzy). */
function fuzzyThreshold(len: number): number {
  if (len < 4) return 0; // muy corto: un typo lo confunde con otra palabra
  if (len < 7) return 1;
  return 2;
}

type MatchKind = "none" | "fuzzy" | "synonym" | "partial" | "prefix" | "exact";

const KIND_RANK: Record<MatchKind, number> = {
  none: 0,
  fuzzy: 1,
  synonym: 2,
  partial: 3,
  prefix: 4,
  exact: 5,
};

/** True si `tok` matchea el índice del producto por cualquier vía (para filtrar). */
function tokenMatchesIndex(idx: SearchIndex, tok: string): boolean {
  const len = tok.length;
  // Palabra completa exacta (cualquier largo).
  if (idx.words.includes(tok)) return true;

  // Singular/plural como palabra completa (cubre términos < 3, ej. plurales cortos).
  const singular = singularizeEs(tok);
  if (singular !== tok && idx.words.includes(singular)) return true;

  if (len < MIN_PARTIAL_LEN) return false;

  // Coincidencia parcial (substring) — el plural del texto ("conservadoras")
  // contiene al singular buscado ("conservadora") y viceversa via singular.
  if (idx.hay.includes(tok)) return true;
  if (singular !== tok && singular.length >= MIN_PARTIAL_LEN && idx.hay.includes(singular)) return true;

  // Fuzzy: typo de 1-2 letras contra alguna palabra del índice.
  const thr = fuzzyThreshold(len);
  if (thr > 0) {
    for (const w of idx.words) {
      if (w.length < MIN_PARTIAL_LEN) continue;
      if (Math.abs(w.length - len) > thr) continue;
      if (boundedDamerauLevenshtein(tok, w, thr) <= thr) return true;
    }
  }
  return false;
}

/** Clasifica cómo matchea `tok` contra el NOMBRE del producto (para relevancia). */
function nameMatchKind(idx: SearchIndex, tok: string): MatchKind {
  const name = idx.name;
  const len = tok.length;
  const singular = singularizeEs(tok);

  // Exacto: el nombre completo o una de sus palabras es el término.
  if (name === tok || idx.nameWords.has(tok)) return "exact";
  if (singular !== tok && (name === singular || idx.nameWords.has(singular))) return "synonym";

  // Empieza con: el nombre, o alguna de sus palabras, comienza con el término.
  if (len >= MIN_PARTIAL_LEN && name.startsWith(tok)) return "prefix";
  if (len >= MIN_PARTIAL_LEN) {
    for (const w of idx.nameWords) if (w.startsWith(tok)) return "prefix";
    // Abreviatura: una palabra del nombre es prefijo del término buscado
    // (ej. nombre "CONSERV" ⊂ búsqueda "conservadora").
    for (const w of idx.nameWords) if (w.length >= 4 && tok.startsWith(w)) return "prefix";
  }

  // Parcial: substring en cualquier parte del nombre.
  if (len >= MIN_PARTIAL_LEN && name.includes(tok)) return "partial";
  if (len >= MIN_PARTIAL_LEN && singular.length >= MIN_PARTIAL_LEN && name.includes(singular)) return "synonym";

  // Fuzzy contra palabras del nombre.
  const thr = fuzzyThreshold(len);
  if (thr > 0) {
    for (const w of idx.nameWords) {
      if (w.length < MIN_PARTIAL_LEN) continue;
      if (Math.abs(w.length - len) > thr) continue;
      if (boundedDamerauLevenshtein(tok, w, thr) <= thr) return "fuzzy";
    }
  }
  return "none";
}

/** True si el producto matchea TODOS los términos del texto buscado. */
export function productMatchesQuery(product: Product, rawQuery: string): boolean {
  const q = normalizeSearchText(rawQuery);
  if (!q) return true;
  const tokens = q.split(" ").filter(Boolean);
  if (tokens.length === 0) return true;

  const idx = getIndex(product);
  return tokens.every((tok) => tokenMatchesIndex(idx, tok));
}

/**
 * Relevancia para ordenar según los tramos definidos arriba. Los productos cuyo
 * NOMBRE contiene el término pesan más que los que solo matchean por
 * sinónimo/categoría/descripción o por typo. Se suma por término (AND multi-palabra).
 */
const KIND_SCORE: Record<MatchKind, number> = {
  none: 0, // matchea fuera del nombre (categoría/sku/descripción/sinónimo global)
  fuzzy: 5, // (5) aproximado por error de escritura
  synonym: 12, // (4) singular/plural o sinónimo
  partial: 25, // (3) coincidencia parcial en el nombre
  prefix: 50, // (2) el nombre comienza con el término
  exact: 100, // (1) coincidencia exacta en el nombre
};

function relevanceScore(idx: SearchIndex, tokens: string[]): number {
  let score = 0;
  for (const tok of tokens) {
    // Base mínima por término encontrado (garantiza que lo filtrado supere a lo no
    // filtrado y que un match fuera del nombre igual sume algo).
    score += 2;
    score += KIND_SCORE[nameMatchKind(idx, tok)];
  }
  return score;
}

/** Ordena (copia) por relevancia respecto al texto buscado; estable si empatan. */
export function sortByRelevance<T extends Product>(products: T[], rawQuery: string): T[] {
  const q = normalizeSearchText(rawQuery);
  if (!q) return products;
  const tokens = q.split(" ").filter(Boolean);
  return products
    .map((p, i) => ({ p, i, s: relevanceScore(getIndex(p), tokens) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.p);
}

/** Filtra + ordena por relevancia. Usado por la vista previa de la navbar. */
export function searchProducts(products: Product[], rawQuery: string): Product[] {
  const q = normalizeSearchText(rawQuery);
  if (!q) return [];
  return sortByRelevance(products.filter((p) => productMatchesQuery(p, rawQuery)), rawQuery);
}

/** Expuesto para tests / usos avanzados: cómo matchea un término contra un nombre. */
export const __test = { boundedDamerauLevenshtein, singularizeEs, nameMatchKind, getIndex, KIND_RANK };
