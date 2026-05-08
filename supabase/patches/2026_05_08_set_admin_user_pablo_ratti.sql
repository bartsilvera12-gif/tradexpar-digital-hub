-- =============================================================================
-- PATCH 2026-05-08 — Actualizar usuario admin (Pablo Ratti)
-- -----------------------------------------------------------------------------
-- Objetivo:
--   Asignar al usuario `6a219f0b-a7d8-4356-a556-f4ac92b4dbc7` los datos
--     - Nombre : Pablo Ratti
--     - Email  : comercial@tradexpar.com.py
--
--   El panel admin lee:
--     • `auth.users.email`
--     • `auth.users.raw_user_meta_data.full_name`  (con fallback a `name`)
--
--   Como Supabase Auth replica el email en `auth.identities` cuando el
--   provider es `email`, también lo sincronizamos ahí para evitar
--   inconsistencias en futuros logins.
--
--   Si `tradexpar.profiles` tiene columnas `email` / `name` / `full_name`,
--   se actualizan también (detectado dinámicamente con information_schema).
--
-- Idempotente: ejecutar varias veces deja exactamente el mismo estado.
-- =============================================================================

DO $$
DECLARE
  v_user_id    uuid  := '6a219f0b-a7d8-4356-a556-f4ac92b4dbc7';
  v_email      text  := 'comercial@tradexpar.com.py';
  v_full_name  text  := 'Pablo Ratti';
  v_exists     boolean;
  v_has_col    boolean;
BEGIN
  /* 1) Validar que el usuario exista en Supabase Auth. */
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'auth.users no contiene el id %', v_user_id;
  END IF;

  /* 2) auth.users: email + metadata + confirmación + updated_at.
        - email_confirmed_at: si nunca se confirmó, lo damos por confirmado
          (evita que Supabase dispare flujo de re-confirmación al loguearse).
        - email_change*: limpiamos cualquier cambio de email pendiente para
          que no se interponga con este UPDATE administrativo. */
  UPDATE auth.users
     SET email              = v_email,
         email_confirmed_at = COALESCE(email_confirmed_at, now()),
         email_change       = '',
         email_change_token_new     = '',
         email_change_token_current = '',
         email_change_sent_at = NULL,
         raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
                              || jsonb_build_object(
                                   'full_name', v_full_name,
                                   'name',      v_full_name,
                                   'email',     v_email
                                 ),
         updated_at         = now()
   WHERE id = v_user_id;

  /* 3) auth.identities: si hay provider 'email', sincronizar `identity_data`.
        En Supabase Auth ≥ 2.x la columna `auth.identities.email` es GENERATED
        (se computa desde identity_data->>'email'), por eso NO se actualiza
        directamente; basta con escribir `identity_data` y Postgres recalcula
        la columna generada. */
  UPDATE auth.identities
     SET identity_data = COALESCE(identity_data, '{}'::jsonb)
                          || jsonb_build_object('email', v_email),
         updated_at    = now()
   WHERE user_id = v_user_id
     AND provider = 'email';

  /* 4) tradexpar.profiles: actualizar columnas opcionales si existen. */
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'tradexpar' AND table_name = 'profiles' AND column_name = 'email'
  ) INTO v_has_col;
  IF v_has_col THEN
    EXECUTE format(
      'UPDATE tradexpar.profiles SET email = %L WHERE id = %L',
      v_email, v_user_id
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'tradexpar' AND table_name = 'profiles' AND column_name = 'full_name'
  ) INTO v_has_col;
  IF v_has_col THEN
    EXECUTE format(
      'UPDATE tradexpar.profiles SET full_name = %L WHERE id = %L',
      v_full_name, v_user_id
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'tradexpar' AND table_name = 'profiles' AND column_name = 'name'
  ) INTO v_has_col;
  IF v_has_col THEN
    EXECUTE format(
      'UPDATE tradexpar.profiles SET name = %L WHERE id = %L',
      v_full_name, v_user_id
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'tradexpar' AND table_name = 'profiles' AND column_name = 'updated_at'
  ) INTO v_has_col;
  IF v_has_col THEN
    EXECUTE format(
      'UPDATE tradexpar.profiles SET updated_at = now() WHERE id = %L',
      v_user_id
    );
  END IF;
END
$$;

/* 5) Verificación final. Debe devolver una fila con email y full_name correctos. */
SELECT
  u.id,
  u.email,
  u.raw_user_meta_data->>'full_name' AS full_name,
  u.email_confirmed_at,
  u.updated_at
FROM auth.users u
WHERE u.id = '6a219f0b-a7d8-4356-a556-f4ac92b4dbc7';
