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
  Truck,
  ClipboardList,
  Settings,
  ReceiptText,
  Wallet,
  CreditCard,
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

const allRoles: AppRole[] = ["arquitecto", "compras", "proveedor", "admin", "deposito"];

const navItems: NavItem[] = [
  { to: "/dashboard",    label: "Dashboard",        icon: LayoutDashboard, roles: allRoles },
  { to: "/requerimientos", label: "Requerimientos",  icon: Inbox,           roles: ["arquitecto", "compras", "admin"] },
  { to: "/rfqs",         label: "Solicitudes",       icon: FileText,        roles: ["compras", "admin"] },
  { to: "/cotizaciones", label: "Cotizaciones",      icon: BarChart3,       roles: ["compras", "proveedor", "admin"] },
  { to: "/pools",        label: "Pools de Compra",   icon: Layers,          roles: ["compras", "admin"] },
  { to: "/ordenes",      label: "Órdenes de Compra", icon: ShoppingCart,    roles: ["compras", "proveedor", "admin"] },
  { to: "/historial",    label: "Reportes",          icon: History,         roles: ["compras", "admin"] },
  { to: "/trazabilidad", label: "Trazabilidad",      icon: GitBranch,       roles: ["compras", "admin"] },
  { to: "/deposito/solicitudes", label: "Solicitudes Despacho", icon: ClipboardList, roles: ["deposito", "admin"] },
  { to: "/deposito/recepciones", label: "Recepciones",          icon: Truck,         roles: ["deposito", "admin"] },
  { to: "/inventario",   label: "Inventario",        icon: Warehouse,       roles: ["compras", "deposito", "admin"] },
  { to: "/materiales",   label: "Materiales",        icon: Package,         roles: ["compras", "admin"] },
  { to: "/obras",        label: "Obras",             icon: Building2,       roles: ["compras", "admin"] },
  { to: "/arquitectos",  label: "Arquitectos",       icon: HardHat,        roles: ["compras", "admin"] },
  { to: "/proveedores",  label: "Proveedores",       icon: Building2,       roles: ["compras", "admin"] },
  { to: "/lista-precios",       label: "Lista de Precios",    icon: Wallet,       roles: ["proveedor", "compras", "admin"] },
  { to: "/retiros",             label: "Registro de Retiros", icon: ReceiptText,  roles: ["compras", "admin"] },
  { to: "/cuenta-corriente",    label: "Cuenta Corriente",    icon: CreditCard,   roles: ["compras", "admin"] },
  { to: "/reporte-consumos",    label: "Reporte de Consumos", icon: BarChart3,    roles: ["compras", "admin"] },
  { to: "/mi-cuenta-corriente", label: "Mi Cuenta Corriente", icon: CreditCard,   roles: ["proveedor"] },
  { to: "/usuarios",       label: "Usuarios",        icon: Users,           roles: ["admin"] },
  { to: "/configuracion",  label: "Configuración",   icon: Settings,        roles: ["admin"] },
];

interface AppSidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function AppSidebar({ mobileOpen, onMobileClose }: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { viewRole: role, loading } = useViewRole();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const visibleItems = loading
    ? []
    : navItems.filter((item) => !role || item.roles.includes(role as AppRole));

  const sidebarContent = (
    <>
      <div className="flex items-center justify-center px-6 py-5 border-b border-sidebar-border">
        <img src={logoBuildBuy} alt="BuildBuy" className="h-10 w-auto" />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visibleItems.map((item) => {
          const isActive = location.pathname === item.to ||
            location.pathname.startsWith(item.to + "/") ||
            (item.to === '/requerimientos' && location.pathname.includes('/requerimientos'));
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onMobileClose}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors min-h-[44px]",
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

      <div className="border-t border-sidebar-border p-3">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors min-h-[44px]"
        >
          <LogOut className="h-4 w-4" />
          Cerrar Sesión
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onMobileClose} />
          <aside className="relative z-10 flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
