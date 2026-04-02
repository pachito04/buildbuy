import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewRole } from "@/hooks/useViewRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ShoppingCart, CheckCircle, XCircle } from "lucide-react";

const poStatusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  sent: { label: "Enviada", variant: "default" },
  accepted: { label: "Aceptada", variant: "secondary" },
  rejected: { label: "Rechazada", variant: "destructive" },
};

export default function Ordenes() {
  const { viewRole: role } = useViewRole();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Get provider record for proveedor role
  const { data: myProvider } = useQuery({
    queryKey: ["my-provider-po", user?.id],
    enabled: role === "proveedor" && !!user,
    queryFn: async () => {
      const { data } = await supabase.from("providers").select("id").eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  const { data: orders, isLoading } = useQuery({
    queryKey: ["purchase-orders", role, myProvider?.id],
    queryFn: async () => {
      let query = supabase
        .from("purchase_orders")
        .select("*, providers:provider_id(name, email), rfqs:rfq_id(id, delivery_location)")
        .order("created_at", { ascending: false });

      if (role === "proveedor" && myProvider) {
        query = query.eq("provider_id", myProvider.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Provider can accept/reject POs
  const updatePOStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("purchase_orders").update({ status: status as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({ title: "Estado actualizado" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Órdenes de Compra</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {role === "proveedor" ? "OCs recibidas de constructoras" : "OCs emitidas y su seguimiento"}
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : !orders?.length ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p className="text-sm">No hay órdenes de compra.</p>
            <p className="text-xs mt-1">
              {role === "proveedor"
                ? "Las OCs aparecerán cuando te adjudiquen una cotización."
                : "Las OCs se generan al adjudicar una cotización."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((po: any) => (
            <Card key={po.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-sm font-display">OC #{po.id.slice(0, 8)}</CardTitle>
                  <Badge variant={poStatusLabels[po.status]?.variant || "secondary"}>
                    {poStatusLabels[po.status]?.label || po.status}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(po.created_at).toLocaleDateString("es-MX")}</span>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>🏢 {po.providers?.name || "—"}</span>
                  {po.total_amount && <span>💰 ${Number(po.total_amount).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>}
                </div>
                {po.notes && <p className="text-sm text-muted-foreground">{po.notes}</p>}

                {/* Provider actions: accept/reject sent POs */}
                {role === "proveedor" && po.status === "sent" && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={() => updatePOStatus.mutate({ id: po.id, status: "accepted" })}>
                      <CheckCircle className="h-3 w-3 mr-1" />Aceptar
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => updatePOStatus.mutate({ id: po.id, status: "rejected" })}>
                      <XCircle className="h-3 w-3 mr-1" />Rechazar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
