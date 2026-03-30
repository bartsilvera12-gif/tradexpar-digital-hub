-- =============================================================================
-- TRADEXPAR — Afiliados PRO: antifraude, ajustes, campañas, assets, tiers, hooks, analytics
-- Ejecutar DESPUÉS de phase1 + portal + catalog (create_checkout_order).
-- Idempotente en lo posible (ALTER IF NOT EXISTS, CREATE IF NOT EXISTS).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A) Órdenes: IP checkout + slug campaña (ERP puede sincronizar status vía update)
-- -----------------------------------------------------------------------------
alter table tradexpar.orders
  add column if not exists checkout_client_ip inet,
  add column if not exists affiliate_campaign_slug text;

-- -----------------------------------------------------------------------------
-- B) Visitas y atribuciones: campaña + revisión manual
-- -----------------------------------------------------------------------------
alter table tradexpar.affiliate_visits
  add column if not exists campaign_slug text,
  add column if not exists campaign_id uuid;

alter table tradexpar.affiliate_attributions
  add column if not exists campaign_slug text,
  add column if not exists campaign_id uuid,
  add column if not exists requires_manual_review boolean not null default false;

do $$
begin
  alter table tradexpar.affiliate_attributions
    drop constraint if exists affiliate_attributions_commission_status_check;
exception when undefined_object then null;
end $$;

do $$
begin
  alter table tradexpar.affiliate_attributions
    add constraint affiliate_attributions_commission_status_check
    check (commission_status in ('pending','approved','paid','cancelled','rejected'));
exception when duplicate_object then null;
end $$;

alter table tradexpar.affiliate_order_items
  add column if not exists tier_bonus_percent_used numeric(7,4) not null default 0;

-- -----------------------------------------------------------------------------
-- C) Tablas nuevas
-- -----------------------------------------------------------------------------
create table if not exists tradexpar.affiliate_tiers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  min_sales int not null default 0 check (min_sales >= 0),
  commission_bonus_percent numeric(7,4) not null default 0 check (commission_bonus_percent >= 0 and commission_bonus_percent <= 100),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_affiliate_tiers_active on tradexpar.affiliate_tiers(is_active, sort_order);

insert into tradexpar.affiliate_tiers (name, min_sales, commission_bonus_percent, sort_order, is_active)
select v.name, v.min_sales, v.bonus, v.ord, true
from (values
  ('Nivel base', 0, 0::numeric, 0),
  ('Pro', 11, 2::numeric, 1),
  ('Elite', 31, 4::numeric, 2)
) as v(name, min_sales, bonus, ord)
where not exists (select 1 from tradexpar.affiliate_tiers limit 1);

create table if not exists tradexpar.affiliate_campaigns (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references tradexpar.affiliates(id) on delete cascade,
  name text not null,
  slug text not null,
  target_type text not null default 'store' check (target_type in ('product','store','custom')),
  target_id uuid,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(affiliate_id, slug)
);

create index if not exists idx_aff_campaigns_aff on tradexpar.affiliate_campaigns(affiliate_id);

