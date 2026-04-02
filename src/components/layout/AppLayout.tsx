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
import { Eye } from "lucide-react";

const roleOptions: { value: AppRole; label: string }[] = [
  { value: "arquitecto", label: "Arquitecto" },
  { value: "compras", label: "Compras" },
  { value: "proveedor", label: "Proveedor" },
  { value: "admin", label: "Administrador" },
];

function RoleSwitcher() {
  const { viewRole, setViewRole } = useViewRole();

  return (
    <header className="h-12 flex items-center justify-end gap-3 border-b border-border px-6 bg-background shrink-0">
      <Eye className="h-4 w-4 text-muted-foreground" />
      <span className="text-xs text-muted-foreground hidden sm:inline">Vista:</span>
      <Select value={viewRole} onValueChange={(v) => setViewRole(v as AppRole)}>
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
    </header>
  );
}

export function AppLayout() {
  return (
    <ViewRoleProvider>
      <div className="flex h-screen overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <RoleSwitcher />
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </ViewRoleProvider>
  );
}
