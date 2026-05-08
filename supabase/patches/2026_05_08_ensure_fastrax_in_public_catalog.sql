-- =============================================================================
-- PATCH: Asegurar que productos Fastrax aparezcan en el catálogo público.
-- Idempotente. Ejecutar en Supabase SQL Editor (rol superusuario / postgres).
-- Schema: tradexpar
--
-- Causa probable del bug: los SQL antiguos (`tradexpar_migrations.sql`,
-- `tradexpar_catalog_orders.sql`) crearon la constraint
--   products_source_type_chk CHECK (product_source_type IN ('tradexpar','dropi'))
-- y la migración Fastrax (20260415153000_tradexpar_fastrax_catalog.sql) que la
-- amplía a `('tradexpar','dropi','fastrax')` puede no haberse aplicado en la
-- base productiva. En ese caso TODOS los inserts Fastrax fallaban con
-- "violates check constraint" y los productos jamás llegaban a la tabla, por
-- lo que /products mostraba "0 productos disponibles".
--
-- Este patch:
--   1. Garantiza columnas `external_*` y `images` (jsonb) usadas por el upsert
--      Fastrax actual y el frontend (galería).
--   2. Re-crea la check constraint aceptando 'fastrax'.
--   3. Confirma índices y unique parcial (anti-duplicados) Fastrax.
--   4. Reafirma GRANT SELECT a anon/authenticated (catálogo público).
--   5. Recarga el cache de schema de PostgREST.
--
-- NO TOCA: pedidos, PagoPar, Dropi, fastrax_order_map, ni tablas de checkout.
-- =============================================================================

-- 1) Columnas externas y galería de imágenes (idempotente).
alter table tradexpar.products
  add column if not exists external_provider text,
  add column if not exists external_product_id text,
  add column if not exists external_sku text,
  add column if not exists external_payload jsonb,
  add column if not exists external_sync_crc text,
  add column if not exists external_last_sync_at timestamptz,
  add column if not exists external_active boolean not null default true,
  add column if not exists images jsonb,
  add column if not exists brand text not null default '',
  add column if not exists weight_kg numeric(14, 4),
  add column if not exists dimensions_label text;

comment on column tradexpar.products.images is
  'Galería de imágenes (jsonb array de URLs públicas). Fastrax usa /fastrax-products/{SKU}-{i}.jpg';

-- 2) Check constraint actualizada (acepta fastrax).
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

-- 3) Índices que el catálogo y el upsert Fastrax esperan.
create index if not exists idx_products_product_source_type on tradexpar.products (product_source_type);
create index if not exists idx_products_external_provider   on tradexpar.products (external_provider);
create index if not exists idx_products_external_product_id on tradexpar.products (external_product_id);
create index if not exists idx_products_sku                 on tradexpar.products (sku);

-- Anti-duplicados Fastrax (mismo proveedor + id externo).
create unique index if not exists idx_products_external_provider_product_id
  on tradexpar.products (external_provider, external_product_id)
  where external_provider is not null
    and external_product_id is not null
    and btrim(external_product_id) <> '';

-- Anti-duplicados Fastrax por SKU canónico.
create unique index if not exists ux_products_fastrax_provider_sku
  on tradexpar.products (external_provider, external_sku)
  where external_provider = 'fastrax' and external_sku is not null;

-- 4) GRANT SELECT al rol anon (PostgREST) y authenticated.
grant usage on schema tradexpar to anon, authenticated, service_role;
grant select on tradexpar.products to anon, authenticated;

-- 5) Recargar el cache de PostgREST para que reconozca constraints/columnas.
notify pgrst, 'reload schema';

-- =============================================================================
-- DIAGNÓSTICO (opcional). Después de correr este patch, las siguientes consultas
-- ayudan a verificar que Fastrax llegó al catálogo.
--
--   -- ¿Se aplicó la constraint nueva?
--   select pg_get_constraintdef(c.oid) as def
--   from   pg_constraint c
--   join   pg_class t on c.conrelid = t.oid
--   join   pg_namespace n on t.relnamespace = n.oid
--   where  n.nspname = 'tradexpar' and t.relname = 'products'
--     and  c.conname = 'products_source_type_chk';
--
--   -- ¿Cuántos productos Fastrax hay y su estado?
--   select product_source_type, count(*) as filas, sum((stock > 0)::int) as con_stock
--   from   tradexpar.products
--   group  by product_source_type
--   order  by product_source_type;
--
--   -- ¿Aparece SKU 94306?
--   select id, sku, name, price, stock, image, images, product_source_type,
--          external_provider, external_product_id, external_active
--   from   tradexpar.products
--   where  sku = '94306'
--      or  external_product_id = '94306';
-- =============================================================================
