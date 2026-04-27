/**
 * Arrays de SQL para copiar pegar en Supabase SQL Editor (un statement por string).
 * No se ejecuta automáticamente. Ver también `apply_fastrax_order_map_manual.sql`.
 */

export const SQL_1_ALTER_FASTRAX_ORDER_MAP = [
  `ALTER TABLE tradexpar.fastrax_order_map ADD COLUMN IF NOT EXISTS fastrax_ped text`,
  `ALTER TABLE tradexpar.fastrax_order_map ADD COLUMN IF NOT EXISTS fastrax_pdc text`,
  `ALTER TABLE tradexpar.fastrax_order_map ADD COLUMN IF NOT EXISTS invoice_response jsonb`,
  `ALTER TABLE tradexpar.fastrax_order_map ADD COLUMN IF NOT EXISTS fastrax_status_code int`,
]

export const SQL_2_PRODUCTS_UNIQUE_INDEXES = [
  `ALTER TABLE tradexpar.products ADD COLUMN IF NOT EXISTS external_sku text`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_products_fastrax_provider_sku ON tradexpar.products (external_provider, external_sku) WHERE external_provider = 'fastrax' AND external_sku IS NOT NULL`,
]

export const SQL_3_COMMENTS = [
  `COMMENT ON COLUMN tradexpar.fastrax_order_map.fastrax_ped IS 'Pedido ecommerce enviado a Fastrax (ope=12, ped)'`,
  `COMMENT ON COLUMN tradexpar.fastrax_order_map.fastrax_pdc IS 'Pedido generado en sistema Fastrax (ope=12, pdc)'`,
  `COMMENT ON COLUMN tradexpar.fastrax_order_map.invoice_response IS 'Respuesta cruda ope=15 (facturar), si aplica'`,
  `COMMENT ON COLUMN tradexpar.fastrax_order_map.fastrax_status_code IS 'Código entero ope=13 (sit) alineado a Fastrax'`,
  `COMMENT ON COLUMN tradexpar.products.external_sku IS 'SKU canónico del proveedor (Fastrax: eje de id único con external_provider=fastrax)'`,
]

/**
 * Import controlado (admin) por SKU: no requiere sentencias adicionales si `external_sku` e índices
 * (SQL_2) ya existen. Copiá solo si falta el esquema.
 */
export const SQL_4_FASTRAX_CONTROLLED_IMPORTER = []

/**
 * @deprecated nombres previos; conservados por si hay scripts viejos
 */
const SQL_1_CREATE_TABLES = [
  `create table if not exists tradexpar.fastrax_order_map ( id uuid not null default gen_random_uuid() , order_id uuid not null references tradexpar.orders (id) on delete cascade , status text , fastrax_status text , fastrax_order_id text , fastrax_sit text , fastrax_status_label text , payload jsonb , response jsonb , last_error text , error text , last_sync_at timestamptz , created_at timestamptz not null default now() , updated_at timestamptz not null default now() , primary key (id) , constraint uq_fastrax_order_map_order_id unique (order_id) )`,
  `comment on table tradexpar.fastrax_order_map is 'Mapeo pedido interno a Fastrax (ope 12/13); no modifica tablas Dropi'`,
]

const SQL_2_ALTERS_PRODUCTS = [
  `comment on column tradexpar.products.product_source_type is 'Incluye fastrax para filas importadas o manuales (ver migraciones existentes)'`,
]

const SQL_3_INDEXES = [
  `create index if not exists idx_fastrax_order_map_fastrax_order_id on tradexpar.fastrax_order_map (fastrax_order_id)`,
]

const SQL_4_OPTIONAL_FIXES = [
  `comment on column tradexpar.fastrax_order_map.fastrax_sit is 'Código de estado Fastrax (ope 13, campo sit si aplica)'`,
]

export { SQL_1_CREATE_TABLES, SQL_2_ALTERS_PRODUCTS, SQL_3_INDEXES, SQL_4_OPTIONAL_FIXES }
