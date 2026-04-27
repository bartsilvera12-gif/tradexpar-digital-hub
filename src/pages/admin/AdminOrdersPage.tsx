import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { tradexpar } from "@/services/tradexpar";
import type { Order, OrderLineItem } from "@/types";
import { Loader, ErrorState, EmptyState } from "@/components/shared/Loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ITEM_STATUSES_DROPI,
  ITEM_STATUSES_ERP,
  applyLineStatusDraft,
  canFinalizeOrderFromItems,
  deriveOrderKind,
  dropiLinkForLine,
  aggregateGroupQuantity,
  aggregateGroupSubtotal,
  displayProductNameForGroup,
  groupOrderLinesForDisplay,
  hasLineDraftChanges,
  isDropiLine,
  isFastraxLine,
  isOrderClosed,
  itemSummaryGrouped,
  orderKindLabel,
  productTypeLabel,
  sourceLabel,
  statusBadgeClass,
  statusLabelEs,
} from "@/lib/adminOrdersUtils";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ADMIN_CARD, ADMIN_FORM_CONTROL, ADMIN_TABLE_SCROLL } from "@/lib/adminModuleLayout";
import { api, type AdminFastraxStatusResponse } from "@/services/api";
import { ChevronDown, ExternalLink, Loader2, Package, RefreshCw, CheckCircle2, Save, Truck } from "lucide-react";

function shortId(id: string) {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

function OrderKindBadge({ kind }: { kind: ReturnType<typeof deriveOrderKind> }) {
  const cls =
    kind === "internal"
      ? "border-sky-500/55 bg-sky-500/12 text-sky-900 dark:text-sky-100 dark:border-sky-400/45"
      : kind === "dropi"
        ? "border-orange-500/55 bg-orange-500/12 text-orange-950 dark:text-orange-100 dark:border-orange-400/45"
        : kind === "fastrax"
          ? "border-cyan-500/55 bg-cyan-500/12 text-cyan-950 dark:text-cyan-100 dark:border-cyan-400/45"
          : "border-violet-500/55 bg-violet-500/12 text-violet-950 dark:text-violet-100 dark:border-violet-400/45";
  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex items-center justify-center font-medium text-[9px] sm:text-[10px] px-2.5 py-1 min-h-[1.625rem] whitespace-nowrap shadow-sm leading-none",
        cls
      )}
    >
      {orderKindLabel(kind)}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full border px-3 py-1 min-h-[1.625rem] text-[10px] sm:text-xs font-semibold text-center leading-none whitespace-nowrap",
        statusBadgeClass(status)
      )}
    >
      {statusLabelEs(status)}
    </span>
  );
}

/** Colores alineados al reporte: Tradexpar celeste, Dropi naranja, Fastrax cian. */
function lineOriginBadgeForItem(it: OrderLineItem) {
  if (isDropiLine(it)) {
    return "border-orange-500/55 text-orange-950 dark:text-orange-100 bg-orange-500/10 shadow-sm";
  }
  if (isFastraxLine(it)) {
    return "border-cyan-500/55 text-cyan-950 dark:text-cyan-100 bg-cyan-500/10 shadow-sm";
  }
  return "border-sky-500/55 text-sky-950 dark:text-sky-100 bg-sky-500/10 shadow-sm";
}

