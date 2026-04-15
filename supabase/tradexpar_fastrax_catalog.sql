-- =============================================================================
-- TRADEXPAR — Fastrax: columnas externas, check product_source_type, índices
-- Idempotente. Ejecutar en SQL Editor (o como migración) después del catálogo base.
-- =============================================================================

-- Columnas de integración (catálogo externo)
alter table tradexpar.products
  add column if not exists external_provider text,
  add column if not exists external_product_id text,
  add column if not exists external_payload jsonb,
  add column if not exists external_sync_crc text,
  add column if not exists external_last_sync_at timestamptz,
  add column if not exists external_active boolean not null default true;

comment on column tradexpar.products.external_provider is 'Proveedor de catálogo, ej. fastrax';
comment on column tradexpar.products.external_product_id is 'ID/SKU en el proveedor (Fastrax: mismo sku)';
comment on column tradexpar.products.external_payload is 'Respuesta cruda o snapshot útil del proveedor';
comment on column tradexpar.products.external_sync_crc is 'Hash/checksum de la última versión sincronizada';
comment on column tradexpar.products.external_last_sync_at is 'Última sincronización exitosa con el proveedor';
comment on column tradexpar.products.external_active is 'Si el proveedor considera el ítem activo/vendible';

-- Ampliar origen de catálogo
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

-- Un ítem externo por (proveedor, id externo) cuando ambos están definidos
create unique index if not exists idx_products_external_provider_product_id
  on tradexpar.products (external_provider, external_product_id)
  where external_provider is not null
    and external_product_id is not null
    and btrim(external_product_id) <> '';

create index if not exists idx_products_product_source_type on tradexpar.products (product_source_type);
create index if not exists idx_products_external_provider on tradexpar.products (external_provider);
create index if not exists idx_products_external_product_id on tradexpar.products (external_product_id);
create index if not exists idx_products_sku on tradexpar.products (sku);

-- Marca / peso / dimensiones (ver también migración supabase/migrations/*_tradexpar_products_fastrax_fields.sql)
alter table tradexpar.products
  add column if not exists brand text not null default '',
  add column if not exists weight_kg numeric(14, 4),
  add column if not exists dimensions_label text;
