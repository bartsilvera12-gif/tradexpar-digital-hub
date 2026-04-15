-- Ejecutar en SQL Editor (Postgres conectado a la MISMA base que api.neura.com.py).
-- Corrige: "Could not find the table 'tradexpar.products' in the schema cache"
-- (o PGRST106 si la tabla no existía y PostgREST no la tenía en caché).
--
-- 1) Si la tabla ya existe, solo recarga caché; si no existe, la crea (mínimo catálogo).

create schema if not exists tradexpar;

create table if not exists tradexpar.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text not null default '',
  description text not null default '',
  category text not null default '',
  price numeric(12,2) not null default 0 check (price >= 0),
  stock int not null default 0 check (stock >= 0),
  image text not null default '',
  images jsonb,
  product_source_type text not null default 'tradexpar',
  discount_type text,
  discount_value numeric(12,2) default 0,
  discount_starts_at timestamptz,
  discount_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'tradexpar' and t.relname = 'products' and c.conname = 'products_source_type_chk'
  ) then
    alter table tradexpar.products
      add constraint products_source_type_chk check (product_source_type in ('tradexpar', 'dropi', 'fastrax'));
  end if;
exception when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'tradexpar' and t.relname = 'products' and c.conname = 'products_discount_type_chk'
  ) then
    alter table tradexpar.products
      add constraint products_discount_type_chk check (discount_type is null or discount_type in ('percentage', 'fixed'));
  end if;
exception when duplicate_object then null;
end $$;

create index if not exists idx_products_category on tradexpar.products(category);
create index if not exists idx_products_name on tradexpar.products(name);

grant usage on schema tradexpar to anon, authenticated, service_role;
grant select on tradexpar.products to anon, authenticated;
grant insert, update, delete on tradexpar.products to anon, authenticated;

notify pgrst, 'reload schema';
