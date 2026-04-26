-- Indica con qué base se calculó price/sale_price al importar Dropi.
alter table tradexpar.products
  add column if not exists pricing_source text;

do $$
begin
  alter table tradexpar.products
    add constraint products_pricing_source_chk
    check (pricing_source is null or pricing_source in ('cost', 'suggested_price', 'sale_price'));
exception
  when duplicate_object then null;
  when undefined_table then null;
end $$;

comment on column tradexpar.products.pricing_source is 'Origen fórmula import Dropi: cost (costo) | suggested_price (sin costo) | sale_price (lista/venta).';
