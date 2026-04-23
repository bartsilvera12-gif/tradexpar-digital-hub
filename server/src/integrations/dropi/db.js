import { createClient } from "@supabase/supabase-js";

function normalizeSupabaseUrl(raw) {
  let u = (raw || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  u = u.replace(/\/+$/, "");
  u = u.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
  return u;
}

const SCHEMA = String(process.env.SUPABASE_SCHEMA || process.env.SUPABASE_ORDERS_SCHEMA || "tradexpar").trim() || "tradexpar";

/** Cliente service_role con schema PostgREST `tradexpar`. */
export function supabaseService() {
  const url = normalizeSupabaseUrl(process.env.SUPABASE_URL);
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) throw new Error("SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configurados.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: SCHEMA },
  });
}

export function publicStorageBaseUrl() {
  const u = normalizeSupabaseUrl(process.env.SUPABASE_URL);
  return u.replace(/\/+$/, "");
}

export { SCHEMA as TRADEXPAR_SCHEMA };
