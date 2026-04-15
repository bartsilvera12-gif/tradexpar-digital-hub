import { useEffect, useState } from "react";
import { Plus, Search, Edit, Trash2, Loader2, RefreshCw } from "lucide-react";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ADMIN_CARD,
  ADMIN_FORM_CONTROL,
  ADMIN_FORM_FIELD,
  ADMIN_FORM_HIGHLIGHT,
  ADMIN_FORM_LABEL,
  ADMIN_FORM_MODAL,
  ADMIN_FORM_TEXTAREA,
  ADMIN_TABLE,
  ADMIN_TABLE_SCROLL,
  ADMIN_TBODY,
  ADMIN_TD,
  ADMIN_TH,
  ADMIN_THEAD_ROW,
  ADMIN_TR,
} from "@/lib/adminModuleLayout";
import { formatGuaraniesInteger, parseGuaraniesInput } from "@/lib/paraguayNumberFormat";
import { tradexpar } from "@/services/tradexpar";
import { syncFastraxProducts } from "@/services/fastraxCatalog";
import { Loader, ErrorState, EmptyState } from "@/components/shared/Loader";
import type { Product } from "@/types";
import { getDiscountPercentage, getEffectivePrice, getStockLabel } from "@/lib/productHelpers";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function parsePercentDiscount(raw: string): number {
  const t = raw.replace(",", ".").replace(/[^\d.]/g, "");
  if (t === "" || t === ".") return 0;
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function formatOptionalStockInt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return "";
  return formatGuaraniesInteger(Number(n));
}

function parseOptionalStockInt(raw: string): number | null {
  const digits = raw.replace(/\D/g, "");
  if (digits === "") return null;
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(0, n), 999_999_999);
}

const emptyForm: Partial<Product> = {
  name: "",
  sku: "",
  category: "",
  description: "",
  image: "",
  images: [""],
  price: 0,
  stock: 0,
  stock_min: null,
  stock_max: null,
  product_source_type: "tradexpar",
  discount_type: null,
  discount_value: 0,
  discount_starts_at: "",
  discount_ends_at: "",
};

