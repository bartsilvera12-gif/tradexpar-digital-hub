# Sincronización automática de stock Fastrax

Flujo **único y oficial**: el server Node (`server/`, en el VPS `payments.neura.com.py`).
La Edge Function `fastrax-sync-catalog` quedó **retirada como escritor** para evitar
que dos procesos actualicen el mismo catálogo de formas distintas.

## Qué hace

- **Arranque**: sincronización inicial completa (ope=4 + ope=98).
- **Luego**: sincronizaciones **incrementales** cada 10 min (configurable),
  consultando los productos modificados desde la última corrida exitosa
  (ope=99) y actualizando saldos con ope=98.
- **Full periódico** (≈1/día) para detectar bajas y desactivar SKU faltantes.
- Actualiza **solo** campos técnicos: `stock`, `external_active`,
  `external_last_sync_at`, `external_sync_crc`, `external_payload`.
  **No** toca nombre, categoría, imagen, descripción ni marca (eso es solo
  importación manual desde el panel).
- Relaciona por SKU / `external_product_id` de Fastrax. Idempotente
  (índice único `external_provider + external_product_id`).
- Saldo 0 → agotado (no baja). Bloqueado en Fastrax → `external_active=false`.
  **Nunca** borra físicamente por una falla temporal de la API.
- Cada corrida queda auditada en `tradexpar.fastrax_sync_runs`
  (estado: success / partial / failed, contadores, error).

## 1. Aplicar migraciones (Supabase SQL Editor)

En orden:

1. `supabase/migrations/20260803120000_tradexpar_fastrax_sync_runs.sql`
   — tabla de estado/auditoría.
2. `supabase/migrations/20260803130000_tradexpar_checkout_stock_validation.sql`
   — revalidación de stock en `create_checkout_order`.

## 2. Variables de entorno (VPS)

En `/home/ubuntu/tradexpar-digital-hub/server/.env` (ver `server/.env.example`).
Las credenciales Fastrax siguen **server-side** (`FASTRAX_*`), nunca en `VITE_*`
ni en el navegador.

```bash
# Ya existentes:
FASTRAX_API_URL=...
FASTRAX_COD=...
FASTRAX_PASS=...
FASTRAX_ENABLED=1

# Nuevas (opcionales; valores por defecto entre paréntesis):
FASTRAX_AUTO_SYNC_ENABLED=1          # (on) apaga con 0
FASTRAX_SYNC_INTERVAL_MS=600000      # (10 min) intervalo incremental
FASTRAX_FULL_EVERY=144               # (≈1/día) cada N ticks, un full
# FASTRAX_CHANGED_SINCE_PARAM=       # parámetro alterno de ope=99 si el manual lo pide
# FASTRAX_CHANGED_MOD=               # filtro "mod" de ope=99 si aplica
# FASTRAX_CHANGED_SINCE_FORMAT=datetime   # datetime | date | iso
```

> **Verificar el contrato de ope=99** con el manual Fastrax: si la API espera otro
> nombre de parámetro o formato de fecha para "cambios desde", ajustá
> `FASTRAX_CHANGED_SINCE_PARAM` / `FASTRAX_CHANGED_SINCE_FORMAT`. Si ope=99 falla,
> el proceso cae automáticamente a un full (se registra en `meta.incremental_fallback`).

## 3. Ejecutar el server bajo systemd (reinicio automático)

El scheduler vive en el proceso Node; para que sobreviva caídas/reinicios,
correlo con systemd. Ejemplo `/etc/systemd/system/tradexpar-payments.service`:

```ini
[Unit]
Description=Tradexpar payments API (Node) + Fastrax sync
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/tradexpar-digital-hub/server
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tradexpar-payments
sudo systemctl status tradexpar-payments
journalctl -u tradexpar-payments -f   # ver logs del scheduler ([fastrax/scheduler])
```

> Si ya usás pm2, alcanza con `pm2 start src/index.js --name tradexpar-payments`
> + `pm2 save`; el scheduler arranca solo con el proceso.

## 4. Retirar la Edge Function como escritor

Ya está deshabilitada por código (responde `410 retired` salvo
`FASTRAX_EDGE_WRITER_ENABLED=1`). Además, **quitá cualquier cron/pg_cron o
Scheduled Function** que la invoque, para que no compita con el server Node.

## 5. Verificación

- Panel admin → sección **Sincronización automática de stock (Fastrax)**:
  muestra estado, última sync exitosa, revisados/actualizados y botón
  **Sincronizar ahora**.
- Endpoints:
  - `GET /api/admin/fastrax/sync/status`
  - `POST /api/admin/fastrax/sync/run` `{ "mode": "incremental" | "full" }`
- Checkout: intentar comprar más que el stock disponible debe rechazarse con un
  mensaje claro (validación en `create_checkout_order`).
