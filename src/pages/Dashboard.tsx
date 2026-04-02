import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewRole } from "@/hooks/useViewRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Inbox, Layers, FileText, ShoppingCart, BarChart3, Building2 } from "lucide-react";

export default function Dashboard() {
  const { viewRole: role } = useViewRole();
  const { user } = useAuth();

  const { data: reqCount } = useQuery({
    queryKey: ["dashboard-requests"],
    enabled: role !== "proveedor",
    queryFn: async () => {
      const { count } = await supabase.from("requests").select("*", { count: "exact", head: true }).in("status", ["draft", "approved"]);
      return count || 0;
    },
  });

  const { data: poolCount } = useQuery({
    queryKey: ["dashboard-pools"],
    enabled: role === "compras" || role === "admin",
    queryFn: async () => {
      const { count } = await supabase.from("purchase_pools").select("*", { count: "exact", head: true }).in("status", ["open", "closed", "quoting"]);
      return count || 0;
    },
  });

  const { data: rfqCount } = useQuery({
    queryKey: ["dashboard-rfqs"],
    enabled: role !== "arquitecto",
    queryFn: async () => {
      if (role === "proveedor") {
        // Count RFQs where this provider is invited
        const { data: providerData } = await supabase.from("providers").select("id").eq("user_id", user?.id).maybeSingle();
        if (!providerData) return 0;
        const { count } = await supabase.from("rfq_providers").select("*", { count: "exact", head: true }).eq("provider_id", providerData.id);
        return count || 0;
      }
      const { count } = await supabase.from("rfqs").select("*", { count: "exact", head: true }).in("status", ["draft", "sent"]);
      return count || 0;
    },
  });

  const { data: poCount } = useQuery({
    queryKey: ["dashboard-pos"],
    enabled: role !== "arquitecto",
    queryFn: async () => {
      if (role === "proveedor") {
        const { data: providerData } = await supabase.from("providers").select("id").eq("user_id", user?.id).maybeSingle();
        if (!providerData) return 0;
        const { count } = await supabase.from("purchase_orders").select("*", { count: "exact", head: true }).eq("provider_id", providerData.id);
        return count || 0;
      }
      const { count } = await supabase.from("purchase_orders").select("*", { count: "exact", head: true });
      return count || 0;
    },
  });

  const { data: recentRequests } = useQuery({
    queryKey: ["dashboard-recent"],
    enabled: role !== "proveedor",
    queryFn: async () => {
      const { data } = await supabase.from("requests").select("id, status, urgency, raw_message, created_at").order("created_at", { ascending: false }).limit(5);
      return data || [];
    },
  });

  const roleLabels: Record<string, string> = {
    arquitecto: "Panel de Arquitecto",
    compras: "Panel de Compras",
    proveedor: "Panel de Proveedor",
    admin: "Panel de Administrador",
  };

  // Build stats based on role
  const stats = [];
  if (role !== "proveedor") {
    stats.push({ label: "Pedidos Pendientes", value: reqCount ?? "—", icon: Inbox, color: "text-primary" });
  }
  if (role === "compras" || role === "admin") {
    stats.push({ label: "Pools Activos", value: poolCount ?? "—", icon: Layers, color: "text-success" });
  }
  if (role !== "arquitecto") {
    stats.push({ label: role === "proveedor" ? "RFQs Recibidos" : "RFQs Abiertos", value: rfqCount ?? "—", icon: FileText, color: "text-warning" });
    stats.push({ label: role === "proveedor" ? "OCs Recibidas" : "OCs Emitidas", value: poCount ?? "—", icon: ShoppingCart, color: "text-muted-foreground" });
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">{role ? roleLabels[role] || "Dashboard" : "Dashboard"}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {role === "arquitecto" && "Gestiona tus requerimientos de obra"}
          {role === "compras" && "Resumen general de compras"}
          {role === "proveedor" && "Tus cotizaciones y órdenes de compra"}
          {role === "admin" && "Vista completa del sistema"}
          {!role && "Cargando..."}
        </p>
      </div>

      {stats.length > 0 && (
        <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-${Math.min(stats.length, 4)}`}>
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-display font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {role !== "proveedor" && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Actividad Reciente</CardTitle>
          </CardHeader>
          <CardContent>
            {!recentRequests?.length ? (
              <p className="text-muted-foreground text-sm">No hay actividad reciente.</p>
            ) : (
              <div className="space-y-3">
                {recentRequests.map((r) => (
                  <div key={r.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <div>
                      <p className="text-sm font-medium">Pedido #{r.id.slice(0, 8)}</p>
                      {r.raw_message && <p className="text-xs text-muted-foreground line-clamp-1">{r.raw_message}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("es-MX")}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
