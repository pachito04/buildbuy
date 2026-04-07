import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { ViewRoleProvider, useViewRole } from "@/hooks/useViewRole";
import { AppRole } from "@/hooks/useUserRole";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, Clock } from "lucide-react";

const roleOptions: { value: AppRole; label: string }[] = [
  { value: "arquitecto", label: "Arquitecto" },
  { value: "compras", label: "Compras" },
  { value: "proveedor", label: "Proveedor" },
  { value: "admin", label: "Administrador" },
];

function AdminRoleSwitcher() {
  const { viewRole, setViewRole, actualRole } = useViewRole();

  // Only admins can switch view role
  if (actualRole !== "admin") return null;

  return (
    <div className="flex items-center gap-2">
      <Eye className="h-4 w-4 text-muted-foreground" />
      <span className="text-xs text-muted-foreground hidden sm:inline">Vista:</span>
      <Select value={viewRole ?? ""} onValueChange={(v) => setViewRole(v as AppRole)}>
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {roleOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Header() {
  return (
    <header className="h-12 flex items-center justify-end gap-3 border-b border-border px-6 bg-background shrink-0">
      <AdminRoleSwitcher />
    </header>
  );
}

function NoRoleScreen() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <Clock className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="font-semibold text-lg mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        Cuenta pendiente de activación
      </h2>
      <p className="text-muted-foreground text-sm max-w-xs leading-relaxed">
        Tu cuenta fue creada exitosamente. Un administrador te asignará tu rol de acceso en breve.
      </p>
    </div>
  );
}

function AppLayoutInner() {
  const { viewRole, loading } = useViewRole();

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          {loading ? null : !viewRole ? <NoRoleScreen /> : <Outlet />}
        </main>
      </div>
    </div>
  );
}

export function AppLayout() {
  return (
    <ViewRoleProvider>
      <AppLayoutInner />
    </ViewRoleProvider>
  );
}
