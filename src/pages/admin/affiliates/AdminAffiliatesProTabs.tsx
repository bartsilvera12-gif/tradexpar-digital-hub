import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
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
import { tradexpar } from "@/services/tradexpar";
import {
  fetchAffiliateAnalytics,
  insertAffiliateAssetAdmin,
  listAffiliateAdjustments,
  listAffiliateAssets,
  listAffiliateFraudFlags,
  listAffiliates,
  setAffiliateAssetActive,
  setFraudFlagStatus,
} from "@/services/affiliateTradexparService";
import type { Product } from "@/types";
import type {
  AffiliateAnalyticsPayload,
  AffiliateAssetRow,
  AffiliateCommissionAdjustmentRow,
  AffiliateFraudFlagRow,
} from "@/types/affiliatesPro";
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
import { cn } from "@/lib/utils";
import { Loader } from "@/components/shared/Loader";
import { DDI } from "@/lib/ddiLabels";

export function FraudTab() {
  const [flags, setFlags] = useState<AffiliateFraudFlagRow[]>([]);
  const [adj, setAdj] = useState<AffiliateCommissionAdjustmentRow[]>([]);
  const [filter, setFilter] = useState<"all" | "open">("open");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([listAffiliateFraudFlags(), listAffiliateAdjustments()])
      .then(([f, a]) => {
        setFlags(f);
        setAdj(a);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = filter === "open" ? flags.filter((x) => x.status === "open") : flags;

  const setStatus = async (id: string, status: string) => {
    try {
      await setFraudFlagStatus(id, status);
      toast.success("Estado actualizado");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  if (loading) return <Loader text="Cargando antifraude…" />;

  return (
    <div className="w-full min-w-0 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={filter === "open" ? "default" : "outline"} onClick={() => setFilter("open")}>
            Abiertas
          </Button>
          <Button type="button" size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
            Todas
          </Button>
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
                <th className={ADMIN_TH}>Tipo</th>
                <th className={ADMIN_TH}>Severidad</th>
                <th className={ADMIN_TH}>Estado</th>
                <th className={ADMIN_TH}>{DDI.columnHeader}</th>
                <th className={ADMIN_TH}>Pedido</th>
                <th className={ADMIN_TH}>Notas</th>
                <th className={ADMIN_TH}>Fecha</th>
                <th className={ADMIN_TH}>Acción</th>
              </tr>
            </thead>
            <tbody className={ADMIN_TBODY}>
              {rows.map((f) => (
                <tr key={f.id} className={`${ADMIN_TR} align-top`}>
                  <td className={`${ADMIN_TD} font-mono text-xs`}>{f.flag_type}</td>
                  <td className={`${ADMIN_TD} capitalize`}>{f.severity}</td>
                  <td className={`${ADMIN_TD} capitalize`}>{f.status}</td>
                  <td className={`${ADMIN_TD} font-mono text-xs`}>{f.affiliate_id.slice(0, 8)}…</td>
                  <td className={`${ADMIN_TD} font-mono text-xs`}>{f.order_id ? `${f.order_id.slice(0, 8)}…` : "—"}</td>
                  <td className={`${ADMIN_TD} max-w-[200px] text-xs text-muted-foreground`}>{f.notes || "—"}</td>
                  <td className={`${ADMIN_TD} whitespace-nowrap`}>{new Date(f.created_at).toLocaleString("es-PY")}</td>
                  <td className={ADMIN_TD}>
                  {f.status === "open" ? (
                    <div className="flex flex-col gap-1">
                      <Button type="button" size="sm" variant="secondary" onClick={() => void setStatus(f.id, "reviewed")}>
                        Revisada
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => void setStatus(f.id, "dismissed")}>
                        Descartar
                      </Button>
                      <Button type="button" size="sm" variant="destructive" onClick={() => void setStatus(f.id, "confirmed")}>
                        Confirmar fraude
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
          {rows.length === 0 && <p className="p-6 text-center text-muted-foreground">Sin alertas en este filtro.</p>}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-foreground mb-2">Ajustes de comisión (reversiones)</h3>
        <div className={ADMIN_CARD}>
          <div className={ADMIN_TABLE_SCROLL}>
            <table className={ADMIN_TABLE}>
              <thead>
                <tr className={ADMIN_THEAD_ROW}>
                  <th className={ADMIN_TH}>{DDI.columnHeader}</th>
                  <th className={ADMIN_TH}>Tipo</th>
                  <th className={ADMIN_TH}>Monto</th>
                  <th className={ADMIN_TH}>Motivo</th>
                  <th className={ADMIN_TH}>Fecha</th>
                </tr>
              </thead>
              <tbody className={ADMIN_TBODY}>
                {adj.map((a) => (
                  <tr key={a.id} className={ADMIN_TR}>
                    <td className={`${ADMIN_TD} font-mono text-xs`}>{a.affiliate_id.slice(0, 8)}…</td>
                    <td className={ADMIN_TD}>{a.type}</td>
                    <td className={ADMIN_TD}>₲ {Number(a.amount).toLocaleString("es-PY")}</td>
                    <td className={`${ADMIN_TD} text-xs max-w-[240px]`}>{a.reason || "—"}</td>
                    <td className={`${ADMIN_TD} whitespace-nowrap`}>{new Date(a.created_at).toLocaleString("es-PY")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {adj.length === 0 && <p className="p-4 text-center text-muted-foreground text-sm">Sin ajustes registrados.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AssetsTab() {
  const [rows, setRows] = useState<AffiliateAssetRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    asset_type: "image",
    file_url: "",
    product_id: "none",
  });

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([listAffiliateAssets(), tradexpar.getProducts()])
      .then(([a, p]) => {
        setRows(a);
        setProducts(p);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form.title.trim() || !form.file_url.trim()) {
      toast.error("Título y URL del archivo son obligatorios");
      return;
    }
    setSaving(true);
    try {
      await insertAffiliateAssetAdmin({
        title: form.title,
        asset_type: form.asset_type,
        file_url: form.file_url,
        product_id: form.product_id === "none" ? null : form.product_id,
        is_active: true,
      });
      toast.success("Material creado");
      setForm({ title: "", asset_type: "image", file_url: "", product_id: "none" });
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (id: string, active: boolean) => {
    try {
      await setAffiliateAssetActive(id, !active);
      toast.success(active ? "Desactivado" : "Activado");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  if (loading) return <Loader text="Cargando materiales…" />;

  return (
    <div className="w-full min-w-0 space-y-8">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualizar
        </Button>
      </div>

      <div className={ADMIN_FORM_SECTION}>
        <h3 className="font-semibold text-foreground">Nuevo material</h3>
        <p className="text-xs text-muted-foreground">Subí el archivo a tu storage/CDN y pegá la URL pública.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className={cn(ADMIN_FORM_FIELD, "sm:col-span-2")}>
            <Label className={ADMIN_FORM_LABEL}>Título</Label>
            <Input
              className={ADMIN_FORM_CONTROL}
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            />
          </div>
          <div className={ADMIN_FORM_FIELD}>
            <Label className={ADMIN_FORM_LABEL}>Tipo</Label>
            <Select value={form.asset_type} onValueChange={(v) => setForm((p) => ({ ...p, asset_type: v }))}>
              <SelectTrigger className={ADMIN_FORM_CONTROL}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="image">Imagen</SelectItem>
                <SelectItem value="video">Video</SelectItem>
                <SelectItem value="text">Texto</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className={ADMIN_FORM_FIELD}>
            <Label className={ADMIN_FORM_LABEL}>Producto (opcional)</Label>
            <Select value={form.product_id} onValueChange={(v) => setForm((p) => ({ ...p, product_id: v }))}>
              <SelectTrigger className={ADMIN_FORM_CONTROL}>
                <SelectValue placeholder="Ninguno" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ninguno</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={cn(ADMIN_FORM_FIELD, "sm:col-span-2")}>
            <Label className={ADMIN_FORM_LABEL}>URL del archivo</Label>
            <Input
              className={ADMIN_FORM_CONTROL}
              value={form.file_url}
              onChange={(e) => setForm((p) => ({ ...p, file_url: e.target.value }))}
            />
          </div>
        </div>
        <Button type="button" className="gradient-celeste text-primary-foreground shadow-sm" onClick={() => void save()} disabled={saving}>
          Guardar
        </Button>
      </div>

      <div className={ADMIN_CARD}>
        <div className={ADMIN_TABLE_SCROLL}>
          <table className={ADMIN_TABLE}>
            <thead>
              <tr className={ADMIN_THEAD_ROW}>
                <th className={ADMIN_TH}>Título</th>
                <th className={ADMIN_TH}>Tipo</th>
                <th className={ADMIN_TH}>URL</th>
                <th className={ADMIN_TH}>Activo</th>
                <th className={ADMIN_TH}>Acción</th>
              </tr>
            </thead>
            <tbody className={ADMIN_TBODY}>
              {rows.map((r) => (
                <tr key={r.id} className={ADMIN_TR}>
                  <td className={`${ADMIN_TD} font-medium`}>{r.title}</td>
                  <td className={ADMIN_TD}>{r.asset_type}</td>
                  <td className={`${ADMIN_TD} max-w-[200px] truncate text-xs`}>
                    <a href={r.file_url} className="text-primary underline" target="_blank" rel="noreferrer">
                      {r.file_url}
                    </a>
                  </td>
                  <td className={ADMIN_TD}>{r.is_active ? "Sí" : "No"}</td>
                  <td className={ADMIN_TD}>
                    <Button type="button" size="sm" variant="outline" onClick={() => void toggle(r.id, r.is_active)}>
                      {r.is_active ? "Desactivar" : "Activar"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="p-6 text-center text-muted-foreground">Sin materiales.</p>}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="text-lg font-semibold text-foreground mt-1">{value}</p>
    </div>
  );
}

export function AnalyticsTab() {
  const [data, setData] = useState<AffiliateAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetchAffiliateAnalytics()
      .then(setData)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Loader text="Cargando analytics…" />;
  if (!data) return <p className="text-muted-foreground">Sin datos.</p>;

  const c = data.commissions_by_status;
  const f = data.funnel_30d;

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualizar
        </Button>
      </div>

      <div>
        <h3 className="font-semibold text-foreground mb-3">Embudo 30 días</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <MetricCard title="Visitas" value={String(f.visits_30d)} />
          <MetricCard title="Atribuciones (ventas)" value={String(f.attributions_30d)} />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Conversión aprox.:{" "}
          {f.visits_30d > 0 ? `${((f.attributions_30d / f.visits_30d) * 100).toFixed(2)}%` : "—"}
        </p>
      </div>

      <div>
        <h3 className="font-semibold text-foreground mb-3">Comisiones por estado</h3>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          <MetricCard title="Pendiente" value={`₲ ${Number(c.pending).toLocaleString("es-PY")}`} />
          <MetricCard title="Aprobada" value={`₲ ${Number(c.approved).toLocaleString("es-PY")}`} />
          <MetricCard title="Pagada" value={`₲ ${Number(c.paid).toLocaleString("es-PY")}`} />
          <MetricCard title="Cancelada" value={`₲ ${Number(c.cancelled).toLocaleString("es-PY")}`} />
          <MetricCard title="Rechazada" value={`₲ ${Number(c.rejected).toLocaleString("es-PY")}`} />
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-foreground mb-2">{`Top ${DDI.pluralLower}`}</h3>
        <div className={ADMIN_CARD}>
          <div className={ADMIN_TABLE_SCROLL}>
            <table className={ADMIN_TABLE}>
              <thead>
                <tr className={ADMIN_THEAD_ROW}>
                  <th className={ADMIN_TH}>Nombre</th>
                  <th className={ADMIN_TH}>Código</th>
                  <th className={ADMIN_TH}>Ventas</th>
                  <th className={ADMIN_TH}>Comisión Σ</th>
                </tr>
              </thead>
              <tbody className={ADMIN_TBODY}>
                {(data.top_affiliates ?? []).map((x) => (
                  <tr key={x.affiliate_id} className={ADMIN_TR}>
                    <td className={ADMIN_TD}>{x.name}</td>
                    <td className={`${ADMIN_TD} font-mono text-xs`}>{x.code}</td>
                    <td className={ADMIN_TD}>{x.sales}</td>
                    <td className={ADMIN_TD}>₲ {Number(x.commission_sum).toLocaleString("es-PY")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-foreground mb-2">{`Productos más vendidos vía ${DDI.pluralLower}`}</h3>
        <div className={ADMIN_CARD}>
          <div className={ADMIN_TABLE_SCROLL}>
            <table className={ADMIN_TABLE}>
              <thead>
                <tr className={ADMIN_THEAD_ROW}>
                  <th className={ADMIN_TH}>Producto</th>
                  <th className={ADMIN_TH}>Cant.</th>
                  <th className={ADMIN_TH}>Ingresos</th>
                </tr>
              </thead>
              <tbody className={ADMIN_TBODY}>
                {(data.top_products ?? []).map((x) => (
                  <tr key={String(x.product_id)} className={ADMIN_TR}>
                    <td className={ADMIN_TD}>{x.product_name || x.product_id}</td>
                    <td className={ADMIN_TD}>{x.qty}</td>
                    <td className={ADMIN_TD}>₲ {Number(x.revenue).toLocaleString("es-PY")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-foreground mb-2">{`Devoluciones por ${DDI.singularLower}`}</h3>
        <div className={ADMIN_CARD}>
          <div className={ADMIN_TABLE_SCROLL}>
            <table className={ADMIN_TABLE}>
              <thead>
                <tr className={ADMIN_THEAD_ROW}>
                  <th className={ADMIN_TH}>{DDI.columnHeader}</th>
                  <th className={ADMIN_TH}>Pedidos atrib.</th>
                  <th className={ADMIN_TH}>Reembolsos</th>
                </tr>
              </thead>
              <tbody className={ADMIN_TBODY}>
                {(data.refunds_by_affiliate ?? []).map((x) => (
                  <tr key={x.affiliate_id} className={ADMIN_TR}>
                    <td className={ADMIN_TD}>{x.name}</td>
                    <td className={ADMIN_TD}>{x.orders}</td>
                    <td className={ADMIN_TD}>{x.refunds}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  );
}
