/** Solo dígitos con código país (para enlaces wa.me). */
export const WHATSAPP_NUMBER_DIGITS = "595986776881";

/** Formato legible para la UI */
export const WHATSAPP_DISPLAY = "+595 986 776 881";

/** Override opcional en build (`VITE_WHATSAPP_NUMBER`); por defecto Tradexpar. */
export function getWhatsAppDigits(): string {
  return import.meta.env.VITE_WHATSAPP_NUMBER || WHATSAPP_NUMBER_DIGITS;
}
