import { Navigate, Outlet } from "react-router-dom";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export function AdminLayout() {
  const isLogged = sessionStorage.getItem("tradexpar_admin") === "true";
  if (!isLogged) return <Navigate to="/admin/login" replace />;

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
