-- =============================================================================
-- ERP Pedidos: columnas para líneas Dropi, estado por ítem y enlace externo.
-- Ejecutar en Supabase SQL Editor (schema tradexpar).
-- Idempotente: IF NOT EXISTS en columnas.
-- =============================================================================

alter table tradexpar.order_items
  add column if not exists line_status text not null default 'pending';

alter table tradexpar.order_items
  add column if not exists external_provider text;

alter table tradexpar.order_items
  add column if not exists external_product_id text;

alter table tradexpar.order_items
  add column if not exists external_order_id text;

alter table tradexpar.order_items
  add column if not exists external_status text;

alter table tradexpar.order_items
  add column if not exists external_url text;

comment on column tradexpar.order_items.line_status is 'Estado operativo de la línea (ERP o flujo Dropi).';
comment on column tradexpar.order_items.external_provider is 'Proveedor externo, ej. dropi';
comment on column tradexpar.order_items.external_url is 'URL directa al pedido/producto en el panel del proveedor';

alter table tradexpar.orders
  add column if not exists external_order_url text;

comment on column tradexpar.orders.external_order_url is 'URL del pedido en Dropi u otro proveedor (nivel pedido)';

-- Permisos (ajustar si usás RLS estricto)
grant select, insert, update, delete on tradexpar.order_items to anon, authenticated;
