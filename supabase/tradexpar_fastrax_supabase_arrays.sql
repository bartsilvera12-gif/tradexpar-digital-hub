-- =============================================================================
-- FASTRAX — Bloques listos para Supabase SQL Editor (copiar/pegar por ARRAY)
-- Idempotente. Schema: tradexpar. Tabla: products
-- Ejecutá en orden ARRAY 1 → 5 si tu base aún no tiene la integración.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ARRAY 1 — columnas nuevas (integración catálogo externo)
-- -----------------------------------------------------------------------------
alter table tradexpar.products
  add column if not exists external_provider text,
  add column if not exists external_product_id text,
  add column if not exists external_payload jsonb,
  add column if not exists external_sync_crc text,
  add column if not exists external_last_sync_at timestamptz,
  add column if not exists external_active boolean not null default true;

comment on column tradexpar.products.external_provider is 'Proveedor de catálogo, ej. fastrax';
comment on column tradexpar.products.external_product_id is 'ID en proveedor (Fastrax: mismo sku)';
comment on column tradexpar.products.external_payload is 'Snapshot JSON del proveedor';
comment on column tradexpar.products.external_sync_crc is 'Hash última versión sincronizada';
comment on column tradexpar.products.external_last_sync_at is 'Última sync con proveedor';
comment on column tradexpar.products.external_active is 'Ítem activo/vendible según proveedor';

-- -----------------------------------------------------------------------------
-- ARRAY 2 — constraint / check de product_source_type (tradexpar | dropi | fastrax)
-- -----------------------------------------------------------------------------
do $$
begin
  alter table tradexpar.products drop constraint if exists products_source_type_chk;
exception when undefined_table then null;
end $$;

do $$
begin
  alter table tradexpar.products
    add constraint products_source_type_chk
    check (product_source_type in ('tradexpar', 'dropi', 'fastrax'));
exception
  when duplicate_object then null;
  when undefined_table then null;
end $$;

-- -----------------------------------------------------------------------------
-- ARRAY 3 — índices (búsqueda y listados)
-- -----------------------------------------------------------------------------
create index if not exists idx_products_product_source_type on tradexpar.products (product_source_type);
create index if not exists idx_products_external_provider on tradexpar.products (external_provider);
create index if not exists idx_products_external_product_id on tradexpar.products (external_product_id);
create index if not exists idx_products_sku on tradexpar.products (sku);

-- -----------------------------------------------------------------------------
-- ARRAY 4 — unique parcial anti-duplicados Fastrax (mismo proveedor + id externo)
-- -----------------------------------------------------------------------------
create unique index if not exists idx_products_external_provider_product_id
  on tradexpar.products (external_provider, external_product_id)
  where external_provider is not null
    and external_product_id is not null
    and btrim(external_product_id) <> '';

-- -----------------------------------------------------------------------------
-- ARRAY 5 — backfill / normalización opcional (seguro si ya corría catálogo)
-- -----------------------------------------------------------------------------
-- Quitar espacios en SKU externos duplicables (opcional; solo si tenías datos sucios)
update tradexpar.products
set external_product_id = btrim(external_product_id)
where external_product_id is not null
  and external_product_id <> btrim(external_product_id);

-- Nota: no se borran filas. Productos sin Fastrax no requieren backfill.
