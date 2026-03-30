-- ARRAY 1 — Pedidos: columnas y líneas (comisión por ítem / fallback total)
alter table tradexpar.orders
  add column if not exists affiliate_attribution_done boolean not null default false,
  add column if not exists affiliate_ref text;

create table if not exists tradexpar.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references tradexpar.orders(id) on delete cascade,
  product_id uuid not null,
  product_name text,
  quantity int not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_subtotal numeric(14,2) not null check (line_subtotal >= 0),
  line_index int not null default 0,
  unique(order_id, line_index)
);

create index if not exists idx_order_items_order on tradexpar.order_items(order_id);
