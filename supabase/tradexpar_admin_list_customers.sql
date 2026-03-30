-- Listado de clientes para el panel admin (bypass RLS con SECURITY DEFINER).
-- Requiere sesión JWT (usuario autenticado). Ejecutar en Supabase SQL Editor.
-- Si no corrés este script, tradexpar.adminGetUsers sigue intentando select directo.

create or replace function tradexpar.admin_list_customers()
returns jsonb
language plpgsql
security definer
set search_path = tradexpar, public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'name', name,
          'email', email,
          'auth_user_id', auth_user_id,
          'provider', provider,
          'created_at', created_at,
          'is_affiliate', exists(
            select 1
            from tradexpar.affiliates a
            where a.customer_id = c.id
               or (
                 nullif(trim(a.email), '') is not null
                 and nullif(trim(c.email), '') is not null
                 and lower(trim(a.email)) = lower(trim(c.email))
               )
          )
        ) order by created_at desc nulls last
      )
      from tradexpar.customers c
    ),
    '[]'::jsonb
  );
end;
$$;

grant execute on function tradexpar.admin_list_customers() to authenticated;
