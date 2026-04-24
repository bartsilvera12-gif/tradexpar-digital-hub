-- Reparación: 42703 column "status" does not exist (tabla creada sin `status` o esquema incompleto).
-- Aplica a instalaciones que fallaron a mitad; idempotente.

create table if not exists tradexpar.dropi_order_map (
  order_id uuid primary key references tradexpar.orders (id) on delete cascade
);

alter table tradexpar.dropi_order_map
  add column if not exists status text,
  add column if not exists dropi_order_id text,
  add column if not exists dropi_order_url text,
  add column if not exists last_error text,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

update tradexpar.dropi_order_map set status = 'pending' where status is null;
update tradexpar.dropi_order_map set created_at = now() where created_at is null;
update tradexpar.dropi_order_map set updated_at = now() where updated_at is null;

alter table tradexpar.dropi_order_map
  alter column status set default 'pending',
  alter column status set not null,
  alter column created_at set not null,
  alter column created_at set default now(),
  alter column updated_at set not null,
  alter column updated_at set default now();

-- CHECK solo si aún no existe
do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'tradexpar' and t.relname = 'dropi_order_map' and c.conname = 'dropi_order_map_status_check'
  ) then
    alter table tradexpar.dropi_order_map
      add constraint dropi_order_map_status_check
      check (status in ('pending', 'succeeded', 'failed'));
  end if;
exception
  when check_violation then null;
end $$;

create index if not exists idx_dropi_order_map_status on tradexpar.dropi_order_map (status);

revoke all on tradexpar.dropi_order_map from anon, authenticated;
grant select, insert, update, delete on tradexpar.dropi_order_map to service_role;
alter table tradexpar.dropi_order_map enable row level security;

comment on table tradexpar.dropi_order_map is
  'Sincronización del pedido con Dropi solo después de PagoPar pagado; no tocar pago si falla Dropi.';
