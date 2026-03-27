import { useEffect, useMemo, useState } from "react";
import { api } from "@/services/api";
import type { Order } from "@/types";
import { Loader, ErrorState, EmptyState } from "@/components/shared/Loader";

export default function AdminOrdersPage() {
  const [orderType, setOrderType] = useState<"all" | "tradexpar" | "dropi">("all");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = () => {
    setLoading(true);
    setError(null);
    api.adminGetOrders()
      .then((res) => setOrders(res.orders))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchOrders(); }, []);

  const filtered = useMemo(
    () =>
      orders.filter((o) =>
        orderType === "all" ? true : (o.checkout_type || "tradexpar") === orderType
      ),
    [orders, orderType]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pedidos</h1>
        <p className="text-sm text-muted-foreground">Gestión de pedidos y transacciones</p>
      </div>

      <div className="grid grid-cols-3 gap-2 max-w-md">
        {(["tradexpar", "dropi", "all"] as const).map((type) => (
          <button
            key={type}
            onClick={() => setOrderType(type)}
            className={`px-3 py-2 rounded-lg text-sm border ${
              orderType === type ? "bg-primary text-primary-foreground border-primary" : "bg-card"
            }`}
          >
            {type === "tradexpar" ? "Tradexpar" : type === "dropi" ? "Dropi" : "Todos"}
          </button>
        ))}
      </div>

      {loading && <Loader text="Cargando pedidos..." />}
      {error && <ErrorState message={error} onRetry={fetchOrders} />}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState title="Sin pedidos" description="No hay pedidos para el filtro seleccionado." />
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className="bg-card rounded-2xl border shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30">
                  <th className="text-left py-3 px-4">Pedido</th>
                  <th className="text-left py-3 px-4">Cliente</th>
                  <th className="text-left py-3 px-4">Tipo</th>
                  <th className="text-left py-3 px-4">Estado</th>
                  <th className="text-right py-3 px-4">Total</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id} className="border-t">
                    <td className="py-3 px-4 font-mono text-xs">{o.id}</td>
                    <td className="py-3 px-4">{o.customer?.name || "—"}</td>
                    <td className="py-3 px-4 capitalize">{o.checkout_type || "tradexpar"}</td>
                    <td className="py-3 px-4 capitalize">{o.status}</td>
                    <td className="py-3 px-4 text-right">₲{Number(o.total || 0).toLocaleString("es-PY")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
