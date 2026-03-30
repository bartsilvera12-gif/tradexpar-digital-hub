-- Parche: conflicto entre variable record "o" y alias de tabla "o" en apply_affiliate_to_order
-- (error 55000: record "o" is not assigned yet).
-- Ejecutar en Supabase SQL Editor una vez. También incorporado en tradexpar_affiliates_pro.sql (sección J).

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
