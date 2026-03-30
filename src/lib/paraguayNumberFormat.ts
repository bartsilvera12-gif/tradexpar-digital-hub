/** Entero positivo desde texto (ignora puntos de miles y demás no dígitos). */
export function parseGuaraniesInput(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  if (digits === "") return 0;
  const n = parseInt(digits, 10);
  return Number.isNaN(n) ? 0 : Math.min(n, 999_999_999_999);
}

/** Miles con punto, estilo es-PY, sin decimales. */
export function formatGuaraniesInteger(n: number): string {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  return v.toLocaleString("es-PY", { maximumFractionDigits: 0 });
}
