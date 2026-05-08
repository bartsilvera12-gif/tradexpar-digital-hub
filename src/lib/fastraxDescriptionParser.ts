/**
 * Parser de descripciones de productos Fastrax (texto plano ya formateado por
 * `formatFastraxDescription` del backend).
 *
 * El backend ahora guarda la descripción como un único párrafo del estilo:
 *
 *   "Modelo: XTH-356. Audífono: Tipo: Supraaural; Potencia de salida: 10mW;
 *    ...; Cable 1.10 mts. Micrófono: ...; ...; .... Conectividad: 3,5mm TRRS
 *    (4 polos). Color: Azul. Dimensiones: 15 x 7 x 18.2 cm."
 *
 * Para mostrarlo como ficha técnica en el detalle del producto, lo dividimos
 * en secciones `{ label, value }` donde `value` puede ser:
 *  - string simple → "Modelo" → "XTH-356".
 *  - string[] (lista con bullets) → "Audífono" → ["Tipo: Supraaural", …].
 *
 * El parser es defensivo: si la entrada no encaja con la heurística (no es
 * una ficha técnica Fastrax sino un párrafo libre o el texto de un producto
 * local/Dropi), devuelve `null` para que el caller haga fallback al render
 * de texto plano histórico.
 */

export interface FastraxSpecSection {
  label: string;
  value: string | string[];
}

/**
 * Patrones de "bloques basura" que NO aportan valor en el storefront y deben
 * filtrarse aunque vengan parseables como label/valor o como ítems de lista.
 */
const NOISE_VALUE_PATTERNS: ReadonlyArray<RegExp> = [
  /^link\s+externo$/i,
  /^ver\s+m[áa]s$/i,
  /^n\/?a$/i,
  /^-+$/,
];

/**
 * Labels enteros que se descartan si el value es vacío o trivial.
 * Mantenemos la lista corta y muy específica para no perder info útil.
 */
const NOISE_LABELS: ReadonlySet<string> = new Set([
  "informacion extra",
  "información extra",
  "info extra",
]);

/** Quita acentos para comparación case/diacritics-insensitive. */
function foldDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function isNoiseValue(v: string): boolean {
  const t = v.trim();
  if (!t) return true;
  return NOISE_VALUE_PATTERNS.some((rx) => rx.test(t));
}

function isNoiseLabel(label: string): boolean {
  const norm = foldDiacritics(label).trim().toLowerCase();
  return NOISE_LABELS.has(norm);
}

/**
 * Divide el texto en bloques de "sección". El separador es `. ` solo cuando lo
 * siguiente luce como un label nuevo (palabra capitalizada terminada en `:`).
 *
 * Esto evita romper valores con puntos internos (p. ej. "Cable 1.10 mts" o
 * "18.2 cm").
 */
function splitIntoSectionBlocks(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const SPLIT = /\.\s+(?=[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚáéíóúÑñ -]*?:\s)/u;
  return trimmed
    .split(SPLIT)
    .map((b) => b.trim())
    .filter(Boolean);
}

/**
 * Toma un bloque tipo "Audífono: Tipo: ...; Potencia: 10mW; …" y devuelve la
 * sección estructurada, o `null` si el bloque no parece label/value.
 */
function parseSectionBlock(block: string): FastraxSpecSection | null {
  const idx = block.indexOf(":");
  if (idx < 0) return null;
  const label = block.slice(0, idx).trim().replace(/\.$/, "").trim();
  const rawValue = block.slice(idx + 1).trim().replace(/\.$/, "").trim();
  if (!label) return null;
  if (rawValue.includes(";")) {
    const items = rawValue
      .split(";")
      .map((it) => it.trim().replace(/\.$/, "").trim())
      .filter(Boolean)
      .filter((it) => !isNoiseValue(it));
    if (items.length === 0) return null;
    if (isNoiseLabel(label)) return null;
    if (items.length === 1) {
      return { label, value: items[0] };
    }
    return { label, value: items };
  }
  if (isNoiseValue(rawValue)) return null;
  if (isNoiseLabel(label) && (!rawValue || isNoiseValue(rawValue))) return null;
  return { label, value: rawValue };
}

/**
 * Parsea una descripción de catálogo (Fastrax) en una lista de secciones de
 * ficha técnica. Devuelve `null` cuando no se encontró estructura suficiente
 * (heurística: < 2 secciones válidas) para que el caller haga fallback a
 * texto plano.
 */
export function parseFastraxDescription(
  description: string | null | undefined,
): FastraxSpecSection[] | null {
  if (description == null) return null;
  const text = String(description).trim();
  if (!text) return null;
  if (/<[a-z!/?][^>]*>/i.test(text)) return null;

  const blocks = splitIntoSectionBlocks(text);
  if (blocks.length < 2) return null;

  const sections: FastraxSpecSection[] = [];
  for (const b of blocks) {
    const parsed = parseSectionBlock(b);
    if (parsed) sections.push(parsed);
  }

  if (sections.length < 2) return null;

  return sections;
}
