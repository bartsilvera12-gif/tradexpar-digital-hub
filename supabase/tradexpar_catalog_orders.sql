-- =============================================================================
-- TRADEXPAR — Catálogo (products) + pedidos (orders + order_items) para Supabase directo
-- Ejecutar después de tradexpar_migrations.sql y (opcional) affiliates.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ARRAY A — Tabla products (si no existe)
-- -----------------------------------------------------------------------------
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
  if not exists (select 1 from pg_constraint where conname = 'products_source_type_chk' and conrelid = 'tradexpar.products'::regclass) then
    alter table tradexpar.products add constraint products_source_type_chk check (product_source_type in ('tradexpar', 'dropi'));
  end if;
exception when undefined_table then null;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_discount_type_chk' and conrelid = 'tradexpar.products'::regclass) then
    alter table tradexpar.products add constraint products_discount_type_chk check (discount_type is null or discount_type in ('percentage', 'fixed'));
  end if;
exception when undefined_table then null;
end $$;

create index if not exists idx_products_category on tradexpar.products(category);
create index if not exists idx_products_name on tradexpar.products(name);


-- -----------------------------------------------------------------------------
-- ARRAY B — Pedidos: datos de cliente (order_items ya puede existir por afiliados)
-- -----------------------------------------------------------------------------
alter table tradexpar.orders
  add column if not exists customer_name text,
  add column if not exists customer_email text,
  add column if not exists customer_phone text,
  add column if not exists affiliate_attribution_done boolean not null default false,
  add column if not exists checkout_client_ip inet,
  add column if not exists affiliate_campaign_slug text;

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

-- Esquemas viejos: la tabla ya existía sin columnas nuevas
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
-- ARRAY C — Crear pedido en una transacción (checkout tienda)
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

  -- Atribución afiliados (si ya existe el módulo; ejecutar tradexpar_affiliates_phase1.sql antes o después).
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
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
-- ARRAY D — Grants (ajustar RLS en producción)
-- -----------------------------------------------------------------------------
grant usage on schema tradexpar to anon, authenticated, service_role;

grant select on tradexpar.products to anon, authenticated;
grant insert, update, delete on tradexpar.products to anon, authenticated;

grant select, insert, update on tradexpar.orders to anon, authenticated;
grant select, insert, update, delete on tradexpar.order_items to anon, authenticated;

grant execute on function tradexpar.create_checkout_order(text, text, text, text, text, uuid, text, jsonb, text, text) to anon, authenticated;
