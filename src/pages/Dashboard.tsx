import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewRole } from "@/hooks/useViewRole";
import { providersOverLimit } from "@/lib/consumos";
import type { ProviderSaldo } from "@/lib/consumos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Inbox, Layers, FileText, ShoppingCart, Clock, CheckCircle, Truck, PackageCheck, AlertTriangle, Warehouse, ClipboardList } from "lucide-react";

const statusLabelMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
  pendiente:           { label: "Pendiente",             variant: "outline"     },
  en_curso:            { label: "En curso",               variant: "outline", className: "bg-amber-100 text-amber-800 border-amber-300" },
  recibido:            { label: "Recibido",              variant: "default", className: "bg-green-600 text-white border-green-600 hover:bg-green-600" },
  rechazado:           { label: "Rechazado",             variant: "destructive" },
};

export default function Dashboard() {
  const { viewRole: role } = useViewRole();
  const { user } = useAuth();

  const { data: pendienteCount } = useQuery({
    queryKey: ["dashboard-pendiente", role, user?.id],
    enabled: !!role && !!user?.id,
    queryFn: async () => {
      let query = supabase
        .from("requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pendiente" as any);
      if (role === "arquitecto") query = query.eq("created_by", user!.id);
      const { count } = await query;
      return count || 0;
    },
  });

  const { data: parcialCount } = useQuery({
    queryKey: ["dashboard-parcial", role, user?.id],
    enabled: !!role && !!user?.id,
    queryFn: async () => {
      let query = supabase
        .from("requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "en_curso" as any);
      if (role === "arquitecto") query = query.eq("created_by", user!.id);
      const { count } = await query;
      return count || 0;
    },
  });

  const { data: totalCount } = useQuery({
    queryKey: ["dashboard-total", role, user?.id],
    enabled: !!role && !!user?.id,
    queryFn: async () => {
      let query = supabase
        .from("requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "recibido" as any);
      if (role === "arquitecto") query = query.eq("created_by", user!.id);
      const { count } = await query;
      return count || 0;
    },
  });

  const { data: rechazadoCount } = useQuery({
    queryKey: ["dashboard-rechazado", role, user?.id],
    enabled: (role === "compras" || role === "admin") && !!role,
    queryFn: async () => {
      const { count } = await supabase
        .from("requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "rechazado" as any);
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
        const { count: openCount } = await supabase
          .from("rfqs")
          .select("*", { count: "exact", head: true })
          .or("rfq_type.eq.open,rfq_type.is.null")
          .in("status", ["sent", "responded"]);

        const { data: pu } = await supabase
          .from("provider_users")
          .select("provider_id")
          .eq("user_id", user!.id)
          .maybeSingle();
        let closedCount = 0;
        if (pu) {
          const { data: invites } = await supabase
            .from("rfq_providers")
            .select("rfq_id")
            .eq("provider_id", pu.provider_id);
          const invitedIds = (invites || []).map((i) => i.rfq_id);
          if (invitedIds.length) {
            const { count } = await supabase
              .from("rfqs")
              .select("*", { count: "exact", head: true })
              .eq("rfq_type", "closed_bid")
              .in("id", invitedIds)
              .in("status", ["sent", "responded"]);
            closedCount = count || 0;
          }
        }
        return (openCount || 0) + closedCount;
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
          "id, status, raw_message, created_at, updated_at, request_number, desired_date, projects:project_id(name), architects:architect_id(full_name)"
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

  // --- Deposito stats ---
  const { data: depositoSolicitudes } = useQuery({
    queryKey: ["dashboard-deposito-solicitudes"],
    enabled: role === "deposito" || role === "admin",
    queryFn: async () => {
      const { count } = await supabase
        .from("remitos")
        .select("*", { count: "exact", head: true })
        .in("status", ["borrador", "confirmado"]);
      return count || 0;
    },
  });

  const { data: depositoEnTransito } = useQuery({
    queryKey: ["dashboard-deposito-transito"],
    enabled: role === "deposito" || role === "admin",
    queryFn: async () => {
      const { count } = await supabase
        .from("remitos")
        .select("*", { count: "exact", head: true })
        .eq("status", "en_transito");
      return count || 0;
    },
  });

  const { data: depositoRecepciones } = useQuery({
    queryKey: ["dashboard-deposito-recepciones"],
    enabled: role === "deposito" || role === "admin",
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_orders")
        .select("id, purchase_order_items(quantity, quantity_received)")
        .eq("destination", "deposito")
        .eq("status", "accepted");
      return (data ?? []).filter((po: any) =>
        (po.purchase_order_items ?? []).some(
          (i: any) => Number(i.quantity) > Number(i.quantity_received)
        )
      ).length;
    },
  });

  const { data: depositoLowStock } = useQuery({
    queryKey: ["dashboard-deposito-lowstock"],
    enabled: role === "deposito" || role === "admin",
    queryFn: async () => {
      const { data } = await supabase
        .from("inventory")
        .select("quantity, reserved, min_stock");
      return (data ?? []).filter(
        (i: any) => (Number(i.quantity) - Number(i.reserved)) <= Number(i.min_stock)
      ).length;
    },
  });

  // --- Saldo over-limit alert (compras/admin) ---

  const isComprasOrAdmin = role === "compras" || role === "admin";
  const { companyId } = useViewRole();

  const { data: saldoLimite } = useQuery({
    queryKey: ["company-settings-limite", companyId],
    enabled: isComprasOrAdmin && !!companyId,
    queryFn: async (): Promise<number | null> => {
      const { data } = await supabase
        .from("company_settings")
        .select("saldo_limite_proveedor")
        .eq("company_id", companyId!)
        .maybeSingle();
      return data?.saldo_limite_proveedor ?? null;
    },
  });

  const { data: providerSaldos } = useQuery({
    queryKey: ["provider-saldos-dashboard", companyId],
    enabled: isComprasOrAdmin && saldoLimite !== undefined && saldoLimite !== null,
    queryFn: async (): Promise<ProviderSaldo[]> => {
      // Aggregate net saldo per provider from movimiento_cuenta_corriente
      const { data, error } = await supabase
        .from("movimiento_cuenta_corriente")
        .select("provider_id, tipo, monto");
      if (error) throw error;

      const saldoMap = new Map<string, number>();
      for (const mov of data ?? []) {
        const current = saldoMap.get(mov.provider_id) ?? 0;
        saldoMap.set(
          mov.provider_id,
          mov.tipo === "debito" ? current + mov.monto : current - mov.monto
        );
      }
      return Array.from(saldoMap.entries()).map(([provider_id, saldo]) => ({
        provider_id,
        saldo,
      }));
    },
  });

  const { data: allProviders } = useQuery({
    queryKey: ["providers-list-dashboard"],
    enabled: isComprasOrAdmin,
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      const { data, error } = await supabase
        .from("providers")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const overLimitProviders =
    saldoLimite != null && providerSaldos
      ? providersOverLimit(providerSaldos, saldoLimite)
      : [];

  const providerNameMap = new Map((allProviders ?? []).map((p) => [p.id, p.name]));

  const { data: recentRemitos } = useQuery({
    queryKey: ["dashboard-deposito-recent"],
    enabled: role === "deposito",
    queryFn: async () => {
      const { data } = await supabase
        .from("remitos")
        .select("id, status, destination, updated_at, requests:request_id(request_number, projects:project_id(name))")
        .order("updated_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const roleLabels: Record<string, string> = {
    arquitecto: "Panel de Arquitecto",
    compras:    "Panel de Compras",
    proveedor:  "Panel de Proveedor",
    deposito:   "Panel de Depósito",
    admin:      "Panel de Administrador",
  };

  const stats = [];
  if (role === "arquitecto") {
    stats.push({
      label: "Pendientes",
      value: pendienteCount ?? "—",
      icon: Inbox,
      color: "text-primary",
    });
    stats.push({
      label: "Procesado Parcial",
      value: parcialCount ?? "—",
      icon: Clock,
      color: "text-warning",
    });
    stats.push({
      label: "Procesado Total",
      value: totalCount ?? "—",
      icon: CheckCircle,
      color: "text-green-600",
    });
  } else if (role === "deposito") {
    stats.push({
      label: "Solicitudes Pendientes",
      value: depositoSolicitudes ?? "—",
      icon: ClipboardList,
      color: "text-primary",
    });
    stats.push({
      label: "En Tránsito",
      value: depositoEnTransito ?? "—",
      icon: Truck,
      color: "text-blue-600",
    });
    stats.push({
      label: "Recepciones Pendientes",
      value: depositoRecepciones ?? "—",
      icon: PackageCheck,
      color: "text-amber-600",
    });
    stats.push({
      label: "Stock Bajo",
      value: depositoLowStock ?? "—",
      icon: AlertTriangle,
      color: "text-red-600",
    });
  } else if (role !== "proveedor") {
    stats.push({
      label: "Pendientes",
      value: pendienteCount ?? "—",
      icon: Inbox,
      color: "text-primary",
    });
    stats.push({
      label: "Procesado Parcial",
      value: parcialCount ?? "—",
      icon: Clock,
      color: "text-warning",
    });
    stats.push({
      label: "Procesado Total",
      value: totalCount ?? "—",
      icon: CheckCircle,
      color: "text-green-600",
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
      label: role === "proveedor" ? "Solicitudes de cotizaciones vigentes" : "Solicitudes Abiertas",
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
          {role === "deposito" && "Control de despachos y recepciones"}
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

      {role !== "proveedor" && role !== "deposito" && (
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

      {/* Over-limit saldo alert — compras/admin only */}
      {isComprasOrAdmin && saldoLimite != null && overLimitProviders.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-red-800 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              Proveedores con saldo sobre el límite configurado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-red-700 mb-3">
              Los siguientes proveedores superan el límite de{" "}
              <strong>
                {saldoLimite.toLocaleString("es-AR", {
                  style: "currency",
                  currency: "ARS",
                  minimumFractionDigits: 2,
                })}
              </strong>{" "}
              configurado para la cuenta corriente.
            </p>
            <div className="flex flex-wrap gap-2">
              {overLimitProviders.map((p) => (
                <Badge
                  key={p.provider_id}
                  variant="outline"
                  className="text-xs border-red-300 bg-white text-red-800"
                >
                  {providerNameMap.get(p.provider_id) ?? p.provider_id}
                  {" — "}
                  {p.saldo.toLocaleString("es-AR", {
                    style: "currency",
                    currency: "ARS",
                    minimumFractionDigits: 2,
                  })}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {role === "deposito" && (
        <>
          {(depositoLowStock ?? 0) > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-red-800">
                Hay <strong>{depositoLowStock}</strong> material(es) con stock disponible por debajo del mínimo.
              </p>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">Remitos Recientes</CardTitle>
            </CardHeader>
            <CardContent>
              {!recentRemitos?.length ? (
                <p className="text-muted-foreground text-sm">No hay remitos recientes.</p>
              ) : (
                <div className="space-y-3">
                  {recentRemitos.map((r: any) => {
                    const remitoStatusLabels: Record<string, { label: string; className: string }> = {
                      borrador: { label: "Pendiente", className: "bg-amber-100 text-amber-800 border-amber-300" },
                      confirmado: { label: "En preparación", className: "bg-blue-100 text-blue-800 border-blue-300" },
                      en_transito: { label: "Despachado", className: "bg-green-100 text-green-800 border-green-300" },
                      entregado: { label: "Entregado", className: "bg-gray-100 text-gray-600 border-gray-300" },
                    };
                    const sl = remitoStatusLabels[r.status] ?? { label: r.status, className: "" };
                    return (
                      <div key={r.id} className="flex items-start justify-between gap-3 border-b pb-3 last:border-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {r.requests?.request_number
                              ? `Pedido #${r.requests.request_number}`
                              : `Remito ${r.id.slice(0, 8)}`}
                            {r.requests?.projects?.name && ` — ${r.requests.projects.name}`}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className={`text-xs h-4 px-1.5 ${sl.className}`}>
                              {sl.label}
                            </Badge>
                            {r.destination && (
                              <span className="text-xs text-muted-foreground">
                                → {r.destination}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {new Date(r.updated_at).toLocaleDateString("es-AR", {
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
        </>
      )}
    </div>
  );
}
