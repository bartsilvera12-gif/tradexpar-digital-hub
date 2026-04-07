-- Producto de prueba: notebook (laptop) a 100 guaraníes (PYG).
-- Ejecutar en SQL Editor de Supabase / Neura (schema tradexpar).
--
-- Si ya insertaste el seed viejo del "cuaderno" (SKU TRXP-NOTEBOOK-100), esta sentencia lo convierte.
-- Si no existe ninguno, se inserta TRXP-LAPTOP-100.

do $$
declare
  v_imgs jsonb := jsonb_build_array(
    'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800&q=80',
    'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=80',
    'https://images.unsplash.com/photo-1525547719571-a2d4ac8944e2?w=800&q=80'
  );
  v_primary text := 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800&q=80';
begin
  update tradexpar.products
  set
    name = 'Notebook 14" — demo checkout',
    sku = 'TRXP-LAPTOP-100',
    description =
      'Laptop de demostración para pruebas de tienda, carrito y PagoPar. '
      || 'Especificaciones simuladas: pantalla 14", 8 GB RAM, SSD 256 GB. Precio simbólico 100 Gs.',
    category = 'Computación',
    price = 100,
    stock = 50,
    image = v_primary,
    images = v_imgs,
    product_source_type = 'tradexpar',
    updated_at = now()
  where sku = 'TRXP-NOTEBOOK-100';

  insert into tradexpar.products (
    name,
    sku,
    description,
    category,
    price,
    stock,
    image,
    images,
    product_source_type
  )
  select
    'Notebook 14" — demo checkout',
    'TRXP-LAPTOP-100',
    'Laptop de demostración para pruebas de tienda, carrito y PagoPar. '
      || 'Especificaciones simuladas: pantalla 14", 8 GB RAM, SSD 256 GB. Precio simbólico 100 Gs.',
    'Computación',
    100,
    50,
    v_primary,
    v_imgs,
    'tradexpar'
  where not exists (
    select 1 from tradexpar.products p where p.sku = 'TRXP-LAPTOP-100'
  );
end $$;

notify pgrst, 'reload schema';
