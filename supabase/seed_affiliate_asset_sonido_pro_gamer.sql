-- Banner promocional «Sonido Pro Gamer» (archivo en public/affiliate-assets/sonido-pro-gamer-tradexpar.png).
-- Ejecutar una vez en Supabase SQL Editor (schema tradexpar).
-- La URL es relativa al dominio donde corre el front (Vite sirve /affiliate-assets/... en build).

insert into tradexpar.affiliate_assets (title, asset_type, file_url, product_id, is_active)
select
  'Banner Sonido Pro Gamer — Tradexpar',
  'image',
  '/affiliate-assets/sonido-pro-gamer-tradexpar.png',
  null,
  true
where not exists (
  select 1
  from tradexpar.affiliate_assets a
  where a.file_url = '/affiliate-assets/sonido-pro-gamer-tradexpar.png'
);
