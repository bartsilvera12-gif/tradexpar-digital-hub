-- =============================================================================
-- TRADEXPAR — Módulo afiliados FASE 1 (schema tradexpar)
-- Ejecutar en Supabase SQL Editor por bloques si prefieres; es idempotente en lo posible.
-- Requisito: extensión pgcrypto (ya en tradexpar_migrations.sql)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ARRAY 0 — Limpieza de triggers/tablas legacy (si existían)
-- -----------------------------------------------------------------------------
drop trigger if exists trg_create_affiliate_commission on tradexpar.affiliate_attributions;
drop function if exists tradexpar.fn_create_affiliate_commission();
drop table if exists tradexpar.affiliate_commissions cascade;
drop table if exists tradexpar.affiliate_clicks cascade;


-- -----------------------------------------------------------------------------
-- ARRAY 1 — Pedidos: columnas y líneas (comisión por ítem / fallback total)
-- -----------------------------------------------------------------------------
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

alter table tradexpar.order_items
  add column if not exists product_name text;

alter table tradexpar.order_items
  add column if not exists line_subtotal numeric(14,2);

update tradexpar.order_items oi
set line_subtotal = round(coalesce(oi.unit_price, 0)::numeric * greatest(1, coalesce(oi.quantity, 1)), 2)
where oi.line_subtotal is null;

alter table tradexpar.order_items
  alter column line_subtotal set not null;

-- -----------------------------------------------------------------------------
-- ARRAY 2 — Solicitudes y afiliados (evolución de affiliates)
-- -----------------------------------------------------------------------------
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

-- Columnas nuevas en affiliates (tabla ya creada en migración base)
alter table tradexpar.affiliates
  add column if not exists phone text,
  add column if not exists document_id text,
  add column if not exists customer_id uuid references tradexpar.customers(id) on delete set null,
  add column if not exists request_id uuid references tradexpar.affiliate_requests(id) on delete set null,
  add column if not exists default_buyer_discount_percent numeric(5,2) not null default 0
    check (default_buyer_discount_percent >= 0 and default_buyer_discount_percent <= 100),
  add column if not exists updated_at timestamptz not null default now();

-- Ajustar status: active | suspended | pending
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


-- -----------------------------------------------------------------------------
-- ARRAY 3 — Links, reglas de comisión y descuento (prioridad: producto > global afiliado)
-- -----------------------------------------------------------------------------
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


-- -----------------------------------------------------------------------------
-- ARRAY 4 — Visitas (last-click), atribución, ítems congelados, pagos
-- -----------------------------------------------------------------------------
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

-- Recrear affiliate_attributions con esquema ampliado
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


-- -----------------------------------------------------------------------------
-- ARRAY 5 — Funciones: resolver ref, tasas, código único
-- -----------------------------------------------------------------------------
create or replace function tradexpar.resolve_affiliate_by_ref(p_ref text)
returns uuid
language sql
stable
as $$
  select coalesce(
    (select a.id from tradexpar.affiliates a
     where a.status = 'active' and lower(trim(a.code)) = lower(trim(p_ref)) limit 1),
    (select l.affiliate_id from tradexpar.affiliate_links l
     join tradexpar.affiliates a on a.id = l.affiliate_id
     where l.is_active and lower(trim(l.ref_token)) = lower(trim(p_ref)) and a.status = 'active' limit 1)
  );
$$;

create or replace function tradexpar.generate_unique_affiliate_code()
returns text
language plpgsql
as $$
declare
  v_try text;
  v_n int := 0;
begin
  loop
    v_try := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));
    exit when not exists (select 1 from tradexpar.affiliates c where c.code = v_try);
    v_n := v_n + 1;
    exit when v_n > 50;
  end loop;
  return v_try;
end;
$$;

create or replace function tradexpar.affiliate_commission_rate_for_line(
  p_affiliate_id uuid,
  p_product_id uuid
) returns numeric
language sql
stable
as $$
  select coalesce(
    (select r.commission_percent
     from tradexpar.affiliate_commission_rules r
     where r.affiliate_id = p_affiliate_id and r.product_id = p_product_id limit 1),
    (select r.commission_percent
     from tradexpar.affiliate_commission_rules r
     where r.affiliate_id = p_affiliate_id and r.product_id is null limit 1),
    (select a.commission_rate from tradexpar.affiliates a where a.id = p_affiliate_id limit 1),
    0::numeric
  );
$$;

