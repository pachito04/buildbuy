import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider, RequireAuth, useAuth } from "./hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { BasketProvider } from "@/contexts/BasketContext";
import { AwardCartProvider } from "@/contexts/AwardCartContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Pedidos from "./pages/Pedidos";
import Pools from "./pages/Pools";
import RFQs from "./pages/RFQs";
import Cotizaciones from "./pages/Cotizaciones";
import Comparativa from "./pages/Comparativa";
import Ordenes from "./pages/Ordenes";
import Inventario from "./pages/Inventario";
import Historial from "./pages/Historial";
import Trazabilidad from "./pages/Trazabilidad";
import Materiales from "./pages/Materiales";
import Arquitectos from "./pages/Arquitectos";
import Obras from "./pages/Obras";
import ObraDetail from "./pages/ObraDetail";
import Proveedores from "./pages/Proveedores";
import Usuarios from "./pages/Usuarios";
import Configuracion from "./pages/Configuracion";
import Onboarding from "./pages/Onboarding";
import RegistroProveedor from "./pages/RegistroProveedor";
import SolicitudesDeposito from "./pages/deposito/SolicitudesDeposito";
import RecepcionesDeposito from "./pages/deposito/RecepcionesDeposito";
import ListaPreciosProveedor from "./pages/ListaPreciosProveedor";
import RegistroRetiro from "./pages/RegistroRetiro";
import CuentaCorriente from "./pages/CuentaCorriente";
import ReporteConsumos from "./pages/ReporteConsumos";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Root handler — waits for auth state (including OAuth code exchange) before redirecting.
// Critically, this does NOT navigate immediately, preserving ?code= in the URL long enough
// for supabase-js to exchange it via PKCE before we know where to send the user.
function RootRedirect() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      navigate(session ? "/dashboard" : "/login", { replace: true });
    }
  }, [loading, session, navigate]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <BasketProvider>
          <AwardCartProvider>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route path="/registro-proveedor" element={<RegistroProveedor />} />
            <Route
              path="/onboarding"
              element={
                <RequireAuth>
                  <Onboarding />
                </RequireAuth>
              }
            />
            <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/requerimientos" element={<Pedidos />} />
              <Route path="/obras/:obraId/requerimientos" element={<Pedidos />} />
              <Route path="/pedidos" element={<Navigate to="/requerimientos" replace />} />
              <Route path="/inventario" element={<Inventario />} />
              <Route path="/pools" element={<Pools />} />
              <Route path="/rfqs" element={<RFQs />} />
              <Route path="/cotizaciones" element={<Cotizaciones />} />
              <Route path="/comparativa/:rfqId" element={<Comparativa />} />
              <Route path="/ordenes" element={<Ordenes />} />
              <Route path="/historial" element={<Historial />} />
              <Route path="/trazabilidad" element={<Trazabilidad />} />
              <Route path="/materiales" element={<Materiales />} />
              <Route path="/arquitectos" element={<Arquitectos />} />
              <Route path="/obras" element={<Obras />} />
              <Route path="/obras/:obraId" element={<ObraDetail />} />
              <Route path="/proveedores" element={<Proveedores />} />
              <Route path="/deposito/solicitudes" element={<SolicitudesDeposito />} />
              <Route path="/deposito/recepciones" element={<RecepcionesDeposito />} />
              <Route path="/lista-precios" element={<ListaPreciosProveedor />} />
              <Route path="/retiros" element={<RegistroRetiro />} />
              <Route path="/cuenta-corriente" element={<CuentaCorriente />} />
              <Route path="/reporte-consumos" element={<ReporteConsumos />} />
              <Route path="/usuarios" element={<Usuarios />} />
              <Route path="/configuracion" element={<Configuracion />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </AwardCartProvider>
          </BasketProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
