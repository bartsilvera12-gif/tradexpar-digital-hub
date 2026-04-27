/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_KEY?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_PUBLIC_SITE_URL?: string;
  /** Solo dígitos (ej. 595986776881). Si no se define, usa `src/config/whatsapp.ts`. */
  readonly VITE_WHATSAPP_NUMBER?: string;
  /** Base URL para armar enlace «Ver en Dropi» si no hay external_url (ej. https://panel.dropi.com/orders) */
  readonly VITE_DROPI_ORDER_BASE_URL?: string;
  /** Si es "true", solo usa Edge Function para cambio de contraseña admin (ignora RPC SQL). */
  readonly VITE_ADMIN_PASSWORD_VIA_EDGE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
