import { useState } from "react";
import { Search, Eye } from "lucide-react";

const mockOrders = [
  { id: "ORD-001", customer: "Juan Pérez", email: "juan@mail.com", total: "$125,000", status: "completed", items: 3, date: "2026-03-20" },
  { id: "ORD-002", customer: "María López", email: "maria@mail.com", total: "$89,500", status: "pending", items: 1, date: "2026-03-21" },
  { id: "ORD-003", customer: "Carlos Ruiz", email: "carlos@mail.com", total: "$234,000", status: "processing", items: 5, date: "2026-03-22" },
  { id: "ORD-004", customer: "Ana García", email: "ana@mail.com", total: "$67,800", status: "completed", items: 2, date: "2026-03-23" },
  { id: "ORD-005", customer: "Roberto Díaz", email: "roberto@mail.com", total: "$412,000", status: "cancelled", items: 4, date: "2026-03-23" },
];

const statusStyles: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  processing: "bg-primary/10 text-primary",
  cancelled: "bg-destructive/10 text-destructive",
};

const statusLabels: Record<string, string> = {
  completed: "Completado",
  pending: "Pendiente",
  processing: "Procesando",
  cancelled: "Cancelado",
};

export default function AdminOrdersPage() {
  const [search, setSearch] = useState("");
  const filtered = mockOrders.filter(
    (o) => o.id.toLowerCase().includes(search.toLowerCase()) || o.customer.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pedidos</h1>
        <p className="text-sm text-muted-foreground">Gestión de pedidos y transacciones</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text" placeholder="Buscar por ID o cliente..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="bg-card rounded-2xl border shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30">
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">ID</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Cliente</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Fecha</th>
                <th className="text-center py-3 px-4 text-muted-foreground font-medium">Items</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium">Total</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Estado</th>
                <th className="text-right py-3 px-4 text-muted-foreground font-medium">Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id} className="border-t hover:bg-muted/20 transition-colors">
                  <td className="py-3 px-4 font-mono text-foreground">{o.id}</td>
                  <td className="py-3 px-4">
                    <div>
                      <p className="font-medium text-foreground">{o.customer}</p>
                      <p className="text-xs text-muted-foreground">{o.email}</p>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">{o.date}</td>
                  <td className="py-3 px-4 text-center text-foreground">{o.items}</td>
                  <td className="py-3 px-4 text-right font-medium text-foreground">{o.total}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[o.status] || ""}`}>
                      {statusLabels[o.status] || o.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted/50 text-muted-foreground hover:text-primary transition-colors ml-auto">
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t">
          <p className="text-xs text-muted-foreground">* Datos mock. Endpoint: GET /api/admin/orders (debe ser implementado en backend)</p>
        </div>
      </div>
    </div>
  );
}
