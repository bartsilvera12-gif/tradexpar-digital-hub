-- =============================================================================
-- TRADEXPAR — Panel afiliado (snapshot) + borrar reglas por producto (admin)
-- Ejecutar después de tradexpar_affiliates_phase1.sql
-- =============================================================================

create or replace function tradexpar.affiliate_portal_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = tradexpar, public
as $$
declare
  v_aff uuid;
  v_row tradexpar.affiliates%rowtype;
  v_session_email text;
  v_sales jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  -- Email: claim JWT, user_metadata (OAuth) o fila customers (si el JWT no trae email)
  v_session_email := nullif(lower(trim(coalesce(
    nullif(trim(auth.jwt() ->> 'email'), ''),
    nullif(trim(auth.jwt() -> 'user_metadata' ->> 'email'), ''),
    (select nullif(trim(c.email), '') from tradexpar.customers c where c.auth_user_id = auth.uid() limit 1)
  ))), '');
  -- Vinculación: (1) cliente ligado con mismo auth.uid(), o (2) email del JWT = email del afiliado.
  -- Nota: al aprobar la solicitud no se rellena customer_id; si quedó mal vinculado, el match por email
  -- igual debe funcionar (antes solo aplicaba si customer_id era null).
  select a.* into v_row
  from tradexpar.affiliates a
  left join tradexpar.customers c on c.id = a.customer_id
  where a.status = 'active'
    and (
      (
        a.customer_id is not null
        and c.id is not null
        and c.auth_user_id = auth.uid()
      )
      or (
        (
          select c2.id
          from tradexpar.customers c2
          where c2.auth_user_id = auth.uid()
            and lower(trim(c2.email)) = lower(trim(a.email))
          limit 1
        ) is not null
      )
      or (
        v_session_email is not null
        and lower(trim(a.email)) = v_session_email
      )
    )
  order by
    case
      when a.customer_id is not null and c.id is not null and c.auth_user_id = auth.uid() then 0
      when exists (
        select 1 from tradexpar.customers c2
        where c2.auth_user_id = auth.uid()
          and lower(trim(c2.email)) = lower(trim(a.email))
      ) then 1
      when v_session_email is not null and lower(trim(a.email)) = v_session_email then 2
      else 3
    end
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_affiliate');
  end if;

  v_aff := v_row.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'attribution_id', s.attribution_id,
        'order_id', s.order_id,
        'order_created_at', s.order_created_at,
        'order_total', s.order_total,
        'commission_total', s.commission_total,
        'commission_status', s.commission_status,
        'products_label', s.products_label,
        'total_qty', s.total_qty
      )
      order by s.order_created_at desc
    ),
    '[]'::jsonb
  ) into v_sales
  from tradexpar.v_affiliate_sales_detail s
  where s.affiliate_id = v_aff;

  return jsonb_build_object(
    'ok', true,
    'affiliate', to_jsonb(v_row),
    'totals_pending', (
      select coalesce(sum(att.commission_total), 0)
      from tradexpar.affiliate_attributions att
      where att.affiliate_id = v_aff and att.commission_status = 'pending'
    ),
    'totals_approved', (
      select coalesce(sum(att.commission_total), 0)
      from tradexpar.affiliate_attributions att
      where att.affiliate_id = v_aff and att.commission_status = 'approved'
    ),
    'totals_paid', (
      select coalesce(sum(att.commission_total), 0)
      from tradexpar.affiliate_attributions att
      where att.affiliate_id = v_aff and att.commission_status = 'paid'
    ),
    'sales', coalesce(v_sales, '[]'::jsonb)
  );
end;
$$;

-- ¿Puede mostrarse el enlace al panel? (sesión requerida) Afiliado activo o solicitud pendiente con el mismo email del JWT.
create or replace function tradexpar.affiliate_customer_portal_eligible()
returns boolean
language plpgsql
security definer
set search_path = tradexpar, public
as $$
declare
  v_email text;
begin
  if auth.uid() is null then
    return false;
  end if;

  v_email := nullif(lower(trim(coalesce(
    nullif(trim(auth.jwt() ->> 'email'), ''),
    nullif(trim(auth.jwt() -> 'user_metadata' ->> 'email'), ''),
    (select nullif(trim(c.email), '') from tradexpar.customers c where c.auth_user_id = auth.uid() limit 1)
  ))), '');

  if exists (
    select 1
    from tradexpar.affiliates a
    left join tradexpar.customers c on c.id = a.customer_id
    where a.status = 'active'
      and (
        (
          a.customer_id is not null
          and c.id is not null
          and c.auth_user_id = auth.uid()
        )
        or (
          exists (
            select 1 from tradexpar.customers c2
            where c2.auth_user_id = auth.uid()
              and lower(trim(c2.email)) = lower(trim(a.email))
          )
        )
        or (
          v_email is not null
          and lower(trim(a.email)) = v_email
        )
      )
  ) then
    return true;
  end if;

  if v_email is null then
    return false;
  end if;

  return exists (
    select 1
    from tradexpar.affiliate_requests r
    where lower(trim(r.email)) = v_email
      and r.status = 'pending'
  );
end;
$$;

create or replace function tradexpar.admin_delete_commission_rule(
  p_affiliate_id uuid,
  p_product_id uuid
) returns void
language plpgsql
security definer
set search_path = tradexpar, public
as $$
begin
  if p_product_id is null then
    raise exception 'global rule: usar admin_set_affiliate_globals o admin_set_commission_rule';
  end if;
  delete from tradexpar.affiliate_commission_rules
  where affiliate_id = p_affiliate_id and product_id = p_product_id;
end;
$$;

create or replace function tradexpar.admin_delete_discount_rule(
  p_affiliate_id uuid,
  p_product_id uuid
) returns void
language plpgsql
security definer
set search_path = tradexpar, public
as $$
begin
  if p_product_id is null then
    raise exception 'global rule: usar admin_set_affiliate_globals o admin_set_discount_rule';
  end if;
  delete from tradexpar.affiliate_discount_rules
  where affiliate_id = p_affiliate_id and product_id = p_product_id;
end;
$$;

grant execute on function tradexpar.affiliate_portal_snapshot() to authenticated;
grant execute on function tradexpar.affiliate_customer_portal_eligible() to authenticated;
grant execute on function tradexpar.admin_delete_commission_rule(uuid, uuid) to anon, authenticated, service_role;
grant execute on function tradexpar.admin_delete_discount_rule(uuid, uuid) to anon, authenticated, service_role;