create or replace function tradexpar.affiliate_buyer_discount_for_line(
  p_affiliate_id uuid,
  p_product_id uuid
) returns numeric
language sql
stable
as $$
  select coalesce(
    (select r.discount_percent
     from tradexpar.affiliate_discount_rules r
     where r.affiliate_id = p_affiliate_id and r.product_id = p_product_id limit 1),
    (select r.discount_percent
     from tradexpar.affiliate_discount_rules r
     where r.affiliate_id = p_affiliate_id and r.product_id is null limit 1),
    (select a.default_buyer_discount_percent from tradexpar.affiliates a where a.id = p_affiliate_id limit 1),
    0::numeric
  );
$$;


-- -----------------------------------------------------------------------------
-- ARRAY 6 — RPC públicos (anon): solicitud, visita, snapshot de líneas, aplicar atribución
-- -----------------------------------------------------------------------------
create or replace function tradexpar.submit_affiliate_request(
  p_full_name text,
  p_email text,
  p_phone text default null,
  p_document_id text default null,
  p_message text default null
) returns uuid
language plpgsql
security definer
set search_path = tradexpar, public
as $$
declare
  v_id uuid;
begin
  insert into tradexpar.affiliate_requests (full_name, email, phone, document_id, message)
  values (trim(p_full_name), lower(trim(p_email)), nullif(trim(p_phone),''), nullif(trim(p_document_id),''), nullif(trim(p_message),''))
  returning id into v_id;
  return v_id;
end;
$$;

-- Espejo mínimo del pedido en Supabase (ERP sigue siendo fuente operativa; esto habilita comisiones).
create or replace function tradexpar.sync_checkout_order_stub(
  p_order_id uuid,
  p_total numeric,
  p_affiliate_ref text default null,
  p_checkout_type text default 'tradexpar'
) returns void
language plpgsql
security definer
set search_path = tradexpar, public
as $$
begin
  insert into tradexpar.orders (id, total, status, checkout_type, affiliate_ref)
  values (
    p_order_id,
    coalesce(p_total, 0),
    'pending',
    coalesce(nullif(trim(p_checkout_type), ''), 'tradexpar'),
    nullif(trim(p_affiliate_ref), '')
  )
  on conflict (id) do update set
    total = excluded.total,
    affiliate_ref = coalesce(nullif(excluded.affiliate_ref, ''), tradexpar.orders.affiliate_ref),
    checkout_type = excluded.checkout_type;
end;
$$;

create or replace function tradexpar.record_affiliate_visit(
  p_ref text,
  p_path text default '/',
  p_user_agent text default null
) returns jsonb
language plpgsql
security definer
set search_path = tradexpar, public
as $$
declare
  v_aff uuid;
  v_id uuid;
begin
  if p_ref is null or trim(p_ref) = '' then
    return jsonb_build_object('ok', false, 'reason', 'empty_ref');
  end if;
  v_aff := tradexpar.resolve_affiliate_by_ref(p_ref);
  if v_aff is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_or_inactive');
  end if;
  insert into tradexpar.affiliate_visits (affiliate_id, ref_token, landing_path, user_agent)
  values (v_aff, trim(p_ref), nullif(trim(p_path),''), nullif(trim(p_user_agent),''))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'affiliate_id', v_aff, 'visit_id', v_id);
end;
$$;

-- Sincronizar líneas desde el checkout (ERP debe preferir escribir order_items server-side).
-- Llamar con service role o política estricta en producción.
create or replace function tradexpar.upsert_order_items_for_affiliate(
  p_order_id uuid,
  p_items jsonb
) returns void
language plpgsql
security definer
set search_path = tradexpar, public
as $$
declare
  it jsonb;
  idx int := 0;
begin
  if p_order_id is null then
    raise exception 'order_id required';
  end if;
  delete from tradexpar.order_items where order_id = p_order_id;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into tradexpar.order_items (
      order_id, product_id, product_name, quantity, unit_price, line_subtotal, line_index
    ) values (
      p_order_id,
      (it->>'product_id')::uuid,
      it->>'product_name',
      greatest(1, coalesce((it->>'quantity')::int, 1)),
      coalesce((it->>'unit_price')::numeric, 0),
      coalesce((it->>'line_subtotal')::numeric,
        coalesce((it->>'unit_price')::numeric, 0) * greatest(1, coalesce((it->>'quantity')::int, 1))),
      idx
    );
    idx := idx + 1;
  end loop;
end;
$$;

create or replace function tradexpar.apply_affiliate_to_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = tradexpar, public
as $$
declare
  v_ref text;
  v_aff uuid;
  v_visit uuid;
  v_attr_id uuid;
  v_attr_done boolean;
  v_line record;
  v_comm_rate numeric;
  v_disc_pct numeric;
  v_comm_amt numeric;
  v_disc_amt numeric;
  v_comm_total numeric := 0;
  v_disc_total numeric := 0;
  v_has_items boolean;
