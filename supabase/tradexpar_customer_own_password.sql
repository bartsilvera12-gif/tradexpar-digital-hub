-- Cliente (tienda): cambiar su propia contraseña en Auth con cooldown de 24 h entre cambios.
-- Columna password_changed_at en customers (también la actualiza el admin al asignar contraseña).
-- Ejecutar en SQL Editor como superusuario (SECURITY DEFINER toca auth.users).
-- Requiere pgcrypto en schema extensions (igual que tradexpar_admin_set_customer_auth_password.sql).

create extension if not exists pgcrypto with schema extensions;

alter table tradexpar.customers
  add column if not exists password_changed_at timestamptz;

comment on column tradexpar.customers.password_changed_at is
  'Último cambio de contraseña (tienda o admin); cooldown 24h para el flujo «Mi cuenta».';

-- Estado para la UI (sin revelar contraseña).
create or replace function tradexpar.customer_password_change_status()
returns jsonb
language plpgsql
security definer
set search_path = tradexpar, public
stable
as $$
declare
  v_id uuid;
  v_ts timestamptz;
  v_next timestamptz;
begin
  if auth.uid() is null then
    return jsonb_build_object('can_change', false, 'reason', 'not_authenticated');
  end if;

  select c.id, c.password_changed_at
  into v_id, v_ts
  from tradexpar.customers c
  where c.auth_user_id = auth.uid()
  limit 1;

  if v_id is null then
    return jsonb_build_object('can_change', false, 'reason', 'no_customer');
  end if;

  if v_ts is null or now() >= v_ts + interval '24 hours' then
    return jsonb_build_object('can_change', true);
  end if;

  v_next := v_ts + interval '24 hours';
  return jsonb_build_object(
    'can_change', false,
    'reason', 'cooldown',
    'next_change_after', to_jsonb(v_next)
  );
end;
$$;

grant execute on function tradexpar.customer_password_change_status() to authenticated;

create or replace function tradexpar.customer_change_own_password(p_new_password text)
returns jsonb
language plpgsql
security definer
set search_path = tradexpar, public
as $$
declare
  v_cust_id uuid;
  v_auth uuid;
  v_changed timestamptz;
  v_pwd text;
  v_cnt int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select c.id, c.auth_user_id, c.password_changed_at
  into v_cust_id, v_auth, v_changed
  from tradexpar.customers c
  where c.auth_user_id = auth.uid()
  limit 1;

  if v_cust_id is null or v_auth is null then
    return jsonb_build_object('ok', false, 'reason', 'no_customer');
  end if;

  if v_changed is not null and now() < v_changed + interval '24 hours' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'cooldown',
      'next_change_after', to_jsonb(v_changed + interval '24 hours')
    );
  end if;

  v_pwd := nullif(trim(coalesce(p_new_password, '')), '');
  if v_pwd is null or length(v_pwd) < 6 then
    return jsonb_build_object('ok', false, 'reason', 'password_too_short');
  end if;

  begin
    update auth.users u
    set
      encrypted_password = extensions.crypt(v_pwd, extensions.gen_salt('bf')),
      updated_at = now()
    where u.id = v_auth;

    get diagnostics v_cnt = row_count;
    if v_cnt = 0 then
      return jsonb_build_object('ok', false, 'reason', 'auth_user_not_found');
    end if;
  exception
    when insufficient_privilege then
      return jsonb_build_object('ok', false, 'reason', 'insufficient_privilege');
    when sqlstate '42883' then
      return jsonb_build_object('ok', false, 'reason', 'pgcrypto_missing');
    when others then
      return jsonb_build_object('ok', false, 'reason', 'auth_update_error', 'message', sqlerrm);
  end;

  update tradexpar.customers c
  set
    password_changed_at = now(),
    updated_at = now()
  where c.id = v_cust_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function tradexpar.customer_change_own_password(text) to authenticated;
