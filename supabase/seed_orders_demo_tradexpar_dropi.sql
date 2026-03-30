-- =============================================================================
-- Pedidos de demostración: uno checkout_type = tradexpar y otro = dropi
-- para ver filtros y listados en el panel (Pedidos).
--
-- Ejecutar en: Supabase → SQL Editor (rol con permiso sobre tradexpar).
-- Idempotencia: cada ejecución crea 2 pedidos nuevos (no borra datos).
-- =============================================================================

do $$
declare
  pid uuid;
  v_items_trad jsonb;
  v_items_drop jsonb;
begin
  select id into pid from tradexpar.products order by created_at asc limit 1;

  if pid is null then
    insert into tradexpar.products (
      name, sku, description, category, price, stock, image, product_source_type
    ) values (
      'Producto demo (seed pedidos)',
      'SEED-DEMO-ORD',
      'Creado solo para pruebas de pedidos en panel.',
      'General',
      100000,
      50,
      '',
      'tradexpar'
    )
    returning id into pid;
  end if;

  v_items_trad := jsonb_build_array(
    jsonb_build_object(
      'product_id', pid::text,
      'product_name', 'Línea demo Tradexpar',
      'quantity', 1,
      'price', 85000,
      'line_subtotal', 85000
    )
  );

  v_items_drop := jsonb_build_array(
    jsonb_build_object(
      'product_id', pid::text,
      'product_name', 'Línea demo Dropi',
      'quantity', 1,
      'price', 195000,
      'line_subtotal', 195000
    )
  );

  perform tradexpar.create_checkout_order(
    'tradexpar',
    null,
    'Cliente demo Tradexpar',
    'demo.pedido.tradexpar@example.com',
    null,
    null,
    null,
    v_items_trad,
    null,
    null
  );

  perform tradexpar.create_checkout_order(
    'dropi',
    null,
    'Cliente demo Dropi',
    'demo.pedido.dropi@example.com',
    null,
    null,
    null,
    v_items_drop,
    null,
    null
  );
end $$;
