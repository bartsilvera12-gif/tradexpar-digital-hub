-- RPC tienda: % de descuento al comprador por producto según ref (código afiliado o token de link).
-- Requiere tradexpar.resolve_affiliate_by_ref y tradexpar.affiliate_buyer_discount_for_line (phase1).

create or replace function tradexpar.store_affiliate_buyer_discounts(
  p_ref text,
  p_product_ids uuid[]
) returns jsonb
language plpgsql
stable
set search_path = tradexpar, public
as $$
declare
  v_aff uuid;
  v_pid uuid;
  v_pct numeric;
  v_map jsonb := '{}'::jsonb;
begin
  if p_ref is null or trim(p_ref) = ''
     or p_product_ids is null
     or coalesce(array_length(p_product_ids, 1), 0) = 0 then
    return jsonb_build_object('ok', true, 'by_product', '{}'::jsonb);
  end if;

  v_aff := tradexpar.resolve_affiliate_by_ref(trim(p_ref));
  if v_aff is null then
    return jsonb_build_object('ok', true, 'by_product', '{}'::jsonb);
  end if;

  foreach v_pid in array p_product_ids
  loop
    v_pct := tradexpar.affiliate_buyer_discount_for_line(v_aff, v_pid);
    if coalesce(v_pct, 0) > 0 then
      v_map := v_map || jsonb_build_object(v_pid::text, v_pct);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'by_product', v_map);
end;
$$;

grant execute on function tradexpar.store_affiliate_buyer_discounts(text, uuid[]) to anon, authenticated;
