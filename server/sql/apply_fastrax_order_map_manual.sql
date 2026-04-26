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
