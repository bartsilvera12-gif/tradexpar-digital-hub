-- =============================================================================
-- 2 pedidos con el mismo producto y ref de afiliado E2ED891F
-- (equivalente a ?ref=E2ED891F en http://localhost:8080/?ref=E2ED891F).
--
-- Producto: 7ee432fd-93e3-4b88-9628-3ef94ab28efe
-- Ejecutar en Supabase → SQL Editor (permiso sobre tradexpar).
-- Cada ejecución inserta 2 pedidos nuevos. Requiere afiliado con code = E2ED891F.
--
-- Prerrequisito: tradexpar_order_items_product_name.sql si falla por line_index.
-- =============================================================================

do $$
declare
  pid uuid := '7ee432fd-93e3-4b88-9628-3ef94ab28efe';
  p_name text;
  p_price numeric(14,2);
  v_items jsonb;
  v_ref text := 'E2ED891F';
begin
  select name, price into p_name, p_price from tradexpar.products where id = pid;
  if p_name is null then
    raise exception 'Producto % no existe en tradexpar.products', pid;
  end if;

  v_items := jsonb_build_array(
    jsonb_build_object(
      'product_id', pid::text,
      'product_name', p_name,
      'quantity', 1,
      'price', p_price,
      'line_subtotal', p_price
    )
  );

  perform tradexpar.create_checkout_order(
    'tradexpar',
    null,
    'Demo ref E2ED — pedido 1',
    'demo.ref.e2ed1@example.com',
    null,
    null,
    v_ref,
    v_items,
    null,
    null
  );

  perform tradexpar.create_checkout_order(
    'tradexpar',
    null,
    'Demo ref E2ED — pedido 2',
    'demo.ref.e2ed2@example.com',
    null,
    null,
    v_ref,
    v_items,
    null,
    null
  );
end $$;
