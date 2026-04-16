-- Admin: asignar contraseña nueva al usuario de GoTrue vinculado a tradexpar.customers (self-hosted sin Edge Functions).
-- Ejecutar en SQL Editor como rol con permiso de escritura en auth.users (p. ej. postgres / supabase_admin).
-- Requiere pgcrypto (en Supabase suele estar en schema extensions).

create extension if not exists pgcrypto with schema extensions;

alter table tradexpar.customers
  add column if not exists password_changed_at timestamptz;

create or replace function tradexpar.admin_set_customer_auth_password(
  p_customer_id uuid,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = tradexpar, public
as $$
declare
  v_auth uuid;
  v_prov text;
  v_pwd text;
  v_cnt int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  v_pwd := nullif(trim(coalesce(p_password, '')), '');
  if v_pwd is null or length(v_pwd) < 6 then
    return jsonb_build_object('ok', false, 'reason', 'password_too_short');
  end if;

  select c.auth_user_id, lower(trim(coalesce(c.provider, ''))) into v_auth, v_prov
  from tradexpar.customers c
  where c.id = p_customer_id;

  if v_auth is null then
    return jsonb_build_object('ok', false, 'reason', 'no_auth_user');
  end if;

  if v_prov in ('google', 'facebook') then
    return jsonb_build_object('ok', false, 'reason', 'oauth_password_not_allowed');
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
  where c.id = p_customer_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function tradexpar.admin_set_customer_auth_password(uuid, text) to authenticated;
