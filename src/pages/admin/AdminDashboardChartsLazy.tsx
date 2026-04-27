import type { ReactNode } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ADMIN_PANEL } from "@/lib/adminModuleLayout";

export interface AdminDashboardChartsLazyProps {
  chartData: { name: string; count: number }[];
  monthlySalesChart: { name: string; total: number }[];
  ordersColumn: ReactNode;
}

/** Recharts en chunk aparte: el dashboard admin carga más rápido el shell y los KPI. */
export default function AdminDashboardChartsLazy({
  chartData,
  monthlySalesChart,
  ordersColumn,
}: AdminDashboardChartsLazyProps) {
  return (
    <>
      {chartData.length > 0 && (
        <div className={ADMIN_PANEL}>
          <h3 className="font-semibold text-foreground mb-4">Productos por tipo (origen)</h3>
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
        {ordersColumn}
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
    </>
  );
}
