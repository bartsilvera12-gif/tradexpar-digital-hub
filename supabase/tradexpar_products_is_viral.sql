-- Marca de "producto viral" para la home (schema tradexpar).
-- Independiente del origen del catálogo: cualquier producto puede marcarse viral
-- manualmente desde el panel, igual que "Producto destacado".
-- Ejecutar una vez en Supabase SQL Editor.

alter table tradexpar.products
  add column if not exists is_viral boolean not null default false;

comment on column tradexpar.products.is_viral is
  'Si es true, el producto aparece en la sección "Los más virales" del home. Manual, no depende de product_source_type.';

create index if not exists products_is_viral_idx
  on tradexpar.products (is_viral)
  where is_viral = true;

-- Backfill: los que hoy salían como virales por ser Dropi, quedan marcados
-- para no perder la selección actual al pasar al flag manual.
update tradexpar.products
  set is_viral = true
  where product_source_type = 'dropi'
    and is_viral = false;
