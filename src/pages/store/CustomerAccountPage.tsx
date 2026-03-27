import { Navigate } from "react-router-dom";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";

export default function CustomerAccountPage() {
  const { user, logout } = useCustomerAuth();

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="container mx-auto px-4 py-10 max-w-2xl">
      <h1 className="text-3xl font-bold text-foreground mb-6">Mi cuenta</h1>
      <div className="bg-card border rounded-2xl p-6 space-y-3">
        <p className="text-sm text-muted-foreground">Nombre</p>
        <p className="font-semibold text-foreground">{user.name}</p>
        <p className="text-sm text-muted-foreground mt-3">Email</p>
        <p className="font-semibold text-foreground">{user.email}</p>
        <button onClick={logout} className="mt-6 px-4 py-2 rounded-lg border text-sm hover:bg-muted/50">
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
