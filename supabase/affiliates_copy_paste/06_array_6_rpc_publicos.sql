-- ARRAY 6 — RPC públicos: solicitud, visita, stub pedido, líneas, aplicar atribución
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
