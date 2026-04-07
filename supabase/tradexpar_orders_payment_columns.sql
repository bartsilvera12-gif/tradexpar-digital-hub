-- Columnas de pago PagoPar en tradexpar.orders
-- Ejecutar en Supabase SQL si aún no existen.

alter table tradexpar.orders
  add column if not exists payment_reference text,
  add column if not exists payment_status text default 'pending',
  add column if not exists pagopar_hash text;

-- Si antes usaste el script con `pagopar_hash_pedido`, copiar a `pagopar_hash`
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'tradexpar' and table_name = 'orders' and column_name = 'pagopar_hash_pedido'
  ) then
    execute $u$
      update tradexpar.orders
      set pagopar_hash = coalesce(pagopar_hash, pagopar_hash_pedido)
      where pagopar_hash_pedido is not null
    $u$;
  end if;
end $$;

drop index if exists tradexpar.idx_orders_pagopar_hash_unique;
drop index if exists idx_orders_pagopar_hash_unique;

create index if not exists idx_orders_payment_reference on tradexpar.orders (payment_reference)
  where payment_reference is not null;

create unique index if not exists idx_orders_pagopar_hash_unique on tradexpar.orders (pagopar_hash)
  where pagopar_hash is not null;

comment on column tradexpar.orders.payment_reference is 'Referencia interna (id_pedido_comercio hacia PagoPar).';
comment on column tradexpar.orders.payment_status is 'pending | paid | approved | failed | rejected (SuccessPage mapea paid/approved y failed/rejected).';
comment on column tradexpar.orders.pagopar_hash is 'hash_pedido de PagoPar (checkout / webhook).';
