import { motion } from "framer-motion";
import {
  Bell,
  CheckCheck,
  DollarSign,
  Package,
  ShoppingCart,
  TrendingUp,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { tradexpar } from "@/services/tradexpar";
import { Loader } from "@/components/shared/Loader";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { ADMIN_PANEL } from "@/lib/adminModuleLayout";
import { cn } from "@/lib/utils";
import type { CustomerUser, Order, Product } from "@/types";

const LOW_STOCK_MAX = 5;
const STOCK_DISMISSED_KEY = "tradexpar_admin_stock_dismissed";
/** Evita spinner eterno si PostgREST no responde. */
const DASHBOARD_FETCH_MS = 22000;

function loadDismissedStockIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STOCK_DISMISSED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveDismissedStockIds(ids: Set<string>) {
  localStorage.setItem(STOCK_DISMISSED_KEY, JSON.stringify([...ids]));
}

function isLowStock(p: Product) {
  return (p.stock ?? 0) <= LOW_STOCK_MAX;
}

function startOfCurrentMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

export default function AdminDashboardPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<CustomerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [stockPopoverOpen, setStockPopoverOpen] = useState(false);
  const [dismissedStockIds, setDismissedStockIds] = useState<Set<string>>(() => loadDismissedStockIds());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const bundle = Promise.all([
      tradexpar.getProducts().catch(() => [] as Product[]),
      tradexpar.adminGetOrders().catch(() => ({ orders: [] as Order[] })),
      tradexpar.adminGetUsers().catch(() => ({ users: [] as CustomerUser[] })),
    ]);
    Promise.race([
      bundle,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), DASHBOARD_FETCH_MS)),
    ])
      .then((result) => {
        if (cancelled) return;
        const [prods, ordersRes, usersRes] = result as [
          Product[],
          { orders: Order[] },
          { users: CustomerUser[] },
        ];
        setProducts(Array.isArray(prods) ? prods : []);
        setOrders(ordersRes.orders ?? []);
        setUsers(usersRes.users ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setProducts([]);
          setOrders([]);
          setUsers([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setDismissedStockIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of next) {
        const p = products.find((x) => x.id === id);
        if (!p || !isLowStock(p)) {
          next.delete(id);
          changed = true;
        }
      }
      if (changed) saveDismissedStockIds(next);
      return next;
    });
  }, [products]);

  const lowStockProducts = useMemo(() => products.filter(isLowStock), [products]);
  const pendingStockProducts = useMemo(
    () => lowStockProducts.filter((p) => !dismissedStockIds.has(p.id)),
    [lowStockProducts, dismissedStockIds]
  );
  const pendingStockCount = pendingStockProducts.length;

  const markStockNotificationsRead = () => {
    setDismissedStockIds((prev) => {
      const next = new Set(prev);
      products.filter(isLowStock).forEach((p) => next.add(p.id));
      saveDismissedStockIds(next);
      return next;
    });
    setStockPopoverOpen(false);
  };

  const markSingleStockRead = (productId: string) => {
    setDismissedStockIds((prev) => {
      if (prev.has(productId)) return prev;
      const next = new Set(prev);
      next.add(productId);
      saveDismissedStockIds(next);
      return next;
    });
  };

  const totalProducts = products.length;
  const totalStock = products.reduce((sum, p) => sum + (p.stock || 0), 0);

  const monthStart = useMemo(() => startOfCurrentMonth(), []);
  const ordersThisMonth = useMemo(
    () =>
      orders.filter((o) => {
        const t = new Date(o.created_at).getTime();
        return !Number.isNaN(t) && t >= monthStart.getTime();
      }),
    [orders, monthStart]
  );
  const monthRevenue = ordersThisMonth.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const totalRevenue = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);

  const categoryData = products.reduce<Record<string, number>>((acc, p) => {
    const cat = p.category || "Sin categoría";
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});
  const chartData = Object.entries(categoryData).map(([name, count]) => ({ name, count }));

  const recentOrders = useMemo(() => {
    return [...orders]
      .filter((o) => o.created_at)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 6);
  }, [orders]);

  const monthlySalesChart = useMemo(() => {
    const map = new Map<string, number>();
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map.set(key, 0);
    }
    orders.forEach((o) => {
      const dt = new Date(o.created_at);
      if (Number.isNaN(dt.getTime())) return;
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      if (map.has(key)) map.set(key, (map.get(key) ?? 0) + (Number(o.total) || 0));
    });
    return [...map.entries()].map(([key, total]) => {
      const [y, m] = key.split("-");
      const label = `${m}/${y.slice(2)}`;
      return { name: label, total };
    });
  }, [orders]);

  const stats = [
    {
      label: "Ventas del mes en curso",
      value: `Gs. ${monthRevenue.toLocaleString("es-PY")}`,
      icon: TrendingUp,
      hint: "Total facturado en pedidos registrados desde el primer día del mes hasta hoy.",
    },
    {
      label: "Clientes registrados",
      value: String(users.length),
      icon: Users,
      hint: "Cuentas de cliente creadas en la tienda.",
    },
    {
      label: "Ingresos acumulados",
      value: `Gs. ${totalRevenue.toLocaleString("es-PY")}`,
      icon: DollarSign,
      hint: "Suma de todos los pedidos registrados en el sistema.",
    },
    { label: "Productos activos", value: String(totalProducts), icon: Package, hint: null as string | null },
    {
      label: "Stock total",
      value: totalStock.toLocaleString("es-PY"),
      icon: ShoppingCart,
      hint: "Unidades disponibles sumando el inventario de todos los productos.",
    },
  ];

  return (
    <AdminPageShell
      className="relative"
      title="Dashboard"
      description="Resumen operativo: inventario, pedidos y clientes en un solo vistazo."
      actions={
        <Popover open={stockPopoverOpen} onOpenChange={setStockPopoverOpen}>
          <PopoverTrigger asChild>
            <div className="fixed right-4 top-4 z-50 sm:static sm:right-auto sm:top-auto">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn(
                  "relative h-11 w-11 shrink-0 rounded-2xl border-border/80 bg-card shadow-sm transition-all hover:shadow-md hover:border-primary/25",
                  pendingStockCount > 0 &&
                    "border-primary/30 bg-primary/[0.04] ring-1 ring-primary/15 hover:bg-primary/[0.07]"
                )}
                aria-label="Alertas de inventario"
              >
                <Bell
                  className={cn("h-5 w-5", pendingStockCount > 0 ? "text-primary" : "text-muted-foreground")}
                  strokeWidth={1.75}
                  aria-hidden
                />
                {pendingStockCount > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground shadow-sm ring-2 ring-card">
                    {pendingStockCount > 99 ? "99+" : pendingStockCount}
                  </span>
                ) : null}
              </Button>
            </div>
          </PopoverTrigger>
          <PopoverContent
            className={cn(
              "w-[min(22rem,calc(100vw-2rem))] p-0 overflow-hidden rounded-2xl border-border/60",
              "bg-popover shadow-xl shadow-black/[0.06] dark:shadow-black/40"
            )}
            align="end"
            sideOffset={10}
          >
            <div className="relative px-4 pt-4 pb-3.5 bg-gradient-to-b from-primary/[0.06] via-muted/30 to-transparent dark:from-primary/10 dark:via-muted/20">
              <div className="flex gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm ring-1 ring-primary/15 dark:bg-primary/15">
                  <Package className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </div>
                <div className="min-w-0 pt-0.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Alertas</p>
                  <p className="text-[15px] font-semibold tracking-tight text-foreground">Inventario bajo</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Productos con stock ≤ {LOW_STOCK_MAX} u. o agotados.
                  </p>
                </div>
              </div>
            </div>
            <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent mx-4" />
            <div className="max-h-[min(18rem,50vh)] overflow-y-auto px-3 py-3">
              {lowStockProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-2 py-10 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
                    <Package className="h-6 w-6 opacity-70" aria-hidden />
                  </div>
                  <p className="text-sm font-medium text-foreground">Todo en orden</p>
                  <p className="text-xs text-muted-foreground max-w-[14rem] leading-relaxed">
                    No hay productos por debajo del umbral de stock.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {lowStockProducts.map((p) => {
                    const unread = !dismissedStockIds.has(p.id);
                    const stock = p.stock ?? 0;
                    const out = stock === 0;
                    return (
                      <li key={p.id} className="list-none">
                        <button
                          type="button"
                          className={cn(
                            "group w-full flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all",
                            "border-border/60 bg-card/50 hover:bg-muted/35 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                            unread && "bg-primary/[0.03] ring-1 ring-primary/12 dark:bg-primary/[0.05]",
                            !unread && "opacity-70 hover:opacity-90"
                          )}
                          onClick={() => markSingleStockRead(p.id)}
                          title={unread ? "Clic para marcar como leída" : undefined}
                          aria-label={
                            unread
                              ? `Alerta: ${p.name}, ${stock} unidades. Marcar como leída.`
                              : `${p.name}, leída, ${stock} unidades`
                          }
                        >
                          <span
                            className={cn(
                              "mt-2 h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
                              unread ? "bg-primary ring-4 ring-primary/15" : "bg-muted-foreground/25"
                            )}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">{p.name}</p>
                            {out ? (
                              <p className="text-[11px] text-destructive/90 font-medium mt-0.5">Sin unidades</p>
                            ) : unread ? (
                              <p className="text-[10px] text-muted-foreground mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                Clic para archivar
                              </p>
                            ) : null}
                          </div>
                          <span
                            className={cn(
                              "shrink-0 tabular-nums rounded-lg px-2 py-1 text-[11px] font-semibold leading-none",
                              out
                                ? "bg-destructive/12 text-destructive"
                                : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                            )}
                          >
                            {stock} u.
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {lowStockProducts.length > 0 && pendingStockCount > 0 ? (
              <div className="border-t border-border/50 bg-muted/15 px-3 py-3">
                <Button
                  type="button"
                  className="w-full gap-2 rounded-xl h-9 text-sm font-medium gradient-celeste text-primary-foreground shadow-sm hover:opacity-95"
                  onClick={markStockNotificationsRead}
                >
                  <CheckCheck className="h-4 w-4 opacity-95" />
                  Marcar como leídas
                </Button>
              </div>
            ) : null}
          </PopoverContent>
        </Popover>
      }
    >
      {loading ? (
        <Loader text="Cargando datos..." />
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-card rounded-2xl border border-border/80 shadow-card p-5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                    <p className="text-xl font-bold text-foreground mt-1 break-words">{s.value}</p>
                    {s.hint ? <p className="text-[11px] text-muted-foreground mt-2 leading-snug">{s.hint}</p> : null}
                  </div>
                  <div className="w-10 h-10 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
                    <s.icon className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {chartData.length > 0 && (
            <div className={ADMIN_PANEL}>
              <h3 className="font-semibold text-foreground mb-4">Productos por categoría</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(40 4% 86%)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(197 10% 52%)" />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(197 10% 52%)" />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(195 89% 47%)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className={ADMIN_PANEL}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground">Pedidos recientes</h3>
                <Link to="/admin/orders" className="text-xs font-medium text-primary hover:underline">
                  Ver todos
                </Link>
              </div>
              {recentOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Aún no hay pedidos registrados.</p>
              ) : (
                <ul className="space-y-0 divide-y divide-border/70">
                  {recentOrders.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 first:pt-0">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{o.customer?.name || "Cliente"}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(o.created_at).toLocaleString("es-PY", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-foreground">
                        Gs. {(Number(o.total) || 0).toLocaleString("es-PY")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className={ADMIN_PANEL}>
              <h3 className="font-semibold text-foreground mb-4">Facturación por mes (últimos 6)</h3>
              {monthlySalesChart.every((x) => x.total === 0) ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Sin datos de ventas en ese período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={monthlySalesChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(40 4% 86%)" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(197 10% 52%)" />
                    <YAxis tick={{ fontSize: 12 }} stroke="hsl(197 10% 52%)" />
                    <Tooltip formatter={(v: number) => [`Gs. ${v.toLocaleString("es-PY")}`, "Total"]} />
                    <Bar dataKey="total" fill="hsl(142 76% 36%)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}