create table if not exists tradexpar.affiliate_assets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  asset_type text not null check (asset_type in ('image','video','text','pdf')),
  file_url text not null,
  product_id uuid references tradexpar.products(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_aff_assets_active on tradexpar.affiliate_assets(is_active);

create table if not exists tradexpar.affiliate_fraud_flags (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references tradexpar.affiliates(id) on delete cascade,
  order_id uuid references tradexpar.orders(id) on delete set null,
  visit_id uuid references tradexpar.affiliate_visits(id) on delete set null,
  flag_type text not null check (flag_type in (
    'self_purchase','duplicate_pattern','suspicious_ip','high_refund_rate','low_conversion'
  )),
  severity text not null check (severity in ('low','medium','high')),
  status text not null default 'open' check (status in ('open','reviewed','dismissed','confirmed')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_aff_fraud_aff on tradexpar.affiliate_fraud_flags(affiliate_id);
create index if not exists idx_aff_fraud_status on tradexpar.affiliate_fraud_flags(status);

create table if not exists tradexpar.affiliate_commission_adjustments (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references tradexpar.affiliates(id) on delete restrict,
  attribution_id uuid references tradexpar.affiliate_attributions(id) on delete set null,
  payout_id uuid references tradexpar.affiliate_payouts(id) on delete set null,
  type text not null check (type in ('refund','chargeback','manual_adjustment')),
  amount numeric(14,2) not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_aff_adj_aff on tradexpar.affiliate_commission_adjustments(affiliate_id);
create index if not exists idx_aff_adj_attr on tradexpar.affiliate_commission_adjustments(attribution_id);

create table if not exists tradexpar.affiliate_hook_queue (
  id uuid primary key default gen_random_uuid(),
  hook_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_aff_hook_unprocessed on tradexpar.affiliate_hook_queue(created_at) where processed_at is null;

-- FK visitas → campaigns (ahora existe la tabla)
do $$
begin
  alter table tradexpar.affiliate_visits
    drop constraint if exists affiliate_visits_campaign_fk;
  alter table tradexpar.affiliate_visits
    add constraint affiliate_visits_campaign_fk
    foreign key (campaign_id) references tradexpar.affiliate_campaigns(id) on delete set null;
exception when undefined_table then null;
end $$;

do $$
begin
  alter table tradexpar.affiliate_attributions
    drop constraint if exists affiliate_attributions_campaign_fk;
  alter table tradexpar.affiliate_attributions
    add constraint affiliate_attributions_campaign_fk
    foreign key (campaign_id) references tradexpar.affiliate_campaigns(id) on delete set null;
exception when undefined_table then null;
end $$;

-- -----------------------------------------------------------------------------
-- D) Helpers: normalizar teléfono, ventas del mes, bonus tier
-- -----------------------------------------------------------------------------
create or replace function tradexpar._affiliate_digits_phone(p text)
returns text language sql immutable as $$
  select nullif(regexp_replace(coalesce(p,''), '[^0-9]', '', 'g'), '');
$$;

create or replace function tradexpar.affiliate_sales_count_month(p_affiliate_id uuid, p_ref timestamptz default now())
returns int
language sql stable
as $$
  select count(distinct att.order_id)::int
  from tradexpar.affiliate_attributions att
  join tradexpar.orders o on o.id = att.order_id
  where att.affiliate_id = p_affiliate_id
    and date_trunc('month', o.created_at) = date_trunc('month', p_ref)
    and coalesce(lower(o.status),'') not in ('cancelled','refunded');
$$;

create or replace function tradexpar.affiliate_tier_bonus_percent(p_affiliate_id uuid)
returns numeric
language sql stable
as $$
  select coalesce(max(t.commission_bonus_percent), 0::numeric)
  from tradexpar.affiliate_tiers t
  where t.is_active
    and t.min_sales <= tradexpar.affiliate_sales_count_month(p_affiliate_id);
$$;

-- -----------------------------------------------------------------------------
-- E) Hooks (stub → cola; email/WhatsApp después)
-- -----------------------------------------------------------------------------
create or replace function tradexpar.hook_affiliate_event(p_hook_type text, p_payload jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = tradexpar, public
as $$
begin
  insert into tradexpar.affiliate_hook_queue (hook_type, payload)
  values (p_hook_type, coalesce(p_payload, '{}'::jsonb));
end;
$$;

create or replace function tradexpar.on_affiliate_approved()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'active' and (
    tg_op = 'INSERT'
    or (tg_op = 'UPDATE' and coalesce(old.status, '') is distinct from 'active')
  ) then
    perform tradexpar.hook_affiliate_event('onAffiliateApproved', jsonb_build_object('affiliate_id', new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_affiliate_approved_hook on tradexpar.affiliates;
create trigger trg_affiliate_approved_hook
after insert or update of status on tradexpar.affiliates
for each row execute function tradexpar.on_affiliate_approved();

-- Comisión aprobada / pago: desde RPC admin (más abajo se llama hook)

-- -----------------------------------------------------------------------------
-- F) Antifraude: evaluación post-atribución
-- -----------------------------------------------------------------------------
create or replace function tradexpar.affiliate_evaluate_fraud(
  p_order_id uuid,
  p_affiliate_id uuid,
  p_attribution_id uuid,
  p_visit_id uuid
) returns void
language plpgsql
security definer
set search_path = tradexpar, public
as $$
declare
  o record;
  a record;
  v_same_ip int;
  v_visits int;
  v_conv int;
  v_attr int;
  v_refund int;
  v_ratio numeric;
  v_high boolean := false;
begin
  select * into o from tradexpar.orders where id = p_order_id;
  select * into a from tradexpar.affiliates where id = p_affiliate_id;

  if o.id is null or a.id is null then
    return;
  end if;

  -- Self purchase (email)
  if o.customer_email is not null and length(trim(o.customer_email)) > 0
     and lower(trim(o.customer_email)) = lower(trim(a.email)) then
    insert into tradexpar.affiliate_fraud_flags (
      affiliate_id, order_id, visit_id, flag_type, severity, status, notes
    ) values (
      p_affiliate_id, p_order_id, p_visit_id, 'self_purchase', 'high', 'open',
      'Email comprador coincide con email del afiliado'
    );
    v_high := true;
  end if;

  -- Self purchase (teléfono)
  if tradexpar._affiliate_digits_phone(o.customer_phone) is not null
     and tradexpar._affiliate_digits_phone(o.customer_phone) = tradexpar._affiliate_digits_phone(a.phone) then
    insert into tradexpar.affiliate_fraud_flags (
      affiliate_id, order_id, visit_id, flag_type, severity, status, notes
    ) values (
      p_affiliate_id, p_order_id, p_visit_id, 'self_purchase', 'high', 'open',
      'Teléfono comprador coincide con afiliado'
    );
    v_high := true;
  end if;

  -- IP sospechosa: 3+ pedidos mismo afiliado + misma IP en 24h
  if o.checkout_client_ip is not null then
    select count(*)::int into v_same_ip
    from tradexpar.orders x
    join tradexpar.affiliate_attributions ax on ax.order_id = x.id
    where ax.affiliate_id = p_affiliate_id
      and x.checkout_client_ip is not distinct from o.checkout_client_ip
      and x.created_at > now() - interval '24 hours';
    if v_same_ip >= 3 then
      insert into tradexpar.affiliate_fraud_flags (
        affiliate_id, order_id, visit_id, flag_type, severity, status, notes
      ) values (
        p_affiliate_id, p_order_id, p_visit_id, 'suspicious_ip', 'high', 'open',
        format('Varios pedidos con misma IP en 24h (%s)', host(o.checkout_client_ip))
      );
      v_high := true;
    end if;
  end if;

  -- Muchas visitas, pocas conversiones (7 días)
  select count(*)::int into v_visits
  from tradexpar.affiliate_visits v
  where v.affiliate_id = p_affiliate_id and v.created_at > now() - interval '7 days';

  select count(*)::int into v_conv
  from tradexpar.affiliate_attributions att
  where att.affiliate_id = p_affiliate_id and att.created_at > now() - interval '7 days';

  if v_visits >= 50 and v_conv = 0 then
    insert into tradexpar.affiliate_fraud_flags (
      affiliate_id, order_id, visit_id, flag_type, severity, status, notes
    ) values (
      p_affiliate_id, null, p_visit_id, 'low_conversion', 'medium', 'open',
      'Muchas visitas en 7d sin conversiones atribuidas'
    );
  end if;

  -- Ratio devoluciones
  select count(*)::int into v_attr
  from tradexpar.affiliate_attributions att
  where att.affiliate_id = p_affiliate_id;

  select count(*)::int into v_refund
  from tradexpar.affiliate_attributions att
  join tradexpar.orders ox on ox.id = att.order_id
  where att.affiliate_id = p_affiliate_id and lower(coalesce(ox.status,'')) = 'refunded';

  if v_attr >= 5 and v_refund > 0 then
    v_ratio := v_refund::numeric / v_attr::numeric;
    if v_ratio > 0.4 then
      insert into tradexpar.affiliate_fraud_flags (
        affiliate_id, order_id, visit_id, flag_type, severity, status, notes
      ) values (
        p_affiliate_id, p_order_id, p_visit_id, 'high_refund_rate', 'medium', 'open',
        format('Ratio devoluciones %.2f', v_ratio)
      );
    end if;
  end if;

  if v_high then
    update tradexpar.affiliate_attributions
    set requires_manual_review = true
    where id = p_attribution_id;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- G) Reversión / ajustes por estado de pedido
-- -----------------------------------------------------------------------------
create or replace function tradexpar.apply_order_affiliate_financials()
returns trigger
language plpgsql
security definer
set search_path = tradexpar, public
as $$
declare
  att record;
  v_amt numeric;
begin
  if tg_op <> 'UPDATE' or new.status is not distinct from old.status then
    return new;
  end if;

  select * into att from tradexpar.affiliate_attributions where order_id = new.id limit 1;
  if not found then
    return new;
  end if;

  if lower(coalesce(new.status,'')) = 'cancelled' then
    if att.commission_status = 'pending' then
      update tradexpar.affiliate_attributions
      set commission_status = 'rejected'
      where id = att.id;
    end if;
  end if;

  if lower(coalesce(new.status,'')) = 'refunded' then
    v_amt := att.commission_total;
    if att.commission_status in ('pending','rejected','cancelled') then
      update tradexpar.affiliate_attributions set commission_status = 'cancelled' where id = att.id;
    elsif att.commission_status = 'approved' then
      insert into tradexpar.affiliate_commission_adjustments (
        affiliate_id, attribution_id, type, amount, reason
      ) values (
        att.affiliate_id, att.id, 'refund', -v_amt, 'Pedido reembolsado (comisión aprobada)'
      );
      update tradexpar.affiliate_attributions set commission_status = 'cancelled' where id = att.id;
    elsif att.commission_status = 'paid' then
      insert into tradexpar.affiliate_commission_adjustments (
        affiliate_id, attribution_id, type, amount, reason
      ) values (
        att.affiliate_id, att.id, 'refund', -v_amt, 'Pedido reembolsado (comisión ya pagada — deuda)'
      );
      perform tradexpar.hook_affiliate_event('onCommissionClawback', jsonb_build_object(
        'affiliate_id', att.affiliate_id, 'attribution_id', att.id, 'amount', -v_amt
      ));
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_affiliate_financials on tradexpar.orders;
create trigger trg_orders_affiliate_financials
after update of status on tradexpar.orders
for each row execute function tradexpar.apply_order_affiliate_financials();

-- -----------------------------------------------------------------------------
-- H) record_affiliate_visit extendido
-- -----------------------------------------------------------------------------
create or replace function tradexpar.record_affiliate_visit(
  p_ref text,
  p_path text default '/',
  p_user_agent text default null,
  p_campaign_slug text default null,
  p_client_ip text default null
) returns jsonb
language plpgsql
security definer
set search_path = tradexpar, public
as $$
declare
  v_aff uuid;
  v_id uuid;
  v_cid uuid;
  v_ip inet;
begin
  if p_ref is null or trim(p_ref) = '' then
    return jsonb_build_object('ok', false, 'reason', 'empty_ref');
  end if;
  v_aff := tradexpar.resolve_affiliate_by_ref(p_ref);
  if v_aff is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_or_inactive');
  end if;

  if p_client_ip is not null and trim(p_client_ip) <> '' then
    begin
      v_ip := trim(p_client_ip)::inet;
    exception when others then
      v_ip := null;
    end;
  end if;

  if p_campaign_slug is not null and trim(p_campaign_slug) <> '' then
    select c.id into v_cid
    from tradexpar.affiliate_campaigns c
    where c.affiliate_id = v_aff
      and lower(trim(c.slug)) = lower(trim(p_campaign_slug))
      and c.is_active
    limit 1;
  end if;

  insert into tradexpar.affiliate_visits (
    affiliate_id, ref_token, landing_path, user_agent, ip, campaign_slug, campaign_id
  ) values (
    v_aff, trim(p_ref), nullif(trim(p_path),''), nullif(trim(p_user_agent),''), v_ip,
    nullif(trim(p_campaign_slug),''), v_cid
  ) returning id into v_id;

  return jsonb_build_object('ok', true, 'affiliate_id', v_aff, 'visit_id', v_id, 'campaign_id', v_cid);
end;
$$;

-- -----------------------------------------------------------------------------
-- I) create_checkout_order: + campaña + IP (compat: defaults null)
-- -----------------------------------------------------------------------------
create or replace function tradexpar.create_checkout_order(
  p_checkout_type text,
  p_location_url text,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_customer_location_id uuid,
  p_affiliate_ref text,
  p_items jsonb,
  p_affiliate_campaign_slug text default null,
  p_checkout_client_ip text default null
) returns jsonb
language plpgsql
security definer
set search_path = tradexpar, public
as $$
declare
  v_order_id uuid;
  v_total numeric(14,2) := 0;
  it jsonb;
  idx int := 0;
  v_qty int;
  v_price numeric(14,2);
  v_line numeric(14,2);
  v_ct text;
  v_ip inet;
begin
  v_ct := coalesce(nullif(trim(p_checkout_type), ''), 'tradexpar');
  if v_ct not in ('tradexpar', 'dropi') then
    v_ct := 'tradexpar';
  end if;

  if p_checkout_client_ip is not null and trim(p_checkout_client_ip) <> '' then
    begin
      v_ip := trim(p_checkout_client_ip)::inet;
    exception when others then
      v_ip := null;
    end;
  end if;

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_qty := greatest(1, coalesce((it->>'quantity')::int, 1));
    v_price := coalesce((it->>'price')::numeric, (it->>'unit_price')::numeric, 0);
    v_line := coalesce((it->>'line_subtotal')::numeric, v_price * v_qty);
    v_total := v_total + v_line;
    idx := idx + 1;
  end loop;

  insert into tradexpar.orders (
    total, status, checkout_type, location_url, customer_location_id,
    affiliate_ref, customer_name, customer_email, customer_phone,
    checkout_client_ip, affiliate_campaign_slug
  ) values (
    round(v_total, 2),
    'pending',
    v_ct,
    nullif(trim(p_location_url), ''),
    p_customer_location_id,
    nullif(trim(p_affiliate_ref), ''),
    nullif(trim(p_customer_name), ''),
    nullif(trim(p_customer_email), ''),
    nullif(trim(p_customer_phone), ''),
    v_ip,
    nullif(trim(p_affiliate_campaign_slug), '')
  ) returning id into v_order_id;

  idx := 0;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_qty := greatest(1, coalesce((it->>'quantity')::int, 1));
    v_price := coalesce((it->>'price')::numeric, (it->>'unit_price')::numeric, 0);
    v_line := coalesce((it->>'line_subtotal')::numeric, v_price * v_qty);
    insert into tradexpar.order_items (
      order_id, product_id, product_name, quantity, unit_price, line_subtotal, line_index
    ) values (
      v_order_id,
      (it->>'product_id')::uuid,
      nullif(trim(coalesce(it->>'product_name', '')), ''),
      v_qty,
      v_price,
      round(v_line, 2),
      idx
    );
    idx := idx + 1;
  end loop;

  if exists (
    select 1 from pg_proc p join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'tradexpar' and p.proname = 'apply_affiliate_to_order'
  ) then
    perform tradexpar.apply_affiliate_to_order(v_order_id);
  end if;

  return jsonb_build_object(
    'id', v_order_id,
    'total', round(v_total, 2),
    'status', 'pending',
    'checkout_type', v_ct,
    'created_at', (select o.created_at from tradexpar.orders o where o.id = v_order_id),
    'customer', jsonb_build_object(
      'name', coalesce(nullif(trim(p_customer_name), ''), ''),
      'email', coalesce(nullif(trim(p_customer_email), ''), ''),
      'phone', coalesce(nullif(trim(p_customer_phone), ''), '')
    ),
    'items', coalesce(p_items, '[]'::jsonb)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- J) apply_affiliate_to_order: tier bonus + campaña + fraude
-- -----------------------------------------------------------------------------
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
  v_tier_bonus numeric;
  v_eff_rate numeric;
  v_disc_pct numeric;
  v_comm_amt numeric;
  v_disc_amt numeric;
  v_comm_total numeric := 0;
  v_disc_total numeric := 0;
  v_has_items boolean;
  v_cid uuid;
  v_cslug text;
  v_order record;
begin
  if exists (select 1 from tradexpar.affiliate_attributions where order_id = p_order_id) then
    return jsonb_build_object('ok', true, 'skipped', 'already_attributed');
  end if;

  -- Alias de tabla distinto de v_order: si se usa "o" como alias, o.id en el WHERE
  -- se resuelve a la variable record y falla con "record o is not assigned yet".
  select * into v_order from tradexpar.orders ord where ord.id = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'order_not_found');
  end if;

  v_ref := v_order.affiliate_ref;
  v_attr_done := v_order.affiliate_attribution_done;

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

  v_tier_bonus := tradexpar.affiliate_tier_bonus_percent(v_aff);

  v_cslug := nullif(trim(v_order.affiliate_campaign_slug), '');
  if v_cslug is not null then
    select c.id into v_cid
    from tradexpar.affiliate_campaigns c
    where c.affiliate_id = v_aff and lower(trim(c.slug)) = lower(v_cslug) and c.is_active
    limit 1;
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
    order_id, affiliate_id, visit_id, ref_code, commission_total, buyer_discount_total,
    commission_status, campaign_id, campaign_slug
  ) values (
    p_order_id, v_aff, v_visit, trim(v_ref), 0, 0, 'pending', v_cid, v_cslug
  ) returning id into v_attr_id;

  if v_has_items then
    for v_line in
      select * from tradexpar.order_items where order_id = p_order_id order by line_index
    loop
      v_comm_rate := tradexpar.affiliate_commission_rate_for_line(v_aff, v_line.product_id);
      v_disc_pct := tradexpar.affiliate_buyer_discount_for_line(v_aff, v_line.product_id);
      v_eff_rate := least(100::numeric, v_comm_rate + coalesce(v_tier_bonus, 0));
      v_comm_amt := round(v_line.line_subtotal * (v_eff_rate / 100.0), 2);
      v_disc_amt := round(v_line.line_subtotal * (v_disc_pct / 100.0), 2);
      v_comm_total := v_comm_total + v_comm_amt;
      v_disc_total := v_disc_total + v_disc_amt;
      insert into tradexpar.affiliate_order_items (
        attribution_id, order_id, product_id, product_name, quantity, unit_price, line_subtotal,
        commission_rate_used, commission_amount, buyer_discount_percent_used, line_index,
        tier_bonus_percent_used
      ) values (
        v_attr_id, p_order_id, v_line.product_id, v_line.product_name, v_line.quantity,
        v_line.unit_price, v_line.line_subtotal, v_eff_rate, v_comm_amt, v_disc_pct, v_line.line_index,
        coalesce(v_tier_bonus, 0)
      );
    end loop;
  else
    v_comm_amt := v_order.total;
    v_comm_rate := tradexpar.affiliate_commission_rate_for_line(v_aff, null);
    v_disc_pct := tradexpar.affiliate_buyer_discount_for_line(v_aff, null);
    v_eff_rate := least(100::numeric, v_comm_rate + coalesce(v_tier_bonus, 0));
    v_comm_amt := round(coalesce(v_comm_amt,0) * (v_eff_rate / 100.0), 2);
    v_disc_amt := round(coalesce((select total from tradexpar.orders where id = p_order_id),0) * (v_disc_pct / 100.0), 2);
    v_comm_total := v_comm_amt;
    v_disc_total := v_disc_amt;
    insert into tradexpar.affiliate_order_items (
      attribution_id, order_id, product_id, product_name, quantity, unit_price, line_subtotal,
      commission_rate_used, commission_amount, buyer_discount_percent_used, line_index,
      tier_bonus_percent_used
    ) values (
      v_attr_id, p_order_id, null, '(total pedido)', 1,
      coalesce((select total from tradexpar.orders where id = p_order_id),0),
      coalesce((select total from tradexpar.orders where id = p_order_id),0),
      v_eff_rate, v_comm_amt, v_disc_pct, 0,
      coalesce(v_tier_bonus, 0)
    );
  end if;

  update tradexpar.affiliate_attributions
  set commission_total = v_comm_total, buyer_discount_total = v_disc_total
  where id = v_attr_id;

  perform tradexpar.affiliate_evaluate_fraud(p_order_id, v_aff, v_attr_id, v_visit);

  update tradexpar.orders
  set affiliate_attribution_done = true
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'attribution_id', v_attr_id, 'commission_total', v_comm_total);
end;
$$;

