import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Loader2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import {
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
import {
  importFastraxItemsToCatalog,
  searchFastraxProductsForAdmin,
  type FastraxAdminListItem,
} from "@/services/fastraxAdminApi";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = {
  onLocalCatalogRefresh?: () => void;
};

export function AdminFastraxImportPanel({ onLocalCatalogRefresh }: Props) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [textFilter, setTextFilter] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [onlyStock, setOnlyStock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<FastraxAdminListItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailJson, setDetailJson] = useState<string>("");

  const load = useCallback(
    async (p: number) => {
    setLoading(true);
    try {
      const r = await searchFastraxProductsForAdmin({
        page: p,
        size,
        search: appliedSearch || undefined,
        only_stock: onlyStock,
      });
      if (r && "ok" in r && r.ok) {
        setPage(r.page);
        setRows(r.items);
      } else {
        setRows([]);
        const m = (r as { message?: string; error?: string })?.message || (r as { error?: string })?.error;
        throw new Error(typeof m === "string" && m ? m : "Búsqueda Fastrax falló");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ variant: "destructive", title: "Fastrax", description: msg });
    } finally {
      setLoading(false);
    }
    },
    [size, appliedSearch, onlyStock]
  );

  useEffect(() => {
    void load(page);
  }, [load, page, size, onlyStock, appliedSearch]);

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedSearch(textFilter.trim());
    setPage(1);
    setSelected(new Set());
  };

  const toggle = (sku: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(sku)) n.delete(sku);
      else n.add(sku);
      return n;
    });
  };

  const doImport = async (items: FastraxAdminListItem[]) => {
    if (items.length === 0) {
      toast({ title: "Elegí al menos un producto" });
      return;
    }
    setImporting(true);
    try {
      const r = await importFastraxItemsToCatalog(
        items.map((it) => ({
          sku: it.sku,
          name: it.name,
          price: it.price,
          stock: it.stock,
          raw_detail: it.raw_detail ?? null,
        }))
      );
      const line = `Nuevos ${r.inserted}, actualizados ${r.updated}, fallos ${r.failed}`;
      if (r.failed) {
        toast({ title: "Importación con errores", description: line, variant: "default" });
      } else {
        toast({ title: "Importado", description: line });
      }
      onLocalCatalogRefresh?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ variant: "destructive", title: "Import", description: msg });
    } finally {
      setImporting(false);
    }
  };

  const openDetail = async (sku: string) => {
    setDetailOpen(true);
    setDetailJson("…");
    try {
      const r = await searchFastraxProductsForAdmin({ sku, size: 1, page: 1 });
      if (r && "ok" in r && r.ok) {
        const raw = r.items[0]?.raw_detail;
        if (raw != null) {
          setDetailJson(JSON.stringify(raw, null, 2));
        } else {
          setDetailJson(JSON.stringify(r, null, 2));
        }
      } else {
        setDetailJson("Sin datos");
      }
    } catch (e) {
      setDetailJson(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-4 w-full max-w-6xl">
      <p className="text-sm text-muted-foreground max-w-2xl">
        Consultá el catálogo Fastrax en la nube, elegí SKUs e importalos a tu base local. Nada se guarda hasta
        presionar <strong>Importar</strong>.
      </p>

      <form onSubmit={onSearchSubmit} className="flex flex-col sm:flex-row flex-wrap gap-3 sm:items-end">
        <div className="flex-1 min-w-[160px] max-w-sm space-y-1.5">
          <Label htmlFor="fastrax-filter-text" className={ADMIN_FORM_LABEL}>
            Buscar (nombre o SKU, esta página)
          </Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="fastrax-filter-text"
              className={cn(ADMIN_FORM_CONTROL, "pl-9")}
              value={textFilter}
              onChange={(e) => setTextFilter(e.target.value)}
              placeholder="Ej. tornillo, 185…"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 pb-0.5">
          <Checkbox
            id="fastrax-only-stock"
            checked={onlyStock}
            onCheckedChange={(v) => {
              setOnlyStock(v === true);
            }}
          />
          <label htmlFor="fastrax-only-stock" className="text-sm text-foreground cursor-pointer">
            Solo con stock
          </label>
        </div>
        <div className={cn(ADMIN_FORM_FIELD, "w-24")}>
          <Label htmlFor="fastrax-tam" className={ADMIN_FORM_LABEL}>
            Cant./pág.
          </Label>
          <Input
            id="fastrax-tam"
            type="number"
            min={1}
            max={20}
            className={cn(ADMIN_FORM_CONTROL, "tabular-nums")}
            value={String(size)}
            onChange={(e) => {
              const n = Math.max(1, Math.min(20, Number(e.target.value) || 20));
              setSize(n);
            }}
          />
        </div>
        <Button type="submit" disabled={loading} className="gap-1.5" variant="secondary">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Buscar
        </Button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Pág. {page} · {rows.length} fila(s) en esta vista (máx. 20 por pág., ope=4+ope=2)
        </p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => {
              if (page <= 1) return;
              setPage((p) => p - 1);
            }}
            disabled={page <= 1 || loading}
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium tabular-nums px-2 min-w-[5rem] text-center">Pág. {page}</span>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => setPage((p) => p + 1)}
            disabled={loading}
            aria-label="Página siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => void doImport(rows.filter((r) => selected.has(r.sku)))}
          disabled={importing || selected.size === 0}
          className="gap-2"
        >
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Importar seleccionados{selected.size > 0 ? ` (${selected.size})` : ""}
        </Button>
      </div>

      <div className={ADMIN_TABLE_SCROLL}>
        <table className={ADMIN_TABLE}>
          <thead>
            <tr className={ADMIN_THEAD_ROW}>
              <th className={`${ADMIN_TH} w-10`} />
              <th className={ADMIN_TH}>SKU</th>
              <th className={ADMIN_TH}>Nombre</th>
              <th className={`${ADMIN_TH} text-right`}>Stock</th>
              <th className={`${ADMIN_TH} text-right`}>Precio (₲)</th>
              <th className={ADMIN_TH}>Estado</th>
              <th className={`${ADMIN_TH} text-right`}>Acciones</th>
            </tr>
          </thead>
          <tbody className={ADMIN_TBODY}>
            {loading && (
              <tr>
                <td colSpan={7} className={`${ADMIN_TD} text-center text-muted-foreground py-6`}>
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className={`${ADMIN_TD} text-center text-muted-foreground py-6`}>
                  No hay resultados. Probá otra búsqueda o página.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => (
                <tr key={row.sku} className={ADMIN_TR}>
                  <td className={ADMIN_TD}>
                    <Checkbox
                      checked={selected.has(row.sku)}
                      onCheckedChange={() => toggle(row.sku)}
                      aria-label={`Seleccionar ${row.sku}`}
                    />
                  </td>
                  <td className={cn(ADMIN_TD, "font-mono")}>{row.sku}</td>
                  <td className={ADMIN_TD}>{row.name}</td>
                  <td className={`${ADMIN_TD} text-right tabular-nums`}>{row.stock.toLocaleString("es-PY")}</td>
                  <td className={`${ADMIN_TD} text-right tabular-nums`}>
                    {Math.floor(row.price).toLocaleString("es-PY")}
                  </td>
                  <td className={ADMIN_TD}>
                    <span
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-full",
                        (row.stock ?? 0) > 0
                          ? "bg-emerald-100 text-emerald-900"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {row.price > 0 ? (row.stock > 0 ? "Vendible" : "Sin stock") : "Precio 0"}
                    </span>
                  </td>
                  <td className={`${ADMIN_TD} text-right`}>
                    <div className="inline-flex items-center justify-end gap-1">
                      <Button type="button" size="sm" variant="secondary" onClick={() => void openDetail(row.sku)} className="h-8">
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        Ver detalle
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void doImport([row])}
                        disabled={importing}
                        className="h-8"
                      >
                        <Download className="h-3.5 w-3.5 mr-1" />
                        Importar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle Fastrax (ope=2, respuesta API)</DialogTitle>
          </DialogHeader>
          <pre className="text-xs bg-muted/40 rounded-md p-3 overflow-x-auto font-mono whitespace-pre-wrap break-all">
            {detailJson}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
