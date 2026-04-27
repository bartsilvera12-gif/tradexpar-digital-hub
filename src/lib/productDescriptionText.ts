/**
 * Descripciones provenientes de catálogos (p. ej. Fastrax) a veces vienen en HTML.
 * En ficha pública mostramos solo el texto, sin el código de marcado.
 */
const TAG_RE = /<\/?[a-z][^>]*>/gi;

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
  if (!/<[a-z!/?]/.test(s0)) {
    return decodeBasicEntities(s0);
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
  return t.replace(/\n +/g, "\n").trim();
}
