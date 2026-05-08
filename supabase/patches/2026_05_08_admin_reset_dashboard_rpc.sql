-- =============================================================================
-- PATCH 2026-05-08 — RPC `tradexpar.admin_reset_dashboard()`
-- -----------------------------------------------------------------------------
-- Objetivo:
--   Permitir al panel admin "resetear" el dashboard borrando productos y
--   pedidos (con todas sus tablas dependientes) en una única llamada
--   transaccional. Lo invoca el botón "Resetear" del header del dashboard.
--
-- Seguridad:
--   - SECURITY DEFINER + comprobación explícita de
--       tradexpar.profiles.is_super_admin = true
--     contra `auth.uid()` (la JWT del cliente). Sin sesión ni sin flag se
--     levanta excepción y la transacción aborta sin tocar datos.
--   - Solo se concede `EXECUTE` al rol `authenticated` (los anónimos no
--     pueden llamarla aunque adivinen el nombre).
--
-- Alcance del borrado:
--   ▸ Pedidos / items y dependencias:
--       affiliate_order_items, affiliate_commission_adjustments,
--       affiliate_commissions, affiliate_attributions, dropi_order_map,
--       order_items, orders.
--   ▸ Productos y staging Dropi:
--       dropi_image_queue, dropi_product_map, dropi_source_products_raw,
--       products.
--   ▸ NO toca: profiles, customers, customer_locations, affiliates,
--       affiliate_links, affiliate_requests, paraguay_cities, etc.
--
--   Cada DELETE corre solo si la tabla existe (`to_regclass`), para no
--   romper si alguna tabla aún no fue creada en este entorno.
--
-- Idempotente: ejecutar varias veces simplemente sobrescribe la función.
-- =============================================================================

CREATE OR REPLACE FUNCTION tradexpar.admin_reset_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id          uuid;
  v_is_admin         boolean;
  v_orders_deleted   integer := 0;
  v_items_deleted    integer := 0;
  v_products_deleted integer := 0;
  v_existing         text[] := ARRAY[]::text[];
  v_targets          text[] := ARRAY[
    /* Orden no es relevante: usamos TRUNCATE multi-tabla en una sola
       sentencia, Postgres maneja las dependencias entre las listadas. */
    'tradexpar.affiliate_order_items',
    'tradexpar.affiliate_commission_adjustments',
    'tradexpar.affiliate_commissions',
    'tradexpar.affiliate_attributions',
    'tradexpar.dropi_order_map',
    'tradexpar.order_items',
    'tradexpar.orders',
    'tradexpar.dropi_image_queue',
    'tradexpar.dropi_product_map',
    'tradexpar.dropi_source_products_raw',
    'tradexpar.products'
  ];
  t text;
BEGIN
  /* 1) Validación: usuario autenticado y super admin. */
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(p.is_super_admin, false)
    INTO v_is_admin
  FROM tradexpar.profiles p
  WHERE p.id = v_user_id;

  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Solo super administradores pueden resetear el dashboard.'
      USING ERRCODE = '42501';
  END IF;

  /* 2) Counts antes de borrar (para devolverle al frontend cuántos registros
        se eliminaron). */
  IF to_regclass('tradexpar.orders') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM tradexpar.orders' INTO v_orders_deleted;
  END IF;
  IF to_regclass('tradexpar.order_items') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM tradexpar.order_items' INTO v_items_deleted;
  END IF;
  IF to_regclass('tradexpar.products') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM tradexpar.products' INTO v_products_deleted;
  END IF;

  /* 3) Filtro: solo tablas existentes en este entorno. */
  FOREACH t IN ARRAY v_targets LOOP
    IF to_regclass(t) IS NOT NULL THEN
      v_existing := array_append(v_existing, t);
    END IF;
  END LOOP;

  /* 4) TRUNCATE en una sola sentencia. Razones:
        - Evita la extensión `pg_safeupdate` (Supabase) que rechaza
          DELETE/UPDATE sin WHERE real, incluyendo `WHERE true`.
        - Postgres resuelve las FK entre las tablas listadas; agregamos
          CASCADE por si alguna tabla externa al set apunta a éstas.
        - RESTART IDENTITY reinicia secuencias de PKs auto-incremento. */
  IF cardinality(v_existing) > 0 THEN
    EXECUTE 'TRUNCATE TABLE '
            || array_to_string(v_existing, ', ')
            || ' RESTART IDENTITY CASCADE';
  END IF;

  RETURN jsonb_build_object(
    'orders_deleted',   v_orders_deleted,
    'items_deleted',    v_items_deleted,
    'products_deleted', v_products_deleted,
    'reset_at',         now()
  );
END
$$;

REVOKE ALL ON FUNCTION tradexpar.admin_reset_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tradexpar.admin_reset_dashboard() TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMENT ON FUNCTION tradexpar.admin_reset_dashboard()
IS 'Reset operativo del panel admin: borra productos y pedidos con sus tablas dependientes. Solo super admin (tradexpar.profiles.is_super_admin = true).';
