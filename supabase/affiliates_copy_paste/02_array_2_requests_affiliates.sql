-- ARRAY 2 — Solicitudes y afiliados (evolución de affiliates)
create table if not exists tradexpar.affiliate_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  document_id text,
  message text,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  admin_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_affiliate_requests_status on tradexpar.affiliate_requests(status);
create index if not exists idx_affiliate_requests_created on tradexpar.affiliate_requests(created_at desc);

alter table tradexpar.affiliates
  add column if not exists phone text,
  add column if not exists document_id text,
  add column if not exists customer_id uuid references tradexpar.customers(id) on delete set null,
  add column if not exists request_id uuid references tradexpar.affiliate_requests(id) on delete set null,
  add column if not exists default_buyer_discount_percent numeric(5,2) not null default 0
    check (default_buyer_discount_percent >= 0 and default_buyer_discount_percent <= 100),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'affiliates_status_chk' and conrelid = 'tradexpar.affiliates'::regclass
  ) then
    alter table tradexpar.affiliates drop constraint affiliates_status_chk;
  end if;
exception when undefined_table then null;
end $$;

update tradexpar.affiliates set status = 'active' where status = 'approved';

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'tradexpar' and t.relname = 'affiliates' and c.conname = 'affiliates_status_chk'
  ) then
    alter table tradexpar.affiliates
      add constraint affiliates_status_chk check (status in ('active','suspended','pending'));
  end if;
end $$;