-- -----------------------------------------------------------------------------
-- K) Admin: aprobar comisión bloqueada por fraude high abierto
-- -----------------------------------------------------------------------------
create or replace function tradexpar.admin_set_attribution_commission_status(
  p_attribution_id uuid,
  p_status text
) returns void
language plpgsql
security definer
set search_path = tradexpar, public
as $$
declare
  v_blocked boolean;
begin
  if p_status not in ('pending','approved','paid','cancelled','rejected') then
    raise exception 'invalid commission status';
  end if;

  if p_status = 'approved' then
    select exists (
      select 1 from tradexpar.affiliate_fraud_flags f
      where f.status = 'open'
        and f.severity = 'high'
        and f.order_id = (select att.order_id from tradexpar.affiliate_attributions att where att.id = p_attribution_id)
    ) into v_blocked;
    if coalesce(v_blocked, false) then
      raise exception 'No se puede aprobar: hay alertas de fraude HIGH abiertas para este pedido. Revisá Fraud y marcá reviewed/dismissed.';
    end if;
  end if;

  update tradexpar.affiliate_attributions
  set commission_status = p_status
  where id = p_attribution_id;

  if p_status = 'approved' then
    perform tradexpar.hook_affiliate_event('onCommissionApproved', jsonb_build_object(
      'attribution_id', p_attribution_id
    ));
  elsif p_status = 'paid' then
    perform tradexpar.hook_affiliate_event('onPayoutCompleted', jsonb_build_object(
      'attribution_id', p_attribution_id
    ));
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- L) Balance dinámico (vista)
-- -----------------------------------------------------------------------------
create or replace view tradexpar.v_affiliate_balance as
select
  a.id as affiliate_id,
  coalesce((
    select sum(att.commission_total)
    from tradexpar.affiliate_attributions att
    where att.affiliate_id = a.id and att.commission_status in ('approved','paid')
  ), 0) as commissions_approved_or_paid,
  coalesce((
    select sum(adj.amount)
    from tradexpar.affiliate_commission_adjustments adj
    where adj.affiliate_id = a.id
  ), 0) as adjustments_sum,
  coalesce((
    select sum(att.commission_total)
    from tradexpar.affiliate_attributions att
    where att.affiliate_id = a.id and att.commission_status in ('approved','paid')
  ), 0) + coalesce((
    select sum(adj.amount)
    from tradexpar.affiliate_commission_adjustments adj
    where adj.affiliate_id = a.id
  ), 0) as net_balance
