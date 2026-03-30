-- ARRAY 8 — Vistas panel (ventas / resumen afiliados)
create or replace view tradexpar.v_affiliate_sales_detail as
select
  att.id as attribution_id,
  att.affiliate_id,
  af.code as affiliate_code,
  af.name as affiliate_name,
  att.order_id,
  o.created_at as order_created_at,
  o.total as order_total,
  att.commission_total,
  att.commission_status,
  att.ref_code,
  (select coalesce(string_agg(coalesce(aoi.product_name, aoi.product_id::text), ', '), '')
   from tradexpar.affiliate_order_items aoi
   where aoi.attribution_id = att.id) as products_label,
  (select coalesce(sum(aoi.quantity), 0)::bigint
   from tradexpar.affiliate_order_items aoi
   where aoi.attribution_id = att.id) as total_qty
from tradexpar.affiliate_attributions att
join tradexpar.affiliates af on af.id = att.affiliate_id
join tradexpar.orders o on o.id = att.order_id;

create or replace view tradexpar.v_affiliate_summary as
select
  a.id as affiliate_id,
  a.name,
  a.code,
  a.status,
  a.commission_rate as default_commission_percent,
  a.default_buyer_discount_percent,
  count(distinct att.order_id) as orders_count,
  coalesce(sum(aoi.line_subtotal), 0) as total_sold,
  coalesce(sum(aoi.commission_amount), 0) as commission_total,
  coalesce(sum(case when att.commission_status = 'pending' then aoi.commission_amount end), 0) as commission_pending,
  coalesce(sum(case when att.commission_status = 'approved' then aoi.commission_amount end), 0) as commission_approved,
  coalesce(sum(case when att.commission_status = 'paid' then aoi.commission_amount end), 0) as commission_paid
from tradexpar.affiliates a
left join tradexpar.affiliate_attributions att on att.affiliate_id = a.id
left join tradexpar.affiliate_order_items aoi on aoi.attribution_id = att.id
group by a.id, a.name, a.code, a.status, a.commission_rate, a.default_buyer_discount_percent;
