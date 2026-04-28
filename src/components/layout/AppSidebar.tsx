import { NavLink, useLocation } from "react-router-dom";
import logoBuildBuy from "@/assets/logo-buildbuy.png";
import {
  LayoutDashboard,
  Inbox,
  Layers,
  FileText,
  BarChart3,
  ShoppingCart,
  History,
  GitBranch,
  Building2,
  Package,
  HardHat,
  LogOut,
  Warehouse,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { AppRole } from "@/hooks/useUserRole";
import { useViewRole } from "@/hooks/useViewRole";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: AppRole[]; // which roles can see this item
};

const allRoles: AppRole[] = ["arquitecto", "compras", "proveedor", "admin"];

const navItems: NavItem[] = [
  { to: "/dashboard",   label: "Dashboard",        icon: LayoutDashboard, roles: allRoles },
  { to: "/pedidos",     label: "Pedidos",           icon: Inbox,           roles: ["arquitecto", "compras", "admin"] },
  { to: "/obras",       label: "Obras",             icon: Building2,       roles: ["compras", "admin"] },
  { to: "/inventario",  label: "Inventario",        icon: Warehouse,       roles: ["compras", "admin"] },
  { to: "/pools",       label: "Pools de Compra",   icon: Layers,          roles: ["compras", "admin"] },
  { to: "/rfqs",        label: "Solicitudes",       icon: FileText,        roles: ["compras", "admin"] },
  { to: "/cotizaciones",label: "Cotizaciones",      icon: BarChart3,       roles: ["compras", "proveedor", "admin"] },
  { to: "/ordenes",     label: "Órdenes de Compra", icon: ShoppingCart,    roles: ["compras", "proveedor", "admin"] },
  { to: "/historial",   label: "Reportes",          icon: History,         roles: ["compras", "admin"] },
  { to: "/trazabilidad",label: "Trazabilidad",      icon: GitBranch,       roles: ["compras", "admin"] },
  { to: "/materiales",  label: "Materiales",        icon: Package,         roles: ["compras", "admin"] },
  { to: "/arquitectos", label: "Arquitectos",       icon: HardHat,         roles: ["compras", "admin"] },
  { to: "/proveedores", label: "Proveedores",       icon: Building2,       roles: ["compras", "admin"] },
  { to: "/usuarios",    label: "Usuarios",          icon: Users,           roles: ["admin"] },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { viewRole: role, loading } = useViewRole();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  // Don't show any nav items while loading — prevents flash of all items before role resolves
  const visibleItems = loading
    ? []
    : navItems.filter((item) => !role || item.roles.includes(role as AppRole));

  return (
    <aside className="flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex items-center justify-center px-6 py-5 border-b border-sidebar-border">
        <img src={logoBuildBuy} alt="BuildBuy" className="h-10 w-auto" />
      </div>


      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visibleItems.map((item) => {
          const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Cerrar Sesión
        </button>
      </div>
    </aside>
  );
}
