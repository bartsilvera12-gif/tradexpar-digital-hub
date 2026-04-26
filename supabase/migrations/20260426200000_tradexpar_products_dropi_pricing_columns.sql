-- Costo Dropi, precio lista duplicado en sale_price, márgenes de regla de import.
alter table tradexpar.products
  add column if not exists sale_price numeric(12,2),
  add column if not exists cost numeric(12,2) check (cost is null or cost >= 0),
  add column if not exists dropi_cost_price numeric(12,2) check (dropi_cost_price is null or dropi_cost_price >= 0),
  add column if not exists margin_percent numeric(10,4),
  add column if not exists margin_fixed numeric(12,2) check (margin_fixed is null or margin_fixed >= 0);

comment on column tradexpar.products.dropi_cost_price is 'Costo en Gs provisto por Dropi / bridge (import).';
comment on column tradexpar.products.cost is 'Costo alineado a import Dropi (mismo valor que dropi_cost_price al sincronizar desde Dropi).';
comment on column tradexpar.products.sale_price is 'Precio de venta lista; en Dropi = price tras regla de margen.';
comment on column tradexpar.products.margin_percent is 'Margen adicional (regla import): 0,5 = +50% sobre costo (×1,5).';
comment on column tradexpar.products.margin_fixed is 'Margen fijo en Gs añadido al costo (regla import, ej. 25.000).';
