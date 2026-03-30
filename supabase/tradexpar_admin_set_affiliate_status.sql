-- Activa o suspende un afiliado desde el panel admin.
-- Ejecutar una vez en Supabase SQL Editor (schema tradexpar).
--
-- Si el toggle falla, ejecutá de nuevo este script y comprobá que el schema
-- `tradexpar` esté expuesto en API de Supabase y que inicies sesión en el admin.

create or replace function tradexpar.admin_set_affiliate_status(
  p_affiliate_id uuid,
  p_status text
) returns void
language plpgsql
security definer
set search_path = tradexpar, public
as $$
declare
  v_n int;
begin
  if p_status not in ('active', 'suspended') then
    raise exception 'invalid affiliate status';
  end if;

  update tradexpar.affiliates
  set status = p_status,
      updated_at = now()
  where id = p_affiliate_id;

  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'No existe un afiliado con el id indicado.';
  end if;
end;
$$;

grant execute on function tradexpar.admin_set_affiliate_status(uuid, text) to anon, authenticated, service_role;
