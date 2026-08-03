import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCcw, CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  getFastraxSyncStatus,
  runFastraxSyncNow,
  type FastraxSyncStatus,
} from "@/services/fastraxAdminApi";
import { cn } from "@/lib/utils";

/** Fecha/hora legible (es-PY) o guion si falta. */
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" });
}

const STATUS_META: Record<
  string,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  success: { label: "Exitosa", icon: CheckCircle2, className: "text-emerald-600" },
  partial: { label: "Parcial", icon: AlertTriangle, className: "text-amber-600" },
  failed: { label: "Con error", icon: XCircle, className: "text-red-600" },
  running: { label: "En curso", icon: Loader2, className: "text-sky-600" },
};

export function FastraxSyncStatusCard() {
  const [status, setStatus] = useState<FastraxSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await getFastraxSyncStatus();
      setStatus(s);
      return s;
    } catch (e) {
      // Silencioso en el poll; el error de acción se muestra por toast.
      if (import.meta.env.DEV) console.warn("[fastrax-sync] status error", e);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  // Mientras el server informe una corrida en curso, refrescar cada 5s.
  useEffect(() => {
    const isRunning = running || status?.running;
    if (isRunning && !pollRef.current) {
      pollRef.current = setInterval(() => void refresh(), 5000);
    } else if (!isRunning && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [running, status?.running, refresh]);

  const onRun = useCallback(
    async (mode: "incremental" | "full") => {
      setRunning(true);
      try {
        const r = await runFastraxSyncNow(mode);
        if (r.busy) {
          toast({ title: "Ya hay una sincronización en curso", description: "Esperá a que termine." });
        } else if (r.ok) {
          const s = r.stats ?? {};
          toast({
            title: `Sincronización ${r.status === "partial" ? "parcial" : "completada"}`,
            description: `Revisados ${s.reviewed ?? 0} · actualizados ${s.updated ?? 0} · nuevos ${s.inserted ?? 0}${
              s.failed ? ` · fallos ${s.failed}` : ""
            }`,
          });
        } else {
          toast({ title: "La sincronización falló", description: r.error || "Error desconocido", variant: "destructive" });
        }
      } catch (e) {
        toast({
          title: "No se pudo sincronizar",
          description: e instanceof Error ? e.message : String(e),
          variant: "destructive",
        });
      } finally {
        setRunning(false);
        void refresh();
      }
    },
    [refresh]
  );

  const run = status?.last_run ?? null;
  const meta = run ? STATUS_META[run.status] ?? STATUS_META.running : null;
  const StatusIcon = meta?.icon ?? Clock;
  const busy = running || !!status?.running;
  const stats = run?.stats ?? {};

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 w-full max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Sincronización automática de stock (Fastrax)</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {status?.auto_sync_enabled === false
              ? "Automática apagada — solo manual."
              : `Automática cada ${Math.round((status?.interval_ms ?? 600000) / 60000)} min.`}{" "}
            Actualiza stock y disponibilidad; no toca nombres, imágenes ni categorías.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label="Refrescar estado"
        >
          <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Estado</div>
          <div className={cn("flex items-center gap-1.5 font-medium", meta?.className)}>
            <StatusIcon className={cn("h-4 w-4", run?.status === "running" && "animate-spin")} />
            {busy && !run ? "En curso" : meta?.label ?? "Sin datos"}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Última exitosa</div>
          <div className="font-medium">{fmtDateTime(status?.last_successful_at)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Revisados</div>
          <div className="font-medium">{stats.reviewed ?? 0}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Actualizados</div>
          <div className="font-medium">
            {stats.updated ?? 0}
            {stats.inserted ? ` (+${stats.inserted} nuevos)` : ""}
          </div>
        </div>
      </div>

      {run && (run.status === "partial" || run.status === "failed") && run.error_message && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          {run.error_message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="button" size="sm" onClick={() => void onRun("incremental")} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-1.5" />}
          Sincronizar ahora
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void onRun("full")} disabled={busy}>
          Completa
        </Button>
        <span className="text-xs text-muted-foreground">
          {run?.trigger === "manual" ? "Última: manual" : run ? "Última: automática" : ""}
          {run?.mode ? ` · ${run.mode === "full" ? "completa" : "incremental"}` : ""}
        </span>
      </div>
    </div>
  );
}