from tradexpar.affiliates a;

-- -----------------------------------------------------------------------------
-- M) Analytics admin (JSON)
-- -----------------------------------------------------------------------------
create or replace function tradexpar.admin_affiliate_analytics()
returns jsonb
language plpgsql
security definer
set search_path = tradexpar, public
stable
as $$
declare
  v_top jsonb;
  v_products jsonb;
  v_conv jsonb;
  v_refunds jsonb;
  v_comm jsonb;
  v_camp jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_top
  from (
    select af.name, af.code, af.id as affiliate_id,
           count(distinct att.order_id)::int as sales,
           coalesce(sum(att.commission_total),0) as commission_sum
    from tradexpar.affiliates af
    left join tradexpar.affiliate_attributions att on att.affiliate_id = af.id
    group by af.id, af.name, af.code
    order by sales desc nulls last
    limit 20
  ) x;

  select coalesce(jsonb_agg(to_jsonb(y)), '[]'::jsonb) into v_products
  from (
    select aoi.product_id,
           max(aoi.product_name) as product_name,
           sum(aoi.quantity)::bigint as qty,
           sum(aoi.line_subtotal) as revenue
    from tradexpar.affiliate_order_items aoi
    where aoi.product_id is not null
    group by aoi.product_id
    order by qty desc
    limit 30
  ) y;

  select jsonb_build_object(
    'visits_30d', (select count(*)::int from tradexpar.affiliate_visits v where v.created_at > now() - interval '30 days'),
    'attributions_30d', (select count(*)::int from tradexpar.affiliate_attributions a where a.created_at > now() - interval '30 days')
  ) into v_conv;

  select coalesce(jsonb_agg(z), '[]'::jsonb) into v_refunds
  from (
    select att.affiliate_id, af.name,
           count(*) filter (where lower(coalesce(o.status,'')) = 'refunded')::int as refunds,
           count(*)::int as orders
    from tradexpar.affiliate_attributions att
    join tradexpar.orders o on o.id = att.order_id
    join tradexpar.affiliates af on af.id = att.affiliate_id
    group by att.affiliate_id, af.name
  ) z;

  select jsonb_build_object(
    'pending', coalesce(sum(att.commission_total) filter (where att.commission_status = 'pending'),0),
    'approved', coalesce(sum(att.commission_total) filter (where att.commission_status = 'approved'),0),
    'paid', coalesce(sum(att.commission_total) filter (where att.commission_status = 'paid'),0),
    'cancelled', coalesce(sum(att.commission_total) filter (where att.commission_status = 'cancelled'),0),
    'rejected', coalesce(sum(att.commission_total) filter (where att.commission_status = 'rejected'),0)
  ) into v_comm
  from tradexpar.affiliate_attributions att;

  select coalesce(jsonb_agg(c), '[]'::jsonb) into v_camp
  from (
    select camp.slug, camp.name, camp.affiliate_id,
           count(v.id)::int as visits,
           count(distinct att.id)::int as attributions
    from tradexpar.affiliate_campaigns camp
    left join tradexpar.affiliate_visits v on v.campaign_id = camp.id
    left join tradexpar.affiliate_attributions att on att.campaign_id = camp.id
    where camp.is_active
    group by camp.id, camp.slug, camp.name, camp.affiliate_id
  ) c;

  return jsonb_build_object(
    'top_affiliates', v_top,
    'top_products', v_products,
    'funnel_30d', v_conv,
    'refunds_by_affiliate', v_refunds,
    'commissions_by_status', v_comm,
    'campaigns', v_camp
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- N) Assets públicos (solo lectura)
-- -----------------------------------------------------------------------------
create or replace function tradexpar.affiliate_public_assets()
returns jsonb
language sql
security definer
set search_path = tradexpar, public
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'title', a.title,
        'asset_type', a.asset_type,
        'file_url', a.file_url,
        'product_id', a.product_id,
        'created_at', a.created_at
      ) order by a.created_at desc
    ),
    '[]'::jsonb
  )
  from tradexpar.affiliate_assets a
  where a.is_active;
