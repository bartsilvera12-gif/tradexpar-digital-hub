-- ARRAY 5 — Funciones: resolver ref, tasas, código único
create or replace function tradexpar.resolve_affiliate_by_ref(p_ref text)
returns uuid
language sql
stable
as $$
  select coalesce(
    (select a.id from tradexpar.affiliates a
     where a.status = 'active' and lower(trim(a.code)) = lower(trim(p_ref)) limit 1),
    (select l.affiliate_id from tradexpar.affiliate_links l
     join tradexpar.affiliates a on a.id = l.affiliate_id
     where l.is_active and lower(trim(l.ref_token)) = lower(trim(p_ref)) and a.status = 'active' limit 1)
  );
$$;

create or replace function tradexpar.generate_unique_affiliate_code()
returns text
language plpgsql
as $$
declare
  v_try text;
  v_n int := 0;
begin
  loop
    v_try := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));
    exit when not exists (select 1 from tradexpar.affiliates c where c.code = v_try);
    v_n := v_n + 1;
    exit when v_n > 50;
  end loop;
  return v_try;
end;
$$;

create or replace function tradexpar.affiliate_commission_rate_for_line(
  p_affiliate_id uuid,
  p_product_id uuid
) returns numeric
language sql
stable
as $$
  select coalesce(
    (select r.commission_percent
     from tradexpar.affiliate_commission_rules r
     where r.affiliate_id = p_affiliate_id and r.product_id = p_product_id limit 1),
    (select r.commission_percent
     from tradexpar.affiliate_commission_rules r
     where r.affiliate_id = p_affiliate_id and r.product_id is null limit 1),
    (select a.commission_rate from tradexpar.affiliates a where a.id = p_affiliate_id limit 1),
    0::numeric
  );
$$;

create or replace function tradexpar.affiliate_buyer_discount_for_line(
  p_affiliate_id uuid,
  p_product_id uuid
) returns numeric
language sql
stable
as $$
  select coalesce(
    (select r.discount_percent
     from tradexpar.affiliate_discount_rules r
     where r.affiliate_id = p_affiliate_id and r.product_id = p_product_id limit 1),
    (select r.discount_percent
     from tradexpar.affiliate_discount_rules r
     where r.affiliate_id = p_affiliate_id and r.product_id is null limit 1),
    (select a.default_buyer_discount_percent from tradexpar.affiliates a where a.id = p_affiliate_id limit 1),
    0::numeric
  );
$$;