begin
  if exists (select 1 from tradexpar.affiliate_attributions where order_id = p_order_id) then
    return jsonb_build_object('ok', true, 'skipped', 'already_attributed');
  end if;

  select o.affiliate_ref, o.affiliate_attribution_done
  into v_ref, v_attr_done
  from tradexpar.orders o where o.id = p_order_id;

  if coalesce(v_attr_done, false) then
    return jsonb_build_object('ok', true, 'skipped', 'order_already_processed');
  end if;

  if v_ref is null or trim(v_ref) = '' then
    return jsonb_build_object('ok', false, 'reason', 'no_affiliate_ref');
  end if;

  v_aff := tradexpar.resolve_affiliate_by_ref(v_ref);
  if v_aff is null then
    return jsonb_build_object('ok', false, 'reason', 'inactive_or_unknown_ref');
  end if;

  select id into v_visit
  from tradexpar.affiliate_visits
  where affiliate_id = v_aff
    and lower(trim(ref_token)) = lower(trim(v_ref))
  order by created_at desc
  limit 1;
  if v_visit is null then
    select id into v_visit
    from tradexpar.affiliate_visits
    where affiliate_id = v_aff
    order by created_at desc
    limit 1;
  end if;

  select exists (select 1 from tradexpar.order_items oi where oi.order_id = p_order_id) into v_has_items;

  insert into tradexpar.affiliate_attributions (
    order_id, affiliate_id, visit_id, ref_code, commission_total, buyer_discount_total, commission_status
  ) values (
    p_order_id, v_aff, v_visit, trim(v_ref), 0, 0, 'pending'
  ) returning id into v_attr_id;

  if v_has_items then
    for v_line in
      select * from tradexpar.order_items where order_id = p_order_id order by line_index
    loop
      v_comm_rate := tradexpar.affiliate_commission_rate_for_line(v_aff, v_line.product_id);
      v_disc_pct := tradexpar.affiliate_buyer_discount_for_line(v_aff, v_line.product_id);
      v_comm_amt := round(v_line.line_subtotal * (v_comm_rate / 100.0), 2);
      v_disc_amt := round(v_line.line_subtotal * (v_disc_pct / 100.0), 2);
      v_comm_total := v_comm_total + v_comm_amt;
      v_disc_total := v_disc_total + v_disc_amt;
      insert into tradexpar.affiliate_order_items (
        attribution_id, order_id, product_id, product_name, quantity, unit_price, line_subtotal,
        commission_rate_used, commission_amount, buyer_discount_percent_used, line_index
      ) values (
        v_attr_id, p_order_id, v_line.product_id, v_line.product_name, v_line.quantity,
        v_line.unit_price, v_line.line_subtotal, v_comm_rate, v_comm_amt, v_disc_pct, v_line.line_index
      );
    end loop;
  else
    -- Fallback: una línea sintética con el total del pedido (solo comisión global)
    select o.total into v_comm_amt from tradexpar.orders o where o.id = p_order_id;
    v_comm_rate := tradexpar.affiliate_commission_rate_for_line(v_aff, null);
    v_disc_pct := tradexpar.affiliate_buyer_discount_for_line(v_aff, null);
    v_comm_amt := round(coalesce(v_comm_amt,0) * (v_comm_rate / 100.0), 2);
    v_disc_amt := round(coalesce((select total from tradexpar.orders where id = p_order_id),0) * (v_disc_pct / 100.0), 2);
    v_comm_total := v_comm_amt;
    v_disc_total := v_disc_amt;
    insert into tradexpar.affiliate_order_items (
      attribution_id, order_id, product_id, product_name, quantity, unit_price, line_subtotal,
      commission_rate_used, commission_amount, buyer_discount_percent_used, line_index
    ) values (
      v_attr_id, p_order_id, null, '(total pedido)', 1,
      coalesce((select total from tradexpar.orders where id = p_order_id),0),
      coalesce((select total from tradexpar.orders where id = p_order_id),0),
      v_comm_rate, v_comm_amt, v_disc_pct, 0
    );
  end if;

  update tradexpar.affiliate_attributions
  set commission_total = v_comm_total, buyer_discount_total = v_disc_total
  where id = v_attr_id;

  update tradexpar.orders
  set affiliate_attribution_done = true
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'attribution_id', v_attr_id, 'commission_total', v_comm_total);
end;
$$;


