/**
 * Códigos hub PagoPar (1–15) usados en `paraguay_cities.pagopar_city_code` y como respaldo si la tabla no está cargada.
 * El checkout prioriza `tradexpar.paraguay_cities` (263 municipios); esta lista es la referencia de hubs.
 */
export const PAGOPAR_CIUDADES_PY = [
  { code: "1", label: "Asunción" },
  { code: "2", label: "Ciudad del Este" },
  { code: "3", label: "San Lorenzo" },
  { code: "4", label: "Luque" },
  { code: "5", label: "Capiatá" },
  { code: "6", label: "Lambaré" },
  { code: "7", label: "Fernando de la Mora" },
  { code: "8", label: "Limpio" },
  { code: "9", label: "Ñemby" },
  { code: "10", label: "Encarnación" },
  { code: "11", label: "Pedro Juan Caballero" },
  { code: "12", label: "Coronel Oviedo" },
  { code: "13", label: "Villarrica" },
  { code: "14", label: "Caaguazú" },
  { code: "15", label: "Itauguá" },
] as const;

export function pagoparCiudadLabel(code: string): string {
  const c = PAGOPAR_CIUDADES_PY.find((x) => x.code === code);
  return c?.label ?? code;
}
