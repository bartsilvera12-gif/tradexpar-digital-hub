import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Copy, Loader2, RefreshCw } from "lucide-react";
import logoIcon from "@/assets/logo-icon.png";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getSupabaseAuth,
  runAuthExclusive,
  setDataClientAccessToken,
  tryReadAuthAccessTokenFromStorage,
} from "@/lib/supabaseClient";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import {
  affiliatesAvailable,
  buildAffiliateStoreUrl,
  fetchAffiliatePortalLinkVisible,
  fetchAffiliatePortalSnapshot,
  fetchPublicAffiliateAssets,
} from "@/services/affiliateTradexparService";
import { commissionStatusLabelEs } from "@/lib/affiliateCommissionLabels";
import { DDI } from "@/lib/ddiLabels";
import type { AffiliatePortalSaleRow, AffiliatePortalSnapshot, CommissionStatus } from "@/types/affiliates";
import type { AffiliateAssetRow } from "@/types/affiliatesPro";

type SaleFilter = "all" | CommissionStatus;

/** Sesión GoTrue a veces tarda (lock); las RPC del panel pueden ser pesadas. Topes separados evitan un único 35s falso positivo. */
const SESSION_READY_MS = 22_000;
const AFFILIATE_RPC_MS = 65_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

/** URLs guardadas como ruta absoluta en el sitio (p. ej. /affiliate-assets/...) */
function resolvePublicAssetUrl(fileUrl: string): string {
  const t = fileUrl.trim();
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  if (t.startsWith("/")) {
    const envBase = import.meta.env.VITE_PUBLIC_SITE_URL?.replace(/\/$/, "");
    const base = envBase || (typeof window !== "undefined" ? window.location.origin : "");
    return base ? `${base}${t}` : t;
  }
  return t;
}

