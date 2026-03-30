import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Package, ShoppingCart, Users, LogOut, ChevronLeft, ChevronRight, UserPlus,
} from "lucide-react";
import { useState } from "react";
import logoIcon from "@/assets/logo-icon.png";

const navItems = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/products", label: "Productos", icon: Package },
  { to: "/admin/orders", label: "Pedidos", icon: ShoppingCart },
  { to: "/admin/users", label: "Usuarios", icon: Users },
  { to: "/admin/affiliates", label: "Afiliados", icon: UserPlus },
];

export function AdminSidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`sticky top-0 h-screen flex flex-col bg-secondary border-r border-border transition-all duration-300 ${
        collapsed ? "w-[72px]" : "w-64"
      }`}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-secondary-foreground/10">
        {!collapsed && (
          <Link to="/admin/dashboard" className="flex items-center gap-2">
            <img src={logoIcon} alt="Tradexpar" className="w-7 h-7" width={28} height={28} />
            <span className="text-lg font-bold tracking-tight text-secondary-foreground">
              TRADE<span className="text-gradient">XPAR</span>
            </span>
          </Link>
        )}
        {collapsed && (
          <Link to="/admin/dashboard" className="mx-auto">
            <img src={logoIcon} alt="Tradexpar" className="w-7 h-7" width={28} height={28} />
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary-foreground/10 transition-colors text-secondary-foreground/70 ${collapsed ? "hidden" : ""}`}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {collapsed && (
        <div className="flex justify-center py-2">
          <button
            onClick={() => setCollapsed(false)}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary-foreground/10 transition-colors text-secondary-foreground/70"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-1 px-3">
        {navItems.map((item) => {
          const active = location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active
                  ? "gradient-celeste text-primary-foreground shadow-brand"
                  : "text-secondary-foreground/70 hover:bg-secondary-foreground/10 hover:text-secondary-foreground"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-secondary-foreground/10">
        <Link
          to="/admin/login"
          onClick={() => {
            sessionStorage.removeItem("tradexpar_admin");
            sessionStorage.removeItem("tradexpar_admin_token");
          }}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-secondary-foreground/50 hover:bg-secondary-foreground/10 hover:text-secondary-foreground transition-all"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Cerrar sesión</span>}
        </Link>
      </div>
    </aside>
  );
}
