import { useEffect, useLayoutEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { getSupabaseAuth, setDataClientAccessToken, syncDataClientTokenFromAuthSession } from "@/lib/supabaseClient";

export function AdminLayout() {
  const isLogged = sessionStorage.getItem("tradexpar_admin") === "true";

  useLayoutEffect(() => {
    const t = sessionStorage.getItem("tradexpar_admin_token");
    if (t) setDataClientAccessToken(t);
  }, []);

  useEffect(() => {
    if (!isLogged) return;
    syncDataClientTokenFromAuthSession().catch(() => {});
    const { data: { subscription } } = getSupabaseAuth().auth.onAuthStateChange((event, session) => {
      if (event !== "TOKEN_REFRESHED" && event !== "SIGNED_IN") return;
      if (sessionStorage.getItem("tradexpar_admin") !== "true" || !session?.access_token) return;
      sessionStorage.setItem("tradexpar_admin_token", session.access_token);
      setDataClientAccessToken(session.access_token);
    });
    return () => subscription.unsubscribe();
  }, [isLogged]);

  if (!isLogged) return <Navigate to="/admin/login" replace />;

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <main className="min-w-0 flex-1 overflow-auto bg-muted/20">
        <Outlet />
      </main>
    </div>
  );
}
