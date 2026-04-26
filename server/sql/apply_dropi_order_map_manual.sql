-- =============================================================================
-- Aplicar manualmente en Supabase SQL Editor (no se ejecuta como migración CI).
-- Ajusta tradexpar.dropi_order_map: id único, columnas de negocio, unique(order_id).
-- =============================================================================

-- 1) id como PK (si aún no existe): descomentá y verificá el nombre del constraint PK.
--    SELECT conname FROM pg_constraint c
--    JOIN pg_class t ON c.conrelid = t.oid JOIN pg_namespace n ON t.relnamespace = n.oid
--    WHERE n.nspname = 'tradexpar' AND t.relname = 'dropi_order_map' AND c.contype = 'p';

ALTER TABLE tradexpar.dropi_order_map
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

UPDATE tradexpar.dropi_order_map SET id = gen_random_uuid() WHERE id IS NULL;

ALTER TABLE tradexpar.dropi_order_map ALTER COLUMN id SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'tradexpar' AND t.relname = 'dropi_order_map' AND c.conname = 'dropi_order_map_pkey'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'tradexpar' AND table_name = 'dropi_order_map'
      AND constraint_type = 'PRIMARY KEY' AND constraint_name = 'dropi_order_map_pkey'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.key_column_usage
    WHERE table_schema = 'tradexpar' AND table_name = 'dropi_order_map'
      AND constraint_name = 'dropi_order_map_pkey' AND column_name = 'order_id'
  ) THEN
    ALTER TABLE tradexpar.dropi_order_map DROP CONSTRAINT dropi_order_map_pkey;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_dropi_order_map_order_id ON tradexpar.dropi_order_map (order_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'tradexpar' AND t.relname = 'dropi_order_map' AND c.conname = 'dropi_order_map_pkey'
  ) THEN
    ALTER TABLE tradexpar.dropi_order_map ADD CONSTRAINT dropi_order_map_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- 2) Renombrar / añadir columnas de negocio
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'tradexpar' AND table_name = 'dropi_order_map' AND column_name = 'status'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'tradexpar' AND table_name = 'dropi_order_map' AND column_name = 'dropi_status'
  ) THEN
    ALTER TABLE tradexpar.dropi_order_map RENAME COLUMN status TO dropi_status;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'tradexpar' AND table_name = 'dropi_order_map' AND column_name = 'last_error'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'tradexpar' AND table_name = 'dropi_order_map' AND column_name = 'error'
  ) THEN
    ALTER TABLE tradexpar.dropi_order_map RENAME COLUMN last_error TO error;
  END IF;
END $$;

ALTER TABLE tradexpar.dropi_order_map
  ADD COLUMN IF NOT EXISTS dropi_order_id text,
  ADD COLUMN IF NOT EXISTS dropi_order_code text,
  ADD COLUMN IF NOT EXISTS dropi_status text,
  ADD COLUMN IF NOT EXISTS dropi_status_label text,
  ADD COLUMN IF NOT EXISTS dropi_order_url text,
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS response jsonb,
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS error text;

-- CHECK dropi_status (mismos estados lógicos que usaba el server)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'tradexpar' AND t.relname = 'dropi_order_map' AND c.conname = 'dropi_order_map_status_check'
  ) THEN
    ALTER TABLE tradexpar.dropi_order_map
      ADD CONSTRAINT dropi_order_map_status_check
      CHECK (dropi_status IS NULL OR dropi_status IN ('pending', 'succeeded', 'failed'));
  END IF;
END $$;

UPDATE tradexpar.dropi_order_map SET created_at = now() WHERE created_at IS NULL;
UPDATE tradexpar.dropi_order_map SET updated_at = now() WHERE updated_at IS NULL;
ALTER TABLE tradexpar.dropi_order_map
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE tradexpar.dropi_order_map
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

COMMENT ON TABLE tradexpar.dropi_order_map IS
  'Pedido interno -> Dropi vía bridge WP; response/payload de auditoría; un fila por order_id.';
