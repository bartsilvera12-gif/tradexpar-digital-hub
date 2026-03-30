-- =============================================================================
-- Tienda: permisos y RLS para tradexpar.customers (login email + OAuth Google/Facebook)
-- Sin esto, PostgREST devuelve 403 al leer/insertar la fila del cliente y la UI
-- nunca guarda sesión aunque GoTrue tenga JWT válido.
-- Ejecutar en el SQL Editor del proyecto Supabase (o supabase db push si aplica).
-- =============================================================================

grant usage on schema tradexpar to authenticated;

grant select, insert, update on tradexpar.customers to authenticated;

alter table tradexpar.customers enable row level security;

drop policy if exists "customers_select_own" on tradexpar.customers;
drop policy if exists "customers_insert_own" on tradexpar.customers;
drop policy if exists "customers_update_own" on tradexpar.customers;

create policy "customers_select_own"
  on tradexpar.customers
  for select
  to authenticated
  using (auth.uid() = auth_user_id);

create policy "customers_insert_own"
  on tradexpar.customers
  for insert
  to authenticated
  with check (auth.uid() = auth_user_id);

create policy "customers_update_own"
  on tradexpar.customers
  for update
  to authenticated
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);
