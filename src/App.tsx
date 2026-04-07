import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, RequireAuth } from "./hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Pedidos from "./pages/Pedidos";
import Pools from "./pages/Pools";
import RFQs from "./pages/RFQs";
import Cotizaciones from "./pages/Cotizaciones";
import Ordenes from "./pages/Ordenes";
import Inventario from "./pages/Inventario";
import Historial from "./pages/Historial";
import Trazabilidad from "./pages/Trazabilidad";
import Materiales from "./pages/Materiales";
import Arquitectos from "./pages/Arquitectos";
import Proveedores from "./pages/Proveedores";
import Usuarios from "./pages/Usuarios";
import Onboarding from "./pages/Onboarding";
import RegistroProveedor from "./pages/RegistroProveedor";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/registro-proveedor" element={<RegistroProveedor />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/onboarding"
              element={
                <RequireAuth>
                  <Onboarding />
                </RequireAuth>
              }
            />
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/pedidos" element={<Pedidos />} />
              <Route path="/inventario" element={<Inventario />} />
              <Route path="/pools" element={<Pools />} />
              <Route path="/rfqs" element={<RFQs />} />
              <Route path="/cotizaciones" element={<Cotizaciones />} />
              <Route path="/ordenes" element={<Ordenes />} />
              <Route path="/historial" element={<Historial />} />
              <Route path="/trazabilidad" element={<Trazabilidad />} />
              <Route path="/materiales" element={<Materiales />} />
              <Route path="/arquitectos" element={<Arquitectos />} />
              <Route path="/proveedores" element={<Proveedores />} />
              <Route path="/usuarios" element={<Usuarios />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
