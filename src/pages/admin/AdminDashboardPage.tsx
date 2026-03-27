import { motion } from "framer-motion";
import { DollarSign, Package, ShoppingCart, Users, TrendingUp, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "@/services/api";
import { Loader } from "@/components/shared/Loader";
import type { Product } from "@/types";

export default function AdminDashboardPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getProducts()
      .then(setProducts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalProducts = products.length;
  const totalStock = products.reduce((sum, p) => sum + (p.stock || 0), 0);

  const stats = [
    { label: "Productos activos", value: String(totalProducts), icon: Package },
    { label: "Stock total", value: totalStock.toLocaleString("es-PY"), icon: ShoppingCart },
  ];

  const categoryData = products.reduce<Record<string, number>>((acc, p) => {
    const cat = p.category || "Sin categoría";
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});
  const chartData = Object.entries(categoryData).map(([name, count]) => ({ name, count }));
  const lowStockProducts = products.filter((p) => (p.stock ?? 0) > 0 && (p.stock ?? 0) <= 5).slice(0, 5);

  return (
    <div className="space-y-8">
      {lowStockProducts.length > 0 && (
        <div className="fixed top-6 right-6 z-40 w-80 bg-card border shadow-xl rounded-2xl p-4">
          <p className="font-semibold text-foreground mb-2">Alerta de stock bajo</p>
          <ul className="space-y-1">
            {lowStockProducts.map((p) => (
              <li key={p.id} className="text-sm text-muted-foreground flex justify-between gap-3">
                <span className="truncate">{p.name}</span>
                <span className="text-destructive font-semibold">{p.stock}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Resumen general del sistema</p>
      </div>

      {loading ? (
        <Loader text="Cargando datos..." />
      ) : (
        <>
          {/* KPIs from real data */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-card rounded-2xl border shadow-card p-5"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{s.value}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <s.icon className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Pending KPIs */}
            {[
              { label: "Ingresos totales", icon: DollarSign, endpoint: "GET /api/admin/stats" },
              { label: "Usuarios registrados", icon: Users, endpoint: "GET /api/admin/users/count" },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: (i + 2) * 0.05 }}
                className="bg-card rounded-2xl border shadow-card p-5 opacity-60"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                    <p className="text-lg font-semibold text-muted-foreground mt-1">—</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                    <s.icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Pendiente: {s.endpoint}
                </p>
              </motion.div>
            ))}
          </div>

          {/* Chart from real data */}
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

          {/* Pending sections */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-2xl border shadow-card p-6 opacity-60">
              <h3 className="font-semibold text-foreground mb-2">Pedidos recientes</h3>
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                <AlertCircle className="h-4 w-4" />
                Pendiente: endpoint GET /api/admin/orders
              </div>
            </div>
            <div className="bg-card rounded-2xl border shadow-card p-6 opacity-60">
              <h3 className="font-semibold text-foreground mb-2">Ventas mensuales</h3>
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                <AlertCircle className="h-4 w-4" />
                Pendiente: endpoint GET /api/admin/stats/monthly
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
