import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ADMIN_FORM_CONTROL,
  ADMIN_FORM_CONTROL_READONLY,
  ADMIN_FORM_FIELD,
  ADMIN_FORM_LABEL,
  ADMIN_PANEL,
} from "@/lib/adminModuleLayout";

export default function AdminSettingsPage() {
  return (
    <AdminPageShell
      title="Configuración"
      description="Propiedades y ajustes generales del sistema."
    >
      <div className="max-w-2xl w-full">
        <div className={`${ADMIN_PANEL} space-y-8`}>
          <div className="border-b border-border/60 pb-8">
            <h2 className="text-lg font-semibold text-foreground mb-2">Catálogo Fastrax</h2>
            <p className="text-sm text-muted-foreground">
              Para buscar e importar artículos desde Fastrax, usá <span className="font-medium text-foreground">Productos</span> → pestaña{" "}
              <span className="font-medium text-foreground">Fastrax</span>. Allí podés buscar, elegir SKUs e importar; no
              hace falta un botón de sincronización global aquí.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">API</h2>
            <div className="space-y-4">
              <div className={ADMIN_FORM_FIELD}>
                <Label className={ADMIN_FORM_LABEL}>Base URL</Label>
                <Input
                  type="text"
                  readOnly
                  value={
                    import.meta.env.VITE_API_BASE_URL || "—"
                  }
                  className={ADMIN_FORM_CONTROL_READONLY}
                />
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  {import.meta.env.VITE_API_BASE_URL
                    ? "URL del servidor Node de pagos inyectada en este build."
                    : import.meta.env.DEV
                      ? "Vacío: en desarrollo las llamadas van a /api/… y Vite las reenvía al Node (proxy → PAYMENTS_API_PROXY_TARGET, por defecto 127.0.0.1:8787)."
                      : "Vacío en producción: el checkout con PagoPar fallará hasta definir VITE_API_BASE_URL y volver a ejecutar npm run build."}
                </p>
              </div>
              <div className={ADMIN_FORM_FIELD}>
                <Label className={ADMIN_FORM_LABEL}>API Key</Label>
                <Input type="password" readOnly value="••••••••••••••••" className={ADMIN_FORM_CONTROL_READONLY} />
              </div>
            </div>
          </div>

          <div className="border-t border-border/60 pt-8">
            <h2 className="text-lg font-semibold text-foreground mb-4">Tienda</h2>
            <div className="space-y-4">
              <div className={ADMIN_FORM_FIELD}>
                <Label htmlFor="store-name" className={ADMIN_FORM_LABEL}>
                  Nombre de la tienda
                </Label>
                <Input id="store-name" type="text" defaultValue="Tradexpar Store" className={ADMIN_FORM_CONTROL} />
              </div>
              <div className={ADMIN_FORM_FIELD}>
                <Label htmlFor="store-email" className={ADMIN_FORM_LABEL}>
                  Email de contacto
                </Label>
                <Input
                  id="store-email"
                  type="email"
                  defaultValue="info@tradexpar.com"
                  className={ADMIN_FORM_CONTROL}
                />
              </div>
            </div>
          </div>

          <Button type="button" className="gradient-celeste text-primary-foreground shadow-sm rounded-xl px-6">
            Guardar cambios
          </Button>

          <p className="text-xs text-muted-foreground">
            * Endpoint de configuración debe ser implementado en backend (PUT /api/admin/settings)
          </p>
        </div>
      </div>
    </AdminPageShell>
  );
}
