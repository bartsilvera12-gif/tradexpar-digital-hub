export default function AdminSettingsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configuración</h1>
        <p className="text-sm text-muted-foreground">Ajustes generales del sistema</p>
      </div>

      <div className="bg-card rounded-2xl border shadow-card p-6 space-y-6">
        <div>
          <h2 className="font-semibold text-foreground mb-4">API</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Base URL</label>
              <input
                type="text" readOnly value="https://tan-trout-550053.hostingersite.com"
                className="w-full px-4 py-2.5 rounded-xl border bg-muted/30 text-muted-foreground text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">API Key</label>
              <input
                type="password" readOnly value="••••••••••••••••"
                className="w-full px-4 py-2.5 rounded-xl border bg-muted/30 text-muted-foreground text-sm"
              />
            </div>
          </div>
        </div>

        <div className="border-t pt-6">
          <h2 className="font-semibold text-foreground mb-4">Tienda</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Nombre de la tienda</label>
              <input
                type="text" defaultValue="Tradexpar Store"
                className="w-full px-4 py-2.5 rounded-xl border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Email de contacto</label>
              <input
                type="email" defaultValue="info@tradexpar.com"
                className="w-full px-4 py-2.5 rounded-xl border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
        </div>

        <button className="px-6 py-2.5 gradient-celeste text-white font-semibold rounded-xl text-sm hover:opacity-90 transition-opacity">
          Guardar cambios
        </button>

        <p className="text-xs text-muted-foreground">
          * Endpoint de configuración debe ser implementado en backend (PUT /api/admin/settings)
        </p>
      </div>
    </div>
  );
}
