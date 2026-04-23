/**
 * Valida JWT de Supabase Auth y opcionalmente tradexpar.profiles.is_super_admin (igual que Edge Fastrax).
 */

export function normalizeSupabaseUrl(raw) {
  let u = (raw || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  u = u.replace(/\/+$/, "");
  u = u.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
  return u;
}

export async function authGetUserId(jwt, projectUrl, anonKey) {
  const res = await fetch(`${projectUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return typeof data.id === "string" ? data.id : null;
}

const PROFILE_SCHEMA = String(process.env.SUPABASE_SCHEMA || process.env.SUPABASE_ORDERS_SCHEMA || "tradexpar").trim() || "tradexpar";

export async function isSuperAdmin(userId, projectUrl, serviceKey) {
  const u = new URL(`${projectUrl}/rest/v1/profiles`);
  u.searchParams.set("select", "is_super_admin");
  u.searchParams.set("id", `eq.${userId}`);
  const res = await fetch(u.toString(), {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
      "Accept-Profile": PROFILE_SCHEMA,
    },
  });
  if (!res.ok) return false;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0 && rows[0]?.is_super_admin === true;
}

/**
 * @returns {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<void>}
 */
export function createRequireAdminMiddleware() {
  const requireSuper = process.env.DROPI_REQUIRE_SUPER !== "false";

  return async function requireAdmin(req, res, next) {
    try {
      const projectUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL);
      const anon = String(process.env.SUPABASE_ANON_KEY || "").trim();
      const service = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
      if (!projectUrl || !anon || !service) {
        return res.status(500).json({ error: "server_misconfigured", message: "Faltan SUPABASE_URL, SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY." });
      }

      const authHeader = req.headers.authorization ?? "";
      const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (!jwt) {
        return res.status(401).json({ error: "unauthorized" });
      }

      const userId = await authGetUserId(jwt, projectUrl, anon);
      if (!userId) {
        return res.status(401).json({ error: "unauthorized" });
      }

      if (requireSuper) {
        const ok = await isSuperAdmin(userId, projectUrl, service);
        if (!ok) {
          return res.status(403).json({
            error: "forbidden",
            message: "Integración Dropi reservada a super administradores (o definí DROPI_REQUIRE_SUPER=false en el server).",
          });
        }
      }

      req.adminUserId = userId;
      next();
    } catch (e) {
      console.error("[adminAuth]", e);
      return res.status(500).json({ error: "auth_check_failed", message: e instanceof Error ? e.message : String(e) });
    }
  };
}
