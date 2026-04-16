-- Datos de envío / facturación para checkout (PagoPar: documento, dirección, ciudad).
-- Ejecutar en SQL Editor (Neura / Supabase) después de tradexpar_catalog_orders o tradexpar_affiliates_pro.

alter table tradexpar.orders
  add column if not exists customer_document text,
  add column if not exists customer_address text,
  add column if not exists customer_city_code text,
  add column if not exists customer_address_reference text;

comment on column tradexpar.orders.customer_address_reference is
  'Referencia de dirección (opcional): entre calles, piso, timbre, etc.';

-- Una sola firma: eliminar overloads previos.
drop function if exists tradexpar.create_checkout_order(text, text, text, text, text, uuid, text, jsonb, text, text, text, text, text, text);
drop function if exists tradexpar.create_checkout_order(text, text, text, text, text, uuid, text, jsonb, text, text, text, text, text);
drop function if exists tradexpar.create_checkout_order(text, text, text, text, text, uuid, text, jsonb, text, text);
drop function if exists tradexpar.create_checkout_order(text, text, text, text, text, uuid, text, jsonb);

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
  p_checkout_client_ip text default null,
  p_customer_document text default null,
  p_customer_address text default null,
  p_customer_city_code text default null,
  p_customer_address_reference text default null
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
    checkout_client_ip, affiliate_campaign_slug,
    customer_document, customer_address, customer_city_code,
    customer_address_reference
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
    nullif(trim(p_affiliate_campaign_slug), ''),
    nullif(trim(p_customer_document), ''),
    nullif(trim(p_customer_address), ''),
    nullif(trim(p_customer_city_code), ''),
    nullif(trim(p_customer_address_reference), '')
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
      'phone', coalesce(nullif(trim(p_customer_phone), ''), ''),
      'document', coalesce(nullif(trim(p_customer_document), ''), ''),
      'address', coalesce(nullif(trim(p_customer_address), ''), ''),
      'city_code', coalesce(nullif(trim(p_customer_city_code), ''), ''),
      'address_reference', coalesce(nullif(trim(p_customer_address_reference), ''), '')
    ),
    'items', coalesce(p_items, '[]'::jsonb)
  );
end;
$$;

grant execute on function tradexpar.create_checkout_order(text, text, text, text, text, uuid, text, jsonb, text, text, text, text, text, text) to anon, authenticated;
