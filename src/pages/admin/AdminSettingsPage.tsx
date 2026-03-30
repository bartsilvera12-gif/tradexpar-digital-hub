import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { Button } from "@/components/ui/button";
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
    <AdminPageShell title="Configuración" description="Ajustes generales del sistema.">
      <div className="max-w-2xl w-full">
        <div className={`${ADMIN_PANEL} space-y-8`}>
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">API</h2>
            <div className="space-y-4">
              <div className={ADMIN_FORM_FIELD}>
                <Label className={ADMIN_FORM_LABEL}>Base URL</Label>
                <Input
                  type="text"
                  readOnly
                  value="https://tan-trout-550053.hostingersite.com"
                  className={ADMIN_FORM_CONTROL_READONLY}
                />
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
