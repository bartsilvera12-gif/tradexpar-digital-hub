-- ARRAY 4 — Visitas (last-click), atribución, ítems congelados, pagos
create table if not exists tradexpar.affiliate_visits (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references tradexpar.affiliates(id) on delete cascade,
  ref_token text not null,
  landing_path text,
  user_agent text,
  ip inet,
  created_at timestamptz not null default now()
);

create index if not exists idx_affiliate_visits_aff_time on tradexpar.affiliate_visits(affiliate_id, created_at desc);

drop table if exists tradexpar.affiliate_order_items cascade;
drop table if exists tradexpar.affiliate_attributions cascade;

create table tradexpar.affiliate_attributions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references tradexpar.orders(id) on delete cascade,
  affiliate_id uuid not null references tradexpar.affiliates(id) on delete restrict,
  visit_id uuid references tradexpar.affiliate_visits(id) on delete set null,
  ref_code text not null,
  commission_total numeric(14,2) not null default 0 check (commission_total >= 0),
  buyer_discount_total numeric(14,2) not null default 0 check (buyer_discount_total >= 0),
  commission_status text not null default 'pending'
    check (commission_status in ('pending','approved','paid','cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists idx_aff_attr_aff on tradexpar.affiliate_attributions(affiliate_id);
create index if not exists idx_aff_attr_status on tradexpar.affiliate_attributions(commission_status);

create table tradexpar.affiliate_order_items (
  id uuid primary key default gen_random_uuid(),
  attribution_id uuid not null references tradexpar.affiliate_attributions(id) on delete cascade,
  order_id uuid not null references tradexpar.orders(id) on delete cascade,
  product_id uuid,
  product_name text,
  quantity int not null check (quantity > 0),
  unit_price numeric(14,2) not null,
  line_subtotal numeric(14,2) not null,
  commission_rate_used numeric(7,4) not null default 0,
  commission_amount numeric(14,2) not null default 0,
  buyer_discount_percent_used numeric(7,4) not null default 0,
  line_index int not null default 0,
  unique(attribution_id, line_index)
);

create index if not exists idx_aff_oi_order on tradexpar.affiliate_order_items(order_id);

create table if not exists tradexpar.affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references tradexpar.affiliates(id) on delete restrict,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'PYG',
  status text not null default 'pending' check (status in ('pending','completed','cancelled')),
  period_start date,
  period_end date,
  paid_at timestamptz,
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_aff_payouts_aff on tradexpar.affiliate_payouts(affiliate_id);
