import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewRole } from "@/hooks/useViewRole";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { lineSubtotal } from "@/lib/quote-pricing";
import { ShoppingCart, CheckCircle, XCircle, Clock, FileText, Package, Building2, MapPin } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";

const poStatusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  sent: { label: "Pendiente", variant: "outline" },
  accepted: { label: "Aceptada", variant: "default" },
  rejected: { label: "Rechazada", variant: "destructive" },
};

/** Human-readable OC code. Prefers real references; falls back to a clean uppercase code (no raw hash). */
function ocCode(po: any): string {
  if (po?.po_number) return `OC-${po.po_number}`;
  const reqN = po?.requests?.request_number ?? po?.rfqs?.requests?.request_number;
  if (reqN) return `OC · Pedido #${reqN}`;
  if (po?.rfqs?.rfq_number) return `OC · SC-${String(po.rfqs.rfq_number).padStart(4, "0")}`;
  if (po?.rfqs?.purchase_pools?.name) return `OC · Pool: ${po.rfqs.purchase_pools.name}`;
  return `OC-${String(po?.id ?? "").slice(0, 8).toUpperCase()}`;
}

type TabKey = "sent" | "accepted" | "rejected";

const tabs: { key: TabKey; label: string; icon: typeof Clock }[] = [
  { key: "sent", label: "Pendientes", icon: Clock },
  { key: "accepted", label: "Aceptadas", icon: CheckCircle },
  { key: "rejected", label: "Rechazadas", icon: XCircle },
];

