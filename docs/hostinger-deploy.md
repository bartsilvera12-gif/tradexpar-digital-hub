# Despliegue en Hostinger (sitio estático + Vite)

## 1. Variables de entorno (Supabase)

En tu PC, antes de `npm run build`, creá `.env.production` en la raíz del proyecto (no se sube a Git) con:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_clave_anonima

# Pagos / PagoPar (API Node en `server/`). Sin esto, el checkout llama /api/... al mismo host del
# sitio estático y suele recibir index.html → error "Unexpected token '<' ... is not valid JSON".
VITE_API_BASE_URL=https://donde-corre-tu-api-de-pagos
VITE_API_KEY=mismo_valor_que_API_PUBLIC_KEY_en_el_server
```

Vite inyecta solo variables que empiezan con `VITE_`. Podés copiar el formato de `.env.example`.

Si no usás `.env.production`, el build usará el `.env` local o los defaults del código; **no dejes `VITE_API_BASE_URL` vacío en producción** si usás crear pago desde la tienda.

## 2. Build

```bash
npm ci
npm run build
```

La salida queda en la carpeta **`dist/`**.

## 3. Subir a Hostinger

1. En **Administrador de archivos**, abrí `public_html` (o la carpeta del dominio).
2. Subí **el contenido** de `dist/` (no la carpeta `dist` en sí, sino `index.html`, `assets/`, `favicon.png`, etc.).
3. Asegurate de que exista **`.htaccess`** en la raíz del sitio (viene copiado desde `public/` al hacer build). Sin esto, al recargar `/products` o `/admin/login` Apache puede devolver 404.

## 4. Probar

- Abrir la URL del dominio.
- Navegar a `/products` y recargar la página: debe seguir funcionando.

## 5. Dominio en subcarpeta (opcional)

Si el sitio no está en la raíz sino en `https://tudominio.com/tienda/`, hace falta configurar `base` en Vite y el router; este proyecto asume despliegue en la **raíz del dominio**.