function LineStatusSelect({
  value,
  options,
  currentUnknown,
  disabled,
  onChange,
  triggerClassName,
}: {
  value: string;
  options: readonly string[];
  currentUnknown: boolean;
  disabled?: boolean;
  onChange: (v: string) => void;
  triggerClassName?: string;
}) {
  const list =
    currentUnknown && !(options as readonly string[]).includes(value) ? [...options, value] : [...options];
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={cn(ADMIN_FORM_CONTROL, triggerClassName)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {list.map((s) => (
          <SelectItem key={s} value={s} className="text-[11px]">
            {statusLabelEs(s)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function formatDropiMapSyncAt(row: Record<string, unknown> | null | undefined): string {
  if (!row) return "—";
  const t = row.last_sync_at;
  if (t == null || t === "") return "—";
  const d = new Date(String(t));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" });
}

/** Card «Tracking Dropi» si el pedido es o incluye origen Dropi. */
function shouldShowDropiTrackingCard(o: Order) {
  const hasLine = o.items?.some((it) => isDropiLine(it)) ?? false;
  const kind = o.order_kind ?? deriveOrderKind(o.items);
  const ct = String(o.checkout_type ?? "").toLowerCase();
  if (hasLine) return true;
  if (kind === "dropi" || kind === "mixed") return true;
  if (ct === "dropi" || ct === "mixed") return true;
  return false;
}

function mapErrorDetail(m: Record<string, unknown> | null | undefined): string {
  if (!m) return "";
  const e = m.error ?? m.last_error;
  if (e == null) return "";
  return String(e).trim();
}

function isWalletInsufficient(map: Record<string, unknown> | null | undefined, errDetail: string) {
  const st = String(map?.dropi_status ?? "").toLowerCase();
  if (st !== "failed") return false;
  return /wallet/i.test(errDetail);
}

function OrderDropiCard({ o }: { o: Order }) {
  if (!shouldShowDropiTrackingCard(o)) return null;

  const [st, setSt] = useState<{
    has_map: boolean;
    map: Record<string, unknown> | null;
  } | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [actErr, setActErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadErr(null);
    void (async () => {
      try {
        const r = await api.getAdminOrderDropiStatus(o.id);
        if (!r.ok) throw new Error("Respuesta inesperada");
        setSt({ has_map: r.has_map, map: (r.map as Record<string, unknown> | null) ?? null });
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : String(e));
        setSt(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [o.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-4" data-testid="order-dropi-block">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Cargando tracking Dropi…
      </div>
    );
  }

  if (loadErr) {
    return (
      <div
        className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 mt-4 text-xs text-amber-900 dark:text-amber-100"
        data-testid="order-dropi-block"
      >
        <p className="font-medium mb-1">Tracking Dropi</p>
        <p>{loadErr}</p>
        <Button type="button" size="sm" variant="outline" className="mt-2 h-7 text-[10px]" onClick={() => void load()}>
          Reintentar
        </Button>
      </div>
    );
  }

  const map = st?.map ?? null;
  const hasMap = Boolean(st?.has_map);
  const dropiIdRaw = map && map.dropi_order_id != null && String(map.dropi_order_id).trim() !== "" ? String(map.dropi_order_id).trim() : null;
  const hasDropiId = Boolean(dropiIdRaw);
  const errDetail = mapErrorDetail(map);
  const dSt = !hasMap
    ? "Sin crear"
    : map && String(map.dropi_status_label ?? "").trim()
      ? String(map.dropi_status_label)
      : map && map.dropi_status != null && String(map.dropi_status).trim()
        ? String(map.dropi_status)
        : "—";
  const dUrl = map && String(map.dropi_order_url ?? "").trim() ? String(map.dropi_order_url).trim() : null;
  const walletFlag = isWalletInsufficient(map, errDetail);
  const dropiStatusNorm = map ? String(map.dropi_status ?? "").trim().toLowerCase() : "";
  const retryFailedDropi =
    Boolean(map) && !hasDropiId && dropiStatusNorm === "failed";

  const onCreate = () => {
    setActErr(null);
    setCreating(true);
    void (async () => {
      try {
        const r = (await api.postAdminOrderDropiCreate(o.id)) as Record<string, unknown>;
        if (r && typeof r === "object" && (r as Record<string, unknown>).ok === false) {
          const msg =
            (typeof (r as Record<string, unknown>).error === "string" && (r as Record<string, unknown>).error) ||
            (typeof (r as Record<string, unknown>).message === "string" && (r as Record<string, unknown>).message) ||
            "No se pudo crear en Dropi";
          throw new Error(String(msg));
        }
        await load();
      } catch (e) {
        setActErr(e instanceof Error ? e.message : String(e));
      } finally {
        setCreating(false);
      }
    })();
  };

  const onSync = () => {
    setActErr(null);
    setSyncing(true);
    void (async () => {
      try {
        const r = (await api.postAdminOrderDropiSyncStatus(o.id)) as Record<string, unknown>;
        if (r.ok === false) {
          const re = (r.reason as string) || "";
          if (re === "dropi_status_endpoint_pending") {
            throw new Error("El bridge aún no expone consulta de estado (DROPI_BRIDGE_GET_ORDER_PATH).");
          }
          if (re === "missing_dropi_order_id") {
            throw new Error("No hay id de pedido en Dropi para sincronizar.");
          }
          throw new Error((typeof r.error === "string" && r.error) || "Sincronización no disponible");
        }
        await load();
      } catch (e) {
        setActErr(e instanceof Error ? e.message : String(e));
      } finally {
        setSyncing(false);
      }
    })();
  };

  return (
    <div
      className="rounded-lg border border-border/80 bg-card p-3 sm:p-3.5 mt-4 space-y-2"
      data-testid="order-dropi-block"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center flex-wrap gap-2">
          <Package className="h-3.5 w-3.5 text-orange-600 dark:text-orange-300 shrink-0" />
          <p className="text-xs font-semibold text-foreground">Tracking Dropi</p>
          {walletFlag && (
            <Badge
              variant="outline"
              className="text-[9px] border-amber-500/50 bg-amber-500/15 text-amber-900 dark:text-amber-100"
            >
              Saldo insuficiente en wallet Dropi
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {dUrl && (
            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-0.5" asChild>
              <a href={dUrl} target="_blank" rel="noopener noreferrer" title="Abrir en panel Dropi">
                <ExternalLink className="h-3 w-3" />
                Abrir en Dropi
              </a>
            </Button>
          )}
          {hasDropiId && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 text-[10px] gap-0.5"
              disabled={syncing}
              onClick={onSync}
            >
              {syncing ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Sincronizando…
                </>
              ) : (
                <>
                  <RefreshCw className="h-3 w-3" />
                  Sincronizar estado
                </>
              )}
            </Button>
          )}
          {!hasDropiId && (
            <Button type="button" size="sm" className="h-7 text-[10px]" disabled={creating} onClick={onCreate}>
              {creating ? "Creando…" : retryFailedDropi ? "Reintentar pedido Dropi" : "Crear pedido Dropi"}
            </Button>
          )}
        </div>
      </div>
      {actErr && <p className="text-[10px] text-rose-600 dark:text-rose-300">{actErr}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] sm:text-xs text-muted-foreground pt-1 border-t border-border/50">
        <div>
          <span className="block font-medium text-foreground/80">Estado Dropi</span>
          <span className="text-foreground">{dSt}</span>
        </div>
        <div>
          <span className="block font-medium text-foreground/80">Dropi Order ID</span>
          <span className="font-mono text-foreground break-all">{hasDropiId ? dropiIdRaw : "—"}</span>
        </div>
        {errDetail && (
          <div className="sm:col-span-2">
            <span className="block font-medium text-foreground/80">Detalle</span>
            <span className="text-foreground/90 break-words">{errDetail}</span>
          </div>
        )}
        <div className="sm:col-span-2">
          <span className="block font-medium text-foreground/80">Última sincronización</span>
          <span>{formatDropiMapSyncAt(map)}</span>
        </div>
      </div>
    </div>
  );
}

function formatFastraxMapSyncAt(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "—";
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" });
}

function fastraxStateBadgeClass(code: number | null, err: string | null) {
  if (err) return "border-rose-500/50 bg-rose-500/10 text-rose-900 dark:text-rose-100";
  if (code === 7) return "border-emerald-500/50 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100";
  return "border-cyan-500/50 bg-cyan-500/10 text-cyan-900 dark:text-cyan-100";
}

function shouldShowFastraxTrackingCard(o: Order) {
  return o.items?.some((it) => isFastraxLine(it)) ?? false;
}

function fstrError(r: Record<string, unknown>, k: string): string {
  const v = r[k];
  return typeof v === "string" ? v : "";
}

function OrderFastraxCard({ o }: { o: Order }) {
  if (!shouldShowFastraxTrackingCard(o)) return null;

  const [st, setSt] = useState<AdminFastraxStatusResponse | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [actErr, setActErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadErr(null);
    void (async () => {
      try {
        const r = await api.getAdminOrderFastraxStatus(o.id, false);
        if (!r.ok) throw new Error("Respuesta inesperada");
        setSt(r);
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : String(e));
        setSt(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [o.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-4" data-testid="order-fastrax-block">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Cargando tracking Fastrax…
      </div>
    );
  }

  if (loadErr) {
    return (
      <div
        className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 mt-4 text-xs text-amber-900 dark:text-amber-100"
        data-testid="order-fastrax-block"
      >
        <p className="font-medium mb-1">Fastrax</p>
        <p>{loadErr}</p>
        <Button type="button" size="sm" variant="outline" className="mt-2 h-7 text-[10px]" onClick={() => void load()}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (!st) return null;
  const trk = st.tracking;
  const hasPdc = Boolean(trk?.fastrax_pdc);
  const hasMap = st.has_map;
  const errDetail = (trk?.error || "").trim() || (st.map && mapErrorDetail(st.map as Record<string, unknown>));
  const m = st.map as Record<string, unknown> | null;
  const canInvoice = hasPdc;
  const invoiceTried = m != null && m.invoice_response != null;
  const showCreate = !hasPdc;
  const showSync = hasMap;
  const showInvoice = canInvoice;
  const facturarLabel = invoiceTried ? "Reintentar facturación" : "Facturar Fastrax";

  const onCreate = () => {
    setActErr(null);
    setCreating(true);
    void (async () => {
      try {
        const r = (await api.postAdminOrderFastraxCreate(o.id)) as Record<string, unknown>;
        if (r && (r as Record<string, unknown>).ok === false) {
          const msg =
            fstrError(r, "message") || fstrError(r, "error") || "No se pudo crear en Fastrax";
          throw new Error(msg);
        }
        await load();
      } catch (e) {
        setActErr(e instanceof Error ? e.message : String(e));
      } finally {
        setCreating(false);
      }
    })();
  };

  const onSync = () => {
    setActErr(null);
    setSyncing(true);
    void (async () => {
      try {
        const r = await api.postAdminOrderFastraxSyncStatus(o.id);
        if (!r.ok) throw new Error("Sincronización Fastrax no ok");
        setSt(r);
      } catch (e) {
        setActErr(e instanceof Error ? e.message : String(e));
        try {
          const r2 = await api.getAdminOrderFastraxStatus(o.id, true);
          if (r2.ok) setSt(r2);
        } catch {
          /* */
        }
      } finally {
        setSyncing(false);
      }
    })();
  };

  const onInvoice = () => {
    setActErr(null);
    setInvoicing(true);
    void (async () => {
      try {
        const r = (await api.postAdminOrderFastraxInvoice(o.id)) as Record<string, unknown>;
        if (r && (r as Record<string, unknown>).ok === false) {
          const msg = fstrError(r, "message") || fstrError(r, "error") || "Facturación Fastrax falló";
          throw new Error(String(msg));
        }
        await load();
      } catch (e) {
        setActErr(e instanceof Error ? e.message : String(e));
      } finally {
        setInvoicing(false);
      }
    })();
  };

  const stateLabel = (trk?.status_label || "").trim() || "—";

  return (
    <div
      className="rounded-lg border border-border/80 bg-card p-3 sm:p-3.5 mt-4 space-y-2"
      data-testid="order-fastrax-block"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center flex-wrap gap-2">
          <Truck className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300 shrink-0" />
          <p className="text-xs font-semibold text-foreground">Fastrax</p>
          <Badge
            variant="outline"
            className={cn("text-[9px] max-w-full whitespace-normal", fastraxStateBadgeClass(trk?.status_code ?? null, errDetail || null))}
          >
            {stateLabel}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {showSync && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 text-[10px] gap-0.5"
              disabled={syncing}
              onClick={onSync}
            >
              {syncing ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Sincronizando…
                </>
              ) : (
                <>
                  <RefreshCw className="h-3 w-3" />
                  Sincronizar Fastrax
                </>
              )}
            </Button>
          )}
          {showCreate && (
            <Button type="button" size="sm" className="h-7 text-[10px]" disabled={creating} onClick={onCreate}>
              {creating ? "Creando…" : "Crear pedido Fastrax"}
            </Button>
          )}
          {showInvoice && (
            <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" disabled={invoicing} onClick={onInvoice}>
              {invoicing ? (invoiceTried ? "Reintentando…" : "Facturando…") : facturarLabel}
            </Button>
          )}
        </div>
      </div>
      {actErr && <p className="text-[10px] text-rose-600 dark:text-rose-300">{actErr}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] sm:text-xs text-muted-foreground pt-1 border-t border-border/50">
        <div>
          <span className="block font-medium text-foreground/80">Código</span>
          <span className="font-mono text-foreground">{trk?.status_code != null ? String(trk.status_code) : "—"}</span>
        </div>
        <div>
          <span className="block font-medium text-foreground/80">Pedido ecommerce (ped)</span>
          <span className="font-mono text-foreground break-all">{trk?.fastrax_ped || "—"}</span>
        </div>
        <div>
          <span className="block font-medium text-foreground/80">Pedido Fastrax (pdc)</span>
          <span className="font-mono text-foreground break-all">{trk?.fastrax_pdc || "—"}</span>
        </div>
        {errDetail && (
          <div className="sm:col-span-2">
            <span className="block font-medium text-foreground/80">Error</span>
            <span className="text-rose-700 dark:text-rose-200 break-words">{errDetail}</span>
          </div>
        )}
        <div className="sm:col-span-2">
          <span className="block font-medium text-foreground/80">Última sincronización</span>
          <span>{formatFastraxMapSyncAt(trk?.last_sync_at)}</span>
        </div>
      </div>
    </div>
  );
}

type LifecycleFilter = "all" | "open" | "closed";

export default function AdminOrdersPage() {
  const [orderType, setOrderType] = useState<"all" | "tradexpar" | "dropi">("all");
  const [lifecycle, setLifecycle] = useState<LifecycleFilter>("open");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  /** orderId -> itemId -> line_status (borrador hasta Guardar) */
  const [lineDrafts, setLineDrafts] = useState<Record<string, Record<string, string>>>({});
  const [savingLinesOrderId, setSavingLinesOrderId] = useState<string | null>(null);
  const [finalizingOrderId, setFinalizingOrderId] = useState<string | null>(null);

  const fetchOrders = useCallback(() => {
    setLoading(true);
    setError(null);
    tradexpar
      .adminGetOrders()
      .then((res) => setOrders(res.orders))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    setLineDrafts((prev) => {
      const next: Record<string, Record<string, string>> = {};
      for (const id of expanded) {
        const o = orders.find((x) => x.id === id);
        if (!o) continue;
        const base = { ...(prev[id] ?? {}) };
        for (const it of o.items) {
          if (!it.id) continue;
          if (base[it.id] === undefined) base[it.id] = it.line_status ?? "pending";
        }
        for (const k of Object.keys(base)) {
          if (!o.items.some((it) => it.id === k)) delete base[k];
        }
        next[id] = base;
      }
      return next;
    });
  }, [expanded, orders]);

  const filtered = useMemo(
    () =>
      orders.filter((o) => {
        const typeOk = orderType === "all" || (o.checkout_type || "tradexpar") === orderType;
        const closed = isOrderClosed(o.status);
        const lifeOk =
          lifecycle === "all" ||
          (lifecycle === "closed" && closed) ||
          (lifecycle === "open" && !closed);
        return typeOk && lifeOk;
      }),
    [orders, orderType, lifecycle]
  );

  const toggleExpand = (orderId: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(orderId)) n.delete(orderId);
      else n.add(orderId);
      return n;
    });
  };

  const patchLocalItem = (orderId: string, itemId: string, patch: Partial<OrderLineItem>) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        return {
          ...o,
          items: o.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
        };
      })
    );
  };

  const patchLocalOrder = (orderId: string, patch: Partial<Order>) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...patch } : o)));
  };

  const getDraftStatus = (orderId: string, it: OrderLineItem) => {
    const id = it.id;
    if (!id) return it.line_status ?? "pending";
    return lineDrafts[orderId]?.[id] ?? it.line_status ?? "pending";
  };

  const setDraftGroup = (orderId: string, lines: OrderLineItem[], line_status: string) => {
    setLineDrafts((d) => {
      const cur = { ...d[orderId] };
      for (const it of lines) {
        if (it.id) cur[it.id] = line_status;
      }
      return { ...d, [orderId]: cur };
    });
  };

  const getGroupDraftSelect = (orderId: string, lines: OrderLineItem[]) => {
    const statuses = lines.map((it) => getDraftStatus(orderId, it));
    const value = statuses[0] ?? "pending";
    const mixed = new Set(statuses).size > 1;
    return { value, mixed };
  };

  const saveOrderLines = useCallback(
    async (order: Order) => {
      const draft = lineDrafts[order.id];
      if (!draft) return;
      setSavingLinesOrderId(order.id);
      setError(null);
      try {
        for (const it of order.items) {
          if (!it.id) continue;
          const newS = draft[it.id];
          if (newS === undefined) continue;
          const oldS = it.line_status ?? "pending";
          if (newS === oldS) continue;
          await tradexpar.adminUpdateOrderItemLine(it.id, { line_status: newS });
          patchLocalItem(order.id, it.id, { line_status: newS });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudieron guardar las líneas");
      } finally {
        setSavingLinesOrderId(null);
      }
    },
    [lineDrafts]
  );

  const finalizeOrder = useCallback(
    async (order: Order) => {
      if (isOrderClosed(order.status)) return;
      setFinalizingOrderId(order.id);
      setError(null);
      try {
        const draft = lineDrafts[order.id];
        const merged = applyLineStatusDraft(order.items, draft);
        if (!canFinalizeOrderFromItems(merged)) {
          setError(
            "Marcá todas las líneas como entregadas, canceladas o cerradas en Dropi antes de finalizar."
          );
          return;
        }
        setSavingLinesOrderId(order.id);
        for (let i = 0; i < order.items.length; i++) {
          const it = order.items[i];
          const m = merged[i];
          if (!it?.id || !m) continue;
          const want = m.line_status ?? "pending";
          await tradexpar.adminUpdateOrderItemLine(it.id, { line_status: want });
          patchLocalItem(order.id, it.id, { line_status: want });
        }
        await tradexpar.adminUpdateOrderStatus(order.id, "completed");
        patchLocalOrder(order.id, { status: "completed" });
        setExpanded((prev) => {
          const n = new Set(prev);
          n.delete(order.id);
          return n;
        });
        setLineDrafts((d) => {
          const x = { ...d };
          delete x[order.id];
          return x;
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo finalizar el pedido");
      } finally {
        setFinalizingOrderId(null);
        setSavingLinesOrderId(null);
      }
    },
    [lineDrafts]
  );

  const missingItemIds = (order: Order) => order.items.some((it) => !it.id);

  /** Título arriba; tarjetas + tabla; acciones debajo de los productos. */
  const renderOrderDetail = (o: Order) => {
    const closed = isOrderClosed(o.status);
    const draft = lineDrafts[o.id];
    const dirty = hasLineDraftChanges(o, draft);
    const merged = applyLineStatusDraft(o.items, draft);
    const canFinalize = canFinalizeOrderFromItems(merged) && !closed;
    const busy = savingLinesOrderId === o.id || finalizingOrderId === o.id;

    const shippingLabel = (o.shipping_option && o.shipping_option.trim()) || "";
    const shippingFeeNum =
      typeof o.shipping_fee === "number" && Number.isFinite(o.shipping_fee) ? o.shipping_fee : null;

    const orderShippingSection = (
      <div className="rounded-lg border border-border/80 bg-card/60 px-3 py-3 mb-4 text-xs sm:text-sm">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Opción de envío
        </p>
        <div className="space-y-1">
          <p className="text-foreground font-medium">
            {shippingLabel || <span className="text-muted-foreground font-normal">No registrado</span>}
          </p>
          {shippingFeeNum != null && shippingFeeNum > 0 && (
            <p className="text-muted-foreground tabular-nums">
              Cargo envío: ₲{shippingFeeNum.toLocaleString("es-PY")}
            </p>
          )}
        </div>
      </div>
    );

    const sectionTitle = (
      <p className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Líneas del pedido
      </p>
    );

    const footerActions = (
      <div className="mt-4 pt-3 border-t border-border/60 space-y-2">
        {missingItemIds(o) && (
          <p className="text-[10px] text-amber-700 dark:text-amber-300">
            Faltan ids de línea en BD (migración order_items).
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {dirty && !closed && (
            <span className="text-[10px] text-muted-foreground mr-auto">Cambios sin guardar</span>
          )}
          {!closed && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                disabled={!dirty || busy || missingItemIds(o)}
                onClick={() => void saveOrderLines(o)}
              >
                <Save className="h-3.5 w-3.5" />
                Guardar líneas
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs gap-1"
                disabled={!canFinalize || dirty || busy || missingItemIds(o)}
                title={
                  dirty
                    ? "Guardá primero los cambios de las líneas"
                    : !canFinalize
                      ? "Todas las líneas deben estar resueltas (entregada, cancelada o estado Dropi cerrado)"
                      : undefined
                }
                onClick={() => void finalizeOrder(o)}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Finalizar pedido
              </Button>
            </>
          )}
        </div>
      </div>
    );

    const lineGroups = groupOrderLinesForDisplay(o.items);

    const rowCommon = (lines: OrderLineItem[]) => {
      const rep = lines[0];
      const dropi = isDropiLine(rep);
      const qty = aggregateGroupQuantity(lines);
      const sub = aggregateGroupSubtotal(lines);
      const unit = Number(rep.price) || 0;
      const sameUnit = lines.every((l) => (Number(l.price) || 0) === unit);
      const opts = dropi ? ITEM_STATUSES_DROPI : ITEM_STATUSES_ERP;
      const { value: st, mixed: statusMixed } = getGroupDraftSelect(o.id, lines);
      const stKnown = (opts as readonly string[]).includes(st);
      const href = dropiLinkForLine(rep, o.external_order_url);
      const missingAnyId = lines.some((l) => !l.id);
      const disabled = closed || missingAnyId || busy;
      const extStatuses = [...new Set(lines.map((l) => l.external_status).filter(Boolean))] as string[];
      return {
        rep,
        dropi,
        qty,
        sub,
        unit,
        sameUnit,
        opts,
        st,
        stKnown,
        statusMixed,
        href,
        disabled,
        extStatuses,
      };
    };

    if (o.items.length === 0) {
      return (
        <>
          {orderShippingSection}
          {sectionTitle}
          <p className="py-4 text-center text-sm text-muted-foreground">Sin líneas en este pedido.</p>
          <OrderDropiCard o={o} />
          <OrderFastraxCard o={o} />
        </>
      );
    }

    return (
      <>
        {orderShippingSection}
        {sectionTitle}
        <div className="grid gap-2 lg:hidden">
          {lineGroups.map((g) => {
            const {
              rep,
              dropi,
              qty,
              sub,
              unit,
              sameUnit,
              opts,
              st,
              stKnown,
              statusMixed,
              href,
              disabled,
              extStatuses,
            } = rowCommon(g.lines);
            const name = displayProductNameForGroup(g.lines);
            return (
              <div
                key={g.key}
                className="rounded-lg border border-border/80 bg-card p-3 shadow-sm space-y-2"
              >
                <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <p className="font-medium text-sm text-foreground leading-snug text-center sm:text-left flex-1 min-w-0">
                    {name}
                  </p>
                  <div className="flex justify-center sm:justify-end w-full sm:w-auto">
                    <Badge
                      variant="outline"
                      className={cn(
                        "inline-flex items-center justify-center shrink-0 text-[10px] px-2.5 py-1 min-h-[1.625rem] whitespace-nowrap leading-none",
                        lineOriginBadgeForItem(rep)
                      )}
                    >
                      {productTypeLabel(rep.product_source_type)}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>SKU</span>
                  <span className="font-mono text-foreground text-right">{rep.sku || "—"}</span>
                  <span>Fuente</span>
                  <span className="text-right text-foreground">{sourceLabel(rep.product_source_type)}</span>
                  <span>Cant.</span>
                  <span className="tabular-nums text-right text-foreground">{qty}</span>
                  <span>P. unit.</span>
                  <span className="tabular-nums text-right text-foreground">
                    {sameUnit ? `₲${unit.toLocaleString("es-PY")}` : "—"}
                  </span>
                  <span>Subtotal</span>
                  <span className="tabular-nums text-right font-semibold text-foreground">
                    ₲{Number(sub).toLocaleString("es-PY")}
                  </span>
                </div>
                {extStatuses.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                    <span className="text-muted-foreground">Ext:</span>
                    {extStatuses.map((es) => (
                      <StatusBadge key={es} status={es} />
                    ))}
                  </div>
                )}
                <div className="flex flex-col gap-2 pt-1 items-stretch">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase text-center sm:text-left">Estado ítem</label>
                  {statusMixed && (
                    <p className="text-[10px] text-amber-700 dark:text-amber-300 text-center sm:text-left">
                      Varias líneas con estados distintos; al cambiar se unifica en todas.
                    </p>
                  )}
                  <LineStatusSelect
                    value={st}
                    options={opts}
                    currentUnknown={!stKnown || statusMixed}
                    disabled={disabled}
                    onChange={(v) => setDraftGroup(o.id, g.lines, v)}
                    triggerClassName="h-9 w-full max-w-xs mx-auto sm:mx-0 sm:max-w-none text-xs justify-center sm:justify-between"
                  />
                </div>
                {href && (
                  <Button variant="outline" size="sm" className="w-full h-8 text-xs" asChild>
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                      Ver en Dropi
                    </a>
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <div className="hidden lg:block rounded-lg border border-border/80 overflow-hidden bg-card">
          <div className="overflow-x-auto max-w-full">
            <table className="w-full table-fixed text-xs min-w-0">
              <thead>
                <tr className="bg-muted/50 font-semibold uppercase text-[10px] text-muted-foreground">
                  <th className="py-2 px-2 w-[28%] text-left">Producto</th>
                  <th className="py-2 px-2 w-[12%] text-left">SKU</th>
                  <th className="py-2 px-2 w-[9%] text-center">Tipo</th>
                  <th className="py-2 px-2 w-[6%] text-right">Cant.</th>
                  <th className="py-2 px-2 w-[11%] text-right">P. unit.</th>
                  <th className="py-2 px-2 w-[11%] text-right">Subtotal</th>
                  <th className="py-2 px-2 w-[16%] text-center">Estado</th>
                  <th className="py-2 px-2 w-[12%] text-center">Fuente</th>
                </tr>
              </thead>
              <tbody>
                {lineGroups.map((g) => {
                  const {
                    rep,
                    dropi,
                    qty,
                    sub,
                    unit,
                    sameUnit,
                    opts,
                    st,
                    stKnown,
                    statusMixed,
                    disabled,
                    extStatuses,
                  } = rowCommon(g.lines);
                  const name = displayProductNameForGroup(g.lines);
                  return (
                    <tr key={g.key} className="border-t border-border/50 align-top">
                      <td className="py-2 px-2 min-w-0">
                        <div className="font-medium text-foreground line-clamp-2" title={name}>
                          {name}
                        </div>
                        {extStatuses.length > 0 && (
                          <div className="mt-1 flex items-center gap-1 flex-wrap">
                            <span className="text-[10px] text-muted-foreground">Ext:</span>
                            {extStatuses.map((es) => (
                              <StatusBadge key={es} status={es} />
                            ))}
                          </div>
                        )}
                        {statusMixed && (
                          <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">
                            Estados distintos entre líneas; al cambiar se aplica a todas.
                          </p>
                        )}
                      </td>
                      <td className="py-2 px-2 font-mono text-[11px] break-all">{rep.sku || "—"}</td>
                      <td className="py-2 px-2 text-center align-middle">
                        <div className="flex justify-center">
                          <Badge
                            variant="outline"
                            className={cn(
                              "inline-flex items-center justify-center text-[10px] px-2.5 py-1 min-h-[1.625rem] whitespace-nowrap leading-none",
                              lineOriginBadgeForItem(rep)
                            )}
                          >
                            {productTypeLabel(rep.product_source_type)}
                          </Badge>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{qty}</td>
                      <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap">
                        {sameUnit ? `₲${unit.toLocaleString("es-PY")}` : "—"}
                      </td>
                      <td className="py-2 px-2 text-right font-medium tabular-nums whitespace-nowrap">
                        ₲{Number(sub).toLocaleString("es-PY")}
                      </td>
                      <td className="py-2 px-2 min-w-0 text-center align-middle">
                        <div className="flex justify-center">
                          <LineStatusSelect
                            value={st}
                            options={opts}
                            currentUnknown={!stKnown || statusMixed}
                            disabled={disabled}
                            onChange={(v) => setDraftGroup(o.id, g.lines, v)}
                            triggerClassName="h-8 w-full max-w-[11rem] text-[11px] px-2"
                          />
                        </div>
                      </td>
                      <td className="py-2 px-2 text-muted-foreground text-[11px] text-center align-middle">
                        {sourceLabel(rep.product_source_type)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {footerActions}
        <OrderDropiCard o={o} />
        <OrderFastraxCard o={o} />
      </>
    );
  };

  return (
    <AdminPageShell
      title="Pedidos"
      description="Estados por producto (guardá con «Guardar líneas»). Finalizá el pedido cuando todas las líneas estén resueltas."
    >
      <div className="flex flex-col gap-6 w-full min-w-0">
        <div className="flex flex-col gap-6 min-w-0">
          <div className="space-y-3 w-full" role="group" aria-label="Filtrar por estado del pedido">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-2.5 w-full">
              Estado del pedido
            </p>
            <div className="flex rounded-xl border border-border/90 bg-muted/30 p-1 gap-1 shadow-inner w-full sm:w-fit sm:min-w-[280px]">
              {(
                [
                  ["open", "Pendientes"],
                  ["closed", "Cerrados"],
                  ["all", "Todos"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setLifecycle(key)}
                  className={cn(
                    "flex-1 sm:flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                    lifecycle === key
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 w-full" role="group" aria-label="Filtrar por origen del catálogo">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-2.5 w-full">
              Origen del pedido
            </p>
            <div className="flex flex-wrap gap-2 w-full">
              {(["tradexpar", "dropi", "all"] as const).map((type) => {
                const active = orderType === type;
                const ring =
                  type === "tradexpar"
                    ? active &&
                      "ring-2 ring-sky-500/50 ring-offset-2 ring-offset-background bg-sky-500/10 border-sky-500/40 text-sky-950 dark:text-sky-50"
                    : type === "dropi"
                      ? active &&
                        "ring-2 ring-orange-500/50 ring-offset-2 ring-offset-background bg-orange-500/10 border-orange-500/40 text-orange-950 dark:text-orange-50"
                      : active &&
                        "ring-2 ring-muted-foreground/25 ring-offset-2 ring-offset-background bg-muted/50 border-border";
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setOrderType(type)}
                    className={cn(
                      "px-4 py-2.5 rounded-xl text-sm font-medium border-2 border-transparent transition-all",
                      active
                        ? ring
                        : "bg-card/80 border-border/60 text-muted-foreground hover:border-border hover:text-foreground hover:bg-muted/30"
                    )}
                  >
                    <span className="inline-flex items-center gap-2">
                      {type === "tradexpar" && (
                        <span className="h-2 w-2 rounded-full bg-sky-500 shrink-0" aria-hidden />
                      )}
                      {type === "dropi" && (
                        <span className="h-2 w-2 rounded-full bg-orange-500 shrink-0" aria-hidden />
                      )}
                      {type === "all" && <span className="h-2 w-2 rounded-full bg-muted-foreground/50 shrink-0" aria-hidden />}
                      {type === "tradexpar" ? "Tradexpar" : type === "dropi" ? "Dropi" : "Todos los orígenes"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-border/70 w-full">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 shadow-sm min-w-[9.5rem]"
            onClick={() => fetchOrders()}
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </Button>
        </div>
      </div>

      {loading && <Loader text="Cargando pedidos..." />}
      {error && (
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null);
            fetchOrders();
          }}
        />
      )}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState title="Sin pedidos" description="No hay pedidos para los filtros seleccionados (estado y origen)." />
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className={ADMIN_CARD}>
          <div className={ADMIN_TABLE_SCROLL}>
            <table className="w-full min-w-[880px] text-xs sm:text-sm border-collapse">
              <thead>
                <tr className="bg-muted/30 text-left text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border/80">
                  <th className="py-3.5 pl-3 pr-1 sm:pl-4 w-10" aria-hidden />
                  <th className="py-3.5 px-3 sm:px-4 font-medium w-[10%]">Pedido</th>
                  <th className="py-3.5 px-3 sm:px-4 font-medium min-w-[140px]">Cliente</th>
                  <th className="py-3.5 px-3 sm:px-4 font-medium w-[11%]">Items</th>
                  <th className="py-3.5 px-3 sm:px-4 text-center font-medium w-[11%]">Tipo</th>
                  <th className="py-3.5 px-3 sm:px-4 text-center font-medium w-[12%]">Estado</th>
                  <th className="py-3.5 px-3 sm:px-4 text-right font-medium whitespace-nowrap w-[12%]">Total</th>
                  <th className="py-3.5 px-3 sm:px-4 font-medium w-[14%]">Fecha</th>
                  <th className="py-3.5 pl-3 pr-4 sm:pr-5 text-center font-medium w-[72px]">Acc.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {filtered.map((o) => {
                  const open = expanded.has(o.id);
                  const { productGroups, units } = itemSummaryGrouped(o.items);
                  const kind = o.order_kind ?? deriveOrderKind(o.items);
                  const closed = isOrderClosed(o.status);
                  return (
                    <Fragment key={o.id}>
                      <tr className="hover:bg-muted/25 transition-colors align-middle bg-card">
                        <td className="py-3 pl-3 pr-0 sm:pl-4 align-middle">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 sm:h-8 sm:w-8 shrink-0"
                            onClick={() => toggleExpand(o.id)}
                            aria-expanded={open}
                            aria-label={open ? "Contraer detalle" : "Expandir detalle"}
                          >
                            <ChevronDown
                              className={cn("h-4 w-4 transition-transform", open ? "rotate-180" : "rotate-0")}
                            />
                          </Button>
                        </td>
                        <td className="py-3 px-3 sm:px-4 align-middle min-w-0">
                          <span className="font-mono text-[10px] sm:text-xs text-foreground truncate block" title={o.id}>
                            {shortId(o.id)}
                          </span>
                        </td>
                        <td className="py-3 px-3 sm:px-4 align-middle min-w-0">
                          <div className="font-medium text-foreground text-xs sm:text-sm truncate" title={o.customer?.name}>
                            {o.customer?.name || "—"}
                          </div>
                          <div className="text-[10px] sm:text-xs text-muted-foreground truncate mt-0.5">
                            {o.customer?.email || o.customer?.phone || ""}
                          </div>
                        </td>
                        <td className="py-3 px-3 sm:px-4 align-middle text-muted-foreground leading-snug">
                          {productGroups === 0 ? (
                            "—"
                          ) : (
                            <span className="block tabular-nums">
                              <span>{productGroups}</span> prod. · <span>{units}</span> u.
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 sm:px-4 align-middle text-center">
                          <div className="flex justify-center items-center min-h-[2.5rem]">
                            <OrderKindBadge kind={kind} />
                          </div>
                        </td>
                        <td className="py-3 px-3 sm:px-4 align-middle min-w-0 text-center">
                          <div className="flex flex-col gap-1.5 items-center justify-center min-h-[2.5rem]">
                            <StatusBadge status={o.status} />
                            {closed && (
                              <span className="text-[9px] text-muted-foreground leading-tight text-center max-w-[7rem]">
                                Pedido cerrado
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 sm:px-4 align-middle text-right font-semibold tabular-nums text-xs sm:text-sm whitespace-nowrap text-foreground">
                          ₲{Number(o.total || 0).toLocaleString("es-PY")}
                        </td>
                        <td className="py-3 px-3 sm:px-4 align-middle text-muted-foreground text-[10px] sm:text-xs leading-snug">
                          {new Date(o.created_at).toLocaleString("es-PY", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </td>
                        <td className="py-3 pl-3 pr-4 sm:pr-5 align-middle text-center">
                          {(() => {
                            const url = o.external_order_url?.trim() || null;
                            return url ? (
                              <Button variant="outline" size="sm" className="h-7 sm:h-8 px-1.5 text-[10px] sm:text-xs gap-0.5" asChild>
                                <a href={url} target="_blank" rel="noopener noreferrer" title="Abrir en Dropi">
                                  <ExternalLink className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                                  <span className="hidden sm:inline">Dropi</span>
                                </a>
                              </Button>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            );
                          })()}
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-muted/15">
                          <td colSpan={9} className="p-0 border-t border-border/60">
                            <div className="px-3 py-4 sm:px-5 sm:py-5 border-l-[3px] border-primary/35 bg-muted/10">
                              {renderOrderDetail(o)}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}