export default function Ordenes() {
  const { viewRole: role } = useViewRole();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>("sent");
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: myProvider } = useQuery({
    queryKey: ["my-provider-po", user?.id],
    enabled: role === "proveedor" && !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_users")
        .select("provider_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data ? { id: data.provider_id } : null;
    },
  });

  const { data: orders, isLoading } = useQuery({
    queryKey: ["purchase-orders", role, myProvider?.id],
    queryFn: async () => {
      let query = supabase
        .from("purchase_orders")
        .select("*, providers:provider_id(name, email), rfqs:rfq_id(id, rfq_number, delivery_location, requests:request_id(request_number), purchase_pools:pool_id(name)), requests:request_id(request_number)")
        .order("created_at", { ascending: false });

      if (role === "proveedor" && myProvider) {
        query = query.eq("provider_id", myProvider.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: detailItems } = useQuery({
    queryKey: ["po-items", detailId],
    enabled: !!detailId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select("id, description, quantity, unit, unit_price, quantity_received")
        .eq("purchase_order_id", detailId!)
        .order("description");
      if (error) throw error;
      return data ?? [];
    },
  });

  const updatePOStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("purchase_orders").update({ status: status as any }).eq("id", id);
      if (error) throw error;

      if (status === "accepted") {
        const po = orders?.find((o: any) => o.id === id);
        const requestId = po?.request_id;
        if (requestId) {
          const { data: req } = await supabase
            .from("requests")
            .select("status")
            .eq("id", requestId)
            .single();
          if (req?.status === "en_curso") {
            await supabase
              .from("requests")
              .update({ status: "inventario" as any })
              .eq("id", requestId);
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["dashboard-requests"] });
      toast({ title: "Estado actualizado" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = { sent: 0, accepted: 0, rejected: 0 };
    for (const po of orders ?? []) {
      const s = (po as any).status as TabKey;
      if (s in counts) counts[s]++;
    }
    return counts;
  }, [orders]);

  const filtered = useMemo(
    () => (orders ?? []).filter((po: any) => po.status === activeTab),
    [orders, activeTab]
  );

  const detailPO = orders?.find((o: any) => o.id === detailId);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <PageHeader
        eyebrow="Compras"
        title="Órdenes de Compra"
        subtitle={role === "proveedor" ? "OCs recibidas de constructoras" : "OCs emitidas y su seguimiento"}
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              onClick={() => setActiveTab(t.key)}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              {tabCounts[t.key] > 0 && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {tabCounts[t.key]}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : !filtered.length ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No hay órdenes {activeTab === "sent" ? "pendientes" : activeTab === "accepted" ? "aceptadas" : "rechazadas"}.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((po: any) => (
            <Card
              key={po.id}
              className="cursor-pointer rounded-2xl border-border/70 shadow-soft transition-shadow hover:shadow-card"
              onClick={() => setDetailId(po.id)}
            >
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-mono text-sm font-medium">{ocCode(po)}</span>
                    <Badge variant={poStatusLabels[po.status]?.variant || "secondary"}>
                      {poStatusLabels[po.status]?.label || po.status}
                    </Badge>
                    {po.destination && (
                      <Badge variant="outline" className={po.destination === "deposito" ? "text-primary border-primary/40 bg-primary/5" : "text-success border-success/40 bg-success/5"}>
                        {po.destination === "deposito" ? "Depósito" : "Obra"}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 shrink-0" /> {po.providers?.name || "—"}
                    </span>
                    {po.total_amount != null && (
                      <span className="font-mono">
                        ${Number(po.total_amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </span>
                    )}
                    {po.rfqs?.delivery_location && (
                      <span className="flex max-w-[220px] items-center gap-1.5 truncate">
                        <MapPin className="h-3.5 w-3.5 shrink-0" /> {po.rfqs.delivery_location}
                      </span>
                    )}
                  </div>
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {new Date(po.created_at).toLocaleDateString("es-AR")}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!detailId} onOpenChange={(o) => { if (!o) setDetailId(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <span className="eyebrow">Orden de compra</span>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {detailPO ? ocCode(detailPO) : ""}
            </DialogTitle>
          </DialogHeader>

          {detailPO && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant={poStatusLabels[(detailPO as any).status]?.variant || "secondary"}>
                  {poStatusLabels[(detailPO as any).status]?.label || (detailPO as any).status}
                </Badge>
                {(detailPO as any).destination && (
                  <Badge variant="outline" className={(detailPO as any).destination === "deposito" ? "text-primary border-primary/40 bg-primary/5" : "text-success border-success/40 bg-success/5"}>
                    Destino: {(detailPO as any).destination === "deposito" ? "Depósito" : "Obra"}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  Creada: {new Date((detailPO as any).created_at).toLocaleDateString("es-AR")}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <p>
                  <span className="text-muted-foreground">Proveedor:</span>{" "}
                  {(detailPO as any).providers?.name || "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Email:</span>{" "}
                  {(detailPO as any).providers?.email || "—"}
                </p>
                {(detailPO as any).rfqs?.delivery_location && (
                  <p className="col-span-2">
                    <span className="text-muted-foreground">Lugar de entrega:</span>{" "}
                    {(detailPO as any).rfqs.delivery_location}
                  </p>
                )}
                {(detailPO as any).payment_terms && (
                  <p className="col-span-2">
                    <span className="text-muted-foreground">Condiciones de pago:</span>{" "}
                    {(detailPO as any).payment_terms}
                  </p>
                )}
                {(detailPO as any).notes && (
                  <p className="col-span-2">
                    <span className="text-muted-foreground">Notas:</span>{" "}
                    {(detailPO as any).notes}
                  </p>
                )}
              </div>

              {/* Items table */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted px-3 py-2 text-xs font-medium flex items-center gap-2">
                  <Package className="h-3.5 w-3.5" />
                  Detalle de Ítems
                </div>
                {!detailItems?.length ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Cargando ítems...</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Material</th>
                        <th className="text-right px-3 py-2 font-medium">Cant.</th>
                        <th className="text-left px-3 py-2 font-medium">Unidad</th>
                        <th className="text-right px-3 py-2 font-medium">Precio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailItems.map((item: any) => (
                        <tr key={item.id} className="border-t">
                          <td className="px-3 py-2">{item.description}</td>
                          <td className="text-right px-3 py-2">{item.quantity}</td>
                          <td className="px-3 py-2">{item.unit}</td>
                          <td className="text-right px-3 py-2 font-mono font-medium">
                            ${Number(item.unit_price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/30">
                        <td colSpan={3} className="px-3 py-2 text-right font-medium">Total:</td>
                        <td className="text-right px-3 py-2 font-mono font-bold">
                          ${detailItems.reduce((s: number, i: any) => s + lineSubtotal(Number(i.unit_price), Number(i.quantity)), 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>

              {/* Provider actions */}
              {role === "proveedor" && (detailPO as any).status === "sent" && (
                <div className="flex gap-2 pt-2">
                  <Button
                    className="flex-1"
                    onClick={() => { updatePOStatus.mutate({ id: detailId!, status: "accepted" }); setDetailId(null); }}
                    disabled={updatePOStatus.isPending}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />Aceptar
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 text-destructive"
                    onClick={() => { updatePOStatus.mutate({ id: detailId!, status: "rejected" }); setDetailId(null); }}
                    disabled={updatePOStatus.isPending}
                  >
                    <XCircle className="h-4 w-4 mr-2" />Rechazar
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
