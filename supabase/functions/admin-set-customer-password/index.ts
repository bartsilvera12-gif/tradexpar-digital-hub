/**
 * Cambia la contraseña de un cliente en Auth (admin).
 * Sin dependencias npm/esm: solo fetch → evita "could not find an appropriate entrypoint" en Edge.
 */
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_LEN = 6;
const PROFILE = "tradexpar";

async function authGetUserId(jwt: string, projectUrl: string, anonKey: string): Promise<string | null> {
  const res = await fetch(`${projectUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: anonKey,
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { id?: string };
  return typeof data.id === "string" ? data.id : null;
}

async function isSuperAdmin(
  userId: string,
  projectUrl: string,
  serviceKey: string
): Promise<boolean> {
  const u = new URL(`${projectUrl}/rest/v1/profiles`);
  u.searchParams.set("select", "is_super_admin");
  u.searchParams.set("id", `eq.${userId}`);
  const res = await fetch(u.toString(), {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
      "Accept-Profile": PROFILE,
    },
  });
  if (!res.ok) return false;
  const rows = (await res.json()) as { is_super_admin?: boolean }[];
  return Array.isArray(rows) && rows.length > 0 && rows[0]?.is_super_admin === true;
}

async function getCustomerAuthUserId(
  customerId: string,
  projectUrl: string,
  serviceKey: string
): Promise<{ authUserId: string | null; lookupError: string | null }> {
  const u = new URL(`${projectUrl}/rest/v1/customers`);
  u.searchParams.set("select", "auth_user_id");
  u.searchParams.set("id", `eq.${customerId}`);
  const res = await fetch(u.toString(), {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
      "Accept-Profile": PROFILE,
    },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { message?: string };
      if (j?.message) msg = String(j.message);
    } catch {
      /* ignore */
    }
    return { authUserId: null, lookupError: msg };
  }
  const rows = (await res.json()) as { auth_user_id?: string | null }[];
  const aid = Array.isArray(rows) && rows[0] ? rows[0].auth_user_id : null;
  return {
    authUserId: typeof aid === "string" && aid.length > 0 ? aid : null,
    lookupError: null,
  };
}

async function adminSetPassword(
  authUserId: string,
  password: string,
  projectUrl: string,
  serviceKey: string
): Promise<{ ok: true } | { error: string }> {
  const res = await fetch(`${projectUrl}/auth/v1/admin/users/${authUserId}`, {
    method: "PUT",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as {
        message?: string;
        msg?: string;
        error_description?: string;
      };
      if (j?.message) msg = String(j.message);
      else if (j?.msg) msg = String(j.msg);
      else if (j?.error_description) msg = String(j.error_description);
    } catch {
      /* ignore */
    }
    return { error: msg };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const projectUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!projectUrl || !anon || !service) {
    return new Response(JSON.stringify({ error: "server_misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminUserId = await authGetUserId(jwt, projectUrl, anon);
  if (!adminUserId) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const requireSuper = Deno.env.get("ADMIN_REQUIRE_SUPER") === "true";
  if (requireSuper) {
    const ok = await isSuperAdmin(adminUserId, projectUrl, service);
    if (!ok) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  let body: { customer_id?: string; password?: string };
  try {
    body = (await req.json()) as { customer_id?: string; password?: string };
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const customerId = typeof body.customer_id === "string" ? body.customer_id.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!customerId || !password) {
    return new Response(JSON.stringify({ error: "customer_id_and_password_required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (password.length < MIN_LEN) {
    return new Response(JSON.stringify({ error: "password_too_short", min: MIN_LEN }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { authUserId, lookupError } = await getCustomerAuthUserId(customerId, projectUrl, service);
  if (lookupError) {
    return new Response(JSON.stringify({ error: "lookup_failed", message: lookupError }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!authUserId) {
    return new Response(JSON.stringify({ error: "no_auth_user" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const upd = await adminSetPassword(authUserId, password, projectUrl, service);
  if ("error" in upd) {
    return new Response(JSON.stringify({ error: "auth_update_failed", message: upd.error }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
