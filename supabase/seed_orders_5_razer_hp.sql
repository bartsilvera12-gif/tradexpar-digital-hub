-- =============================================================================
-- 5 pedidos de demo con productos fijos (UUIDs reales del catálogo):
--   7ee432fd-93e3-4b88-9628-3ef94ab28efe — Razer BlackShark V2 X (tradexpar)
--   02235518-172b-40ec-88f8-3009cfb44659 — HP 250 G9 (dropi)
--
-- Ejecutar en Supabase → SQL Editor (permiso sobre tradexpar).
-- Cada ejecución inserta 5 pedidos nuevos (no borra datos).
--
-- Prerrequisito: si falla create_checkout_order por "line_index" inexistente,
-- ejecutá antes: supabase/tradexpar_order_items_product_name.sql
-- =============================================================================

do $$
declare
  pid_razer uuid := '7ee432fd-93e3-4b88-9628-3ef94ab28efe';
  pid_hp uuid := '02235518-172b-40ec-88f8-3009cfb44659';
  razer_name text := 'Razer BlackShark V2 X Gaming Headset';
  hp_name text := 'HP 250 G9 15.6" Core i5 8GB 512GB SSD';
  p_razer numeric := 350000;
  p_hp numeric := 4500000;
  v jsonb;
begin
  -- 1) Dropi, 1 producto (HP)
  v := jsonb_build_array(
    jsonb_build_object(
      'product_id', pid_hp::text,
      'product_name', hp_name,
      'quantity', 1,
      'price', p_hp,
      'line_subtotal', p_hp
    )
  );
  perform tradexpar.create_checkout_order(
    'dropi', null,
    'Demo Dropi ×1', 'demo.dropi1@example.com', null, null, null,
    v, null, null
  );

  -- 2) Tradexpar, 1 producto (Razer)
  v := jsonb_build_array(
    jsonb_build_object(
      'product_id', pid_razer::text,
      'product_name', razer_name,
      'quantity', 1,
      'price', p_razer,
      'line_subtotal', p_razer
    )
  );
  perform tradexpar.create_checkout_order(
    'tradexpar', null,
    'Demo Tradexpar ×1', 'demo.trad1@example.com', null, null, null,
    v, null, null
  );

  -- 3) Dropi, 3 líneas (mismo HP)
  v := jsonb_build_array(
    jsonb_build_object('product_id', pid_hp::text, 'product_name', hp_name || ' (1)', 'quantity', 1, 'price', p_hp, 'line_subtotal', p_hp),
    jsonb_build_object('product_id', pid_hp::text, 'product_name', hp_name || ' (2)', 'quantity', 1, 'price', p_hp, 'line_subtotal', p_hp),
    jsonb_build_object('product_id', pid_hp::text, 'product_name', hp_name || ' (3)', 'quantity', 1, 'price', p_hp, 'line_subtotal', p_hp)
  );
  perform tradexpar.create_checkout_order(
    'dropi', null,
    'Demo Dropi ×3', 'demo.dropi3@example.com', null, null, null,
    v, null, null
  );

  -- 4) Tradexpar, 4 líneas (Razer; una línea cantidad 2)
  v := jsonb_build_array(
    jsonb_build_object('product_id', pid_razer::text, 'product_name', razer_name || ' (1)', 'quantity', 1, 'price', p_razer, 'line_subtotal', p_razer),
    jsonb_build_object('product_id', pid_razer::text, 'product_name', razer_name || ' (2)', 'quantity', 1, 'price', p_razer, 'line_subtotal', p_razer),
    jsonb_build_object('product_id', pid_razer::text, 'product_name', razer_name || ' (3)', 'quantity', 2, 'price', p_razer, 'line_subtotal', p_razer * 2),
    jsonb_build_object('product_id', pid_razer::text, 'product_name', razer_name || ' (4)', 'quantity', 1, 'price', p_razer, 'line_subtotal', p_razer)
  );
  perform tradexpar.create_checkout_order(
    'tradexpar', null,
    'Demo Tradexpar ×4', 'demo.trad4@example.com', null, null, null,
    v, null, null
  );

  -- 5) Mixto 5 líneas (Razer + HP); un solo checkout_type en fila orders
  v := jsonb_build_array(
    jsonb_build_object('product_id', pid_razer::text, 'product_name', '[Tradexpar] ' || razer_name, 'quantity', 1, 'price', p_razer, 'line_subtotal', p_razer),
    jsonb_build_object('product_id', pid_razer::text, 'product_name', '[Tradexpar] ' || razer_name, 'quantity', 1, 'price', p_razer, 'line_subtotal', p_razer),
    jsonb_build_object('product_id', pid_hp::text, 'product_name', '[Dropi] ' || hp_name, 'quantity', 1, 'price', p_hp, 'line_subtotal', p_hp),
    jsonb_build_object('product_id', pid_hp::text, 'product_name', '[Dropi] ' || hp_name, 'quantity', 1, 'price', p_hp, 'line_subtotal', p_hp),
    jsonb_build_object('product_id', pid_razer::text, 'product_name', '[Tradexpar] ' || razer_name, 'quantity', 1, 'price', p_razer, 'line_subtotal', p_razer)
  );
  perform tradexpar.create_checkout_order(
    'tradexpar', null,
    'Demo mixto ×5', 'demo.mixto5@example.com', null, null, null,
    v, null, null
  );
end $$;
