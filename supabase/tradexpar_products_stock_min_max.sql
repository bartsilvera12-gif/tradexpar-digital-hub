-- Stock mínimo / máximo en productos (schema tradexpar).
-- Ejecutar una vez en Supabase SQL Editor si ya tenés la tabla products.

alter table tradexpar.products
  add column if not exists stock_min int,
  add column if not exists stock_max int;

comment on column tradexpar.products.stock_min is 'Umbral mínimo de inventario (opcional).';
comment on column tradexpar.products.stock_max is 'Tope máximo de inventario (opcional).';
