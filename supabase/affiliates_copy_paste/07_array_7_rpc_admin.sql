-- ARRAY 7 — RPC admin (SECURITY DEFINER; restringir en prod)
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
