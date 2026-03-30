-- ARRAY 0 — Limpieza de triggers/tablas legacy (si existían)
drop trigger if exists trg_create_affiliate_commission on tradexpar.affiliate_attributions;
drop function if exists tradexpar.fn_create_affiliate_commission();
drop table if exists tradexpar.affiliate_commissions cascade;
drop table if exists tradexpar.affiliate_clicks cascade;
