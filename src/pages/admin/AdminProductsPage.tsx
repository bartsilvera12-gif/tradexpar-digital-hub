import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Package, Plus, Search, Edit, Trash2 } from "lucide-react";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminFastraxImportPanel } from "@/components/admin/AdminFastraxImportPanel";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
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
import { syncDropiTest } from "@/services/dropiCatalog";
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
  const [activeTab, setActiveTab] = useState<"catalog" | "fastrax">("catalog");
  const [dropiImportId, setDropiImportId] = useState("");
  const [dropiImportLoading, setDropiImportLoading] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<"all" | "tradexpar" | "dropi" | "fastrax">("all");
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogPageSize, setCatalogPageSize] = useState(20);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

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
    if (sourceFilter !== "all") {
      const t = p.product_source_type ?? "tradexpar";
      if (sourceFilter === "tradexpar" && t !== "tradexpar") return false;
      if (sourceFilter === "dropi" && t !== "dropi") return false;
      if (sourceFilter === "fastrax" && t !== "fastrax") return false;
    }
    if (!searchNorm) return true;
    const name = (p.name ?? "").toLowerCase();
    const sku = (p.sku ?? "").toLowerCase();
    return name.includes(searchNorm) || sku.includes(searchNorm);
  });

  useEffect(() => {
    setCatalogPage(1);
  }, [search, sourceFilter]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filtered.length / catalogPageSize) || 1),
    [filtered.length, catalogPageSize]
  );

  useEffect(() => {
    if (catalogPage > totalPages) setCatalogPage(totalPages);
  }, [catalogPage, totalPages]);

  const currentCatalogPage = Math.min(catalogPage, totalPages);

  const pagedProducts = useMemo(() => {
    const start = (currentCatalogPage - 1) * catalogPageSize;
    return filtered.slice(start, start + catalogPageSize);
  }, [filtered, currentCatalogPage, catalogPageSize]);

  const showFrom = filtered.length === 0 ? 0 : (currentCatalogPage - 1) * catalogPageSize + 1;
  const showTo = Math.min(currentCatalogPage * catalogPageSize, filtered.length);
  const pageIdList = pagedProducts.map((p) => p.id);
  const allOnPageSelected =
    pageIdList.length > 0 && pageIdList.every((id) => selectedProductIds.has(id));
  const someOnPageSelected =
    pageIdList.some((id) => selectedProductIds.has(id)) && !allOnPageSelected;

  const handleDropiImportById = async () => {
    if (dropiImportLoading) return;
    const trimmed = dropiImportId.trim();
    if (!trimmed) {
      toast({
        variant: "destructive",
        title: "Indicá un ID",
        description: "Ingresá el ID numérico del producto en Dropi (bridge).",
      });
      return;
    }
    const idPayload = /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
    setDropiImportLoading(true);
    try {
      const res = await syncDropiTest([idPayload]);
      const s = res.stats;
      const lines = [
        `Leídos ${s.total_read}`,
        `Nuevos ${s.created}, actualizados ${s.updated}`,
        s.unchanged ? `Sin cambios (CRC): ${s.unchanged}` : null,
        s.duplicates_skipped ? `Duplicados evitados (SKU ocupado): ${s.duplicates_skipped}` : null,
        s.images_queued ? `Imágenes en cola: ${s.images_queued}` : null,
        s.failed ? `Fallidos: ${s.failed}` : null,
        s.errors_sample?.length ? `Ej.: ${s.errors_sample[0]}` : null,
      ].filter(Boolean);
      const bad = Boolean(s.failed && s.created + s.updated + s.unchanged === 0);
      toast({
        title: bad ? "Dropi: no se importó el producto" : "Producto Dropi importado",
        ...(bad ? { variant: "destructive" as const } : {}),
        description: lines.join(" · "),
      });
      if (!bad) {
        refreshProductsQuiet();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({
        variant: "destructive",
        title: "No se pudo importar desde Dropi",
        description: msg,
      });
    } finally {
      setDropiImportLoading(false);
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
      setSelectedProductIds((prev) => {
        const n = new Set(prev);
        n.delete(productId);
        return n;
      });
      toast({ title: "Producto eliminado" });
      fetchProducts();
    } catch (err: any) {
      toast({ title: "No se pudo eliminar", description: err.message });
    }
  };

  const toggleSelectProduct = (id: string) => {
    setSelectedProductIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleSelectAllOnPage = () => {
    setSelectedProductIds((prev) => {
      const n = new Set(prev);
      if (allOnPageSelected) {
        pageIdList.forEach((id) => n.delete(id));
      } else {
        pageIdList.forEach((id) => n.add(id));
      }
      return n;
    });
  };

  const clearSelection = () => {
    setSelectedProductIds(new Set());
  };

  const handleDeleteSelected = async () => {
    if (selectedProductIds.size === 0) {
      toast({ title: "No hay productos seleccionados" });
      return;
    }
    const n = selectedProductIds.size;
    if (!window.confirm(`¿Eliminar ${n} producto(s) del catálogo? No se puede deshacer.`)) {
      return;
    }
    setBulkDeleting(true);
    const ids = [...selectedProductIds];
    let ok = 0;
    let err = 0;
    for (const id of ids) {
      try {
        await tradexpar.adminDeleteProduct(id);
        ok += 1;
      } catch {
        err += 1;
      }
    }
    setSelectedProductIds(new Set());
    setBulkDeleting(false);
    void fetchProducts();
    if (err) {
      toast({
        variant: "destructive",
        title: "Eliminación parcial",
        description: `Confirmados: ${ok}. Con error: ${err}.`,
      });
    } else {
      toast({ title: "Productos eliminados", description: `Se quitaron ${ok} fila(s).` });
    }
  };

  const headerActions = (
    <div className="flex flex-row flex-wrap items-center justify-end gap-2 w-full lg:w-auto shrink-0">
      {activeTab === "catalog" && (
        <Button
          type="button"
          onClick={startCreate}
          className="gap-2 min-h-10 whitespace-nowrap"
          aria-label="Crear producto nuevo"
        >
          <Plus className="h-4 w-4" />
          Nuevo producto
        </Button>
      )}
    </div>
  );

  return (
    <AdminPageShell
      title="Productos"
      description="Administrá el catálogo local. Los productos Fastrax se guardan aquí y usan el mismo flujo de carrito y pedidos que el resto."
      actions={headerActions}
    >
      <div className="w-full">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v === "fastrax" ? "fastrax" : "catalog")}
          className="w-full"
        >
          <TabsList className="mb-3 w-full sm:w-auto">
            <TabsTrigger value="catalog" className="gap-1.5">
              <Search className="h-3.5 w-3.5" />
              Catálogo
            </TabsTrigger>
            <TabsTrigger value="fastrax" className="gap-1.5">
              <Package className="h-3.5 w-3.5" />
              Fastrax
            </TabsTrigger>
          </TabsList>

          <TabsContent value="fastrax" className="mt-0 outline-none">
            <AdminFastraxImportPanel onLocalCatalogRefresh={refreshProductsQuiet} />
          </TabsContent>

          <TabsContent value="catalog" className="mt-0 w-full outline-none">
            <div className="space-y-3 w-full">
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">Importar producto Dropi por ID</p>
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:items-end max-w-lg">
            <div className="flex-1 min-w-[140px] space-y-1.5">
              <Label htmlFor="dropi-import-id" className="sr-only">
                ID producto Dropi
              </Label>
              <Input
                id="dropi-import-id"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Ej: 14906"
                value={dropiImportId}
                onChange={(e) => setDropiImportId(e.target.value)}
                disabled={dropiImportLoading}
                className={ADMIN_FORM_CONTROL}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="min-h-10 shrink-0 inline-flex items-center"
              disabled={dropiImportLoading}
              onClick={() => void handleDropiImportById()}
              aria-busy={dropiImportLoading}
            >
              {dropiImportLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin shrink-0 mr-2" aria-hidden />
                  Importando…
                </>
              ) : (
                "Importar"
              )}
            </Button>
          </div>
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-2.5 w-full">
          Buscar en catálogo
        </p>
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-end w-full">
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
          <div className={ADMIN_FORM_FIELD}>
            <Label htmlFor="prod-source-filter" className={ADMIN_FORM_LABEL}>
              Origen
            </Label>
            <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as typeof sourceFilter)}>
              <SelectTrigger id="prod-source-filter" className={cn(ADMIN_FORM_CONTROL, "w-full sm:w-[200px]")}>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los orígenes</SelectItem>
                <SelectItem value="tradexpar">Tradexpar / manual</SelectItem>
                <SelectItem value="dropi">Dropi</SelectItem>
                <SelectItem value="fastrax">Fastrax</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

      {loading && <Loader text="Cargando productos..." />}
      {error && <ErrorState message={error} onRetry={fetchProducts} />}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState title="Sin productos" description="No se encontraron productos en el catálogo." />
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className={ADMIN_CARD}>
          <div className="flex flex-col gap-3 p-3 border-b border-border">
            <p className="text-sm text-muted-foreground">
              {filtered.length} producto(s) · Página {currentCatalogPage} de {totalPages}
              {filtered.length > 0
                ? ` · Mostrando ${showFrom}–${showTo} en esta hoja${selectedProductIds.size > 0 ? ` · ${selectedProductIds.size} seleccionado(s)` : ""}`
                : ""}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
              <div className="flex w-fit max-w-full shrink-0 items-center gap-1.5 rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5 pr-3">
                <Label
                  htmlFor="admin-catalog-page-size"
                  className="whitespace-nowrap text-xs text-muted-foreground"
                >
                  Por página
                </Label>
                <Select
                  value={String(catalogPageSize)}
                  onValueChange={(v) => {
                    setCatalogPageSize(Number(v) || 20);
                    setCatalogPage(1);
                  }}
                >
                  <SelectTrigger
                    id="admin-catalog-page-size"
                    className={cn(ADMIN_FORM_CONTROL, "h-9 w-[4.5rem] text-sm bg-background")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  {/*
                    align="end": alinea el ancho mín. del listado con el borde derecho del trigger, para
                    que el desplegable no invada la fila hacia el botón rojo (el menú gana a la izquierda).
                  */}
                  <SelectContent
                    position="popper"
                    side="bottom"
                    align="end"
                    sideOffset={6}
                    className="min-w-[4.5rem] z-[200]"
                    avoidCollisions
                    collisionPadding={8}
                  >
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex w-full min-w-0 flex-wrap items-center justify-start gap-2 sm:ml-auto sm:w-auto sm:justify-end sm:pl-2">
                {selectedProductIds.size > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 shrink-0 text-xs"
                    onClick={clearSelection}
                  >
                    Quitar selección
                  </Button>
                )}
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-9 shrink-0 gap-1.5"
                  disabled={selectedProductIds.size === 0 || bulkDeleting}
                  onClick={() => void handleDeleteSelected()}
                >
                  {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Eliminar seleccionados
                  {selectedProductIds.size > 0 ? ` (${selectedProductIds.size})` : ""}
                </Button>
              </div>
            </div>
          </div>
          <div className={ADMIN_TABLE_SCROLL}>
            <table className={ADMIN_TABLE}>
              <thead>
                <tr className={ADMIN_THEAD_ROW}>
                  <th className={cn(ADMIN_TH, "w-10 pl-2")} scope="col">
                    <span className="sr-only">Seleccionar fila</span>
                    <Checkbox
                      className="align-middle"
                      checked={
                        allOnPageSelected
                          ? true
                          : someOnPageSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={() => toggleSelectAllOnPage()}
                      aria-label="Seleccionar todos en esta página"
                    />
                  </th>
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
                {pagedProducts.map((p) => (
                  <tr key={p.id} className={ADMIN_TR}>
                    <td className={cn(ADMIN_TD, "w-10 pl-2")}>
                      <Checkbox
                        checked={selectedProductIds.has(p.id)}
                        onCheckedChange={() => toggleSelectProduct(p.id)}
                        aria-label={`Seleccionar ${p.name || p.sku || p.id}`}
                      />
                    </td>
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
                        <span className="ms-1.5 text-xs font-normal text-muted-foreground tabular-nums">
                          ({(p.stock ?? 0).toLocaleString("es-PY")})
                        </span>
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
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 p-3 border-t border-border">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                disabled={currentCatalogPage <= 1}
                onClick={() => setCatalogPage((p) => Math.max(1, p - 1))}
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground min-w-[8.5rem] text-center tabular-nums">
                {currentCatalogPage} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                disabled={currentCatalogPage >= totalPages}
                onClick={() => setCatalogPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Página siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

            </div>
          </TabsContent>
        </Tabs>
      </div>

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
                    <SelectItem value="fastrax">Fastrax (importar desde la pestaña Fastrax)</SelectItem>
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
              <div>
                <p className="text-sm font-semibold text-foreground">Descuento promocional</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Por porcentaje sobre el precio, o monto fijo en guaraníes. Las fechas delimitan cuándo aplica.
                </p>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
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
              <Button type="button" onClick={() => void handleSave()}>
                Guardar
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}
