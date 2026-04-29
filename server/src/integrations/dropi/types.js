/**
 * @typedef {object} DropiNormalizedProduct
 * @property {string} externalId
 * @property {string} sku
 * @property {string} name
 * @property {string} description
 * @property {string} category
 * @property {number} price
 * @property {number} salePrice
 * @property {number | null} dropiCostPrice
 * @property {number} marginPercent
 * @property {number} marginFixed
 * @property {'cost' | 'suggested_price' | 'sale_price'} pricingSource
 * @property {number} stock
 * @property {'stock' | 'warehouse_product' | 'warehouse_product_variation' | 'fallback'} stockSource
 * @property {string} brand
 * @property {string[]} imageUrls
 * @property {number | null} weightKg
 * @property {string | null} dimensionsLabel
 * @property {string} syncCrc
 */

/**
 * @typedef {object} DropiSyncStats
 * @property {number} total_read
 * @property {number} created
 * @property {number} updated
 * @property {number} duplicates_skipped
 * @property {number} failed
 * @property {number} images_queued
 * @property {string[]} errors_sample
 */

/**
 * Línea enviada al bridge WordPress → Dropi (`normalizeDropiItemForBridge`).
 * `variation_id` solo debe existir con valor real; productos simples llevan `product_type: "SIMPLE"` sin `variation_id`.
 * @typedef {object} DropiBridgeOrderLineItem
 * @property {unknown} [line_index]
 * @property {string} product_id
 * @property {string} product_name
 * @property {number} quantity
 * @property {number|null} price
 * @property {number|null} sale_price
 * @property {number|null} suggested_price
 * @property {number|null} unit_price
 * @property {number|null} cost
 * @property {string|null} pricing_source
 * @property {number} line_subtotal
 * @property {string} sku
 * @property {string} dropi_product_id
 * @property {string} [variation_id]
 * @property {'SIMPLE'} [product_type]
 */

export {};
