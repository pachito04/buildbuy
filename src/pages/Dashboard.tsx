import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewRole } from "@/hooks/useViewRole";
import { providersOverLimit } from "@/lib/consumos";
import type { ProviderSaldo } from "@/lib/consumos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Inbox, FileText, ShoppingCart, Clock, CheckCircle, Truck, PackageCheck, AlertTriangle, ClipboardList, ArrowUpRight, TrendingUp, TrendingDown, Building2, BarChart3, PiggyBank } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useObrasAvance } from "@/hooks/useObrasAvance";
import { formatCurrency } from "@/lib/computo-utils";

export default function Dashboard() {
  const { viewRole: role, fullName } = useViewRole();
  const { user } = useAuth();
  const navigate = useNavigate();

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

  // --- "Este mes" deltas (real, created in current calendar month) ---
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const { data: requestsThisMonth } = useQuery({
    queryKey: ["dashboard-req-month", role, user?.id],
    enabled: role !== "proveedor" && role !== "deposito" && !!role && !!user?.id,
    queryFn: async () => {
      let q = supabase.from("requests").select("status").gte("created_at", monthStart);
      if (role === "arquitecto") q = q.eq("created_by", user!.id);
      const { data } = await q;
      const counts: Record<string, number> = { pendiente: 0, en_curso: 0, recibido: 0 };
      for (const r of data ?? []) {
        const s = (r as { status: string }).status;
        counts[s] = (counts[s] ?? 0) + 1;
      }
      return counts;
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

  // --- Obras activas (avance) — compras/admin ---
  const { data: obrasList } = useQuery({
    queryKey: ["dashboard-obras", companyId],
    enabled: isComprasOrAdmin && !!companyId,
    queryFn: async (): Promise<{ id: string; name: string; contact_name: string | null; code: string | null }[]> => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, contact_name, code")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; contact_name: string | null; code: string | null }[];
    },
  });

  const { data: avanceMap } = useObrasAvance(isComprasOrAdmin ? companyId : null);

  // Obras creadas este mes (trend de "Obras activas")
  const { data: projectsThisMonth } = useQuery({
    queryKey: ["dashboard-projects-month", companyId],
    enabled: isComprasOrAdmin && !!companyId,
    queryFn: async () => {
      const { count } = await supabase
        .from("projects")
        .select("*", { count: "exact", head: true })
        .eq("active", true)
        .gte("created_at", monthStart);
      return count || 0;
    },
  });

  // Comparativas pendientes = RFQs sent/responded con cotizaciones recibidas
  const { data: comparativasPendientes } = useQuery({
    queryKey: ["dashboard-comparativas", companyId],
    enabled: isComprasOrAdmin && !!companyId,
    queryFn: async (): Promise<number> => {
      const { data: openRfqs } = await supabase
        .from("rfqs")
        .select("id")
        .eq("company_id", companyId!)
        .in("status", ["sent", "responded"]);
      const ids = (openRfqs ?? []).map((r) => r.id);
      if (!ids.length) return 0;
      const { data: quoted } = await supabase
        .from("quotes")
        .select("rfq_id")
        .in("rfq_id", ids)
        .in("status", ["pending", "submitted", "awarded"] as any);
      return new Set((quoted ?? []).map((q) => q.rfq_id)).size;
    },
  });

  // Ahorro total = Σ por ítem adjudicado de (oferta más cara − adjudicada) × cantidad
  const { data: ahorroTotal } = useQuery({
    queryKey: ["dashboard-ahorro", companyId],
    enabled: isComprasOrAdmin && !!companyId,
    queryFn: async (): Promise<number> => {
      // 1. Ítems de OC efectivamente comprados (referencian un quote_item) de la empresa
      const { data: poItems, error: e1 } = await supabase
        .from("purchase_order_items")
        .select("quantity, quote_item_id, purchase_orders!inner(company_id)")
        .eq("purchase_orders.company_id", companyId!)
        .not("quote_item_id", "is", null);
      if (e1) throw e1;
      const awarded = (poItems ?? []).filter((p: any) => p.quote_item_id);
      if (!awarded.length) return 0;

      // 2. unit_price + rfq_item_id de cada quote_item adjudicado
      const qiIds = [...new Set(awarded.map((p: any) => p.quote_item_id as string))];
      const { data: awardedQis, error: e2 } = await supabase
        .from("quote_items")
        .select("id, rfq_item_id, unit_price")
        .in("id", qiIds);
      if (e2) throw e2;
      const qiMap = new Map<string, { rfq_item_id: string; unit_price: number }>();
      for (const qi of awardedQis ?? []) {
        qiMap.set(qi.id, { rfq_item_id: qi.rfq_item_id as string, unit_price: Number(qi.unit_price) });
      }

      // 3. unit_price máximo por rfq_item entre TODAS las ofertas recibidas
      const rfqItemIds = [...new Set((awardedQis ?? []).map((qi: any) => qi.rfq_item_id).filter(Boolean))] as string[];
      if (!rfqItemIds.length) return 0;
      const { data: allQis, error: e3 } = await supabase
        .from("quote_items")
        .select("rfq_item_id, unit_price")
        .in("rfq_item_id", rfqItemIds);
      if (e3) throw e3;
      const maxPrice = new Map<string, number>();
      for (const qi of allQis ?? []) {
        const p = Number(qi.unit_price);
        maxPrice.set(qi.rfq_item_id as string, Math.max(maxPrice.get(qi.rfq_item_id as string) ?? 0, p));
      }

      // 4. Σ (máx − adjudicado) × cantidad
      let total = 0;
      for (const item of awarded as any[]) {
        const qi = qiMap.get(item.quote_item_id);
        if (!qi || !qi.rfq_item_id) continue;
        const max = maxPrice.get(qi.rfq_item_id) ?? qi.unit_price;
        total += Math.max(max - qi.unit_price, 0) * Number(item.quantity);
      }
      return total;
    },
  });

  const obrasActivas = (obrasList ?? [])
    .map((o) => {
      const av = avanceMap?.get(o.id);
      const presupuesto = av?.presupuesto ?? 0;
      const comprometido = av?.comprometido ?? 0;
      const pct = presupuesto > 0 ? Math.min(Math.round((comprometido / presupuesto) * 100), 100) : 0;
      return { ...o, presupuesto, comprometido, pct, hasAvance: !!av };
    })
    .filter((o) => o.hasAvance)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5);

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

  type Stat = {
    label: string;
    value: number | string;
    icon: typeof Inbox;
    color: string;
    trend?: { label: string; positive: boolean };
  };
  const reqM = requestsThisMonth ?? { pendiente: 0, en_curso: 0, recibido: 0 };
  const esteMes = (n: number) => ({ label: `+${n} este mes`, positive: true });
  const stats: Stat[] = [];
  if (role === "compras" || role === "admin") {
    // 4 KPIs del mockup — todos con dato real
    stats.push({
      label: "Obras activas",
      value: obrasList?.length ?? "—",
      icon: Building2,
      color: "text-primary",
      trend: esteMes(projectsThisMonth ?? 0),
    });
    stats.push({
      label: "Requerimientos abiertos",
      value: pendienteCount != null && parcialCount != null ? pendienteCount + parcialCount : "—",
      icon: Inbox,
      color: "text-warning",
      trend: esteMes(reqM.pendiente + reqM.en_curso),
    });
    stats.push({
      label: "Comparativas pendientes",
      value: comparativasPendientes ?? "—",
      icon: BarChart3,
      color: "text-success",
    });
    stats.push({
      label: "Ahorro total",
      value: ahorroTotal != null ? formatCurrency(ahorroTotal) : "—",
      icon: PiggyBank,
      color: "text-success",
    });
  } else if (role === "arquitecto") {
    stats.push({
      label: "Pendientes",
      value: pendienteCount ?? "—",
      icon: Inbox,
      color: "text-primary",
      trend: esteMes(reqM.pendiente),
    });
    stats.push({
      label: "Procesado Parcial",
      value: parcialCount ?? "—",
      icon: Clock,
      color: "text-warning",
      trend: esteMes(reqM.en_curso),
    });
    stats.push({
      label: "Procesado Total",
      value: totalCount ?? "—",
      icon: CheckCircle,
      color: "text-green-600",
      trend: esteMes(reqM.recibido),
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
    stats.push({
      label: "Solicitudes Abiertas",
      value: rfqCount ?? "—",
      icon: FileText,
      color: "text-warning",
    });
    stats.push({
      label: "OCs Emitidas",
      value: poCount ?? "—",
      icon: ShoppingCart,
      color: "text-muted-foreground",
    });
  } else if (role === "proveedor") {
    stats.push({
      label: "Solicitudes de cotizaciones vigentes",
      value: rfqCount ?? "—",
      icon: FileText,
      color: "text-warning",
    });
    stats.push({
      label: "OCs Recibidas",
      value: poCount ?? "—",
      icon: ShoppingCart,
      color: "text-muted-foreground",
    });
  }

  return (
    <div className="p-6 md:p-8 space-y-8">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <span className="eyebrow">Dashboard</span>
          <h1 className="font-display text-4xl font-semibold tracking-tight mt-2">
            {fullName
              ? `Buenas, ${fullName.split(" ")[0]}.`
              : role
                ? roleLabels[role] || "Dashboard"
                : "Dashboard"}
          </h1>
          <p className="text-muted-foreground text-sm mt-2">
            {role === "arquitecto" && "Gestiona tus requerimientos de obra"}
            {role === "compras" && "Resumen general de compras"}
            {role === "proveedor" && "Tus cotizaciones y órdenes de compra"}
            {role === "deposito" && "Control de despachos y recepciones"}
            {role === "admin" && "Vista completa del sistema"}
            {!role && "Cargando..."}
          </p>
        </div>
        {(role === "arquitecto" || role === "compras" || role === "admin") && (
          <button
            onClick={() => navigate("/requerimientos")}
            className="inline-flex items-center gap-2.5 rounded-full bg-foreground py-2 pl-5 pr-2 text-sm font-medium text-background transition-transform hover:-translate-y-0.5"
          >
            Nuevo requerimiento
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15">
              <ArrowUpRight className="h-3.5 w-3.5" />
            </span>
          </button>
        )}
      </div>

      {stats.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="rounded-2xl !shadow-card border-border/70">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-display font-semibold tracking-tight">{stat.value}</div>
                {stat.trend && (
                  <div
                    className={`mt-3 flex items-center gap-1 text-xs ${
                      stat.trend.positive ? "text-success" : "text-destructive"
                    }`}
                  >
                    {stat.trend.positive ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5" />
                    )}
                    <span>{stat.trend.label}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isComprasOrAdmin && obrasActivas.length > 0 && (
        <div className="rounded-[1.25rem] border bg-background p-1.5 !shadow-card">
          <Card className="rounded-2xl shadow-none border-border/70 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="font-display text-lg font-semibold tracking-tight">Obras activas</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Ordenadas por avance</p>
              </div>
              <button
                onClick={() => navigate("/obras")}
                className="rounded-full border px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                Ver todas
              </button>
            </div>
            <div>
              {obrasActivas.map((o, idx) => (
                <div
                  key={o.id}
                  className={`grid grid-cols-[2fr_1fr_1.6fr] items-center gap-6 px-6 py-4 ${idx < obrasActivas.length - 1 ? "border-b" : ""}`}
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{o.name}</div>
                    {(o.contact_name || o.code) && (
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {o.contact_name || o.code}
                      </div>
                    )}
                  </div>
                  <div className="font-mono text-sm text-muted-foreground">{formatCurrency(o.presupuesto)}</div>
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${o.pct}%` }} />
                    </div>
                    <span className="w-10 text-right font-mono text-sm">{o.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
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

          <div className="rounded-[1.25rem] border bg-background p-1.5 !shadow-card">
          <Card className="rounded-2xl shadow-none border-border/70">
            <CardHeader>
              <CardTitle className="font-display text-lg font-semibold tracking-tight">Remitos Recientes</CardTitle>
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
          </div>
        </>
      )}
    </div>
  );
}