$$;

-- -----------------------------------------------------------------------------
-- O) Admin RPC auxiliares
-- -----------------------------------------------------------------------------
create or replace function tradexpar.admin_fraud_flag_set_status(
  p_flag_id uuid,
  p_status text,
  p_notes text default null
) returns void
language plpgsql
security definer
set search_path = tradexpar, public
as $$
begin
  if p_status not in ('open','reviewed','dismissed','confirmed') then
    raise exception 'invalid fraud status';
  end if;
  update tradexpar.affiliate_fraud_flags
  set status = p_status, notes = coalesce(nullif(trim(p_notes),''), notes)
  where id = p_flag_id;
end;
$$;

create or replace function tradexpar.admin_insert_affiliate_asset(
  p_title text,
  p_asset_type text,
  p_file_url text,
  p_product_id uuid default null,
  p_is_active boolean default true
) returns uuid
language plpgsql
security definer
set search_path = tradexpar, public
as $$
declare v_id uuid;
begin
  insert into tradexpar.affiliate_assets (title, asset_type, file_url, product_id, is_active)
  values (trim(p_title), p_asset_type, trim(p_file_url), p_product_id, coalesce(p_is_active, true))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function tradexpar.admin_set_affiliate_asset_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = tradexpar, public
as $$
begin
  update tradexpar.affiliate_assets set is_active = p_active where id = p_id;
