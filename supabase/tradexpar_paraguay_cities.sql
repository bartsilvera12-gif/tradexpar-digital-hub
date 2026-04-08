-- Municipios de Paraguay (Wikipedia / 263 distritos) + código hub PagoPar para checkout.
-- Ejecutar en Supabase SQL Editor DESPUÉS de tener schema tradexpar:
--   1) Este archivo
--   2) tradexpar_paraguay_cities_seed.sql (generado: node scripts/generate-paraguay-cities-sql.mjs)

create table if not exists tradexpar.paraguay_cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  department text not null,
  pagopar_city_code text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (name, department)
);

create index if not exists idx_paraguay_cities_department on tradexpar.paraguay_cities (department);
create index if not exists idx_paraguay_cities_sort on tradexpar.paraguay_cities (department, sort_order, name);

comment on table tradexpar.paraguay_cities is
  'Municipios/distritos del Paraguay; pagopar_city_code agrupa por hub de la pasarela (no es catálogo oficial PagoPar).';

comment on column tradexpar.paraguay_cities.pagopar_city_code is
  'Código hub PagoPar (1–15); ver src/config/pagoparCiudadesPy.ts';

alter table tradexpar.paraguay_cities enable row level security;

drop policy if exists "paraguay_cities_select_public" on tradexpar.paraguay_cities;
create policy "paraguay_cities_select_public"
  on tradexpar.paraguay_cities
  for select
  to anon, authenticated
  using (true);

grant select on tradexpar.paraguay_cities to anon, authenticated;
