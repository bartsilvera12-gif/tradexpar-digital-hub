import { AlertCircle } from "lucide-react";

export default function AdminUsersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Usuarios</h1>
        <p className="text-sm text-muted-foreground">Gestión de usuarios del sistema</p>
      </div>

      <div className="bg-card rounded-2xl border shadow-card p-12">
        <div className="flex flex-col items-center justify-center text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <AlertCircle className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Módulo preparado</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Este módulo está listo para conectarse al endpoint de gestión de usuarios.
            La tabla se poblará automáticamente cuando el endpoint esté disponible.
          </p>
          <div className="mt-4 bg-muted/30 rounded-xl p-4 text-left w-full max-w-md">
            <p className="text-xs font-mono text-muted-foreground mb-1">Endpoints pendientes:</p>
            <ul className="text-xs font-mono text-foreground space-y-1">
              <li>• GET /api/admin/users</li>
              <li>• GET /api/admin/users/:id</li>
              <li>• PUT /api/admin/users/:id</li>
              <li>• DELETE /api/admin/users/:id</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
