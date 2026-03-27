import { useEffect, useState } from "react";
import { api } from "@/services/api";
import type { CustomerUser } from "@/types";
import { Loader, ErrorState, EmptyState } from "@/components/shared/Loader";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<CustomerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = () => {
    setLoading(true);
    setError(null);
    api.adminGetUsers()
      .then((res) => setUsers(res.users))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUsers(); }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Usuarios</h1>
        <p className="text-sm text-muted-foreground">Gestión de usuarios del sistema</p>
      </div>

      {loading && <Loader text="Cargando usuarios..." />}
      {error && <ErrorState message={error} onRetry={fetchUsers} />}
      {!loading && !error && users.length === 0 && (
        <EmptyState title="Sin usuarios" description="Aún no hay usuarios registrados." />
      )}
      {!loading && !error && users.length > 0 && (
        <div className="bg-card rounded-2xl border shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30">
                  <th className="text-left py-3 px-4">ID</th>
                  <th className="text-left py-3 px-4">Nombre</th>
                  <th className="text-left py-3 px-4">Email</th>
                  <th className="text-left py-3 px-4">Creado</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="py-3 px-4 font-mono text-xs">{u.id}</td>
                    <td className="py-3 px-4">{u.name}</td>
                    <td className="py-3 px-4">{u.email}</td>
                    <td className="py-3 px-4">{u.created_at ? new Date(u.created_at).toLocaleDateString("es-PY") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
