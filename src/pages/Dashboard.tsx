import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewRole } from "@/hooks/useViewRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Inbox, Layers, FileText, ShoppingCart, Clock, Send } from "lucide-react";

const statusLabelMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
  draft:             { label: "Borrador",              variant: "secondary"   },
  pending_approval:  { label: "Pendiente Aprobación",  variant: "outline"     },
  approved:          { label: "Aprobado",              variant: "default", className: "bg-green-600 text-white border-green-600 hover:bg-green-600" },
  in_pool:           { label: "En proceso",            variant: "outline"     },
  rfq_direct:        { label: "En proceso",            variant: "outline"     },
  inventario:        { label: "Aprobado",              variant: "default"     },
  rejected:          { label: "Rechazado",             variant: "destructive" },
};

export default function Dashboard() {
  const { viewRole: role } = useViewRole();
  const { user } = useAuth();

  const { data: draftCount } = useQuery({
    queryKey: ["dashboard-drafts", user?.id],
    enabled: role === "arquitecto" && !!user?.id,
    queryFn: async () => {
      const { count } = await supabase
        .from("requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "draft")
        .eq("created_by", user!.id);
      return count || 0;
    },
  });

  const { data: arqPendingCount } = useQuery({
    queryKey: ["dashboard-arq-pending", user?.id],
    enabled: role === "arquitecto" && !!user?.id,
    queryFn: async () => {
      const { count } = await supabase
        .from("requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending_approval")
        .eq("created_by", user!.id);
      return count || 0;
    },
  });

  const { data: pendingApprovalCount } = useQuery({
    queryKey: ["dashboard-pending-approval", role],
    enabled: (role === "compras" || role === "admin") && !!role,
    queryFn: async () => {
      const { count } = await supabase
        .from("requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending_approval");
      return count || 0;
    },
  });

  // En Proceso — arquitecto only: approved/in_pool/rfq_direct/inventario
  const { data: inProgressCount } = useQuery({
    queryKey: ["dashboard-inprogress", role, user?.id],
    enabled: role === "arquitecto" && !!user?.id,
    queryFn: async () => {
      const { count } = await supabase
        .from("requests")
        .select("*", { count: "exact", head: true })
        .in("status", ["approved", "in_pool", "rfq_direct", "inventario"])
        .eq("created_by", user!.id);
      return count || 0;
    },
  });

  // En Proceso — admin/compras: all non-draft, non-rejected pending PO
  const { data: inProgressAdminCount } = useQuery({
    queryKey: ["dashboard-inprogress-admin", role],
    enabled: role === "compras" || role === "admin",
    queryFn: async () => {
      const { count } = await supabase
        .from("requests")
        .select("*", { count: "exact", head: true })
        .in("status", ["approved", "in_pool", "rfq_direct", "inventario"]);
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
    queryKey: ["dashboard-rfqs", role, user?.id],
    enabled: role !== "arquitecto" && !!role && !!user?.id,
    queryFn: async () => {
      if (role === "proveedor") {
        const { count } = await supabase
          .from("rfqs")
          .select("*", { count: "exact", head: true })
          .in("status", ["sent", "responded"]);
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
    queryKey: ["dashboard-pos", role, user?.id],
    enabled: role !== "arquitecto" && !!role && !!user?.id,
    queryFn: async () => {
      if (role === "proveedor") {
        const { data: providerData } = await supabase
          .from("provider_users")
          .select("provider_id")
          .eq("user_id", user?.id)
          .maybeSingle();
        if (!providerData) return 0;
        const { count } = await supabase
          .from("purchase_orders")
          .select("*", { count: "exact", head: true })
          .eq("provider_id", providerData.provider_id);
        return count || 0;
      }
      const { count } = await supabase
        .from("purchase_orders")
        .select("*", { count: "exact", head: true });
      return count || 0;
    },
  });

  // Recent activity — sorted by updated_at so state changes surface first
  const { data: recentRequests } = useQuery({
    queryKey: ["dashboard-recent", role, user?.id],
    enabled: role !== "proveedor" && !!role,
    queryFn: async () => {
      let query = supabase
        .from("requests")
        .select(
          "id, status, urgency, raw_message, created_at, updated_at, request_number, projects:project_id(name), architects:architect_id(full_name)"
        )
        .order("updated_at", { ascending: false })
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

  const stats = [];
  if (role === "arquitecto") {
    stats.push({
      label: "Mis Borradores",
      value: draftCount ?? "—",
      icon: Inbox,
      color: "text-muted-foreground",
    });
    stats.push({
      label: "Pendientes de Aprobación",
      value: arqPendingCount ?? "—",
      icon: Send,
      color: "text-warning",
    });
    stats.push({
      label: "En Proceso",
      value: inProgressCount ?? "—",
      icon: Clock,
      color: "text-primary",
    });
  } else if (role !== "proveedor") {
    stats.push({
      label: "Pedidos Pendientes",
      value: pendingApprovalCount ?? "—",
      icon: Inbox,
      color: "text-primary",
    });
    stats.push({
      label: "En Proceso",
      value: inProgressAdminCount ?? "—",
      icon: Clock,
      color: "text-warning",
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
      label: role === "proveedor" ? "Solicitudes de cotizaciones vigentes" : "RFQs Abiertos",
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
                            : `Pedido #${r.request_number}`}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant={sl.variant} className={`text-xs h-4 px-1.5 ${sl.className || ""}`}>
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
                        {new Date(r.updated_at ?? r.created_at).toLocaleDateString("es-AR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
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
