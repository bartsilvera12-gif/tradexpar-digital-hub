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

export {};
