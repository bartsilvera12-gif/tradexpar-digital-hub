import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronsUpDown, RefreshCw, Trash2, Search, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { tradexpar } from "@/services/tradexpar";
import {
  affiliatesAvailable,
  approveAffiliateRequest,
  buildAffiliateStoreUrl,
  listAffiliateRequests,
  listAffiliateSalesDetail,
  listAffiliateSummary,
  listAffiliates,
  listCommissionRules,
  listDiscountRules,
  rejectAffiliateRequest,
  setAffiliateGlobals,
  setAttributionCommissionStatus,
  setCommissionRule,
  setDiscountRule,
  deleteCommissionRuleForProduct,
  deleteDiscountRuleForProduct,
  setAffiliateStatus,
} from "@/services/affiliateTradexparService";
import type {
  AffiliateRequestRow,
  AffiliateRow,
  AffiliateSalesDetailRow,
  AffiliateSummaryRow,
  AffiliateStatus,
  CommissionStatus,
} from "@/types/affiliates";
import type { Product } from "@/types";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import {
  ADMIN_CARD,
  ADMIN_FORM_CONTROL,
  ADMIN_FORM_FIELD,
  ADMIN_FORM_LABEL,
  ADMIN_FORM_SECTION,
  ADMIN_TABLE,
  ADMIN_TABLE_SCROLL,
  ADMIN_TBODY,
  ADMIN_TD,
  ADMIN_TH,
  ADMIN_THEAD_ROW,
  ADMIN_TR,
} from "@/lib/adminModuleLayout";
import { affiliateSaleCommissionSelectOptions, commissionStatusLabelEs } from "@/lib/affiliateCommissionLabels";
import { cn } from "@/lib/utils";
import { Loader } from "@/components/shared/Loader";
import { AnalyticsTab, AssetsTab } from "@/pages/admin/affiliates/AdminAffiliatesProTabs";

