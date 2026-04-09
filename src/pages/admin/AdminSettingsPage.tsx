import { useState } from "react";
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
import { syncFastraxProducts } from "@/services/fastraxCatalog";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function AdminSettingsPage() {
  const [fastraxLoading, setFastraxLoading] = useState(false);

  const handleFastraxSync = async () => {
    if (fastraxLoading) return;
    setFastraxLoading(true);
    try {
      const res = await syncFastraxProducts();
      const s = res.stats;
      toast.success("Productos Fastrax actualizados", {
        description: [
          `Vistos en API: ${res.products_seen}`,
          `Nuevos: ${s.inserted} · Actualizados: ${s.updated}`,
          s.skipped ? `Omitidos: ${s.skipped}` : null,
          s.failed ? `Fallidos: ${s.failed}` : null,
          s.deactivated ? `Marcados inactivos: ${s.deactivated}` : null,
          s.images_fetched ? `Imágenes: ${s.images_fetched}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("No se pudo actualizar Fastrax", { description: msg });
    } finally {
      setFastraxLoading(false);
    }
  };

  return (
    <AdminPageShell
      title="Configuración"
      description="Propiedades y ajustes generales del sistema."
    >
      <div className="max-w-2xl w-full">
        <div className={`${ADMIN_PANEL} space-y-8`}>
          <div className="border-b border-border/60 pb-8">
            <h2 className="text-lg font-semibold text-foreground mb-2">Catálogo Fastrax</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Sincronizá productos desde Fastrax hacia el catálogo local. Los ítems quedan como cualquier otro
              producto en tienda, carrito y checkout (origen <span className="font-medium">fastrax</span>).
            </p>
            <Button
              type="button"
              variant="secondary"
              className="rounded-xl gap-2"
              disabled={fastraxLoading}
              onClick={() => void handleFastraxSync()}
            >
              {fastraxLoading ? (
                <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
              ) : (
                <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
              )}
              Actualizar productos Fastrax
            </Button>
            <p className="text-xs text-muted-foreground mt-3">
              Requiere Edge Function <code className="text-[11px]">fastrax-sync-catalog</code> y secretos{" "}
              <code className="text-[11px]">FASTRAX_*</code> en Supabase (no uses VITE_ para contraseñas).
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
