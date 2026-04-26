-- =============================================================================
-- Aplicar en Supabase SQL Editor (SOLO sentencias SQL; no copiar .mjs con "const").
-- Orden: 1 → 2 → 3 → 4. Idempotente en lo posible.
-- Schema: tradexpar
-- =============================================================================

-- 1) Tabla fastrax_order_map
create table if not exists tradexpar.fastrax_order_map (
  id uuid not null default gen_random_uuid(),
  order_id uuid not null references tradexpar.orders (id) on delete cascade,
  status text,
  fastrax_status text,
  fastrax_order_id text,
  fastrax_sit text,
  fastrax_status_label text,
  payload jsonb,
  response jsonb,
  last_error text,
  error text,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id),
  constraint uq_fastrax_order_map_order_id unique (order_id)
);

comment on table tradexpar.fastrax_order_map is 'Mapeo pedido interno a Fastrax (ope 12/13); no modifica tablas Dropi';

-- 2) (Opcional) comentario en products — falla si no existe la columna; en ese caso omitir.
comment on column tradexpar.products.product_source_type is 'Incluye fastrax para filas importadas o manuales (ver migraciones existentes)';

-- 3) Índice por id remoto Fastrax
create index if not exists idx_fastrax_order_map_fastrax_order_id on tradexpar.fastrax_order_map (fastrax_order_id);

-- 4) (Opcional) comentario en columna
comment on column tradexpar.fastrax_order_map.fastrax_sit is 'Código de estado Fastrax (ope 13, campo sit si aplica)';

-- 5) columnas ope=12/13/15 (idempotente)
alter table tradexpar.fastrax_order_map add column if not exists fastrax_ped text;
alter table tradexpar.fastrax_order_map add column if not exists fastrax_pdc text;
alter table tradexpar.fastrax_order_map add column if not exists invoice_response jsonb;
alter table tradexpar.fastrax_order_map add column if not exists fastrax_status_code int;

-- 6) productos: SKU Fastrax + índice parcial
alter table tradexpar.products add column if not exists external_sku text;
create unique index if not exists ux_products_fastrax_provider_sku
  on tradexpar.products (external_provider, external_sku)
  where external_provider = 'fastrax' and external_sku is not null;

comment on column tradexpar.fastrax_order_map.fastrax_ped is 'Pedido ecommerce enviado a Fastrax (ope=12, ped)';
comment on column tradexpar.fastrax_order_map.fastrax_pdc is 'Pedido generado en sistema Fastrax (ope=12, pdc)';
comment on column tradexpar.fastrax_order_map.invoice_response is 'Respuesta ope=15 (facturar), si aplica';
comment on column tradexpar.fastrax_order_map.fastrax_status_code is 'Código entero ope=13 (campo sit mapeado)';
comment on column tradexpar.products.external_sku is 'SKU canónico Fastrax (eje con external_provider=fastrax)';
