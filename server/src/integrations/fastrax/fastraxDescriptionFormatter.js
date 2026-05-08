/**
 * Formatter de descripción Fastrax.
 *
 * Las descripciones Fastrax (raw_detail.des) llegan como HTML — típicamente una
 * tabla con filas etiqueta/valor y, dentro de algún `<td>`, una `<ul>` con los
 * detalles técnicos. Si guardamos eso tal cual en `tradexpar.products.description`
 * y el frontend solo le quita los tags, el resultado son bloques con saltos
 * gigantes y una lectura desagradable en la ficha de producto.
 *
 * `formatFastraxDescription(rawDescription, fallbackBriefDescription?)`:
 * - Decodifica URL encoding (`%xx`, `+`).
 * - Decodifica entidades HTML (`&nbsp;`, `&amp;`, etc.).
 * - Identifica filas `<tr><td>label</td><td>value</td></tr>` → "Label: valor".
 * - Si el value contiene `<ul><li>…</li>…</ul>` une los items con `; ` →
 *   "Label: item1; item2; item3".
 * - Quita estilos, clases, `<span>`, `<strong>`, `<a>`, atributos.
 * - Quita texto basura tipo "Link Externo".
 * - Compacta espacios duplicados, dobles puntos, etc.
 * - Devuelve un string en una sola línea, listo para `description`.
 *
 * Si la descripción formateada queda vacía, recurre a `fallbackBriefDescription`
 * (típicamente raw.bre); si tampoco hay, devuelve `""`.
 *
 * Diseño: este módulo NO es específico de Postgres ni de Supabase. Es solo
 * texto. Se aplica únicamente en el upsert de productos Fastrax — Dropi/local
 * no pasan por acá.
 */

const TAG_RE = /<\/?[a-z!][^>]*>/gi;
const UL_INSIDE_RE = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
const TR_RE = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL_RE = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
const HAS_HTML_RE = /<[a-z!][\s\S]*?>/i;
const HAS_LI_RE = /<li\b/i;

/**
 * Decodificación URL: PHP envía a veces texto URL-encoded con `+` por espacio.
 * @param {unknown} v
 * @returns {string}
 */
function decodeUrlEncoded(v) {
  if (v == null) return "";
  const t = String(v).replace(/\+/g, " ");
  try {
    return decodeURIComponent(t);
  } catch {
    return t;
  }
}

/**
 * Entidades HTML típicas. `&#NN;` y `&#xHH;` también.
 * @param {string} s
 */
function decodeEntities(s) {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const cp = Number(n);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const cp = parseInt(h, 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : "";
    });
}

/** Quita TODOS los tags HTML (sin dejar bloques residuales). */
function stripTags(s) {
  return s.replace(TAG_RE, " ");
}

/** Aplana espacios y trim. */
function compactSpaces(s) {
  return s.replace(/[\s\u00A0]+/g, " ").trim();
}

/**
 * "Modelo: " / "<strong>Audífono:</strong>" → "Modelo" / "Audífono".
 * @param {string} html
 */
function buildLabel(html) {
  const t = compactSpaces(stripTags(decodeEntities(html)));
  return t.replace(/[\s:：]+$/u, "").trim();
}

/**
 * Extrae items `<li>` de un fragmento HTML; devuelve textos planos compactados.
 * @param {string} html
 */
function extractListItems(html) {
  const items = [];
  let m;
  UL_INSIDE_RE.lastIndex = 0;
  while ((m = UL_INSIDE_RE.exec(html)) !== null) {
    const t = compactSpaces(stripTags(decodeEntities(m[1])));
    if (t) items.push(t);
  }
  return items;
}

/**
 * Procesa una fila `<tr>…</tr>` (sin las etiquetas).
 * Devuelve la frase generada o "" si no hay nada útil.
 * @param {string} rowHtml
 */
function processTableRow(rowHtml) {
  const cells = [];
  let m;
  CELL_RE.lastIndex = 0;
  while ((m = CELL_RE.exec(rowHtml)) !== null) {
    cells.push(m[1]);
  }
  if (cells.length === 0) return "";
  if (cells.length === 1) {
    const single = compactSpaces(stripTags(decodeEntities(cells[0])));
    return single;
  }
  const label = buildLabel(cells[0]);
  const valueHtml = cells.slice(1).join(" ");

  if (HAS_LI_RE.test(valueHtml)) {
    const items = extractListItems(valueHtml);
    if (items.length > 0) {
      const itemText = items.join("; ");
      return label ? `${label}: ${itemText}` : itemText;
    }
  }

  const valueText = compactSpaces(stripTags(decodeEntities(valueHtml)));
  if (!valueText) return label;
  if (!label) return valueText;
  return `${label}: ${valueText}`;
}

/** Reúne las frases en un único párrafo limpio. */
function joinSentences(sentences) {
  const cleaned = sentences
    .map((s) => {
      let t = compactSpaces(s);
      t = t.replace(/[.;,]+$/u, "");
      return t;
    })
    .filter(Boolean)
    .filter((s) => !/^link externo$/i.test(s.trim()))
    .filter((s) => !/^ver m[áa]s$/i.test(s.trim()));

  if (cleaned.length === 0) return "";

  let out = cleaned.join(". ");
  if (!/[.!?]$/.test(out)) out += ".";

  out = out
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\.{2,}/g, ".")
    .replace(/(?:\.\s+){2,}/g, ". ")
    .trim();

  return out;
}

/**
 * Devuelve la descripción Fastrax en texto plano, compacta y legible.
 *
 * @param {unknown} rawDescription — `raw_detail.des` (HTML URL-encoded posible)
 * @param {unknown} [fallbackBriefDescription] — `raw_detail.bre` o similar
 * @returns {string}
 */
export function formatFastraxDescription(rawDescription, fallbackBriefDescription) {
  const decoded = decodeUrlEncoded(rawDescription).trim();
  if (!decoded) {
    if (fallbackBriefDescription != null) {
      return formatFastraxDescription(fallbackBriefDescription, undefined);
    }
    return "";
  }

  let working = decoded
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  if (!HAS_HTML_RE.test(working)) {
    return compactSpaces(decodeEntities(working));
  }

  /** @type {string[]} */
  const sentences = [];

  if (/<tr\b/i.test(working)) {
    let m;
    TR_RE.lastIndex = 0;
    while ((m = TR_RE.exec(working)) !== null) {
      const sentence = processTableRow(m[1]);
      if (sentence) sentences.push(sentence);
    }
  }

  if (sentences.length === 0 && HAS_LI_RE.test(working)) {
    const items = extractListItems(working);
    if (items.length > 0) sentences.push(items.join("; "));
  }

  if (sentences.length === 0) {
    /**
     * Sin tabla ni lista: dividimos por bloques de párrafo / br y limpiamos.
     */
    const blocks = working
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6])>/gi, "\n")
      .split(/\n+/)
      .map((b) => compactSpaces(stripTags(decodeEntities(b))))
      .filter(Boolean);
    sentences.push(...blocks);
  }

  const out = joinSentences(sentences);
  if (out) return out;

  if (fallbackBriefDescription != null) {
    return formatFastraxDescription(fallbackBriefDescription, undefined);
  }
  return "";
}