export default function AffiliatePortalPage() {
  const { user } = useCustomerAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [pendingReview, setPendingReview] = useState(false);
  const [snapshot, setSnapshot] = useState<AffiliatePortalSnapshot | null>(null);
  const [saleFilter, setSaleFilter] = useState<SaleFilter>("all");
  const [assets, setAssets] = useState<AffiliateAssetRow[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!affiliatesAvailable()) {
      setLoading(false);
      setSnapshot(null);
      setPendingReview(false);
      return;
    }
    setLoading(true);
    setPendingReview(false);
    setLoadError(null);
    try {
      let token = tryReadAuthAccessTokenFromStorage();
      if (!token) {
        const sessionRes = await withTimeout(
          runAuthExclusive(() => getSupabaseAuth().auth.getSession()),
          SESSION_READY_MS,
          "Tiempo de espera al leer tu sesión. Probá recargar la página o cerrar sesión y volver a entrar."
        );
        if (sessionRes.error) {
          throw new Error(sessionRes.error.message);
        }
        token = sessionRes.data.session?.access_token ?? null;
      }
      setDataClientAccessToken(token);
      if (!token) {
        setSnapshot({ ok: false, reason: "not_authenticated" });
        return;
      }

      await withTimeout(
        (async () => {
          /** Snapshot primero: es la fuente de verdad. `eligible` solo desempata no_affiliate (pendiente vs ir a postular). */
          const snap = await fetchAffiliatePortalSnapshot();
          if (snap.ok) {
            setSnapshot(snap);
            return;
          }
          if (snap.reason === "not_authenticated") {
            setSnapshot(snap);
            return;
          }
          if (snap.reason === "no_affiliate") {
            const eligible = await fetchAffiliatePortalLinkVisible();
            if (eligible) {
              setSnapshot(null);
              setPendingReview(true);
            } else {
              navigate("/afiliados", { replace: true });
            }
            return;
          }
          setSnapshot(snap);
        })(),
        AFFILIATE_RPC_MS,
        `El servidor tardó demasiado en responder el panel de ${DDI.pluralLower}. Revisá tu conexión o intentá de nuevo.`
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al cargar el panel";
      setLoadError(msg);
      toast.error(msg);
      setSnapshot({ ok: false, reason: "error" });
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    void load();
  }, [load, user?.id]);

  const filteredSales = useMemo(() => {
    if (!snapshot || !snapshot.ok) return [];
    if (saleFilter === "all") return snapshot.sales;
    return snapshot.sales.filter((s) => s.commission_status === saleFilter);
  }, [snapshot, saleFilter]);

  const copyLink = (code: string) => {
    void navigator.clipboard.writeText(buildAffiliateStoreUrl(code));
    toast.success("Link copiado");
  };

  const loadAssets = useCallback(() => {
    setAssetsLoading(true);
    fetchPublicAffiliateAssets()
      .then(setAssets)
      .catch(() => setAssets([]))
      .finally(() => setAssetsLoading(false));
  }, []);

  useEffect(() => {
    if (snapshot && "ok" in snapshot && snapshot.ok) void loadAssets();
  }, [snapshot, loadAssets]);

  if (!affiliatesAvailable()) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-lg">
        <h1 className="text-2xl font-bold text-foreground mb-2">{DDI.panelTitle}</h1>
        <p className="text-sm text-muted-foreground">Supabase no está configurado.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-20 flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">Cargando tu panel…</p>
      </div>
    );
  }

  if (pendingReview) {
    return (
      <div className="container mx-auto px-4 py-10 max-w-2xl space-y-6">
        <div className="flex items-center gap-2 text-foreground">
          <img src={logoIcon} alt="Tradexpar" className="h-8 w-8 shrink-0" width={32} height={32} />
          <h1 className="text-2xl font-bold">{DDI.panelTitle}</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Solicitud en revisión</CardTitle>
            <CardDescription>
              Ya enviaste tu postulación y está pendiente de aprobación. Cuando el equipo la apruebe, vas a ver acá tu
              código de enlace (?ref), comisiones y enlaces.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Actualizar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!snapshot || !snapshot.ok) {
    const reason = snapshot && !snapshot.ok ? snapshot.reason : "error";
    const needLogin = reason === "not_authenticated";
    return (
      <div className="container mx-auto px-4 py-16 max-w-lg space-y-4">
        <div className="flex items-center gap-2 text-foreground">
          <img src={logoIcon} alt="Tradexpar" className="h-7 w-7 shrink-0" width={28} height={28} />
          <h1 className="text-2xl font-bold">{DDI.panelTitle}</h1>
        </div>
        {needLogin ? (
          <>
            <p className="text-sm text-muted-foreground">
              Iniciá sesión con la misma cuenta con la que comprás en la tienda para ver tus comisiones y enlaces.
            </p>
            <Button asChild className="gradient-celeste">
              <Link to="/login">Iniciar sesión</Link>
            </Button>
          </>
        ) : reason === "no_affiliate" ? (
          <>
            <p className="text-sm text-muted-foreground">
              {`No encontramos un ${DDI.singularLower} `}
              <strong className="text-foreground font-medium">activo</strong> asociado a tu sesión. Suele pasar por una
              de estas causas:
            </p>
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1.5">
              <li>
                Iniciaste sesión con un email distinto al que usaste en la solicitud de {DDI.singularLower} (tiene que
                ser el mismo,
                sin importar mayúsculas).
              </li>
              <li>
                Tu solicitud está pendiente o el registro no está en estado activo en la base de datos (revisá con
                admin).
              </li>
              <li>
                En Supabase, el {DDI.singularLower} tiene un{" "}
                <code className="text-xs bg-muted px-1 rounded">customer_id</code>{" "}
                que apunta a otro cliente: entonces hace falta corregir el vínculo o usar el usuario correcto.
              </li>
            </ul>
            <p className="text-xs text-muted-foreground">
              Si ya fuiste aprobado, probá cerrar sesión y volver a entrar con el mismo email del alta de{" "}
              {DDI.singularLower}.
            </p>
            <Button variant="outline" asChild>
              <Link to="/afiliados">Postularme como {DDI.singularLower}</Link>
            </Button>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-destructive font-medium">No se pudo cargar el panel.</p>
            {loadError ? (
              <p className="text-xs text-muted-foreground break-words rounded-md border border-border bg-muted/40 px-3 py-2 font-mono">
                {loadError}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Reintentá en unos segundos o volvé a iniciar sesión.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="default" size="sm" onClick={() => void load()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reintentar
              </Button>
              <Button type="button" variant="outline" size="sm" asChild>
                <Link to="/login">Iniciar sesión de nuevo</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const { affiliate, totals_pending, totals_approved, totals_paid } = snapshot;

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <img src={logoIcon} alt="Tradexpar" className="h-8 w-8 shrink-0" width={32} height={32} />
            {DDI.panelTitle}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Hola, {affiliate.name}. Código: <span className="font-mono text-foreground">{affiliate.code}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end w-full sm:w-auto">
          <Button type="button" variant="outline" size="sm" onClick={() => copyLink(affiliate.code)}>
            <Copy className="h-4 w-4 mr-2" />
            Copiar mi link
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Comisión pendiente</CardDescription>
            <CardTitle className="text-2xl">₲ {Number(totals_pending).toLocaleString("es-PY")}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Aún no aprobada para pago</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Comisión aprobada</CardDescription>
            <CardTitle className="text-2xl">₲ {Number(totals_approved).toLocaleString("es-PY")}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Lista para liquidación</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Comisión pagada</CardDescription>
            <CardTitle className="text-2xl">₲ {Number(totals_paid).toLocaleString("es-PY")}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Histórico abonado</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Materiales promocionales</CardTitle>
          <CardDescription>Banners y recursos que la marca publica para tu promoción.</CardDescription>
        </CardHeader>
        <CardContent>
          {assetsLoading ? (
            <p className="text-sm text-muted-foreground py-4 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando…
            </p>
          ) : assets.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No hay materiales publicados aún.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {assets.map((a) => {
                const href = resolvePublicAssetUrl(a.file_url);
                return (
                  <li key={a.id} className="rounded-lg border p-3 space-y-2">
                    <div className="font-medium text-sm">{a.title}</div>
                    <div className="text-xs text-muted-foreground capitalize">{a.asset_type}</div>
                    {a.asset_type === "image" ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-md overflow-hidden bg-muted/50 border border-border/60"
                      >
                        <img
                          src={href}
                          alt={a.title}
                          className="w-full max-h-56 object-contain"
                          loading="lazy"
                        />
                      </a>
                    ) : null}
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary underline-offset-4 hover:underline break-all"
                    >
                      Abrir / descargar
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
          <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => void loadAssets()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualizar materiales
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tus ventas atribuidas</CardTitle>
          <CardDescription>
            Descuento global para compradores: {Number(affiliate.default_buyer_discount_percent).toFixed(1)}% · Tu
            comisión base: {Number(affiliate.commission_rate).toFixed(1)}%
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "all" as const, label: "Todas" },
                { id: "pending" as const, label: "Pendientes" },
                { id: "approved" as const, label: "Aprobadas" },
                { id: "paid" as const, label: "Pagadas" },
                { id: "rejected" as const, label: "Rechazadas" },
                { id: "cancelled" as const, label: "Canceladas" },
              ] as const
            ).map(({ id, label }) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant={saleFilter === id ? "default" : "outline"}
                className={saleFilter === id ? "gradient-celeste" : ""}
                onClick={() => setSaleFilter(id)}
              >
                {label}
              </Button>
            ))}
          </div>
          <SalesTable rows={filteredSales} />
        </CardContent>
      </Card>
    </div>
  );
}

function SalesTable({ rows }: { rows: AffiliatePortalSaleRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">No hay ventas en este filtro.</p>;
  }
  return (
    <div className="rounded-xl border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="p-3">Pedido</th>
            <th className="p-3">Fecha</th>
            <th className="p-3">Productos</th>
            <th className="p-3">Cant.</th>
            <th className="p-3">Total pedido</th>
            <th className="p-3">Tu comisión</th>
            <th className="p-3">Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.attribution_id} className="border-b border-border/60 align-top">
              <td className="p-3 font-mono text-xs">{String(r.order_id).slice(0, 8)}…</td>
              <td className="p-3 whitespace-nowrap">{new Date(r.order_created_at).toLocaleString("es-PY")}</td>
              <td className="p-3 max-w-[220px] text-xs text-muted-foreground">{r.products_label || "—"}</td>
              <td className="p-3">{r.total_qty}</td>
              <td className="p-3">₲ {Number(r.order_total).toLocaleString("es-PY")}</td>
              <td className="p-3 font-medium">₲ {Number(r.commission_total).toLocaleString("es-PY")}</td>
              <td className="p-3">{commissionStatusLabelEs(r.commission_status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
