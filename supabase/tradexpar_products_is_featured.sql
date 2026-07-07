-- Marca de "producto destacado" para la home (schema tradexpar).
-- Ejecutar una vez en Supabase SQL Editor.

alter table tradexpar.products
  add column if not exists is_featured boolean not null default false;

comment on column tradexpar.products.is_featured is
  'Si es true, el producto aparece en la sección "Productos destacados" del home.';

create index if not exists products_is_featured_idx
  on tradexpar.products (is_featured)
  where is_featured = true;
