-- CRUD admin de clientes (tienda): actualizar y borrar con manejo de afiliado vinculado.
-- Ejecutar en Supabase SQL Editor después de tradexpar_admin_list_customers.sql.
-- Requiere JWT (usuario autenticado); SECURITY DEFINER bypass RLS en tradexpar.

create or replace function tradexpar.admin_update_customer(
  p_customer_id uuid,
  p_name text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = tradexpar, public
as $$
declare
  v_cnt int;
  v_name text;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  v_name := nullif(trim(coalesce(p_name, '')), '');
  v_email := nullif(lower(trim(coalesce(p_email, ''))), '');

  if v_name is null or v_email is null then
    return jsonb_build_object('ok', false, 'reason', 'name_and_email_required');
  end if;

  update tradexpar.customers
  set
    name = v_name,
    email = v_email,
    updated_at = now()
  where id = p_customer_id;

  get diagnostics v_cnt = row_count;
  if v_cnt = 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'email_taken');
end;
$$;

grant execute on function tradexpar.admin_update_customer(uuid, text, text) to authenticated;

-- Borra el cliente. Si tiene afiliado sin ventas atribuidas: borra el afiliado (cascade).
-- Si el afiliado tiene atribuciones/pedidos vinculados: desvincula customer_id, suspende y desactiva links.
create or replace function tradexpar.admin_delete_customer(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = tradexpar, public
as $$
declare
  v_aff uuid;
  v_has_attr boolean;
  v_cnt int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select a.id into v_aff
  from tradexpar.affiliates a
  where a.customer_id = p_customer_id
  limit 1;

  if v_aff is not null then
    select exists(
      select 1 from tradexpar.affiliate_attributions x where x.affiliate_id = v_aff
    ) into v_has_attr;

    if v_has_attr then
      update tradexpar.affiliates
      set
        customer_id = null,
        status = 'suspended',
        updated_at = now()
      where id = v_aff;

      update tradexpar.affiliate_links
      set is_active = false
      where affiliate_id = v_aff;
    else
      delete from tradexpar.affiliate_commission_adjustments where affiliate_id = v_aff;
      delete from tradexpar.affiliate_payouts where affiliate_id = v_aff;
      delete from tradexpar.affiliates where id = v_aff;
    end if;
  end if;

  delete from tradexpar.customers where id = p_customer_id;
  get diagnostics v_cnt = row_count;
  if v_cnt = 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_aff is null then
    return jsonb_build_object('ok', true, 'affiliate', 'none');
  elsif v_has_attr then
    return jsonb_build_object('ok', true, 'affiliate', 'unlinked_suspended');
  else
    return jsonb_build_object('ok', true, 'affiliate', 'deleted');
  end if;
end;
$$;

grant execute on function tradexpar.admin_delete_customer(uuid) to authenticated;
