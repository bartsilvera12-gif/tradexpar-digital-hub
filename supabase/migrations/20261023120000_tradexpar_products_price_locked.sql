-- Flag por producto: si está true, el sync automático de Fastrax NO pisa
-- `price` ni `cost` (sigue actualizando stock/disponibilidad). Pensado para
-- productos donde el admin fijó un precio manual que debe prevalecer sobre
-- el "costo_fastrax * (1 + margen)" que calcula el sync.

alter table tradexpar.products
  add column if not exists price_locked boolean not null default false;

comment on column tradexpar.products.price_locked is
  'Si es true, el sync automático de Fastrax no sobreescribe price/cost (sí stock).';
