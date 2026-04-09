import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewRole } from "@/hooks/useViewRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Inbox, Layers, FileText, ShoppingCart } from "lucide-react";

const statusLabelMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft:      { label: "Borrador",   variant: "secondary"   },
  approved:   { label: "Aprobado",   variant: "default"     },
  in_pool:    { label: "En proceso", variant: "outline"     },
  rfq_direct: { label: "En proceso", variant: "outline"     },
  inventario: { label: "Aprobado",   variant: "default"     },
  rejected:   { label: "Rechazado",  variant: "destructive" },
};

export default function Dashboard() {
  const { viewRole: role } = useViewRole();
  const { user } = useAuth();

  // Pedidos pendientes — count logic differs by role
  const { data: reqCount } = useQuery({
    queryKey: ["dashboard-requests", role, user?.id],
    enabled: role !== "proveedor" && !!role,
    queryFn: async () => {
      if (role === "arquitecto") {
        // Arquitecto: only their own draft requests (pending admin approval)
        const { count } = await supabase
          .from("requests")
          .select("*", { count: "exact", head: true })
          .eq("status", "draft")
          .eq("created_by", user!.id);
        return count || 0;
      }
      // Admin/compras: all draft requests waiting to be processed
      const { count } = await supabase
        .from("requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "draft");
      return count || 0;
    },
  });

  const { data: poolCount } = useQuery({
    queryKey: ["dashboard-pools"],
    enabled: role === "compras" || role === "admin",
    queryFn: async () => {
      const { count } = await supabase
        .from("purchase_pools")
        .select("*", { count: "exact", head: true })
        .in("status", ["open", "closed", "quoting"]);
      return count || 0;
    },
  });

  const { data: rfqCount } = useQuery({
    queryKey: ["dashboard-rfqs"],
    enabled: role !== "arquitecto" && !!role,
    queryFn: async () => {
      if (role === "proveedor") {
        const { data: providerData } = await supabase
          .from("providers")
          .select("id")
          .eq("user_id", user?.id)
          .maybeSingle();
        if (!providerData) return 0;
        const { count } = await supabase
          .from("rfq_providers")
          .select("*", { count: "exact", head: true })
          .eq("provider_id", providerData.id);
        return count || 0;
      }
      const { count } = await supabase
        .from("rfqs")
        .select("*", { count: "exact", head: true })
        .in("status", ["draft", "sent"]);
      return count || 0;
    },
  });

  const { data: poCount } = useQuery({
    queryKey: ["dashboard-pos"],
    enabled: role !== "arquitecto" && !!role,
    queryFn: async () => {
      if (role === "proveedor") {
        const { data: providerData } = await supabase
          .from("providers")
          .select("id")
          .eq("user_id", user?.id)
          .maybeSingle();
        if (!providerData) return 0;
        const { count } = await supabase
          .from("purchase_orders")
          .select("*", { count: "exact", head: true })
          .eq("provider_id", providerData.id);
        return count || 0;
      }
      const { count } = await supabase
        .from("purchase_orders")
        .select("*", { count: "exact", head: true });
      return count || 0;
    },
  });

  // Recent activity — with project + architect name for context
  const { data: recentRequests } = useQuery({
    queryKey: ["dashboard-recent", role, user?.id],
    enabled: role !== "proveedor" && !!role,
    queryFn: async () => {
      let query = supabase
        .from("requests")
        .select(
          "id, status, urgency, raw_message, created_at, request_number, projects:project_id(name), architects:architect_id(full_name)"
        )
        .order("created_at", { ascending: false })
        .limit(5);

      if (role === "arquitecto") {
        query = query.eq("created_by", user!.id);
      }

      const { data } = await query;
      return data || [];
    },
  });

  const roleLabels: Record<string, string> = {
    arquitecto: "Panel de Arquitecto",
    compras:    "Panel de Compras",
    proveedor:  "Panel de Proveedor",
    admin:      "Panel de Administrador",
  };

  const pendingLabel =
    role === "arquitecto" ? "Mis Pedidos Pendientes" : "Pedidos Pendientes";

  const stats = [];
  if (role !== "proveedor") {
    stats.push({
      label: pendingLabel,
      value: reqCount ?? "—",
      icon: Inbox,
      color: "text-primary",
    });
  }
  if (role === "compras" || role === "admin") {
    stats.push({
      label: "Pools Activos",
      value: poolCount ?? "—",
      icon: Layers,
      color: "text-success",
    });
  }
  if (role !== "arquitecto") {
    stats.push({
      label: role === "proveedor" ? "RFQs Recibidos" : "RFQs Abiertos",
      value: rfqCount ?? "—",
      icon: FileText,
      color: "text-warning",
    });
    stats.push({
      label: role === "proveedor" ? "OCs Recibidas" : "OCs Emitidas",
      value: poCount ?? "—",
      icon: ShoppingCart,
      color: "text-muted-foreground",
    });
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">
          {role ? roleLabels[role] || "Dashboard" : "Dashboard"}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {role === "arquitecto" && "Gestiona tus requerimientos de obra"}
          {role === "compras" && "Resumen general de compras"}
          {role === "proveedor" && "Tus cotizaciones y órdenes de compra"}
          {role === "admin" && "Vista completa del sistema"}
          {!role && "Cargando..."}
        </p>
      </div>

      {stats.length > 0 && (
        <div
          className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-${Math.min(stats.length, 4)}`}
        >
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
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
              <p className="text-muted-foreground text-sm">
                {role === "arquitecto"
                  ? "Aún no creaste ningún pedido."
                  : "No hay actividad reciente."}
              </p>
            ) : (
              <div className="space-y-3">
                {recentRequests.map((r: any) => {
                  const projName = r.projects?.name;
                  const archName = r.architects?.full_name;
                  const sl =
                    role === "arquitecto"
                      ? (statusLabelMap[r.status] ?? { label: r.status, variant: "secondary" as const })
                      : (statusLabelMap[r.status] ?? { label: r.status, variant: "secondary" as const });

                  return (
                    <div
                      key={r.id}
                      className="flex items-start justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {projName
                            ? projName
                            : r.request_number
                            ? `Pedido #${r.request_number}`
                            : `Pedido #${r.id.slice(0, 6).toUpperCase()}`}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant={sl.variant} className="text-xs h-4 px-1.5">
                            {sl.label}
                          </Badge>
                          {archName && (
                            <span className="text-xs text-muted-foreground">
                              👷 {archName}
                            </span>
                          )}
                          {r.raw_message && (
                            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {r.raw_message}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(r.created_at).toLocaleDateString("es-AR")}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
