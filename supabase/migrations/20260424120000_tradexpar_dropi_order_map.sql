-- Pedido interno → Dropi tras pago confirmado (webhook Pagopar). Errores quedan en last_error.
-- Definición inicial (sin inline CHECK: evita errores 42703 en entornos con tablas a medias).
-- La migración 20260424120100 asegura columnas + CHECK + índice.
create table if not exists tradexpar.dropi_order_map (
  order_id uuid primary key references tradexpar.orders (id) on delete cascade,
  status text not null default 'pending',
  dropi_order_id text,
  dropi_order_url text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table tradexpar.dropi_order_map is
  'Sincronización del pedido con Dropi solo después de PagoPar pagado; no tocar pago si falla Dropi.';

revoke all on tradexpar.dropi_order_map from anon, authenticated;
grant select, insert, update, delete on tradexpar.dropi_order_map to service_role;
alter table tradexpar.dropi_order_map enable row level security;