-- -----------------------------------------------------------------------------
-- ARRAY 7 — RPC admin (SECURITY DEFINER; restringir en prod con service role / sin grants a anon)
-- -----------------------------------------------------------------------------
create or replace function tradexpar.admin_approve_affiliate_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = tradexpar, public
as $$
declare
  r tradexpar.affiliate_requests%rowtype;
  v_code text;
  v_aff uuid;
begin
  select * into r from tradexpar.affiliate_requests where id = p_request_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'request_not_found');
  end if;
  if r.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'not_pending');
  end if;

  v_code := tradexpar.generate_unique_affiliate_code();

  insert into tradexpar.affiliates (code, name, email, phone, document_id, commission_rate, status, request_id)
  values (v_code, r.full_name, r.email, r.phone, r.document_id, 10.00, 'active', p_request_id)
  returning id into v_aff;

  insert into tradexpar.affiliate_commission_rules (affiliate_id, product_id, commission_percent)
  values (v_aff, null, 10.00);

  insert into tradexpar.affiliate_links (affiliate_id, label, ref_token, is_active)
  values (v_aff, 'Principal', v_code, true);

  update tradexpar.affiliate_requests
  set status = 'approved', reviewed_at = now()
  where id = p_request_id;

  return jsonb_build_object('ok', true, 'affiliate_id', v_aff, 'code', v_code);
end;
$$;

create or replace function tradexpar.admin_reject_affiliate_request(
  p_request_id uuid,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = tradexpar, public
as $$
begin
  update tradexpar.affiliate_requests
  set status = 'rejected', admin_note = nullif(trim(p_note),''), reviewed_at = now()
  where id = p_request_id and status = 'pending';
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_pending_or_missing');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function tradexpar.admin_set_commission_rule(
  p_affiliate_id uuid,
  p_product_id uuid,
  p_percent numeric
) returns void
language plpgsql
security definer
set search_path = tradexpar, public
as $$
begin
  delete from tradexpar.affiliate_commission_rules
  where affiliate_id = p_affiliate_id and product_id is not distinct from p_product_id;
  insert into tradexpar.affiliate_commission_rules (affiliate_id, product_id, commission_percent)
  values (p_affiliate_id, p_product_id, p_percent);
end;
$$;

create or replace function tradexpar.admin_set_discount_rule(
  p_affiliate_id uuid,
  p_product_id uuid,
  p_percent numeric
) returns void
language plpgsql
security definer
set search_path = tradexpar, public
as $$
begin
  delete from tradexpar.affiliate_discount_rules
  where affiliate_id = p_affiliate_id and product_id is not distinct from p_product_id;
  insert into tradexpar.affiliate_discount_rules (affiliate_id, product_id, discount_percent)
  values (p_affiliate_id, p_product_id, p_percent);
end;
$$;

create or replace function tradexpar.admin_set_attribution_commission_status(
  p_attribution_id uuid,
  p_status text
) returns void
language plpgsql
security definer
set search_path = tradexpar, public
as $$
begin
  if p_status not in ('pending','approved','paid','cancelled') then
    raise exception 'invalid commission status';
  end if;
  update tradexpar.affiliate_attributions
  set commission_status = p_status
  where id = p_attribution_id;
end;
$$;

create or replace function tradexpar.admin_set_affiliate_globals(
  p_affiliate_id uuid,
  p_commission_percent numeric,
  p_buyer_discount_percent numeric
) returns void
language plpgsql
security definer
set search_path = tradexpar, public
as $$
begin
  update tradexpar.affiliates
  set commission_rate = p_commission_percent,
      default_buyer_discount_percent = p_buyer_discount_percent,
      updated_at = now()
  where id = p_affiliate_id;
  perform tradexpar.admin_set_commission_rule(p_affiliate_id, null, p_commission_percent);
  perform tradexpar.admin_set_discount_rule(p_affiliate_id, null, p_buyer_discount_percent);
end;
$$;


-- -----------------------------------------------------------------------------
-- ARRAY 8 — Vista para panel (ventas / comisiones)
-- -----------------------------------------------------------------------------
create or replace view tradexpar.v_affiliate_sales_detail as
select
  att.id as attribution_id,
  att.affiliate_id,
  af.code as affiliate_code,
  af.name as affiliate_name,
  att.order_id,
  o.created_at as order_created_at,
  o.total as order_total,
  att.commission_total,
  att.commission_status,
  att.ref_code,
  (select coalesce(string_agg(coalesce(aoi.product_name, aoi.product_id::text), ', '), '')
   from tradexpar.affiliate_order_items aoi
   where aoi.attribution_id = att.id) as products_label,
  (select coalesce(sum(aoi.quantity), 0)::bigint
   from tradexpar.affiliate_order_items aoi
   where aoi.attribution_id = att.id) as total_qty
