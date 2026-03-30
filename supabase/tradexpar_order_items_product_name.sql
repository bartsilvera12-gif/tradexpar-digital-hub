-- =============================================================================
-- Alinear tradexpar.order_items con el esquema actual (tablas legacy).
-- CREATE TABLE IF NOT EXISTS no añade columnas nuevas → fallan RPC de checkout.
-- Ejecutar en Supabase SQL Editor cuando falle create_checkout_order / upsert.
-- =============================================================================

-- Nombre de línea (snapshot en el momento del pedido)
alter table tradexpar.order_items
  add column if not exists product_name text;

-- Subtotal de línea (precio × cantidad, o valor explícito del checkout)
alter table tradexpar.order_items
  add column if not exists line_subtotal numeric(14,2);

update tradexpar.order_items oi
set line_subtotal = round(coalesce(oi.unit_price, 0)::numeric * greatest(1, coalesce(oi.quantity, 1)), 2)
where oi.line_subtotal is null;

alter table tradexpar.order_items
  alter column line_subtotal set not null;

-- Índice de línea (create_checkout_order inserta por orden 0,1,2…)
alter table tradexpar.order_items
  add column if not exists line_index int;

update tradexpar.order_items oi
set line_index = sub.rn
from (
  select id,
    (row_number() over (partition by order_id order by id) - 1)::int as rn
  from tradexpar.order_items
) sub
where oi.id = sub.id;

alter table tradexpar.order_items
  alter column line_index set default 0;

alter table tradexpar.order_items
  alter column line_index set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'tradexpar'
      and t.relname = 'order_items'
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid) ilike '%order_id%'
      and pg_get_constraintdef(c.oid) ilike '%line_index%'
  ) then
    alter table tradexpar.order_items
      add constraint order_items_order_id_line_index_key unique (order_id, line_index);
  end if;
exception
  when duplicate_object then null;
  when unique_violation then null;
end $$;
