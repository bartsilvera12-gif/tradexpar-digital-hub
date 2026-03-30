-- =============================================================================
-- Insert/merge fila customers al iniciar sesión con Google/Facebook cuando ya
-- existe el mismo email (p. ej. cuenta manual) — evita 409 Conflict en el cliente.
-- Ejecutar en el SQL Editor del proyecto Supabase.
-- =============================================================================

create or replace function tradexpar.upsert_customer_oauth(
  p_name text,
  p_email text,
  p_provider text
)
returns jsonb
language plpgsql
security definer
set search_path = tradexpar, public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(p_email));
  v_jwt_email text;
  existing_id uuid;
  v_row tradexpar.customers%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if v_email is null or v_email = '' then
    raise exception 'email required';
  end if;

  select lower(trim(coalesce(email, ''))) into v_jwt_email from auth.users where id = v_uid;
  if v_jwt_email is null or v_jwt_email = '' or v_jwt_email <> v_email then
    raise exception 'email mismatch';
  end if;

  select id into existing_id from tradexpar.customers c where lower(c.email) = v_email limit 1;

  if existing_id is not null then
    update tradexpar.customers c
    set
      auth_user_id = v_uid,
      name = coalesce(nullif(trim(p_name), ''), c.name),
      provider = coalesce(nullif(trim(p_provider), ''), c.provider),
      updated_at = now()
    where c.id = existing_id;
    select * into v_row from tradexpar.customers where id = existing_id;
  else
    insert into tradexpar.customers (auth_user_id, name, email, provider)
    values (
      v_uid,
      coalesce(nullif(trim(p_name), ''), split_part(v_email, '@', 1)),
      v_email,
      coalesce(nullif(trim(p_provider), ''), 'google')
    )
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'email', v_row.email,
    'created_at', v_row.created_at,
    'provider', v_row.provider
  );
end;
$$;

grant execute on function tradexpar.upsert_customer_oauth(text, text, text) to authenticated;