end;
$$;

create or replace function tradexpar.admin_upsert_affiliate_campaign(
  p_id uuid,
  p_affiliate_id uuid,
  p_name text,
  p_slug text,
  p_target_type text,
  p_target_id uuid,
  p_utm_source text,
  p_utm_medium text,
  p_utm_campaign text,
  p_is_active boolean
) returns uuid
language plpgsql
security definer
set search_path = tradexpar, public
as $$
declare v_id uuid;
begin
  if p_id is null then
    insert into tradexpar.affiliate_campaigns (
      affiliate_id, name, slug, target_type, target_id,
      utm_source, utm_medium, utm_campaign, is_active
    ) values (
      p_affiliate_id, trim(p_name), lower(trim(p_slug)), coalesce(p_target_type,'store'), p_target_id,
      nullif(trim(p_utm_source),''), nullif(trim(p_utm_medium),''), nullif(trim(p_utm_campaign),''), coalesce(p_is_active,true)
    ) returning id into v_id;
    return v_id;
  end if;
  update tradexpar.affiliate_campaigns set
    name = trim(p_name),
    slug = lower(trim(p_slug)),
    target_type = coalesce(p_target_type,'store'),
    target_id = p_target_id,
    utm_source = nullif(trim(p_utm_source),''),
    utm_medium = nullif(trim(p_utm_medium),''),
    utm_campaign = nullif(trim(p_utm_campaign),''),
    is_active = coalesce(p_is_active, is_active)
  where id = p_id;
  return p_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- P) Grants
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on tradexpar.affiliate_fraud_flags to anon, authenticated, service_role;
grant select, insert, update, delete on tradexpar.affiliate_commission_adjustments to anon, authenticated, service_role;
grant select, insert, update, delete on tradexpar.affiliate_campaigns to anon, authenticated, service_role;
grant select, insert, update, delete on tradexpar.affiliate_assets to anon, authenticated, service_role;
grant select, insert, update, delete on tradexpar.affiliate_tiers to anon, authenticated, service_role;
grant select, insert, update, delete on tradexpar.affiliate_hook_queue to service_role;
grant select on tradexpar.v_affiliate_balance to anon, authenticated, service_role;

