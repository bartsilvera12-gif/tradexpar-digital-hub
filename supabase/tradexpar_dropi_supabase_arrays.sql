-- =============================================================================
-- DROPI — Bloques para Supabase self-hosted / SQL Editor (schema tradexpar)
-- Ejecutá en orden ARRAY 1 → ARRAY 6. Migraciones estructurales: usar conexión
-- directa Postgres (p. ej. SUPABASE_DB_URL del env, no pooler de transacciones).
-- No modifica Fastrax ni syncFastraxProducts.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ARRAY 1 — Bucket de Storage para imágenes de catálogo (Dropi → URLs propias)
-- Si tu versión no tiene columnas opcionales, dejá solo id, name, public.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('catalog-images', 'catalog-images', true)
on conflict (id) do update set public = excluded.public;

-- -----------------------------------------------------------------------------
-- ARRAY 2 — Lectura pública de objetos en catalog-images (frontend / CDN)
-- -----------------------------------------------------------------------------
drop policy if exists "catalog_images_public_read" on storage.objects;
create policy "catalog_images_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'catalog-images');

-- -----------------------------------------------------------------------------
-- ARRAY 3 — Tabla dropi_sync_runs (auditoría por corrida)
-- -----------------------------------------------------------------------------
create table if not exists tradexpar.dropi_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  mode text not null default 'sync_test' check (mode in ('sync_test', 'sync_full', 'sync_images')),
  stats jsonb not null default '{}'::jsonb,
  error_message text,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_dropi_sync_runs_started on tradexpar.dropi_sync_runs (started_at desc);

comment on table tradexpar.dropi_sync_runs is 'Auditoría de sincronizaciones Dropi (productos / imágenes).';

-- -----------------------------------------------------------------------------
-- ARRAY 4 — Tabla dropi_source_products_raw (payload crudo por importación)
-- -----------------------------------------------------------------------------
create table if not exists tradexpar.dropi_source_products_raw (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid not null references tradexpar.dropi_sync_runs (id) on delete cascade,
  external_product_id text not null,
  raw jsonb not null,
  fetched_at timestamptz not null default now()
);

create index if not exists idx_dropi_raw_sync on tradexpar.dropi_source_products_raw (sync_run_id);
create index if not exists idx_dropi_raw_external on tradexpar.dropi_source_products_raw (external_product_id);

comment on table tradexpar.dropi_source_products_raw is 'Snapshots JSON devueltos por la API Dropi por cada producto importado.';

-- -----------------------------------------------------------------------------
-- ARRAY 5 — Tabla dropi_product_map (Dropi external id ↔ products.id local)
-- -----------------------------------------------------------------------------
create table if not exists tradexpar.dropi_product_map (
  external_product_id text primary key,
  product_id uuid not null references tradexpar.products (id) on delete cascade,
  updated_at timestamptz not null default now()
);

create index if not exists idx_dropi_map_product on tradexpar.dropi_product_map (product_id);

comment on table tradexpar.dropi_product_map is 'Relación external_product_id Dropi → product_id en tradexpar.products.';

-- -----------------------------------------------------------------------------
-- ARRAY 6 — Tabla dropi_image_queue (descarga → storage propio)
-- -----------------------------------------------------------------------------
create table if not exists tradexpar.dropi_image_queue (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references tradexpar.products (id) on delete cascade,
  source_url text not null,
  sort_index int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed', 'skipped')),
  storage_path text,
  public_url text,
  error text,
  attempts int not null default 0,
  sync_run_id uuid references tradexpar.dropi_sync_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_dropi_image_queue_pending on tradexpar.dropi_image_queue (status)
  where status = 'pending';
create index if not exists idx_dropi_image_queue_product on tradexpar.dropi_image_queue (product_id);

create unique index if not exists idx_dropi_image_queue_pending_dedupe
  on tradexpar.dropi_image_queue (product_id, md5(source_url))
  where status = 'pending';

comment on table tradexpar.dropi_image_queue is 'Cola para descargar imágenes Dropi y subirlas a storage.catalog-images.';

-- Privilegios: solo rol de servicio / backend (anon no accede por PostgREST)
revoke all on tradexpar.dropi_sync_runs from anon, authenticated;
revoke all on tradexpar.dropi_source_products_raw from anon, authenticated;
revoke all on tradexpar.dropi_product_map from anon, authenticated;
revoke all on tradexpar.dropi_image_queue from anon, authenticated;

grant select, insert, update, delete on tradexpar.dropi_sync_runs to service_role;
grant select, insert, update, delete on tradexpar.dropi_source_products_raw to service_role;
grant select, insert, update, delete on tradexpar.dropi_product_map to service_role;
grant select, insert, update, delete on tradexpar.dropi_image_queue to service_role;

alter table tradexpar.dropi_sync_runs enable row level security;
alter table tradexpar.dropi_source_products_raw enable row level security;
alter table tradexpar.dropi_product_map enable row level security;
alter table tradexpar.dropi_image_queue enable row level security;

notify pgrst, 'reload schema';
