/**
 * Genera un JSON por línea para el bridge (un ítem por request), evitando mezclar
 * productos simples y con variación en un mismo POST (error Dropi `variation_id in ()`).
 *
 * Reversibilidad: dejar de usar y enviar `items: [...]` completo en un solo POST.
 *
 * @param {Record<string, unknown>} baseWithoutItems - `tradexpar_order_id`, `payment_confirmed`, `customer` (sin `items`)
 * @param {Record<string, unknown>[]} bridgeItems - ítems ya normalizados (`normalizeDropiItemForBridge`)
 * @returns {Record<string, unknown>[]}
 */
export function splitDropiPayloadByItem(baseWithoutItems, bridgeItems) {
  return bridgeItems.map((oneItem) => ({
    ...baseWithoutItems,
    items: [oneItem],
  }));
}
