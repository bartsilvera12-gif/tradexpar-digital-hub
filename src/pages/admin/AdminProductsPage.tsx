import { useEffect, useState } from "react";
import { Plus, Search, Edit, Trash2 } from "lucide-react";
import { api } from "@/services/api";
import { Loader, ErrorState, EmptyState } from "@/components/shared/Loader";
import type { Product } from "@/types";
import { getDiscountPercentage, getEffectivePrice, getStockLabel } from "@/lib/productHelpers";
import { toast } from "@/hooks/use-toast";

const emptyForm: Partial<Product> = {
  name: "",
  sku: "",
  category: "",
  description: "",
  image: "",
  price: 0,
  stock: 0,
  product_source_type: "tradexpar",
  discount_type: null,
  discount_value: 0,
  discount_starts_at: "",
  discount_ends_at: "",
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Product>>(emptyForm);

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

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setOpenForm(true);
  };

  const startEdit = (product: Product) => {
    setEditingId(product.id);
    setForm({
      ...product,
      discount_starts_at: product.discount_starts_at || "",
      discount_ends_at: product.discount_ends_at || "",
      discount_value: product.discount_value || 0,
      discount_type: product.discount_type || null,
    });
    setOpenForm(true);
  };

  const handleSave = async () => {
    try {
      const payload = {
        ...form,
        discount_value: Math.max(0, Number(form.discount_value || 0)),
      };
      if (editingId) {
        await api.adminUpdateProduct(editingId, payload);
        toast({ title: "Producto actualizado" });
      } else {
        await api.adminCreateProduct(payload);
        toast({ title: "Producto creado" });
      }
      setOpenForm(false);
      fetchProducts();
    } catch (err: any) {
      toast({ title: "No se pudo guardar", description: err.message });
    }
  };

  const handleDelete = async (productId: string) => {
    try {
      await api.adminDeleteProduct(productId);
      toast({ title: "Producto eliminado" });
      fetchProducts();
    } catch (err: any) {
      toast({ title: "No se pudo eliminar", description: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Productos</h1>
          <p className="text-sm text-muted-foreground">Gestión del catálogo — datos reales desde API</p>
        </div>
        <button onClick={startCreate} className="flex items-center gap-2 px-5 py-2.5 gradient-celeste text-white font-semibold rounded-xl text-sm hover:opacity-90 transition-opacity">
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
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Tipo</th>
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
                      <div>
                        {getDiscountPercentage(p) > 0 && (
                          <p className="text-xs text-muted-foreground line-through">₲{(Number(p.price) || 0).toLocaleString("es-PY")}</p>
                        )}
                        <p>₲{getEffectivePrice(p).toLocaleString("es-PY")}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${p.product_source_type === "dropi" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"}`}>
                        {p.product_source_type === "dropi" ? "Dropi" : "Tradexpar"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={`font-medium ${(p.stock ?? 0) > 0 ? "text-green-600" : "text-destructive"}`}>
                        {getStockLabel(p)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => startEdit(p)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted/50 text-muted-foreground" title="Editar">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button onClick={() => void handleDelete(p.id)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-destructive/10 text-muted-foreground" title="Eliminar">
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

      {openForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card border rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-4">
            <h2 className="text-xl font-semibold text-foreground">{editingId ? "Editar producto" : "Nuevo producto"}</h2>
            <div className="grid md:grid-cols-2 gap-3">
              <input className="px-3 py-2 border rounded-lg bg-background text-sm" placeholder="Nombre" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className="px-3 py-2 border rounded-lg bg-background text-sm" placeholder="SKU" value={form.sku || ""} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              <input className="px-3 py-2 border rounded-lg bg-background text-sm" placeholder="Categoría" value={form.category || ""} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              <input className="px-3 py-2 border rounded-lg bg-background text-sm" type="number" placeholder="Precio" value={form.price ?? 0} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
              <input className="px-3 py-2 border rounded-lg bg-background text-sm" type="number" placeholder="Stock" value={form.stock ?? 0} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} />
              <select className="px-3 py-2 border rounded-lg bg-background text-sm" value={form.product_source_type || "tradexpar"} onChange={(e) => setForm({ ...form, product_source_type: e.target.value as "tradexpar" | "dropi" })}>
                <option value="tradexpar">tradexpar</option>
                <option value="dropi">dropi</option>
              </select>
            </div>
            <textarea className="w-full px-3 py-2 border rounded-lg bg-background text-sm" placeholder="Descripción" rows={3} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <input className="w-full px-3 py-2 border rounded-lg bg-background text-sm" placeholder="URL imagen" value={form.image || ""} onChange={(e) => setForm({ ...form, image: e.target.value })} />

            <div className="border rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground">Descuento</p>
              <div className="grid md:grid-cols-2 gap-3">
                <select className="px-3 py-2 border rounded-lg bg-background text-sm" value={form.discount_type || ""} onChange={(e) => setForm({ ...form, discount_type: (e.target.value || null) as "percentage" | "fixed" | null })}>
                  <option value="">Sin descuento</option>
                  <option value="percentage">percentage</option>
                  <option value="fixed">fixed</option>
                </select>
                <input className="px-3 py-2 border rounded-lg bg-background text-sm" type="number" min={0} placeholder="Valor" value={form.discount_value ?? 0} onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })} />
                <input className="px-3 py-2 border rounded-lg bg-background text-sm" type="datetime-local" value={String(form.discount_starts_at || "")} onChange={(e) => setForm({ ...form, discount_starts_at: e.target.value })} />
                <input className="px-3 py-2 border rounded-lg bg-background text-sm" type="datetime-local" value={String(form.discount_ends_at || "")} onChange={(e) => setForm({ ...form, discount_ends_at: e.target.value })} />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setOpenForm(false)} className="px-4 py-2 rounded-lg border text-sm">Cancelar</button>
              <button onClick={() => void handleSave()} className="px-4 py-2 rounded-lg gradient-celeste text-white text-sm font-semibold">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
