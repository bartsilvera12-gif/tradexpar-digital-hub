-- ARRAY 1
create schema if not exists tradexpar;
create extension if not exists pgcrypto;

-- Base mínima para evitar errores si aún no existe la tabla operativa
create table if not exists tradexpar.orders (
  id uuid primary key default gen_random_uuid(),
  total numeric(12,2) not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table if exists tradexpar.products
  add column if not exists product_source_type text not null default 'tradexpar',
  add column if not exists discount_type text,
  add column if not exists discount_value numeric(12,2) default 0,
  add column if not exists discount_starts_at timestamptz,
  add column if not exists discount_ends_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_source_type_chk') then
    alter table tradexpar.products add constraint products_source_type_chk check (product_source_type in ('tradexpar', 'dropi'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_discount_type_chk') then
    alter table tradexpar.products add constraint products_discount_type_chk check (discount_type is null or discount_type in ('percentage', 'fixed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_discount_value_chk') then
    alter table tradexpar.products add constraint products_discount_value_chk check (coalesce(discount_value,0) >= 0);
  end if;
end $$;

do $$
begin
  if to_regclass('tradexpar.orders') is not null then
    alter table tradexpar.orders
      add column if not exists checkout_type text not null default 'tradexpar',
      add column if not exists affiliate_ref text,
      add column if not exists customer_location_id uuid,
      add column if not exists location_url text;

    if not exists (select 1 from pg_constraint where conname = 'orders_checkout_type_chk') then
      alter table tradexpar.orders add constraint orders_checkout_type_chk check (checkout_type in ('tradexpar','dropi','mixed'));
    end if;
  end if;
end $$;

-- ARRAY 2
create table if not exists tradexpar.customers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  name text not null,
  email text not null unique,
  password_hash text,
  provider text default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tradexpar.customer_locations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references tradexpar.customers(id) on delete cascade,
  label text not null,
  location_url text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tradexpar.customer_wishlists (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references tradexpar.customers(id) on delete cascade,
  product_id uuid not null references tradexpar.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(customer_id, product_id)
);

-- ARRAY 3
create table if not exists tradexpar.affiliates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  email text not null unique,
  commission_rate numeric(5,2) not null default 10.00,
  status text not null default 'approved',
  created_at timestamptz not null default now()
);

create table if not exists tradexpar.affiliate_clicks (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references tradexpar.affiliates(id) on delete cascade,
  ref_code text not null,
  landing_url text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists tradexpar.affiliate_attributions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references tradexpar.orders(id) on delete cascade,
  affiliate_id uuid not null references tradexpar.affiliates(id) on delete cascade,
  ref_code text not null,
  created_at timestamptz not null default now(),
  unique(order_id)
);

create table if not exists tradexpar.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references tradexpar.orders(id) on delete cascade,
  affiliate_id uuid not null references tradexpar.affiliates(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  rate numeric(5,2) not null default 10.00,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id, affiliate_id)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'affiliate_commissions_status_chk') then
    alter table tradexpar.affiliate_commissions
      add constraint affiliate_commissions_status_chk
      check (status in ('pending','approved','paid','cancelled'));
  end if;
end $$;

create or replace function tradexpar.fn_create_affiliate_commission()
returns trigger
language plpgsql
as $$
declare
  v_order_total numeric(12,2);
  v_rate numeric(5,2);
begin
  select o.total into v_order_total from tradexpar.orders o where o.id = new.order_id;
  select a.commission_rate into v_rate from tradexpar.affiliates a where a.id = new.affiliate_id;

  insert into tradexpar.affiliate_commissions(order_id, affiliate_id, amount, rate, status)
  values (new.order_id, new.affiliate_id, round((coalesce(v_order_total,0) * coalesce(v_rate,10)) / 100.0, 2), coalesce(v_rate,10), 'pending')
  on conflict (order_id, affiliate_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_create_affiliate_commission on tradexpar.affiliate_attributions;
create trigger trg_create_affiliate_commission
after insert on tradexpar.affiliate_attributions
for each row execute function tradexpar.fn_create_affiliate_commission();

-- ARRAY 4 (compatibilidad DashboardNeura en public)
create or replace view public.tradexpar_products_v as
select p.id, p.name, p.category, p.price, p.stock, p.product_source_type, p.discount_type, p.discount_value, p.discount_starts_at, p.discount_ends_at, p.created_at
from tradexpar.products p;

create or replace view public.tradexpar_orders_v as
select o.id, o.total, o.status, o.checkout_type, o.affiliate_ref, o.location_url, o.created_at
from tradexpar.orders o;
