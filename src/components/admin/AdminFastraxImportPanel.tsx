import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Globe, Loader2, RefreshCcw, Search, Zap } from "lucide-react";
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
  importFastraxPageOnServer,
  importFastraxPageRangeOnServer,
  listFastraxProductsFastForAdmin,
  loadFastraxDetailsBatch,
  searchFastraxAllPagesForAdmin,
  searchFastraxProductsForAdmin,
  type FastraxAdminListItem,
} from "@/services/fastraxAdminApi";
import { cn } from "@/lib/utils";

type Props = {
  onLocalCatalogRefresh?: () => void;
};

type LoadingPhase = "idle" | "loading_list" | "loading_details" | "importing" | "done" | "error";

type SearchMode = "current_page" | "global";

const FAST_LIST_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;

export function AdminFastraxImportPanel({ onLocalCatalogRefresh }: Props) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const [textFilter, setTextFilter] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [onlyStock, setOnlyStock] = useState(false);
  const [fastMode, setFastMode] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>("current_page");
  const [phase, setPhase] = useState<LoadingPhase>("idle");
  const [rows, setRows] = useState<FastraxAdminListItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [sourceCount, setSourceCount] = useState<number>(0);
  const [pagesScanned, setPagesScanned] = useState<number | null>(null);
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null);

  const [rangeFrom, setRangeFrom] = useState(1);
  const [rangeTo, setRangeTo] = useState(2);

  const [selectedItemsBySku, setSelectedItemsBySku] = useState<Record<string, FastraxAdminListItem>>({});

  const detailsLoadedCount = useMemo(
    () => rows.filter((it) => it.detail_state !== "pendiente_detalle" && (it.raw_detail || it.price > 0)).length,
    [rows]
  );
  const pendingDetailCount = useMemo(
    () => rows.filter((it) => it.detail_state === "pendiente_detalle").length,
    [rows]
  );

  const load = useCallback(
    async (p: number) => {
      setPhase("loading_list");
      setLastDurationMs(null);
      try {
        if (searchMode === "global" && appliedSearch) {
          const r = await searchFastraxAllPagesForAdmin({
            q: appliedSearch,
            only_stock: onlyStock,
            max_pages: 20,
            page_size: 50,
            max_results: 200,
          });
          if (!r || r.ok !== true) {
            const m = (r as { message?: string; error?: string })?.message || (r as { error?: string })?.error;
            throw new Error(typeof m === "string" && m ? m : "Búsqueda global Fastrax falló");
          }
          setRows(Array.isArray(r.items) ? r.items : []);
          setTotalPages(r.total_pages ?? null);
          setPagesScanned(r.pages_scanned ?? null);
          setSourceCount(r.source_count ?? r.items.length);
          setLastDurationMs(r.duration_ms ?? null);
          setPhase("done");
          return;
        }
        if (fastMode) {
          const r = await listFastraxProductsFastForAdmin({
            page: p,
            size: FAST_LIST_PAGE_SIZE,
            q: appliedSearch || undefined,
            only_stock: onlyStock,
          });
          if (!r || r.ok !== true) {
            const m = (r as { message?: string; error?: string })?.message || (r as { error?: string })?.error;
            throw new Error(typeof m === "string" && m ? m : "Listado rápido Fastrax falló");
          }
          setRows(Array.isArray(r.items) ? r.items : []);
          setTotalPages(r.total_pages ?? null);
          setPagesScanned(null);
          setSourceCount(r.source_count ?? r.items.length);
          setLastDurationMs(r.duration_ms ?? null);
          if (typeof r.page === "number") setPage(r.page);
          setPhase("done");
          return;
        }
        const r = await searchFastraxProductsForAdmin({
          page: p,
          size,
          q: appliedSearch || undefined,
          only_stock: onlyStock,
        });
        if (r == null || typeof r !== "object" || r.ok !== true) {
          setRows([]);
          const m = (r as { message?: string; error?: string })?.message || (r as { error?: string })?.error;
          throw new Error(typeof m === "string" && m ? m : "Búsqueda Fastrax falló");
        }
        const list = Array.isArray(r.items) ? r.items : [];
        setRows(list);
        setTotalPages((r as { total_pages?: number }).total_pages ?? null);
        setPagesScanned(null);
        setSourceCount((r as { source_count?: number }).source_count ?? list.length);
        if (typeof (r as { page?: number }).page === "number") {
          setPage((r as { page: number }).page);
        }
        setPhase("done");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast({ variant: "destructive", title: "Fastrax", description: msg });
        setPhase("error");
      }
    },
    [appliedSearch, onlyStock, fastMode, searchMode, size]
  );

  useEffect(() => {
    void load(page);
  }, [load, page, size, onlyStock, appliedSearch, fastMode, searchMode]);

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedSearch(textFilter.trim());
    setPage(1);
  };

  const toggleRow = (row: FastraxAdminListItem) => {
    const sku = String(row.sku ?? "").trim();
    if (!sku) return;
    setSelectedItemsBySku((prev) => {
      const next = { ...prev };
      if (next[sku]) delete next[sku];
      else next[sku] = row;
      return next;
    });
  };

  const clearSelection = () => setSelectedItemsBySku({});

  const selectedCount = Object.keys(selectedItemsBySku).length;

  const loadDetailsForCurrentPage = async () => {
    const targetSkus = rows
      .filter((it) => it.detail_state === "pendiente_detalle" || (!it.raw_detail && !it.price))
      .map((it) => it.sku);
    if (targetSkus.length === 0) {
      toast({ title: "Detalles", description: "No hay SKUs pendientes de detalle en esta página." });
      return;
    }
    setPhase("loading_details");
    try {
      const r = await loadFastraxDetailsBatch(targetSkus);
      if (!r || r.ok !== true) {
        const m = (r as { message?: string; error?: string })?.message || (r as { error?: string })?.error;
        throw new Error(typeof m === "string" && m ? m : "Carga de detalles falló");
      }
      const bySku = new Map<string, FastraxAdminListItem>();
      for (const it of r.items) bySku.set(String(it.sku), it);
      setRows((prev) =>
        prev.map((row) => {
          const det = bySku.get(String(row.sku));
          if (!det) return row;
          return { ...row, ...det };
        })
      );
      setLastDurationMs(r.duration_ms ?? null);
      const okCount = r.items.length - (r.failed?.length ?? 0) - (r.missing?.length ?? 0);
      toast({
        title: "Detalles cargados",
        description: `OK ${okCount}, faltantes ${r.missing?.length ?? 0}, fallos ${r.failed?.length ?? 0}`,
      });
      setPhase("done");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ variant: "destructive", title: "Detalles", description: msg });
      setPhase("error");
    }
  };

  const doImport = async (items: FastraxAdminListItem[]) => {
    if (items.length === 0) {
      toast({ title: "Elegí al menos un producto" });
      return;
    }
    setImporting(true);
    setPhase("importing");
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
      const skipped = (r as { skipped?: number }).skipped ?? 0;
      const line = `Nuevos ${r.inserted}, actualizados ${r.updated}, omitidos ${skipped}, fallos ${r.failed}`;
      if (r.failed) {
        toast({ title: "Importación con errores", description: line });
      } else {
        toast({ title: "Importado", description: line });
      }
      if (r.failed === 0) setSelectedItemsBySku({});
      onLocalCatalogRefresh?.();
      setPhase("done");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ variant: "destructive", title: "Import", description: msg });
      setPhase("error");
    } finally {
      setImporting(false);
    }
  };

  const doImportPage = async () => {
    if (importing) return;
    if (!window.confirm(`¿Importar la página ${page} completa al catálogo local?`)) return;
    setImporting(true);
    setPhase("importing");
    try {
      const r = await importFastraxPageOnServer({ page, size: fastMode ? FAST_LIST_PAGE_SIZE : size });
      if (!r || r.ok !== true) {
        const m = (r as { message?: string; error?: string })?.message || (r as { error?: string })?.error;
        throw new Error(typeof m === "string" && m ? m : "Importación de página falló");
      }
      const s = r.stats;
      const partial = s.failed > 0;
      const line = `Encontrados ${s.skus_found}, nuevos ${s.imported}, actualizados ${s.updated}, omitidos ${s.skipped}, fallos ${s.failed} (${s.duration_ms} ms)`;
      toast({
        title: partial ? "Importación con errores" : "Página importada",
        description: line,
      });
      setLastDurationMs(s.duration_ms);
      onLocalCatalogRefresh?.();
      setPhase(partial ? "error" : "done");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ variant: "destructive", title: "Importar página", description: msg });
      setPhase("error");
    } finally {
      setImporting(false);
    }
  };

  const doImportRange = async () => {
    if (importing) return;
    const from = Math.max(1, Math.floor(rangeFrom || 1));
    const to = Math.max(from, Math.floor(rangeTo || from));
    const span = to - from + 1;
    if (span > 50) {
      toast({ variant: "destructive", title: "Rango", description: "Máximo 50 páginas por operación." });
      return;
    }
    if (!window.confirm(`¿Importar páginas ${from} a ${to} (${span} páginas)?`)) return;
    setImporting(true);
    setPhase("importing");
    try {
      const r = await importFastraxPageRangeOnServer({ from_page: from, to_page: to, size: fastMode ? FAST_LIST_PAGE_SIZE : size });
      if (!r || r.ok !== true) {
        const m = (r as { message?: string; error?: string })?.message || (r as { error?: string })?.error;
        throw new Error(typeof m === "string" && m ? m : "Importación de rango falló");
      }
      const t = r.totals;
      const partial = t.failed > 0;
      const line = `Páginas ${t.pages_processed}, encontrados ${t.skus_found}, nuevos ${t.imported}, actualizados ${t.updated}, omitidos ${t.skipped}, fallos ${t.failed} (${r.duration_ms} ms)`;
      toast({ title: partial ? "Rango con errores" : "Rango importado", description: line });
      setLastDurationMs(r.duration_ms);
      onLocalCatalogRefresh?.();
      setPhase(partial ? "error" : "done");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ variant: "destructive", title: "Importar rango", description: msg });
      setPhase("error");
    } finally {
      setImporting(false);
    }
  };

  const phaseLabel = (() => {
    switch (phase) {
      case "loading_list":
        return "Cargando listado…";
      case "loading_details":
        return "Cargando detalles…";
      case "importing":
        return "Importando…";
      case "done":
        return "Listo";
      case "error":
        return "Error parcial";
      default:
        return "";
    }
  })();

  const loadingAny = phase === "loading_list" || phase === "loading_details" || importing;

  return (
    <div className="space-y-4 w-full max-w-6xl">
      <p className="text-sm text-muted-foreground max-w-2xl">
        Consultá el catálogo Fastrax en la nube, elegí SKUs e importalos a tu base local. Nada se guarda hasta
        presionar <strong>Importar</strong>. El servidor consulta los detalles ope=2 en lote (batches de
        20) para acelerar la respuesta.
      </p>

      <form onSubmit={onSearchSubmit} className="flex flex-col sm:flex-row flex-wrap gap-3 sm:items-end">
        <div className="flex-1 min-w-[160px] max-w-sm space-y-1.5">
          <Label htmlFor="fastrax-filter-text" className={ADMIN_FORM_LABEL}>
            Buscar (nombre o SKU)
          </Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="fastrax-filter-text"
              className={cn(ADMIN_FORM_CONTROL, "pl-9")}
              value={textFilter}
              onChange={(e) => setTextFilter(e.target.value)}
              placeholder="Ej. tornillo, 1021…"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 pb-0.5">
          <Checkbox
            id="fastrax-only-stock"
            checked={onlyStock}
            onCheckedChange={(v) => setOnlyStock(v === true)}
          />
          <label htmlFor="fastrax-only-stock" className="text-sm text-foreground cursor-pointer">
            Solo con stock
          </label>
        </div>
        <div className="flex items-center gap-2 pb-0.5">
          <Checkbox
            id="fastrax-fast-mode"
            checked={fastMode}
            onCheckedChange={(v) => {
              setFastMode(v === true);
              setPage(1);
            }}
            disabled={searchMode === "global"}
          />
          <label htmlFor="fastrax-fast-mode" className="text-sm text-foreground cursor-pointer flex items-center gap-1">
            <Zap className="h-3.5 w-3.5 text-amber-500" /> Modo rápido (sin detalles)
          </label>
        </div>
        <div className="flex items-center gap-2 pb-0.5">
          <Checkbox
            id="fastrax-global"
            checked={searchMode === "global"}
            onCheckedChange={(v) => {
              setSearchMode(v === true ? "global" : "current_page");
              setPage(1);
            }}
          />
          <label htmlFor="fastrax-global" className="text-sm text-foreground cursor-pointer flex items-center gap-1">
            <Globe className="h-3.5 w-3.5 text-blue-500" /> Buscar en todo Fastrax
          </label>
        </div>
        {!fastMode && searchMode === "current_page" && (
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
        )}
        <Button type="submit" disabled={loadingAny} className="gap-1.5" variant="secondary">
          {phase === "loading_list" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Buscar
        </Button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p>
            Pág. <span className="tabular-nums">{page}</span>
            {typeof totalPages === "number" ? (
              <>
                {" "}/ <span className="tabular-nums">{totalPages}</span>
              </>
            ) : null}
            {" · "}
            <span className="tabular-nums">{rows.length}</span> fila(s)
            {typeof sourceCount === "number" && sourceCount !== rows.length ? (
              <> · fuente: {sourceCount}</>
            ) : null}
            {pagesScanned != null ? <> · escaneadas: {pagesScanned}</> : null}
          </p>
          <p className="font-medium text-foreground tabular-nums">Seleccionados: {selectedCount}</p>
          {fastMode && pendingDetailCount > 0 ? (
            <p className="text-amber-600">Pendientes de detalle: {pendingDetailCount}</p>
          ) : null}
          {detailsLoadedCount > 0 ? (
            <p className="text-emerald-700">Con detalle: {detailsLoadedCount}</p>
          ) : null}
          {phaseLabel ? (
            <p className={cn(phase === "error" ? "text-destructive" : "text-foreground")}>{phaseLabel}</p>
          ) : null}
          {lastDurationMs != null ? (
            <p className="opacity-70">{lastDurationMs} ms</p>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => {
              if (page <= 1) return;
              setPage((p) => p - 1);
            }}
            disabled={page <= 1 || loadingAny || searchMode === "global"}
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
            disabled={loadingAny || searchMode === "global"}
            aria-label="Página siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Button
          type="button"
          onClick={() => void doImport(Object.values(selectedItemsBySku))}
          disabled={importing || selectedCount === 0}
          className="gap-2"
        >
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Importar seleccionados{selectedCount > 0 ? ` (${selectedCount})` : ""}
        </Button>
        <Button type="button" variant="outline" onClick={clearSelection} disabled={selectedCount === 0}>
          Limpiar selección
        </Button>
        {fastMode ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadDetailsForCurrentPage()}
            disabled={loadingAny || rows.length === 0 || pendingDetailCount === 0}
            className="gap-2"
          >
            {phase === "loading_details" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Cargar detalles ({pendingDetailCount})
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          onClick={() => void doImportPage()}
          disabled={importing || rows.length === 0 || searchMode === "global"}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Importar página actual
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card p-3 flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className={ADMIN_FORM_LABEL}>Importar rango de páginas</Label>
          <p className="text-xs text-muted-foreground">Tope duro: 50 páginas por operación.</p>
        </div>
        <div className={cn(ADMIN_FORM_FIELD, "w-24")}>
          <Label htmlFor="range-from" className={ADMIN_FORM_LABEL}>Desde</Label>
          <Input
            id="range-from"
            type="number"
            min={1}
            className={cn(ADMIN_FORM_CONTROL, "tabular-nums")}
            value={String(rangeFrom)}
            onChange={(e) => setRangeFrom(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
        <div className={cn(ADMIN_FORM_FIELD, "w-24")}>
          <Label htmlFor="range-to" className={ADMIN_FORM_LABEL}>Hasta</Label>
          <Input
            id="range-to"
            type="number"
            min={1}
            className={cn(ADMIN_FORM_CONTROL, "tabular-nums")}
            value={String(rangeTo)}
            onChange={(e) => setRangeTo(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void doImportRange()}
          disabled={importing}
          className="gap-2"
        >
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Importar rango
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
            {phase === "loading_list" && (
              <tr>
                <td colSpan={7} className={`${ADMIN_TD} text-center text-muted-foreground py-6`}>
                  Cargando…
                </td>
              </tr>
            )}
            {phase !== "loading_list" && rows.length === 0 && (
              <tr>
                <td colSpan={7} className={`${ADMIN_TD} text-center text-muted-foreground py-6`}>
                  No hay resultados. Probá otra búsqueda o página.
                </td>
              </tr>
            )}
            {phase !== "loading_list" &&
              rows.map((row) => {
                const isPending = row.detail_state === "pendiente_detalle";
                return (
                  <tr key={row.sku} className={ADMIN_TR}>
                    <td className={ADMIN_TD}>
                      <Checkbox
                        checked={Boolean(selectedItemsBySku[row.sku])}
                        onCheckedChange={() => toggleRow(row)}
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
                          isPending
                            ? "bg-amber-100 text-amber-900"
                            : (row.stock ?? 0) > 0
                              ? "bg-emerald-100 text-emerald-900"
                              : "bg-muted text-muted-foreground"
                        )}
                      >
                        {isPending ? "Pendiente detalle" : row.price > 0 ? (row.stock > 0 ? "Vendible" : "Sin stock") : "Precio 0"}
                      </span>
                    </td>
                    <td className={`${ADMIN_TD} text-right`}>
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
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