grant execute on function tradexpar.record_affiliate_visit(text, text, text, text, text) to anon, authenticated;
grant execute on function tradexpar.create_checkout_order(text, text, text, text, text, uuid, text, jsonb, text, text) to anon, authenticated;
grant execute on function tradexpar.admin_affiliate_analytics() to anon, authenticated, service_role;
grant execute on function tradexpar.affiliate_public_assets() to anon, authenticated;
grant execute on function tradexpar.admin_fraud_flag_set_status(uuid, text, text) to anon, authenticated, service_role;
grant execute on function tradexpar.admin_insert_affiliate_asset(text, text, text, uuid, boolean) to anon, authenticated, service_role;
grant execute on function tradexpar.admin_set_affiliate_asset_active(uuid, boolean) to anon, authenticated, service_role;
grant execute on function tradexpar.admin_upsert_affiliate_campaign(uuid, uuid, text, text, text, uuid, text, text, text, boolean) to anon, authenticated, service_role;
grant execute on function tradexpar.hook_affiliate_event(text, jsonb) to service_role;

-- Una sola firma de checkout (10 args con defaults); eliminar overload viejo de 8 args si existía
drop function if exists tradexpar.create_checkout_order(text, text, text, text, text, uuid, text, jsonb);
drop function if exists tradexpar.record_affiliate_visit(text, text, text);
