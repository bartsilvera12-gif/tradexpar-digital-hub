/**
 * PagoPar usa códigos de ciudad distintos a Dropi (p. ej. sucursal/cotización).
 * Centralizar el mapeo aquí; no duplicar mapas en otros archivos.
 *
 * Reversibilidad: dejar de importar y volver a pasar `customer_city_code` tal cual al bridge.
 *
 * @param {unknown} code - Código ciudad checkout/PagoPar (p. ej. orders.customer_city_code)
 * @param {unknown} [_cityName] - Reservado para reglas por nombre cuando exista customer_city_name en orders
 * @returns {string} Código esperado por Dropi, o el mismo `code` normalizado si no hay entrada en el mapa
 */
export function mapPagoparToDropi(code, _cityName) {
  const key = code != null && String(code).trim() !== "" ? String(code).trim() : "";
  const map = {
    "7": "11", // Fernando de la Mora (PagoPar) → Central (Dropi)
  };
  return map[key] ?? key;
}
