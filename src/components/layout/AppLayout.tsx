import { Outlet, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { AppSidebar } from "./AppSidebar";
import { NotificationBell } from "./NotificationBell";
import { ViewRoleProvider, useViewRole } from "@/hooks/useViewRole";
import { AppRole } from "@/hooks/useUserRole";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, Clock, LogOut, Menu } from "lucide-react";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const roleOptions: { value: AppRole; label: string }[] = [
  { value: "arquitecto", label: "Arquitecto" },
  { value: "compras", label: "Compras" },
  { value: "proveedor", label: "Proveedor" },
  { value: "deposito", label: "Depósito" },
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

function Header({ onMenuToggle }: { onMenuToggle: () => void }) {
  return (
    <header className="h-12 flex items-center justify-between gap-3 border-b border-border px-4 sm:px-6 bg-background shrink-0">
      <button
        onClick={onMenuToggle}
        className="md:hidden flex items-center justify-center h-9 w-9 rounded-lg hover:bg-muted transition-colors"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        <NotificationBell />
        <AdminRoleSwitcher />
      </div>
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

function IdleWarningDialog() {
  const { showWarning, countdown, stayActive, logout } = useIdleTimeout(30, 60);

  return (
    <Dialog open={showWarning}>
      <DialogContent className="max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Sesión por expirar</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Llevás 30 minutos sin actividad. Tu sesión se cerrará en{" "}
          <span className="font-bold text-foreground">{countdown} segundos</span>.
        </p>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={stayActive}>
            Seguir conectado
          </Button>
          <Button variant="outline" className="flex-1" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" />
            Cerrar sesión
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AppLayoutInner() {
  const { viewRole, companyId, loading } = useViewRole();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && companyId === null) {
      navigate("/onboarding", { replace: true });
    }
  }, [loading, companyId, navigate]);

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onMenuToggle={() => setMobileMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          {loading ? null : !companyId ? null : !viewRole ? <NoRoleScreen /> : <Outlet />}
        </main>
      </div>
      <IdleWarningDialog />
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
