import { useEffect, useLayoutEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { Loader } from "@/components/shared/Loader";
import { verifyAdminPanelSession } from "@/services/tradexpar";
import { getSupabaseAuth, setDataClientAccessToken, syncDataClientTokenFromAuthSession } from "@/lib/supabaseClient";

export function AdminLayout() {
  const isLogged = sessionStorage.getItem("tradexpar_admin") === "true";
  const [adminVerified, setAdminVerified] = useState<boolean | null>(null);

  useLayoutEffect(() => {
    const t = sessionStorage.getItem("tradexpar_admin_token");
    if (t) setDataClientAccessToken(t);
  }, []);

  useEffect(() => {
    if (!isLogged) return;
    let cancelled = false;
    void (async () => {
      const ok = await verifyAdminPanelSession();
      if (cancelled) return;
      if (!ok) {
        sessionStorage.removeItem("tradexpar_admin");
        sessionStorage.removeItem("tradexpar_admin_token");
        setDataClientAccessToken(null);
        await getSupabaseAuth().auth.signOut({ scope: "local" }).catch(() => {});
      }
      setAdminVerified(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, [isLogged]);

  useEffect(() => {
    if (!isLogged || adminVerified !== true) return;
    syncDataClientTokenFromAuthSession().catch(() => {});
    const { data: { subscription } } = getSupabaseAuth().auth.onAuthStateChange((event, session) => {
      if (event !== "TOKEN_REFRESHED" && event !== "SIGNED_IN") return;
      if (sessionStorage.getItem("tradexpar_admin") !== "true" || !session?.access_token) return;
      sessionStorage.setItem("tradexpar_admin_token", session.access_token);
      setDataClientAccessToken(session.access_token);
    });
    return () => subscription.unsubscribe();
  }, [isLogged, adminVerified]);

  if (!isLogged) return <Navigate to="/admin/login" replace />;
  if (adminVerified === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader text="Verificando acceso…" />
      </div>
    );
  }
  if (!adminVerified) return <Navigate to="/admin/login" replace />;

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <main className="min-w-0 flex-1 overflow-auto bg-muted/20">
        <Outlet />
      </main>
    </div>
  );
}
