-- order_items.product_id NO debe tener FK dura contra products.
-- Motivo: las líneas guardan un snapshot (product_name, unit_price) y deben sobrevivir
-- aunque el producto se borre o se re-sincronice (Dropi cambia el UUID en cada sync).
-- La FK `order_items_product_id_fkey` quedó de un esquema viejo y rompe el checkout
-- (insert ... violates foreign key constraint) además de borrar historial con su ON DELETE CASCADE.

alter table if exists tradexpar.order_items
  drop constraint if exists order_items_product_id_fkey;

-- Defensivo: elimina cualquier otra FK sobre order_items.product_id sin importar el nombre.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    join pg_attribute att
      on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
    where nsp.nspname = 'tradexpar'
      and rel.relname = 'order_items'
      and con.contype = 'f'
      and att.attname = 'product_id'
  loop
    execute format('alter table tradexpar.order_items drop constraint %I', c.conname);
  end loop;
end $$;