from tradexpar.affiliate_attributions att
join tradexpar.affiliates af on af.id = att.affiliate_id
join tradexpar.orders o on o.id = att.order_id;

create or replace view tradexpar.v_affiliate_summary as
select
  a.id as affiliate_id,
  a.name,
  a.code,
  a.status,
  a.commission_rate as default_commission_percent,
  a.default_buyer_discount_percent,
  count(distinct att.order_id) as orders_count,
  coalesce(sum(aoi.line_subtotal), 0) as total_sold,
  coalesce(sum(aoi.commission_amount), 0) as commission_total,
  coalesce(sum(case when att.commission_status = 'pending' then aoi.commission_amount end), 0) as commission_pending,
  coalesce(sum(case when att.commission_status = 'approved' then aoi.commission_amount end), 0) as commission_approved,
  coalesce(sum(case when att.commission_status = 'paid' then aoi.commission_amount end), 0) as commission_paid
from tradexpar.affiliates a
left join tradexpar.affiliate_attributions att on att.affiliate_id = a.id
left join tradexpar.affiliate_order_items aoi on aoi.attribution_id = att.id
group by a.id, a.name, a.code, a.status, a.commission_rate, a.default_buyer_discount_percent;


-- -----------------------------------------------------------------------------
-- ARRAY 9 — Grants (ajustar según política: admin vía service_role)
-- -----------------------------------------------------------------------------
grant usage on schema tradexpar to anon, authenticated, service_role;

grant select, insert on tradexpar.affiliate_requests to anon, authenticated;
grant execute on function tradexpar.submit_affiliate_request(text, text, text, text, text) to anon, authenticated;
grant execute on function tradexpar.record_affiliate_visit(text, text, text) to anon, authenticated;
grant execute on function tradexpar.apply_affiliate_to_order(uuid) to anon, authenticated, service_role;
grant execute on function tradexpar.upsert_order_items_for_affiliate(uuid, jsonb) to anon, authenticated, service_role;
grant execute on function tradexpar.sync_checkout_order_stub(uuid, numeric, text, text) to anon, authenticated, service_role;

-- Funciones admin: en producción quitar TO anon/authenticated y usar solo service_role
grant execute on function tradexpar.admin_approve_affiliate_request(uuid) to anon, authenticated, service_role;
grant execute on function tradexpar.admin_reject_affiliate_request(uuid, text) to anon, authenticated, service_role;
grant execute on function tradexpar.admin_set_commission_rule(uuid, uuid, numeric) to anon, authenticated, service_role;
grant execute on function tradexpar.admin_set_discount_rule(uuid, uuid, numeric) to anon, authenticated, service_role;
grant execute on function tradexpar.admin_set_affiliate_globals(uuid, numeric, numeric) to anon, authenticated, service_role;
grant execute on function tradexpar.admin_set_attribution_commission_status(uuid, text) to anon, authenticated, service_role;

grant select on tradexpar.affiliate_requests to service_role;
grant select on tradexpar.affiliates to service_role;
grant select on tradexpar.affiliate_links to service_role;
grant select on tradexpar.affiliate_commission_rules to service_role;
grant select on tradexpar.affiliate_discount_rules to service_role;
grant select on tradexpar.affiliate_visits to service_role;
grant select on tradexpar.affiliate_attributions to service_role;
grant select on tradexpar.affiliate_order_items to service_role;
grant select on tradexpar.affiliate_payouts to service_role;
grant select on tradexpar.order_items to service_role;
grant select on tradexpar.orders to service_role;
grant select on tradexpar.v_affiliate_sales_detail to service_role;
grant select on tradexpar.v_affiliate_summary to service_role;

-- Permitir lectura admin con clave anónima SOLO en desarrollo — comentar en prod:
grant select on tradexpar.affiliate_requests to anon, authenticated;
grant select on tradexpar.affiliates to anon, authenticated;
grant select on tradexpar.affiliate_links to anon, authenticated;
grant select on tradexpar.affiliate_commission_rules to anon, authenticated;
grant select on tradexpar.affiliate_discount_rules to anon, authenticated;
grant select on tradexpar.affiliate_attributions to anon, authenticated;
grant select on tradexpar.affiliate_order_items to anon, authenticated;
grant select on tradexpar.v_affiliate_sales_detail to anon, authenticated;
grant select on tradexpar.v_affiliate_summary to anon, authenticated;
