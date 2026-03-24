import { motion } from "framer-motion";
import { DollarSign, Package, ShoppingCart, Users, TrendingUp, TrendingDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

// Mock data — estos datos deben venir del backend
const stats = [
  { label: "Ingresos totales", value: "$12,450,000", change: "+12.5%", up: true, icon: DollarSign },
  { label: "Pedidos", value: "342", change: "+8.2%", up: true, icon: ShoppingCart },
  { label: "Productos", value: "56", change: "+3", up: true, icon: Package },
  { label: "Usuarios", value: "1,284", change: "+15.3%", up: true, icon: Users },
];

const chartData = [
  { month: "Ene", ventas: 4000 }, { month: "Feb", ventas: 3000 }, { month: "Mar", ventas: 5000 },
  { month: "Abr", ventas: 4500 }, { month: "May", ventas: 6000 }, { month: "Jun", ventas: 5500 },
  { month: "Jul", ventas: 7000 },
];

const recentOrders = [
  { id: "ORD-001", customer: "Juan Pérez", total: "$125,000", status: "Completado" },
  { id: "ORD-002", customer: "María López", total: "$89,500", status: "Pendiente" },
  { id: "ORD-003", customer: "Carlos Ruiz", total: "$234,000", status: "Procesando" },
  { id: "ORD-004", customer: "Ana García", total: "$67,800", status: "Completado" },
];

export default function AdminDashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Resumen general del sistema</p>
      </div>

      {/* KPIs */}
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
            <div className="flex items-center gap-1 mt-3">
              {s.up ? <TrendingUp className="h-3 w-3 text-green-600" /> : <TrendingDown className="h-3 w-3 text-destructive" />}
              <span className={`text-xs font-medium ${s.up ? "text-green-600" : "text-destructive"}`}>{s.change}</span>
              <span className="text-xs text-muted-foreground">vs mes anterior</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-2xl border shadow-card p-6">
          <h3 className="font-semibold text-foreground mb-4">Ventas mensuales</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(40 4% 86%)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(197 10% 52%)" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(197 10% 52%)" />
              <Tooltip />
              <Bar dataKey="ventas" fill="hsl(195 89% 47%)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-card rounded-2xl border shadow-card p-6">
          <h3 className="font-semibold text-foreground mb-4">Tendencia</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(40 4% 86%)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(197 10% 52%)" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(197 10% 52%)" />
              <Tooltip />
              <Line type="monotone" dataKey="ventas" stroke="hsl(195 89% 47%)" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="bg-card rounded-2xl border shadow-card p-6">
        <h3 className="font-semibold text-foreground mb-4">Pedidos recientes</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">ID</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Cliente</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Total</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((o) => (
                <tr key={o.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4 font-mono text-foreground">{o.id}</td>
                  <td className="py-3 px-4 text-foreground">{o.customer}</td>
                  <td className="py-3 px-4 text-foreground">{o.total}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      o.status === "Completado" ? "bg-green-100 text-green-700" :
                      o.status === "Pendiente" ? "bg-yellow-100 text-yellow-700" :
                      "bg-primary/10 text-primary"
                    }`}>
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          * Datos mock. Este endpoint debe ser implementado en backend (GET /api/admin/orders)
        </p>
      </div>
    </div>
  );
}
