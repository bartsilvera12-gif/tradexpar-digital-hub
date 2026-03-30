-- =============================================================================
-- Un pedido con ref de afiliado E2ED891F (equivalente a entrar con
-- http://localhost:8080/?ref=E2ED891F) y dos líneas de producto.
--
-- Productos:
--   7ee432fd-93e3-4b88-9628-3ef94ab28efe
--   02235518-172b-40ec-88f8-3009cfb44659
--
-- Ejecutar en Supabase → SQL Editor (schema tradexpar).
-- Requiere: create_checkout_order, productos existentes, afiliado activo con code E2ED891F
-- (o link con ref_token E2ED891F) para que apply_affiliate_to_order tenga sentido.
-- =============================================================================

do $$
declare
  pid1 uuid := '7ee432fd-93e3-4b88-9628-3ef94ab28efe';
  pid2 uuid := '02235518-172b-40ec-88f8-3009cfb44659';
  n1 text;
  p1 numeric(14, 2);
  n2 text;
  p2 numeric(14, 2);
  v_items jsonb;
  v_ref text := 'E2ED891F';
begin
  select name, price into n1, p1 from tradexpar.products where id = pid1;
  select name, price into n2, p2 from tradexpar.products where id = pid2;

  if n1 is null then
    raise exception 'Producto % no existe en tradexpar.products', pid1;
  end if;
  if n2 is null then
    raise exception 'Producto % no existe en tradexpar.products', pid2;
  end if;

  v_items := jsonb_build_array(
    jsonb_build_object(
      'product_id', pid1::text,
      'product_name', n1,
      'quantity', 1,
      'price', p1,
      'line_subtotal', p1
    ),
    jsonb_build_object(
      'product_id', pid2::text,
      'product_name', n2,
      'quantity', 1,
      'price', p2,
      'line_subtotal', p2
    )
  );

  perform tradexpar.create_checkout_order(
    'tradexpar',
    null,
    'Pedido demo ref E2ED891F (2 productos)',
    'demo.ref.e2ed.two@example.com',
    null,
    null,
    v_ref,
    v_items,
    null,
    null
  );
end $$;