function imageUrlsForForm(p: Partial<Product>): string[] {
  if (p.images && p.images.length > 0) return [...p.images];
  if (p.image?.trim()) return [p.image.trim()];
  return [""];
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Product>>(emptyForm);
  const [fastraxSyncing, setFastraxSyncing] = useState(false);

  const fetchProducts = () => {
    setLoading(true);
    setError(null);
    tradexpar
      .getProducts()
      .then(setProducts)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  /** Recarga lista sin overlay (p. ej. tras sync Fastrax). */
  const refreshProductsQuiet = () => {
    tradexpar
      .getProducts()
      .then(setProducts)
      .catch((err) => setError(err.message));
  };

  useEffect(() => { fetchProducts(); }, []);

  const searchNorm = search.toLowerCase().trim();
  const filtered = products.filter((p) => {
    if (!searchNorm) return true;
    const name = (p.name ?? "").toLowerCase();
    const sku = (p.sku ?? "").toLowerCase();
    return name.includes(searchNorm) || sku.includes(searchNorm);
  });

  const handleFastraxSync = async () => {
    if (fastraxSyncing) return;
    setFastraxSyncing(true);
    try {
      const res = await syncFastraxProducts();
      const s = res.stats;
      const nothingWritten = s.inserted + s.updated === 0 && s.failed > 0 && res.products_seen > 0;
      const partialOk = s.inserted + s.updated > 0 && s.failed > 0;
      const lines = [
        `Procesados (API): ${res.products_seen}`,
        res.sync_mode_used ? `Modo: ${res.sync_mode_used}${res.changed_fallback_used ? " (fallback desde ope=99)" : ""}` : null,
        `Nuevos ${s.inserted}, actualizados ${s.updated}`,
        s.unchanged ? `Sin cambios: ${s.unchanged}` : null,
        s.skipped ? `Omitidos: ${s.skipped}` : null,
        s.images_fetched ? `Imágenes: ${s.images_fetched}` : null,
        s.failed ? `Fallidos: ${s.failed}` : null,
        s.deactivated ? `Marcados inactivos: ${s.deactivated}` : null,
        res.db_error_sample ? `DB: ${res.db_error_sample}` : null,
      ].filter(Boolean);
      if (nothingWritten && s.failed > 0) {
        toast({
          variant: "destructive",
          title: "Fastrax: no se guardó ningún producto",
          description: lines.join(" · "),
        });
      } else if (partialOk) {
        toast({
          title: "Fastrax: sincronización parcial",
          description: lines.join(" · "),
        });
      } else {
        toast({
          title: "Fastrax actualizado",
          description: lines.join(" · "),
        });
      }
      refreshProductsQuiet();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({
        variant: "destructive",
        title: "No se pudo sincronizar Fastrax",
        description: msg,
      });
    } finally {
      setFastraxSyncing(false);
    }
  };

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setOpenForm(true);
  };

  const startEdit = (product: Product) => {
    setEditingId(product.id);
    setForm({
      ...product,
      images: imageUrlsForForm(product),
      discount_starts_at: product.discount_starts_at || "",
      discount_ends_at: product.discount_ends_at || "",
      discount_value: product.discount_value || 0,
      discount_type: product.discount_type || null,
    });
    setOpenForm(true);
  };

  const handleSave = async () => {
    try {
      const smin = form.stock_min ?? null;
      const smax = form.stock_max ?? null;
      if (smin != null && smax != null && smax < smin) {
        toast({
          variant: "destructive",
          title: "Revisá los stocks",
          description: "El stock máximo no puede ser menor que el stock mínimo.",
        });
        return;
      }
      const urls = (form.images ?? []).map((s) => String(s).trim()).filter(Boolean);
      const payload = {
        ...form,
        image: urls[0] ?? "",
        images: urls,
        discount_value: Math.max(0, Number(form.discount_value || 0)),
        stock_min: smin,
        stock_max: smax,
      };
      if (editingId) {
        await tradexpar.adminUpdateProduct(editingId, payload);
        toast({ title: "Producto actualizado" });
      } else {
        await tradexpar.adminCreateProduct(payload);
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
      await tradexpar.adminDeleteProduct(productId);
      toast({ title: "Producto eliminado" });
      fetchProducts();
    } catch (err: any) {
      toast({ title: "No se pudo eliminar", description: err.message });
    }
  };

  const headerActions = (
    <div className="flex flex-row flex-wrap items-center justify-end gap-2 w-full lg:w-auto shrink-0">
      <Button
        type="button"
        variant="outline"
        size="default"
        onClick={() => void handleFastraxSync()}
        disabled={fastraxSyncing}
        className="gap-2 min-h-10 whitespace-nowrap"
        aria-label="Sincronizar catálogo Fastrax"
      >
        {fastraxSyncing ? (
          <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
        ) : (
          <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
        )}
        Actualizar productos Fastrax
      </Button>
      <Button
        type="button"
        onClick={startCreate}
        className="gap-2 gradient-celeste text-primary-foreground shadow-sm min-h-10 whitespace-nowrap"
        aria-label="Crear producto nuevo"
      >
        <Plus className="h-4 w-4" />
        Nuevo producto
      </Button>
    </div>
  );

  return (
    <AdminPageShell
      title="Productos"
      description="Administrá el catálogo local. Los productos Fastrax se guardan aquí y usan el mismo flujo de carrito y pedidos que el resto."
      actions={headerActions}
    >
      <div className="space-y-3 w-full">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-2.5 w-full">
          Buscar en catálogo
        </p>
        <div className="relative flex-1 min-w-0 w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Nombre o SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(ADMIN_FORM_CONTROL, "pl-10 w-full")}
          />
        </div>
      </div>

      {loading && <Loader text="Cargando productos..." />}
      {error && <ErrorState message={error} onRetry={fetchProducts} />}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState title="Sin productos" description="No se encontraron productos en el catálogo." />
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className={ADMIN_CARD}>
          <div className={ADMIN_TABLE_SCROLL}>
            <table className={ADMIN_TABLE}>
              <thead>
                <tr className={ADMIN_THEAD_ROW}>
                  <th className={ADMIN_TH}>Producto</th>
                  <th className={ADMIN_TH}>SKU</th>
                  <th className={ADMIN_TH}>Categoría</th>
                  <th className={`${ADMIN_TH} text-right`}>Precio</th>
                  <th className={ADMIN_TH}>Tipo</th>
                  <th className={`${ADMIN_TH} text-right`}>Stock</th>
                  <th className={`${ADMIN_TH} text-right`}>Acciones</th>
                </tr>
              </thead>
              <tbody className={ADMIN_TBODY}>
                {filtered.map((p) => (
                  <tr key={p.id} className={ADMIN_TR}>
                    <td className={ADMIN_TD}>
                      <div className="flex items-center gap-3">
                        {p.images?.[0] || p.image ? (
                          <img
                            src={p.images?.[0] || p.image}
                            alt={p.name}
                            className="w-10 h-10 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-muted/30 flex items-center justify-center shrink-0">
                            <span className="text-[8px] text-muted-foreground">[img]</span>
                          </div>
                        )}
                        <span className="font-medium text-foreground">{p.name}</span>
                      </div>
                    </td>
                    <td className={`${ADMIN_TD} font-mono text-muted-foreground`}>{p.sku || "—"}</td>
                    <td className={ADMIN_TD}>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                        {p.category || "—"}
                      </span>
                    </td>
                    <td className={`${ADMIN_TD} text-right text-foreground`}>
                      <div>
                        {getDiscountPercentage(p) > 0 && (
                          <p className="text-xs text-muted-foreground line-through">₲{(Number(p.price) || 0).toLocaleString("es-PY")}</p>
                        )}
                        <p>₲{getEffectivePrice(p).toLocaleString("es-PY")}</p>
                      </div>
                    </td>
                    <td className={ADMIN_TD}>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          p.product_source_type === "dropi"
                            ? "bg-violet-100 text-violet-700"
                            : p.product_source_type === "fastrax"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {p.product_source_type === "dropi"
                          ? "Dropi"
                          : p.product_source_type === "fastrax"
                            ? "Fastrax"
                            : "Tradexpar"}
                      </span>
                    </td>
                    <td className={`${ADMIN_TD} text-right`}>
                      <span className={`font-medium ${(p.stock ?? 0) > 0 ? "text-green-600" : "text-destructive"}`}>
                        {getStockLabel(p)}
                      </span>
                    </td>
                    <td className={`${ADMIN_TD} text-right`}>
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
          <div className={cn(ADMIN_FORM_MODAL, "max-w-2xl")}>
            <h2 className="text-xl font-semibold text-foreground">{editingId ? "Editar producto" : "Nuevo producto"}</h2>
            <div className="grid md:grid-cols-2 gap-3">
              <div className={ADMIN_FORM_FIELD}>
                <Label htmlFor="prod-name" className={ADMIN_FORM_LABEL}>
                  Nombre
                </Label>
                <Input
                  id="prod-name"
                  className={ADMIN_FORM_CONTROL}
                  placeholder="Nombre del producto"
                  value={form.name || ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className={ADMIN_FORM_FIELD}>
                <Label htmlFor="prod-sku" className={ADMIN_FORM_LABEL}>
                  SKU
                </Label>
                <Input
                  id="prod-sku"
                  className={ADMIN_FORM_CONTROL}
                  placeholder="Código SKU"
                  value={form.sku || ""}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                />
              </div>
              <div className={ADMIN_FORM_FIELD}>
                <Label htmlFor="prod-cat" className={ADMIN_FORM_LABEL}>
                  Categoría
                </Label>
                <Input
                  id="prod-cat"
                  className={ADMIN_FORM_CONTROL}
                  placeholder="Categoría"
                  value={form.category || ""}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
              </div>
              <div className={ADMIN_FORM_FIELD}>
                <Label htmlFor="prod-price" className={ADMIN_FORM_LABEL}>
                  Precio (₲)
                </Label>
                <Input
                  id="prod-price"
                  className={cn(ADMIN_FORM_CONTROL, "tabular-nums")}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0"
                  value={formatGuaraniesInteger(form.price ?? 0)}
                  onChange={(e) => setForm({ ...form, price: parseGuaraniesInput(e.target.value) })}
                />
              </div>
              <div className={ADMIN_FORM_FIELD}>
                <Label htmlFor="prod-stock" className={ADMIN_FORM_LABEL}>
                  Stock
                </Label>
                <Input
                  id="prod-stock"
                  className={cn(ADMIN_FORM_CONTROL, "tabular-nums")}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0"
                  value={formatGuaraniesInteger(form.stock ?? 0)}
                  onChange={(e) => setForm({ ...form, stock: parseGuaraniesInput(e.target.value) })}
                />
              </div>
              <div className={ADMIN_FORM_FIELD}>
                <Label className={ADMIN_FORM_LABEL}>Origen del catálogo</Label>
                <Select
                  value={form.product_source_type || "tradexpar"}
                  onValueChange={(v) =>
                    setForm({ ...form, product_source_type: v as "tradexpar" | "dropi" | "fastrax" })
                  }
                >
                  <SelectTrigger className={ADMIN_FORM_CONTROL}>
                    <SelectValue placeholder="Elegí origen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tradexpar">Tradexpar</SelectItem>
                    <SelectItem value="dropi">Dropi</SelectItem>
                    <SelectItem value="fastrax">Fastrax (recomendado vía sincronización)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className={ADMIN_FORM_FIELD}>
                <Label htmlFor="prod-stock-min" className={ADMIN_FORM_LABEL}>
                  Stock mínimo
                </Label>
                <Input
                  id="prod-stock-min"
                  className={cn(ADMIN_FORM_CONTROL, "tabular-nums")}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Opcional"
                  value={formatOptionalStockInt(form.stock_min)}
                  onChange={(e) => setForm({ ...form, stock_min: parseOptionalStockInt(e.target.value) })}
                />
                <p className="text-[11px] text-muted-foreground mt-1">Vacío = sin umbral definido.</p>
              </div>
              <div className={ADMIN_FORM_FIELD}>
                <Label htmlFor="prod-stock-max" className={ADMIN_FORM_LABEL}>
                  Stock máximo
                </Label>
                <Input
                  id="prod-stock-max"
                  className={cn(ADMIN_FORM_CONTROL, "tabular-nums")}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Opcional"
                  value={formatOptionalStockInt(form.stock_max)}
                  onChange={(e) => setForm({ ...form, stock_max: parseOptionalStockInt(e.target.value) })}
                />
                <p className="text-[11px] text-muted-foreground mt-1">Vacío = sin tope definido.</p>
              </div>
            </div>
            <div className={ADMIN_FORM_FIELD}>
              <Label htmlFor="prod-desc" className={ADMIN_FORM_LABEL}>
                Descripción
              </Label>
              <textarea
                id="prod-desc"
                className={ADMIN_FORM_TEXTAREA}
                placeholder="Descripción"
                rows={3}
                value={form.description || ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className={ADMIN_FORM_FIELD}>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                <Label className={ADMIN_FORM_LABEL}>Imágenes (URLs)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 text-xs w-fit"
                  onClick={() => {
                    const cur = form.images?.length ? [...form.images] : imageUrlsForForm(form);
                    setForm({ ...form, images: [...cur, ""] });
                  }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Añadir URL
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                La primera URL es la imagen principal en listados; las demás forman la galería en la ficha del producto.
              </p>
              <div className="space-y-2">
                {(form.images?.length ? form.images : imageUrlsForForm(form)).map((url, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <div className="flex-1 min-w-0 space-y-1">
                      <Input
                        id={idx === 0 ? "prod-img-0" : undefined}
                        className={ADMIN_FORM_CONTROL}
                        placeholder="https://…"
                        value={url}
                        onChange={(e) => {
                          const rows = [...(form.images?.length ? form.images : imageUrlsForForm(form))];
                          rows[idx] = e.target.value;
                          const trimmed = rows.map((s) => s.trim()).filter(Boolean);
                          setForm({
                            ...form,
                            images: rows,
                            image: trimmed[0] ?? "",
                          });
                        }}
                      />
                      {url.trim() ? (
                        <div className="flex items-center gap-2">
                          <img
                            src={url.trim()}
                            alt=""
                            className="h-12 w-12 rounded-md object-cover border border-border/60 bg-muted/20"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.visibility = "hidden";
                            }}
                          />
                          <span className="text-[10px] text-muted-foreground">
                            {idx === 0 ? "Principal" : `Galería ${idx + 1}`}
                          </span>
                        </div>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      title={form.images && form.images.length <= 1 ? "Debe quedar al menos un campo" : "Quitar URL"}
                      disabled={!(form.images && form.images.length > 1)}
                      onClick={() => {
                        const rows = [...(form.images ?? imageUrlsForForm(form))];
                        if (rows.length <= 1) {
                          setForm({ ...form, images: [""], image: "" });
                          return;
                        }
                        rows.splice(idx, 1);
                        const trimmed = rows.map((s) => s.trim()).filter(Boolean);
                        setForm({ ...form, images: rows, image: trimmed[0] ?? "" });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className={ADMIN_FORM_HIGHLIGHT}>
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_100%_0%,hsl(195_89%_47%_/_0.08),transparent_60%)]"
                aria-hidden
              />
              <div className="relative">
                <p className="text-sm font-semibold text-foreground">Descuento promocional</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Por porcentaje sobre el precio, o monto fijo en guaraníes. Las fechas delimitan cuándo aplica.
                </p>
              </div>
              <div className="relative grid md:grid-cols-2 gap-3">
                <div className={ADMIN_FORM_FIELD}>
                  <Label className={ADMIN_FORM_LABEL}>Tipo de descuento</Label>
                  <Select
                    value={form.discount_type ?? "__none"}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        discount_type: v === "__none" ? null : (v as "percentage" | "fixed"),
                        discount_value: v === "__none" ? 0 : form.discount_value,
                      })
                    }
                  >
                    <SelectTrigger className={ADMIN_FORM_CONTROL}>
                      <SelectValue placeholder="Sin descuento" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Sin descuento</SelectItem>
                      <SelectItem value="percentage">Por porcentaje</SelectItem>
                      <SelectItem value="fixed">Monto fijo (₲)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className={ADMIN_FORM_FIELD}>
                  <Label htmlFor="prod-disc-val" className={ADMIN_FORM_LABEL}>
                    {form.discount_type === "percentage"
                      ? "Porcentaje de descuento"
                      : form.discount_type === "fixed"
                        ? "Monto a descontar (₲)"
                        : "Valor"}
                  </Label>
                  <div className="relative">
                    <Input
                      id="prod-disc-val"
                      className={cn(
                        ADMIN_FORM_CONTROL,
                        "tabular-nums",
                        form.discount_type === "percentage" ? "pr-9" : "",
                        !form.discount_type ? "opacity-50 pointer-events-none" : ""
                      )}
                      disabled={!form.discount_type}
                      inputMode={form.discount_type === "percentage" ? "decimal" : "numeric"}
                      autoComplete="off"
                      placeholder={
                        form.discount_type === "percentage"
                          ? "Ej. 15"
                          : form.discount_type === "fixed"
                            ? "0"
                            : "—"
                      }
                      value={
                        !form.discount_type
                          ? ""
                          : form.discount_type === "percentage"
                            ? form.discount_value === 0
                              ? ""
                              : String(form.discount_value).replace(/\./g, ",")
                            : formatGuaraniesInteger(form.discount_value ?? 0)
                      }
                      onChange={(e) => {
                        if (!form.discount_type) return;
                        if (form.discount_type === "percentage") {
                          setForm({ ...form, discount_value: parsePercentDiscount(e.target.value) });
                        } else {
                          setForm({ ...form, discount_value: parseGuaraniesInput(e.target.value) });
                        }
                      }}
                    />
                    {form.discount_type === "percentage" ? (
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        %
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className={ADMIN_FORM_FIELD}>
                  <Label htmlFor="prod-disc-start" className={ADMIN_FORM_LABEL}>
                    Inicio del descuento
                  </Label>
                  <Input
                    id="prod-disc-start"
                    type="datetime-local"
                    className={ADMIN_FORM_CONTROL}
                    value={String(form.discount_starts_at || "")}
                    onChange={(e) => setForm({ ...form, discount_starts_at: e.target.value })}
                  />
                </div>
                <div className={ADMIN_FORM_FIELD}>
                  <Label htmlFor="prod-disc-end" className={ADMIN_FORM_LABEL}>
                    Fin del descuento
                  </Label>
                  <Input
                    id="prod-disc-end"
                    type="datetime-local"
                    className={ADMIN_FORM_CONTROL}
                    value={String(form.discount_ends_at || "")}
                    onChange={(e) => setForm({ ...form, discount_ends_at: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setOpenForm(false)}>
                Cancelar
              </Button>
              <Button type="button" className="gradient-celeste text-primary-foreground shadow-sm" onClick={() => void handleSave()}>
                Guardar
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}
