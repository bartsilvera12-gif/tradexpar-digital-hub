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
import { api } from "@/services/api";
import { Loader } from "@/components/shared/Loader";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { CustomerUser, Order, Product } from "@/types";

const LOW_STOCK_MAX = 5;
const STOCK_DISMISSED_KEY = "tradexpar_admin_stock_dismissed";

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
    Promise.all([
      api.getProducts().catch(() => [] as Product[]),
      api.adminGetOrders().catch(() => ({ orders: [] as Order[] })),
      api.adminGetUsers().catch(() => ({ users: [] as CustomerUser[] })),
    ])
      .then(([prods, ordersRes, usersRes]) => {
        if (cancelled) return;
        setProducts(Array.isArray(prods) ? prods : []);
        setOrders(ordersRes.orders ?? []);
        setUsers(usersRes.users ?? []);
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
    <div className="relative space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:pr-14">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Resumen operativo: inventario, pedidos y clientes en un solo vistazo.
          </p>
        </div>
        <Popover open={stockPopoverOpen} onOpenChange={setStockPopoverOpen}>
          <PopoverTrigger asChild>
            <div className="fixed right-4 top-4 z-50 sm:absolute sm:right-0 sm:top-0">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn(
                  "relative h-11 w-11 shrink-0 rounded-xl border bg-card shadow-md",
                  pendingStockCount > 0 && "border-amber-300/80 ring-2 ring-amber-400/30"
                )}
                aria-label="Alertas de inventario"
              >
                <Bell className="h-5 w-5 text-foreground" />
                {pendingStockCount > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {pendingStockCount > 99 ? "99+" : pendingStockCount}
                  </span>
                ) : null}
              </Button>
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end" sideOffset={8}>
            <div className="border-b px-4 py-3">
              <p className="font-semibold text-foreground">Inventario</p>
              <p className="text-xs text-muted-foreground">
                Productos con poco stock o agotados (hasta {LOW_STOCK_MAX} unidades).
              </p>
            </div>
            <div className="max-h-72 overflow-y-auto p-2">
              {lowStockProducts.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  No hay alertas de stock en este momento.
                </p>
              ) : (
                <ul className="space-y-1">
                  {lowStockProducts.map((p) => {
                    const unread = !dismissedStockIds.has(p.id);
                    return (
                      <li
                        key={p.id}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm",
                          unread ? "bg-amber-500/10" : "text-muted-foreground"
                        )}
                      >
                        <span className="truncate font-medium text-foreground">{p.name}</span>
                        <span className={cn("shrink-0 font-semibold", (p.stock ?? 0) === 0 ? "text-destructive" : "text-amber-700 dark:text-amber-400")}>
                          {p.stock ?? 0} u.
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {lowStockProducts.length > 0 && pendingStockCount > 0 ? (
              <div className="border-t p-2">
                <Button type="button" variant="secondary" className="w-full gap-2" onClick={markStockNotificationsRead}>
                  <CheckCheck className="h-4 w-4" />
                  Marcar como leídas
                </Button>
              </div>
            ) : null}
          </PopoverContent>
        </Popover>
      </div>

      {loading ? (
        <Loader text="Cargando datos..." />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-card rounded-2xl border shadow-card p-5"
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
            <div className="bg-card rounded-2xl border shadow-card p-6">
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
            <div className="bg-card rounded-2xl border shadow-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground">Pedidos recientes</h3>
                <Link to="/admin/orders" className="text-xs font-medium text-primary hover:underline">
                  Ver todos
                </Link>
              </div>
              {recentOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Aún no hay pedidos registrados.</p>
              ) : (
                <ul className="space-y-3">
                  {recentOrders.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-3 last:border-0 last:pb-0">
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
            <div className="bg-card rounded-2xl border shadow-card p-6">
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
        </>
      )}
    </div>
  );
}
