-- -----------------------------------------------------------------------------
-- Auditoría / estado de la sincronización automática de catálogo Fastrax.
--
-- Modelada en tradexpar.dropi_sync_runs. Cada ejecución (automática o manual) del
-- server Node deja una fila. La "última sincronización exitosa" se deriva de:
--   select max(finished_at) from tradexpar.fastrax_sync_runs
--   where status in ('success','partial') and mode = 'incremental'|'full';
-- y ese timestamp alimenta el parámetro `dat` de la operación 99 (cambios desde).
-- -----------------------------------------------------------------------------

create table if not exists tradexpar.fastrax_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- running: en curso | success: todo ok | partial: terminó pero con fallos por
  -- fila | failed: no pudo completar (ej. la API no respondió).
  status text not null default 'running'
    check (status in ('running', 'success', 'partial', 'failed')),
  -- full: recorre todo el catálogo (ope=4 + ope=98) y desactiva faltantes.
  -- incremental: solo cambios desde la última corrida exitosa (ope=99 + ope=98).
  mode text not null default 'incremental'
    check (mode in ('full', 'incremental')),
  -- 'auto' (scheduler) o 'manual' (botón del panel).
  trigger text not null default 'auto'
    check (trigger in ('auto', 'manual')),
  -- Marca "cambios desde" usada en esta corrida (ope=99). Null en full.
  since timestamptz,
  -- Contadores: { reviewed, updated, inserted, deactivated, unchanged, failed }.
  stats jsonb not null default '{}'::jsonb,
  -- Detalle de error (mensaje de la API o del proceso) cuando status != success.
  error_message text,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_fastrax_sync_runs_started
  on tradexpar.fastrax_sync_runs (started_at desc);

-- Consulta frecuente: última corrida exitosa por modo.
create index if not exists idx_fastrax_sync_runs_status_finished
  on tradexpar.fastrax_sync_runs (status, finished_at desc);

comment on table tradexpar.fastrax_sync_runs is
  'Auditoría/estado de la sincronización automática de catálogo Fastrax (stock/disponibilidad).';
comment on column tradexpar.fastrax_sync_runs.since is
  'Marca de cambios-desde (ope=99) usada por la corrida incremental.';
comment on column tradexpar.fastrax_sync_runs.stats is
  'Contadores de la corrida: reviewed, updated, inserted, deactivated, unchanged, failed.';
