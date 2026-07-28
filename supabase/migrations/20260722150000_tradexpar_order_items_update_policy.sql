-- Política RLS de UPDATE para tradexpar.order_items.
--
-- Problema que resuelve: la tabla tenía RLS habilitado y sólo políticas de INSERT y
-- SELECT. Sin una política de UPDATE, PostgreSQL descartaba silenciosamente cualquier
-- cambio (el UPDATE no falla: afecta 0 filas). Efecto visible en el panel admin: al
-- cambiar el estado de una línea se mostraba el valor nuevo, no se guardaba nada y al
-- recargar volvía el anterior («no actualiza el estado del pedido al guardar»).
--
-- `orders` ya tenía su política de UPDATE (tradexpar_orders_update_anon), por eso el
-- estado del pedido sí se guardaba y el de la línea no.
--
-- Alcance: sólo `authenticated` (el panel admin opera con sesión autenticada; la política
-- de SELECT ya es authenticated y las lecturas funcionan). No se incluye `anon`: el
-- checkout público sólo hace INSERT, y el server usa service_role, que omite RLS.

DROP POLICY IF EXISTS tradexpar_order_items_update_auth ON tradexpar.order_items;

CREATE POLICY tradexpar_order_items_update_auth
  ON tradexpar.order_items
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
