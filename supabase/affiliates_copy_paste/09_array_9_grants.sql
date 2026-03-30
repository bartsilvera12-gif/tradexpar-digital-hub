-- ARRAY 9 — Grants (en producción: quitar permisos admin a anon)
grant usage on schema tradexpar to anon, authenticated, service_role;

grant select, insert on tradexpar.affiliate_requests to anon, authenticated;
grant execute on function tradexpar.submit_affiliate_request(text, text, text, text, text) to anon, authenticated;
grant execute on function tradexpar.record_affiliate_visit(text, text, text) to anon, authenticated;
grant execute on function tradexpar.apply_affiliate_to_order(uuid) to anon, authenticated, service_role;
grant execute on function tradexpar.upsert_order_items_for_affiliate(uuid, jsonb) to anon, authenticated, service_role;
grant execute on function tradexpar.sync_checkout_order_stub(uuid, numeric, text, text) to anon, authenticated, service_role;

grant execute on function tradexpar.admin_approve_affiliate_request(uuid) to anon, authenticated, service_role;
grant execute on function tradexpar.admin_reject_affiliate_request(uuid, text) to anon, authenticated, service_role;
grant execute on function tradexpar.admin_set_commission_rule(uuid, uuid, numeric) to anon, authenticated, service_role;
grant execute on function tradexpar.admin_set_discount_rule(uuid, uuid, numeric) to anon, authenticated, service_role;
grant execute on function tradexpar.admin_set_affiliate_globals(uuid, numeric, numeric) to anon, authenticated, service_role;
grant execute on function tradexpar.admin_set_attribution_commission_status(uuid, text) to anon, authenticated, service_role;

grant select on tradexpar.affiliate_requests to service_role;
grant select on tradexpar.affiliates to service_role;
grant select on tradexpar.affiliate_links to service_role;
grant select on tradexpar.affiliate_commission_rules to service_role;
grant select on tradexpar.affiliate_discount_rules to service_role;
grant select on tradexpar.affiliate_visits to service_role;
grant select on tradexpar.affiliate_attributions to service_role;
grant select on tradexpar.affiliate_order_items to service_role;
grant select on tradexpar.affiliate_payouts to service_role;
grant select on tradexpar.order_items to service_role;
grant select on tradexpar.orders to service_role;
grant select on tradexpar.v_affiliate_sales_detail to service_role;
grant select on tradexpar.v_affiliate_summary to service_role;

grant select on tradexpar.affiliate_requests to anon, authenticated;
grant select on tradexpar.affiliates to anon, authenticated;
grant select on tradexpar.affiliate_links to anon, authenticated;
grant select on tradexpar.affiliate_commission_rules to anon, authenticated;
grant select on tradexpar.affiliate_discount_rules to anon, authenticated;
grant select on tradexpar.affiliate_attributions to anon, authenticated;
grant select on tradexpar.affiliate_order_items to anon, authenticated;
grant select on tradexpar.v_affiliate_sales_detail to anon, authenticated;
grant select on tradexpar.v_affiliate_summary to anon, authenticated;
