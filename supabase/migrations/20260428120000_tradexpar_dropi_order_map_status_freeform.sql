-- Permite almacenar el estado lógico del proveedor (ej. en_transito) sin limitar a pending|succeeded|failed.
-- La creación vía Node ya guarda dropi_status = meta; si existía un CHECK estricto, se elimina.

alter table if exists tradexpar.dropi_order_map
  drop constraint if exists dropi_order_map_status_check;

-- Columnas requeridas por el panel (idempotente). PK = order_id; id uuid opcional (otra SQL manual).
alter table tradexpar.dropi_order_map
  add column if not exists id uuid;
update tradexpar.dropi_order_map set id = gen_random_uuid() where id is null;
alter table tradexpar.dropi_order_map
  add column if not exists dropi_order_id text,
  add column if not exists dropi_order_code text,
  add column if not exists dropi_status text,
  add column if not exists dropi_status_label text,
  add column if not exists dropi_order_url text,
  add column if not exists payload jsonb,
  add column if not exists response jsonb,
  add column if not exists last_error text,
  add column if not exists last_sync_at timestamptz,
  add column if not exists error text;

-- created_at/updated_at si aún faltan (tabla mínima vieja)
alter table tradexpar.dropi_order_map
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;
update tradexpar.dropi_order_map set created_at = now() where created_at is null;
update tradexpar.dropi_order_map set updated_at = now() where updated_at is null;
alter table tradexpar.dropi_order_map
  alter column created_at set default now(),
  alter column updated_at set default now();
alter table tradexpar.dropi_order_map
  alter column created_at set not null,
  alter column updated_at set not null;
