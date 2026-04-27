/**
 * Descripciones provenientes de catálogos (p. ej. Fastrax) a veces vienen en HTML.
 * En ficha pública mostramos solo el texto, sin el código de marcado.
 */
const TAG_RE = /<\/?[a-z][^>]*>/gi;

/**
 * Texto de relleno histórico en productos importados (Dropi) que no debemos mostrar.
 * Coincide con o sin paréntesis y con distintos guiones (– — -).
 */
export function isImportPlaceholderDescription(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  const t = String(raw)
    .replace(/\s+/g, " ")
    .replace(/[()]/g, "")
    .replace(/[\u2013\u2014–—]/g, "-")
    .trim()
    .toLowerCase();
  return t === "sin descripción - importado desde dropi" || t === "sin descripción-importado desde dropi";
}

/** Uso al mapear filas de API: vacío en lugar del placeholder. */
export function productDescriptionForClient(raw: string | null | undefined): string {
  if (raw == null) return "";
  if (isImportPlaceholderDescription(raw)) return "";
  return String(raw);
}

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/gi, "'");
}

export function productDescriptionPlainText(raw: string | null | undefined): string {
  if (raw == null) return "";
  const s0 = String(raw).trim();
  if (!s0) return "";
  if (isImportPlaceholderDescription(s0)) return "";
  if (!/<[a-z!/?]/.test(s0)) {
    const dec = decodeBasicEntities(s0);
    return isImportPlaceholderDescription(dec) ? "" : dec;
  }
  let t = s0
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  t = t
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|tr|h[1-6])>/gi, "\n")
    .replace(/<\/(div|table)>/gi, "\n");
  t = t.replace(/<\/td>/gi, "\t");
  t = t.replace(TAG_RE, " ");
  t = decodeBasicEntities(t);
  t = t
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  const out = t.replace(/\n +/g, "\n").trim();
  return isImportPlaceholderDescription(out) ? "" : out;
}
