-- =============================================================================
-- PATCH 2026-05-08 — Otorgar permisos de super administrador
-- -----------------------------------------------------------------------------
-- Objetivo:
--   Marcar al usuario con id `6a219f0b-a7d8-4356-a556-f4ac92b4dbc7` como super
--   administrador del panel `/admin` de Tradexpar.
--
--   El panel valida `tradexpar.profiles.is_super_admin = true` en el login y
--   en cada navegación a una sección admin. El UUID corresponde al `id` que
--   Supabase Auth asignó al usuario en `auth.users`.
--
-- Requisitos previos:
--   1) Que el usuario exista en `auth.users` (creado desde Supabase Studio →
--      Authentication → Users, o con `supabase auth signup`).
--   2) Que la tabla `tradexpar.profiles(id uuid PK, is_super_admin bool)`
--      exista. Si no existe (entorno fresco), este patch la crea con un
--      esquema mínimo compatible con el panel.
--
-- Idempotente: ejecutar varias veces no duplica filas y deja el flag en true.
-- =============================================================================

DO $$
DECLARE
  v_user_id uuid := '6a219f0b-a7d8-4356-a556-f4ac92b4dbc7';
  v_exists  boolean;
BEGIN
  /* 1) El UUID debe corresponder a un usuario real en Supabase Auth. */
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION
      'auth.users no contiene el id %.  Creá primero el usuario en Supabase Studio → Authentication → Users (con ese mismo UUID) y volvé a correr este patch.',
      v_user_id;
  END IF;

  /* 2) Schema y tabla mínima si no existen (no toca columnas extra ya creadas). */
  CREATE SCHEMA IF NOT EXISTS tradexpar;

  CREATE TABLE IF NOT EXISTS tradexpar.profiles (
    id              uuid PRIMARY KEY,
    is_super_admin  boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
  );

  /* 3) UPSERT del flag. No tocamos columnas adicionales que ya existieran. */
  INSERT INTO tradexpar.profiles (id, is_super_admin, updated_at)
  VALUES (v_user_id, true, now())
  ON CONFLICT (id) DO UPDATE
    SET is_super_admin = true,
        updated_at     = now();
END
$$;

/* 4) Permisos PostgREST: el panel lee `profiles.is_super_admin` con la JWT
      del usuario o con la service-role key (Edge / server). Aseguramos que el
      rol `authenticated` pueda leer su propio perfil y que `service_role`
      pueda leer cualquiera. Si las policies ya estaban definidas, los GRANT
      son no-op. */
GRANT USAGE ON SCHEMA tradexpar TO authenticated, service_role;
GRANT SELECT ON tradexpar.profiles TO authenticated, service_role;

/* 5) Refrescar el caché de schema de PostgREST (necesario si se acaba de
      crear la tabla). */
NOTIFY pgrst, 'reload schema';

/* 6) Verificación: la consulta debe devolver una fila con `is_super_admin = t`. */
SELECT id, is_super_admin, updated_at
FROM tradexpar.profiles
WHERE id = '6a219f0b-a7d8-4356-a556-f4ac92b4dbc7';
