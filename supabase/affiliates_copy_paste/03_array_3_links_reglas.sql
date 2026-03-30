-- ARRAY 3 — Links, reglas de comisión y descuento (prioridad: producto > global afiliado)
create table if not exists tradexpar.affiliate_links (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references tradexpar.affiliates(id) on delete cascade,
  label text,
  ref_token text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(ref_token)
);

create index if not exists idx_affiliate_links_aff on tradexpar.affiliate_links(affiliate_id);

create table if not exists tradexpar.affiliate_commission_rules (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references tradexpar.affiliates(id) on delete cascade,
  product_id uuid,
  commission_percent numeric(5,2) not null check (commission_percent >= 0 and commission_percent <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (product_id is not null or true)
);

create unique index if not exists uq_aff_comm_global
  on tradexpar.affiliate_commission_rules(affiliate_id) where product_id is null;
create unique index if not exists uq_aff_comm_product
  on tradexpar.affiliate_commission_rules(affiliate_id, product_id) where product_id is not null;

create table if not exists tradexpar.affiliate_discount_rules (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references tradexpar.affiliates(id) on delete cascade,
  product_id uuid,
  discount_percent numeric(5,2) not null check (discount_percent >= 0 and discount_percent <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_aff_disc_global
  on tradexpar.affiliate_discount_rules(affiliate_id) where product_id is null;
create unique index if not exists uq_aff_disc_product
  on tradexpar.affiliate_discount_rules(affiliate_id, product_id) where product_id is not null;
