import { useCallback, useEffect, useMemo, useState } from "react";
import { Edit, KeyRound, Search, Trash2 } from "lucide-react";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ADMIN_CARD,
  ADMIN_DIALOG_FORM,
  ADMIN_FORM_CONTROL,
  ADMIN_FORM_FIELD,
  ADMIN_FORM_LABEL,
  ADMIN_TABLE,
  ADMIN_TABLE_SCROLL,
  ADMIN_TBODY,
  ADMIN_TD,
  ADMIN_TH,
  ADMIN_THEAD_ROW,
  ADMIN_TR,
} from "@/lib/adminModuleLayout";
import { cn } from "@/lib/utils";
import { tradexpar } from "@/services/tradexpar";
import type { CustomerUser } from "@/types";
import { Loader, ErrorState, EmptyState } from "@/components/shared/Loader";
import { toast } from "@/hooks/use-toast";

function shortCustomerId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

function normalize(s: string) {
  return s.trim().toLowerCase();
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<CustomerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomerUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<CustomerUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const fetchUsers = useCallback(() => {
    setLoading(true);
    setError(null);
    tradexpar
      .adminGetUsers()
      .then((res) => setUsers(res.users))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return users;
    return users.filter((u) => {
      const name = normalize(u.name || "");
      const email = normalize(u.email || "");
      const id = normalize(u.id);
      return name.includes(q) || email.includes(q) || id.includes(q.replace(/-/g, ""));
    });
  }, [users, query]);

  const openEdit = (u: CustomerUser) => {
    setEditing(u);
    setEditName(u.name);
    setEditEmail(u.email);
    setEditOpen(true);
  };

  const openPasswordDialog = (u: CustomerUser) => {
    setPasswordTarget(u);
    setNewPassword("");
    setConfirmPassword("");
  };

  const saveNewPassword = async () => {
    if (!passwordTarget) return;
    const p = newPassword;
    const c = confirmPassword;
    if (p.length < 6) {
      toast({ title: "La contraseña debe tener al menos 6 caracteres", variant: "destructive" });
      return;
    }
    if (p !== c) {
      toast({ title: "Las contraseñas no coinciden", variant: "destructive" });
      return;
    }
    setSavingPassword(true);
    try {
      await tradexpar.adminSetCustomerPassword(passwordTarget.id, p);
      toast({ title: "Contraseña actualizada" });
      setPasswordTarget(null);
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      toast({
        title: "No se pudo cambiar la contraseña",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const name = editName.trim();
    const email = editEmail.trim();
    if (!name || !email) {
      toast({ title: "Completá nombre y correo", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await tradexpar.adminUpdateCustomer(editing.id, { name, email });
      toast({ title: "Cliente actualizado" });
      setEditOpen(false);
      setEditing(null);
      fetchUsers();
    } catch (e) {
      toast({
        title: "No se pudo guardar",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { affiliate } = await tradexpar.adminDeleteCustomer(deleteTarget.id);
      if (affiliate === "deleted") {
        toast({
          title: "Cliente eliminado",
          description: "También se eliminó el perfil de afiliado vinculado (sin ventas atribuidas).",
        });
      } else if (affiliate === "unlinked_suspended") {
        toast({
          title: "Cliente eliminado",
          description:
            "El afiliado tenía ventas registradas: se desvinculó del cliente, quedó suspendido y sus links se desactivaron.",
        });
      } else {
        toast({ title: "Cliente eliminado" });
      }
      setDeleteTarget(null);
      fetchUsers();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      if (/does not exist|not found|PGRST202|function.*admin_delete_customer/i.test(msg)) {
        toast({
          title: "Falta ejecutar SQL en Supabase",
          description:
            "Ejecutá el archivo supabase/tradexpar_admin_customer_crud.sql en el SQL Editor y reintentá.",
          variant: "destructive",
        });
      } else {
        toast({ title: "No se pudo eliminar", description: msg, variant: "destructive" });
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AdminPageShell title="Usuarios">
      {!loading && !error && users.length > 0 && (
        <div className="space-y-3 w-full max-w-md">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-2.5 w-full">
            Buscar usuarios
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nombre, email o ID…"
              className={cn(ADMIN_FORM_CONTROL, "pl-10")}
              aria-label="Buscar usuarios"
            />
          </div>
        </div>
      )}

      {loading && <Loader text="Cargando usuarios..." />}
      {error && <ErrorState message={error} onRetry={fetchUsers} />}
      {!loading && !error && users.length === 0 && (
        <EmptyState
          title="Sin usuarios en la tienda"
          description="Acá aparecen solo las personas que se dieron de alta en la tienda con perfil completo. Si creés que ya hay cuentas creadas pero no se listan, puede que falte confirmar el correo, iniciar sesión al menos una vez en la tienda, o que el listado del panel aún no esté configurado (revisá el mensaje de error si aparece)."
        />
      )}
      {!loading && !error && users.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground py-4">Ningún usuario coincide con la búsqueda.</p>
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className={ADMIN_CARD}>
          <div className={ADMIN_TABLE_SCROLL}>
            <table className={`${ADMIN_TABLE} min-w-[780px]`}>
              <thead>
                <tr className={ADMIN_THEAD_ROW}>
                  <th className={ADMIN_TH}>ID</th>
                  <th className={ADMIN_TH}>Nombre</th>
                  <th className={ADMIN_TH}>Email</th>
                  <th className={ADMIN_TH}>Origen</th>
                  <th className={ADMIN_TH}>Afiliado</th>
                  <th className={ADMIN_TH}>Creado</th>
                  <th className={`${ADMIN_TH} text-right`}>Acciones</th>
                </tr>
              </thead>
              <tbody className={ADMIN_TBODY}>
                {filtered.map((u) => (
                  <tr key={u.id} className={ADMIN_TR}>
                    <td className={`${ADMIN_TD} font-mono text-xs`} title={u.id}>
                      {shortCustomerId(u.id)}
                    </td>
                    <td className={`${ADMIN_TD} font-medium text-foreground`}>{u.name}</td>
                    <td className={ADMIN_TD}>{u.email}</td>
                    <td className={`${ADMIN_TD} text-muted-foreground capitalize`}>{u.provider || "—"}</td>
                    <td className={ADMIN_TD}>
                      <span className="text-xs text-muted-foreground">{u.is_affiliate ? "Sí" : "No"}</span>
                    </td>
                    <td className={ADMIN_TD}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString("es-PY") : "—"}
                    </td>
                    <td className={`${ADMIN_TD} text-right`}>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title="Editar"
                          onClick={() => openEdit(u)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title="Nueva contraseña"
                          onClick={() => openPasswordDialog(u)}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          title="Eliminar"
                          onClick={() => setDeleteTarget(u)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog
        open={!!passwordTarget}
        onOpenChange={(o) => {
          if (!o) {
            setPasswordTarget(null);
            setNewPassword("");
            setConfirmPassword("");
          }
        }}
      >
        <DialogContent className={cn(ADMIN_DIALOG_FORM, "rounded-2xl")}>
          <DialogHeader>
            <DialogTitle>Nueva contraseña</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se asigna una contraseña nueva en Supabase Auth para{" "}
            <span className="font-medium text-foreground">{passwordTarget?.email}</span>. No hace falta la contraseña
            actual.
          </p>
          <div className="space-y-4 py-2">
            <div className={ADMIN_FORM_FIELD}>
              <Label htmlFor="pw-new" className={ADMIN_FORM_LABEL}>
                Contraseña nueva
              </Label>
              <Input
                id="pw-new"
                className={ADMIN_FORM_CONTROL}
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className={ADMIN_FORM_FIELD}>
              <Label htmlFor="pw-confirm" className={ADMIN_FORM_LABEL}>
                Repetir contraseña
              </Label>
              <Input
                id="pw-confirm"
                className={ADMIN_FORM_CONTROL}
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPasswordTarget(null);
                setNewPassword("");
                setConfirmPassword("");
              }}
              disabled={savingPassword}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="gradient-celeste text-primary-foreground shadow-sm"
              onClick={() => void saveNewPassword()}
              disabled={savingPassword}
            >
              {savingPassword ? "Guardando…" : "Guardar contraseña"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={(o) => !o && setEditOpen(false)}>
        <DialogContent className={cn(ADMIN_DIALOG_FORM, "rounded-2xl")}>
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className={ADMIN_FORM_FIELD}>
              <Label htmlFor="edit-name" className={ADMIN_FORM_LABEL}>
                Nombre
              </Label>
              <Input id="edit-name" className={ADMIN_FORM_CONTROL} value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className={ADMIN_FORM_FIELD}>
              <Label htmlFor="edit-email" className={ADMIN_FORM_LABEL}>
                Correo
              </Label>
              <Input
                id="edit-email"
                className={ADMIN_FORM_CONTROL}
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" className="gradient-celeste text-primary-foreground shadow-sm" onClick={() => void saveEdit()} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className={cn(ADMIN_DIALOG_FORM, "rounded-2xl")}>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este cliente?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left">
              <span className="block">
                Se eliminará <strong className="text-foreground">{deleteTarget?.name}</strong> (
                {deleteTarget?.email}) del catálogo de clientes.
              </span>
              {deleteTarget?.is_affiliate ? (
                <span className="block text-sm">
                  Es <strong className="text-foreground">afiliado</strong>: si no tiene ventas atribuidas, se borra
                  también el perfil de afiliado. Si ya tiene ventas, el afiliado quedará suspendido y desvinculado.
                </span>
              ) : null}
              <span className="block text-xs text-muted-foreground">
                Esto no borra la cuenta de inicio de sesión en Supabase Auth (solo la fila en{" "}
                <code className="rounded bg-muted px-1">customers</code>).
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminPageShell>
  );
}
