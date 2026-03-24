import { useEffect, useState } from "react";
import { Plus, Search, Edit, Trash2 } from "lucide-react";
import { api } from "@/services/api";
import { Loader, ErrorState, EmptyState } from "@/components/shared/Loader";
import type { Product } from "@/types";

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchProducts = () => {
    setLoading(true);
    setError(null);
    api.getProducts()
      .then(setProducts)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchProducts(); }, []);

  const filtered = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Productos</h1>
          <p className="text-sm text-muted-foreground">Gestión del catálogo — datos reales desde API</p>
        </div>
        <button className="flex items-center gap-2 px-5 py-2.5 gradient-celeste text-white font-semibold rounded-xl text-sm hover:opacity-90 transition-opacity opacity-50 cursor-not-allowed" title="Pendiente: POST /api/admin/products">
          <Plus className="h-4 w-4" /> Nuevo producto
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text" placeholder="Buscar producto..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {loading && <Loader text="Cargando productos..." />}
      {error && <ErrorState message={error} onRetry={fetchProducts} />}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState title="Sin productos" description="No se encontraron productos en el catálogo." />
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className="bg-card rounded-2xl border shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Producto</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">SKU</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Categoría</th>
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium">Precio</th>
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium">Stock</th>
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {p.image ? (
                          <img src={p.image} alt={p.name} className="w-10 h-10 rounded-lg object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-muted/30 flex items-center justify-center shrink-0">
                            <span className="text-[8px] text-muted-foreground">[img]</span>
                          </div>
                        )}
                        <span className="font-medium text-foreground">{p.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-muted-foreground">{p.sku || "—"}</td>
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                        {p.category || "—"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-foreground">
                      ${typeof p.price === "number" ? p.price.toLocaleString("es-PY") : p.price}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={`font-medium ${(p.stock ?? 0) > 20 ? "text-green-600" : (p.stock ?? 0) > 0 ? "text-yellow-600" : "text-destructive"}`}>
                        {p.stock ?? "—"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted/50 text-muted-foreground opacity-50 cursor-not-allowed" title="Pendiente: PUT /api/admin/products/:id">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-destructive/10 text-muted-foreground opacity-50 cursor-not-allowed" title="Pendiente: DELETE /api/admin/products/:id">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
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
