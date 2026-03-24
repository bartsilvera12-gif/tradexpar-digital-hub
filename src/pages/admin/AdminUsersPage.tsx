import { Search } from "lucide-react";
import { useState } from "react";

const mockUsers = [
  { id: "1", name: "Juan Pérez", email: "juan@mail.com", role: "Admin", created_at: "2026-01-15" },
  { id: "2", name: "María López", email: "maria@mail.com", role: "Usuario", created_at: "2026-02-10" },
  { id: "3", name: "Carlos Ruiz", email: "carlos@mail.com", role: "Usuario", created_at: "2026-02-22" },
  { id: "4", name: "Ana García", email: "ana@mail.com", role: "Moderador", created_at: "2026-03-01" },
];

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const filtered = mockUsers.filter(
    (u) => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Usuarios</h1>
        <p className="text-sm text-muted-foreground">Gestión de usuarios del sistema</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text" placeholder="Buscar usuario..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="bg-card rounded-2xl border shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30">
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Usuario</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Rol</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Registro</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-t hover:bg-muted/20 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                        {u.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      u.role === "Admin" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">{u.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t">
          <p className="text-xs text-muted-foreground">* Datos mock. Endpoint: GET /api/admin/users (debe ser implementado en backend)</p>
        </div>
      </div>
    </div>
  );
}