export default function AdminAffiliatesPage() {
  const [tab, setTab] = useState("requests");

  if (!affiliatesAvailable()) {
    return (
      <AdminPageShell title="Afiliados">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Configurá <code className="text-xs bg-muted px-1 rounded">VITE_SUPABASE_URL</code> y{" "}
          <code className="text-xs bg-muted px-1 rounded">VITE_SUPABASE_ANON_KEY</code> y ejecutá el SQL de{" "}
          <code className="text-xs bg-muted px-1 rounded">supabase/tradexpar_affiliates_phase1.sql</code>.
        </p>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell
      title="Afiliados"
      description="Solicitudes, afiliados activos, ventas atribuidas, reglas de comisión y materiales."
    >
      <Tabs value={tab} onValueChange={setTab} className="w-full min-w-0">
        <div className="w-full min-w-0 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:overflow-visible">
          <TabsList className="inline-flex h-auto min-h-10 w-max max-w-none flex-wrap justify-start gap-1 rounded-xl border border-border/80 bg-muted/40 p-1.5 shadow-sm sm:inline-flex sm:max-w-full">
            <TabsTrigger value="requests" className="shrink-0 text-xs sm:text-sm">
              Solicitudes
            </TabsTrigger>
            <TabsTrigger value="affiliates" className="shrink-0 text-xs sm:text-sm">
              Afiliados
            </TabsTrigger>
            <TabsTrigger value="sales" className="shrink-0 text-xs sm:text-sm">
              Ventas
            </TabsTrigger>
            <TabsTrigger value="rules" className="shrink-0 text-xs sm:text-sm">
              Reglas
            </TabsTrigger>
            <TabsTrigger value="assets" className="shrink-0 text-xs sm:text-sm">
              Materiales
            </TabsTrigger>
            <TabsTrigger value="analytics" className="shrink-0 text-xs sm:text-sm">
              Analítica
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="requests" className="mt-4 min-w-0 focus-visible:ring-0">
          <RequestsTab />
        </TabsContent>
        <TabsContent value="affiliates" className="mt-4 min-w-0 focus-visible:ring-0">
          <AffiliatesTab />
        </TabsContent>
        <TabsContent value="sales" className="mt-4 min-w-0 focus-visible:ring-0">
          <SalesTab />
        </TabsContent>
        <TabsContent value="rules" className="mt-4 min-w-0 focus-visible:ring-0">
          <RulesTab />
        </TabsContent>
        <TabsContent value="assets" className="mt-4 min-w-0 focus-visible:ring-0">
          <AssetsTab />
        </TabsContent>
        <TabsContent value="analytics" className="mt-4 min-w-0 focus-visible:ring-0">
          <AnalyticsTab />
        </TabsContent>
      </Tabs>
    </AdminPageShell>
  );
}

function RequestsTab() {
  const [rows, setRows] = useState<AffiliateRequestRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    listAffiliateRequests()
      .then(setRows)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (id: string) => {
    try {
      const res = await approveAffiliateRequest(id);
      if (!res?.ok) {
        toast.error(res?.reason || "No se pudo aprobar");
        return;
      }
      toast.success(`Afiliado creado. Código: ${res.code}`);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  const reject = async (id: string) => {
    const note = window.prompt("Motivo del rechazo (opcional):") ?? "";
    try {
      const res = await rejectAffiliateRequest(id, note);
      if (!res?.ok) {
        toast.error(res?.reason || "No se pudo rechazar");
        return;
      }
      toast.success("Solicitud rechazada");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  if (loading) return <Loader text="Cargando solicitudes…" />;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualizar
        </Button>
      </div>
      <div className={ADMIN_CARD}>
        <div className={ADMIN_TABLE_SCROLL}>
          <table className={ADMIN_TABLE}>
            <thead>
              <tr className={ADMIN_THEAD_ROW}>
                <th className={ADMIN_TH}>Nombre</th>
                <th className={ADMIN_TH}>Email</th>
                <th className={ADMIN_TH}>Teléfono</th>
                <th className={ADMIN_TH}>Documento</th>
                <th className={ADMIN_TH}>Estado</th>
                <th className={ADMIN_TH}>Fecha</th>
                <th className={ADMIN_TH}>Acciones</th>
              </tr>
            </thead>
            <tbody className={ADMIN_TBODY}>
              {rows.map((r) => (
                <tr key={r.id} className={ADMIN_TR}>
                  <td className={`${ADMIN_TD} font-medium`}>{r.full_name}</td>
                  <td className={ADMIN_TD}>{r.email}</td>
                  <td className={ADMIN_TD}>{r.phone || "—"}</td>
                  <td className={ADMIN_TD}>{r.document_id || "—"}</td>
                  <td className={`${ADMIN_TD} capitalize`}>{r.status}</td>
                  <td className={`${ADMIN_TD} whitespace-nowrap`}>{new Date(r.created_at).toLocaleString("es-PY")}</td>
                  <td className={ADMIN_TD}>
                  {r.status === "pending" ? (
                    <div className="flex gap-2">
                      <Button type="button" size="sm" className="gradient-celeste" onClick={() => void approve(r.id)}>
                        Aprobar
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => void reject(r.id)}>
                        Rechazar
                      </Button>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="p-6 text-center text-muted-foreground">No hay solicitudes.</p>}
        </div>
      </div>
    </div>
  );
}

function affiliateStatusLabelEs(status: AffiliateStatus): string {
  if (status === "active") return "Activo";
  if (status === "suspended") return "Desactivado";
  return "Pendiente";
}

function affiliateMatchesStatusFilter(a: AffiliateSummaryRow, f: "all" | "active" | "inactive"): boolean {
  if (f === "all") return true;
  if (f === "active") return a.status === "active";
  return a.status === "suspended";
}

function affiliateMatchesSmartSearch(a: AffiliateSummaryRow, raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  const link = buildAffiliateStoreUrl(a.code).toLowerCase();
  const hay = [a.name, a.email ?? "", a.code, a.affiliate_id, link].join(" ").toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

function AffiliatesTab() {
  const [summary, setSummary] = useState<AffiliateSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([listAffiliateSummary(), listAffiliates()])
      .then(([summaryRows, affRows]) => {
        const emailById = new Map(affRows.map((x) => [x.id, x.email ?? null]));
        setSummary(
          summaryRows.map((r) => ({
            ...r,
            email: emailById.get(r.affiliate_id) ?? null,
          }))
        );
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () => summary.filter((a) => affiliateMatchesStatusFilter(a, statusFilter) && affiliateMatchesSmartSearch(a, search)),
    [summary, statusFilter, search]
  );

  const copyLink = (code: string) => {
    void navigator.clipboard.writeText(buildAffiliateStoreUrl(code));
    toast.success("Link copiado al portapapeles");
  };

  const onToggleActive = async (a: AffiliateSummaryRow, nextActive: boolean) => {
    if (a.status === "pending") {
      toast.message("Este afiliado sigue en estado pendiente; activalo desde solicitudes si aplica.");
      return;
    }
    setStatusBusyId(a.affiliate_id);
    try {
      await setAffiliateStatus(a.affiliate_id, nextActive ? "active" : "suspended");
      toast.success(nextActive ? "Afiliado activado" : "Afiliado desactivado");
      await load();
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : e && typeof e === "object" && "message" in e
            ? String((e as { message: unknown }).message)
            : String(e);
      const text = msg.trim() || "No se pudo actualizar el estado";
      if (/admin_set_affiliate_status|function.*does not exist|PGRST202|schema cache/i.test(text)) {
        toast.error("Falta la función en Supabase", {
          description:
            "Ejecutá en el SQL Editor: supabase/tradexpar_admin_set_affiliate_status.sql y recargá el panel.",
        });
      } else {
        toast.error("No se pudo cambiar el estado del afiliado", { description: text });
      }
    } finally {
      setStatusBusyId(null);
    }
  };

  if (loading) return <Loader text="Cargando afiliados…" />;

  return (
    <div className="space-y-4 w-full min-w-0">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3 w-full max-w-xl">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-2.5">
            Buscar afiliados
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre, correo, código, ID o parte del enlace…"
              className={cn(ADMIN_FORM_CONTROL, "pl-10")}
              aria-label="Buscar afiliados"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">Estado</span>
          {(
            [
              ["all", "Todos"],
              ["active", "Activados"],
              ["inactive", "Desactivados"],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={statusFilter === key ? "default" : "outline"}
              className={statusFilter === key ? "gradient-celeste text-primary-foreground shadow-sm" : ""}
              onClick={() => setStatusFilter(key)}
            >
              {label}
            </Button>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualizar
          </Button>
        </div>
      </div>

      <div className={ADMIN_CARD}>
        <div className={ADMIN_TABLE_SCROLL}>
          <table className={`${ADMIN_TABLE} min-w-[1120px]`}>
            <thead>
              <tr className={cn(ADMIN_THEAD_ROW, "!text-center")}>
                <th className={cn(ADMIN_TH, "text-center")}>Nombre</th>
                <th className={cn(ADMIN_TH, "text-center min-w-[200px] max-w-[min(28rem,40vw)]")}>Correo</th>
                <th className={cn(ADMIN_TH, "text-center")}>Código</th>
                <th className={cn(ADMIN_TH, "text-center")}>Estado</th>
                <th className={cn(ADMIN_TH, "text-center")}>Comisión</th>
                <th className={cn(ADMIN_TH, "text-center")}>Desc. cliente</th>
                <th className={cn(ADMIN_TH, "text-center")}>Pedidos</th>
                <th className={cn(ADMIN_TH, "text-center")}>Vendido</th>
                <th className={cn(ADMIN_TH, "text-center")}>Comisión total</th>
                <th className={cn(ADMIN_TH, "text-center min-w-[200px]")}>Enlace de referido</th>
              </tr>
            </thead>
            <tbody className={ADMIN_TBODY}>
              {filtered.map((a) => {
                const url = buildAffiliateStoreUrl(a.code);
                const canToggle = a.status === "active" || a.status === "suspended";
                return (
                  <tr key={a.affiliate_id} className={ADMIN_TR}>
                    <td className={cn(ADMIN_TD, "text-center font-medium")}>{a.name}</td>
                    <td
                      className={cn(
                        ADMIN_TD,
                        "text-center align-middle min-w-[200px] max-w-[min(28rem,40vw)]"
                      )}
                    >
                      {a.email ? (
                        <span
                          className="inline-block text-xs sm:text-sm text-muted-foreground break-all leading-snug text-center max-w-full"
                          title={a.email}
                        >
                          {a.email}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/70">—</span>
                      )}
                    </td>
                    <td className={cn(ADMIN_TD, "text-center font-mono text-xs")}>{a.code}</td>
                    <td className={cn(ADMIN_TD, "text-center")}>
                      <div className="flex flex-col items-center justify-center gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
                        <span
                          className={cn(
                            "text-xs font-medium shrink-0",
                            a.status === "active" && "text-green-700 dark:text-green-400",
                            a.status === "suspended" && "text-muted-foreground",
                            a.status === "pending" && "text-amber-700 dark:text-amber-400"
                          )}
                        >
                          {affiliateStatusLabelEs(a.status)}
                        </span>
                        {canToggle ? (
                          <div className="flex items-center justify-center gap-2">
                            <Switch
                              checked={a.status === "active"}
                              disabled={statusBusyId === a.affiliate_id}
                              onCheckedChange={(checked) => void onToggleActive(a, checked)}
                              aria-label={a.status === "active" ? "Desactivar afiliado" : "Activar afiliado"}
                            />
                            <span className="text-[10px] text-muted-foreground hidden sm:inline">Activo</span>
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className={cn(ADMIN_TD, "text-center")}>{Number(a.default_commission_percent).toFixed(1)}%</td>
                    <td className={cn(ADMIN_TD, "text-center")}>{Number(a.default_buyer_discount_percent).toFixed(1)}%</td>
                    <td className={cn(ADMIN_TD, "text-center")}>{a.orders_count}</td>
                    <td className={cn(ADMIN_TD, "text-center")}>₲ {Number(a.total_sold).toLocaleString("es-PY")}</td>
                    <td className={cn(ADMIN_TD, "text-center")}>
                      <div className="text-xs space-y-0.5 text-center">
                        <div>Pend.: ₲ {Number(a.commission_pending).toLocaleString("es-PY")}</div>
                        <div>Apr.: ₲ {Number(a.commission_approved).toLocaleString("es-PY")}</div>
                        <div>Pag.: ₲ {Number(a.commission_paid).toLocaleString("es-PY")}</div>
                      </div>
                    </td>
                    <td className={cn(ADMIN_TD, "text-center align-top")}>
                      <div className="flex flex-col items-center gap-2 min-w-0 max-w-[min(28rem,90%)] mx-auto">
                        <p
                          className="text-[11px] font-mono text-muted-foreground break-all leading-snug text-center w-full"
                          title={url}
                        >
                          {url}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-fit shrink-0 gap-1.5 text-xs"
                          onClick={() => copyLink(a.code)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copiar
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {summary.length === 0 && <p className="p-6 text-center text-muted-foreground">No hay afiliados.</p>}
          {summary.length > 0 && filtered.length === 0 && (
            <p className="p-6 text-center text-muted-foreground">Ningún afiliado coincide con la búsqueda o el filtro.</p>
          )}
        </div>
      </div>
    </div>
  );
}

type SalesFilter = "all" | CommissionStatus;

const AFFILIATE_SALE_COMMISSION_OPTIONS = affiliateSaleCommissionSelectOptions();

function isAffiliateSaleCommissionLocked(status: string): boolean {
  return status === "paid" || status === "rejected";
}

function AffiliateSaleCommissionStatusSelect({
  attributionId,
  status,
  onCommit,
}: {
  attributionId: string;
  status: string;
  onCommit: (id: string, next: CommissionStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const locked = isAffiliateSaleCommissionLocked(status);
  const label = commissionStatusLabelEs(status);

  return (
    <Popover
      open={locked ? false : open}
      onOpenChange={(next) => {
        if (!locked) setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={locked}
          title={
            locked
              ? "Este estado ya está cerrado (pagada o rechazada) y no se puede cambiar."
              : "Buscar o elegir estado de comisión"
          }
          className={cn(
            ADMIN_FORM_CONTROL,
            "h-8 min-h-8 w-[min(100%,11rem)] justify-between py-1.5 text-xs font-normal",
            locked && "cursor-not-allowed opacity-80"
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,16rem)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar estado…" className="h-9" />
          <CommandList>
            <CommandEmpty>Sin coincidencias.</CommandEmpty>
            <CommandGroup>
              {AFFILIATE_SALE_COMMISSION_OPTIONS.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={`${opt.label} ${opt.value}`}
                  onSelect={() => {
                    onCommit(attributionId, opt.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      status === opt.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SalesTab() {
  const [rows, setRows] = useState<AffiliateSalesDetailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<SalesFilter>("all");

  const load = useCallback(() => {
    setLoading(true);
    listAffiliateSalesDetail()
      .then(setRows)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (attributionId: string, status: string) => {
    try {
      await setAttributionCommissionStatus(attributionId, status);
      toast.success("Estado actualizado");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  const filtered =
    statusFilter === "all" ? rows : rows.filter((r) => r.commission_status === statusFilter);

  const countFor = (s: CommissionStatus) => rows.filter((r) => r.commission_status === s).length;

  if (loading) return <Loader text="Cargando ventas…" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: "all" as const, label: "Todas" },
              { id: "pending" as const, label: `Pendientes (${countFor("pending")})` },
              { id: "approved" as const, label: `Aprobadas (${countFor("approved")})` },
              { id: "paid" as const, label: `Pagadas (${countFor("paid")})` },
              { id: "rejected" as const, label: `Rechazadas (${countFor("rejected")})` },
              { id: "cancelled" as const, label: `Canceladas (${countFor("cancelled")})` },
            ] as const
          ).map(({ id, label }) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={statusFilter === id ? "default" : "outline"}
              className={statusFilter === id ? "gradient-celeste" : ""}
              onClick={() => setStatusFilter(id)}
            >
              {label}
            </Button>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualizar
        </Button>
      </div>
      <div className={ADMIN_CARD}>
        <div className={ADMIN_TABLE_SCROLL}>
          <table className={ADMIN_TABLE}>
            <thead>
              <tr className={ADMIN_THEAD_ROW}>
                <th className={ADMIN_TH}>Afiliado</th>
                <th className={ADMIN_TH}>Pedido</th>
                <th className={ADMIN_TH}>Fecha</th>
                <th className={ADMIN_TH}>Productos</th>
                <th className={ADMIN_TH}>Cant.</th>
                <th className={ADMIN_TH}>Subtotal pedido</th>
                <th className={ADMIN_TH}>Comisión</th>
                <th className={ADMIN_TH}>Estado</th>
              </tr>
            </thead>
            <tbody className={ADMIN_TBODY}>
              {filtered.map((r) => (
                <tr key={r.attribution_id} className={`${ADMIN_TR} align-top`}>
                  <td className={ADMIN_TD}>
                    <div className="font-medium">{r.affiliate_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{r.affiliate_code}</div>
                  </td>
                  <td className={`${ADMIN_TD} font-mono text-xs`}>{r.order_id.slice(0, 8)}…</td>
                  <td className={`${ADMIN_TD} whitespace-nowrap`}>{new Date(r.order_created_at).toLocaleString("es-PY")}</td>
                  <td className={`${ADMIN_TD} max-w-[200px] text-xs`}>{r.products_label || "—"}</td>
                  <td className={ADMIN_TD}>{r.total_qty}</td>
                  <td className={ADMIN_TD}>₲ {Number(r.order_total).toLocaleString("es-PY")}</td>
                  <td className={ADMIN_TD}>₲ {Number(r.commission_total).toLocaleString("es-PY")}</td>
                  <td className={ADMIN_TD}>
                    <AffiliateSaleCommissionStatusSelect
                      attributionId={r.attribution_id}
                      status={r.commission_status}
                      onCommit={(id, next) => void setStatus(id, next)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="p-6 text-center text-muted-foreground">Sin ventas atribuidas aún.</p>
          )}
          {rows.length > 0 && filtered.length === 0 && (
            <p className="p-6 text-center text-muted-foreground">Nada en este filtro.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Selector de afiliado con el mismo aspecto que el Select admin + búsqueda (cmdk). */
function RulesAffiliateCombobox({
  affiliates,
  value,
  onChange,
}: {
  affiliates: AffiliateRow[];
  value: string;
  onChange: (affiliateId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = affiliates.find((a) => a.id === value);
  const label = selected ? `${selected.name} (${selected.code})` : "Seleccionar…";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            ADMIN_FORM_CONTROL,
            "cursor-pointer text-left justify-between gap-2 ring-offset-background",
            open && "bg-background ring-2 ring-primary/25"
          )}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground/80")}>{label}</span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[min(100vw-2rem,20rem)] max-w-[min(100vw-2rem,32rem)] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Buscar por nombre o código…" className="h-9" />
          <CommandList>
            <CommandEmpty>Sin coincidencias.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="seleccionar ninguno"
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4 shrink-0", value ? "opacity-0" : "opacity-100")} />
                <span className="text-muted-foreground">Seleccionar…</span>
              </CommandItem>
              {affiliates.map((a) => (
                <CommandItem
                  key={a.id}
                  value={`${a.name} ${a.code} ${a.id}`}
                  onSelect={() => {
                    onChange(a.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4 shrink-0", value === a.id ? "opacity-100" : "opacity-0")}
                  />
                  {a.name} ({a.code})
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function RulesTab() {
  const [affiliates, setAffiliates] = useState<AffiliateRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [affId, setAffId] = useState<string>("");
  const [globalComm, setGlobalComm] = useState("10");
  const [globalDisc, setGlobalDisc] = useState("0");
  /** Porcentajes globales efectivos ya guardados (misma lógica que la tienda: regla global o columnas del afiliado). */
  const [vigenteGlobal, setVigenteGlobal] = useState<{ comm: number; disc: number } | null>(null);
  const [prodId, setProdId] = useState<string>("");
  const [prodComm, setProdComm] = useState("5");
  const [prodDisc, setProdDisc] = useState("0");
  const [loading, setLoading] = useState(false);
  const [commRules, setCommRules] = useState<{ product_id: string; commission_percent: number }[]>([]);
  const [discRules, setDiscRules] = useState<{ product_id: string; discount_percent: number }[]>([]);

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id.slice(0, 8) + "…";

  const reloadRules = useCallback(async () => {
    if (!affId) {
      setCommRules([]);
      setDiscRules([]);
      setVigenteGlobal(null);
      return;
    }
    const aff = affiliates.find((a) => a.id === affId);
    try {
      const [commAll, discAll] = await Promise.all([listCommissionRules(affId), listDiscountRules(affId)]);
      const gComm = commAll.find((x) => x.product_id == null);
      const gDisc = discAll.find((x) => x.product_id == null);

      if (gComm) setGlobalComm(String(gComm.commission_percent));
      else if (aff) setGlobalComm(String(aff.commission_rate));
      else setGlobalComm("10");

      if (gDisc) setGlobalDisc(String(gDisc.discount_percent));
      else if (aff) setGlobalDisc(String(aff.default_buyer_discount_percent));
      else setGlobalDisc("0");

      setVigenteGlobal({
        comm: Number(gComm?.commission_percent ?? aff?.commission_rate ?? 0),
        disc: Number(gDisc?.discount_percent ?? aff?.default_buyer_discount_percent ?? 0),
      });

      setCommRules(
        commAll
          .filter((r) => r.product_id != null)
          .map((r) => ({
            product_id: r.product_id as string,
            commission_percent: r.commission_percent,
          }))
      );
      setDiscRules(
        discAll
          .filter((r) => r.product_id != null)
          .map((r) => ({
            product_id: r.product_id as string,
            discount_percent: r.discount_percent,
          }))
      );
    } catch {
      /* silencioso: toast solo en acciones explícitas */
    }
  }, [affId, affiliates]);

  useEffect(() => {
    listAffiliates()
      .then((a) => {
        setAffiliates(a);
        setAffId((prev) => prev || a[0]?.id || "");
      })
      .catch((e) => toast.error(e.message));
    tradexpar.getProducts().then(setProducts).catch(() => {});
  }, []);

  useEffect(() => {
    reloadRules();
  }, [reloadRules]);

  useEffect(() => {
    if (!affId || !prodId) return;
    listCommissionRules(affId).then((rules) => {
      const row = rules.find((x) => x.product_id === prodId);
      if (row) setProdComm(String(row.commission_percent));
    });
    listDiscountRules(affId).then((rules) => {
      const row = rules.find((x) => x.product_id === prodId);
      if (row) setProdDisc(String(row.discount_percent));
    });
  }, [affId, prodId]);

  const saveGlobals = async () => {
    if (!affId) return;
    setLoading(true);
    try {
      await setAffiliateGlobals(affId, Number(globalComm), Number(globalDisc));
      toast.success("Reglas globales guardadas (comisión y descuento para compradores)");
      reloadRules();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const saveProductRules = async () => {
    if (!affId || !prodId) {
      toast.error("Elegí un producto");
      return;
    }
    setLoading(true);
    try {
      await setCommissionRule(affId, prodId, Number(prodComm));
      await setDiscountRule(affId, prodId, Number(prodDisc));
      toast.success("Reglas por producto guardadas (sobrescriben las globales para ese ítem)");
      reloadRules();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const removeCommRule = async (product_id: string) => {
    if (!affId) return;
    setLoading(true);
    try {
      await deleteCommissionRuleForProduct(affId, product_id);
      toast.success("Regla de comisión por producto eliminada");
      reloadRules();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const removeDiscRule = async (product_id: string) => {
    if (!affId) return;
    setLoading(true);
    try {
      await deleteDiscountRuleForProduct(affId, product_id);
      toast.success("Regla de descuento por producto eliminada");
      reloadRules();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-8 w-full min-w-0 max-w-6xl">
      <div className={ADMIN_FORM_FIELD}>
        <Label className={ADMIN_FORM_LABEL}>Afiliado</Label>
        <RulesAffiliateCombobox affiliates={affiliates} value={affId} onChange={setAffId} />
      </div>

      <div className={`${ADMIN_FORM_SECTION} space-y-3`}>
        <h3 className="font-semibold text-foreground">Comisión y descuento globales del afiliado</h3>
        <p className="text-xs text-muted-foreground">
          Aplican a todos los productos salvo que definas una regla por producto. El descuento lo ve quien compra con el
          enlace del afiliado; la comisión es lo que gana el afiliado por la venta.
        </p>
        {affId && vigenteGlobal != null && (
          <div className="rounded-xl border border-primary/20 bg-primary/[0.06] px-3 py-2.5 text-sm">
            <p className="font-semibold text-primary text-[11px] uppercase tracking-wider">Vigente en la tienda ahora</p>
            <p className="mt-1.5 text-foreground">
              Descuento global al comprador:{" "}
              <strong className="tabular-nums">{vigenteGlobal.disc.toFixed(1)}%</strong>
              <span className="text-muted-foreground font-normal"> · </span>
              Comisión global del afiliado:{" "}
              <strong className="tabular-nums">{vigenteGlobal.comm.toFixed(1)}%</strong>
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
              Mismo criterio que la tabla de abajo: lo que aplica cuando el producto no tiene regla propia (regla global en
              BD o, si no hay fila, los valores del afiliado).
            </p>
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className={ADMIN_FORM_FIELD}>
            <Label className={ADMIN_FORM_LABEL}>Comisión global</Label>
            <div className="relative">
              <Input
                className={cn(ADMIN_FORM_CONTROL, "pr-9")}
                value={globalComm}
                onChange={(e) => setGlobalComm(e.target.value)}
                inputMode="decimal"
                autoComplete="off"
                placeholder="Ej. 10"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
          </div>
          <div className={ADMIN_FORM_FIELD}>
            <Label className={ADMIN_FORM_LABEL}>Descuento para el comprador (global)</Label>
            <div className="relative">
              <Input
                className={cn(ADMIN_FORM_CONTROL, "pr-9")}
                value={globalDisc}
                onChange={(e) => setGlobalDisc(e.target.value)}
                inputMode="decimal"
                autoComplete="off"
                placeholder="Ej. 5"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
          </div>
        </div>
        <Button
          type="button"
          className="gradient-celeste text-primary-foreground shadow-sm"
          onClick={() => void saveGlobals()}
          disabled={loading || !affId}
        >
          Guardar globales
        </Button>
      </div>

      <div className={`${ADMIN_FORM_SECTION} space-y-4`}>
        <div>
          <h3 className="font-semibold text-foreground">Reglas por producto</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Prioridad: si hay fila para ese producto, se usa en lugar de la global. Podés cargar comisión y descuento
            juntos o gestionar cada lista abajo.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className={ADMIN_FORM_FIELD}>
            <Label className={ADMIN_FORM_LABEL}>Producto</Label>
            <Select value={prodId || "__none"} onValueChange={(v) => setProdId(v === "__none" ? "" : v)}>
              <SelectTrigger className={ADMIN_FORM_CONTROL}>
                <SelectValue placeholder="Seleccionar producto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Seleccionar producto…</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className={ADMIN_FORM_FIELD}>
            <Label className={ADMIN_FORM_LABEL}>Comisión (este producto)</Label>
            <div className="relative">
              <Input
                className={cn(ADMIN_FORM_CONTROL, "pr-9")}
                value={prodComm}
                onChange={(e) => setProdComm(e.target.value)}
                inputMode="decimal"
                autoComplete="off"
                placeholder="Ej. 8"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
          </div>
          <div className={ADMIN_FORM_FIELD}>
            <Label className={ADMIN_FORM_LABEL}>Descuento para el comprador (este producto)</Label>
            <div className="relative">
              <Input
                className={cn(ADMIN_FORM_CONTROL, "pr-9")}
                value={prodDisc}
                onChange={(e) => setProdDisc(e.target.value)}
                inputMode="decimal"
                autoComplete="off"
                placeholder="Ej. 3"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
          </div>
        </div>
        <Button
          type="button"
          className="gradient-celeste text-primary-foreground shadow-sm"
          onClick={() => void saveProductRules()}
          disabled={loading || !affId}
        >
          Guardar reglas del producto seleccionado
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className={`${ADMIN_FORM_SECTION} space-y-3`}>
          <h4 className="font-medium text-sm text-foreground">Comisiones por producto activas</h4>
          <div className="rounded-xl border border-border/80 overflow-x-auto max-h-64 overflow-y-auto bg-background/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-left">
                  <th className="p-2">Producto</th>
                  <th className="p-2">% comisión</th>
                  <th className="p-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {commRules.map((r) => (
                  <tr key={r.product_id} className="border-b border-border/50">
                    <td className="p-2">{productName(r.product_id)}</td>
                    <td className="p-2">{Number(r.commission_percent).toFixed(1)}%</td>
                    <td className="p-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        title="Quitar regla"
                        disabled={loading}
                        onClick={() => void removeCommRule(r.product_id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {commRules.length === 0 && (
              <p className="p-4 text-xs text-muted-foreground text-center">Solo aplica la comisión global.</p>
            )}
          </div>
        </div>
        <div className={`${ADMIN_FORM_SECTION} space-y-3`}>
          <h4 className="font-medium text-sm text-foreground">Descuentos al comprador por producto</h4>
          <div className="rounded-xl border border-border/80 overflow-x-auto max-h-64 overflow-y-auto bg-background/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-left">
                  <th className="p-2">Producto</th>
                  <th className="p-2">% descuento</th>
                  <th className="p-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {discRules.map((r) => (
                  <tr key={r.product_id} className="border-b border-border/50">
                    <td className="p-2">{productName(r.product_id)}</td>
                    <td className="p-2">{Number(r.discount_percent).toFixed(1)}%</td>
                    <td className="p-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        title="Quitar regla"
                        disabled={loading}
                        onClick={() => void removeDiscRule(r.product_id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {discRules.length === 0 && (
              <p className="p-4 text-xs text-muted-foreground text-center">Solo aplica el descuento global.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
