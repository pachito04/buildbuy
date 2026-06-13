import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useViewRole } from "@/hooks/useViewRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Truck,
  FileText,
  ChevronDown,
  ChevronUp,
  PackageCheck,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { RecepcionDialog } from "@/components/deposito/RecepcionDialog";

export default function RecepcionesDeposito() {
  const { companyId } = useViewRole();
  const qc = useQueryClient();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [recepcionOcId, setRecepcionOcId] = useState<string | null>(null);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["deposito-recepciones", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(
          "*, providers:provider_id(name), purchase_order_items(*), requests:request_id(request_number), rfqs:rfq_id(requests:request_id(request_number))"
        )
        .eq("destination", "deposito")
        .eq("status", "accepted")
        .order("created_at", { ascending: false });
      if (error) throw error;

      return (data ?? []).filter((po: any) => {
        const items = po.purchase_order_items ?? [];
        return items.some(
          (i: any) => Number(i.quantity) > Number(i.quantity_received)
        );
      });
    },
  });

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <PageHeader
        eyebrow="Depósito"
        title="Recepciones de Material"
        subtitle="Órdenes de compra pendientes de recepción en depósito"
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : !orders?.length ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <Truck className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No hay recepciones pendientes.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((po: any) => {
            const items = po.purchase_order_items ?? [];
            const isExpanded = expandedId === po.id;
            const totalItems = items.length;
            const pendingItems = items.filter(
              (i: any) => Number(i.quantity) > Number(i.quantity_received)
            ).length;

            return (
              <Card key={po.id} className="overflow-hidden">
                <CardHeader
                  className="pb-2 cursor-pointer"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : po.id)
                  }
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <CardTitle className="text-sm font-display">
                        {(() => {
                          const reqNum = po.requests?.request_number ?? po.rfqs?.requests?.request_number;
                          if (po.po_number) return `OC #${po.po_number}`;
                          if (reqNum) return `OC — Pedido #${reqNum}`;
                          return `OC #${po.id.slice(0, 8)}`;
                        })()}
                      </CardTitle>
                      <Badge
                        variant="outline"
                        className="text-violet-700 border-violet-300 bg-violet-50"
                      >
                        Depósito
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {pendingItems}/{totalItems} pendiente(s)
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {new Date(po.created_at).toLocaleDateString("es-AR")}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                    <span>Proveedor: {po.providers?.name || "—"}</span>
                    {po.total_amount != null && (
                      <span>
                        Total: $
                        {Number(po.total_amount).toLocaleString("es-AR", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    )}
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0 space-y-3">
                    <div className="border rounded-lg overflow-x-auto">
                      <table className="w-full text-sm min-w-[420px]">
                        <thead className="bg-muted">
                          <tr>
                            <th className="text-left px-3 py-2">Material</th>
                            <th className="text-right px-3 py-2">Pedido</th>
                            <th className="text-right px-3 py-2">Recibido</th>
                            <th className="text-right px-3 py-2">Pendiente</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item: any) => {
                            const pending =
                              Number(item.quantity) -
                              Number(item.quantity_received);
                            return (
                              <tr key={item.id} className="border-t">
                                <td className="px-3 py-2">
                                  {item.description}
                                </td>
                                <td className="text-right px-3 py-2 font-mono">
                                  {item.quantity} {item.unit}
                                </td>
                                <td className="text-right px-3 py-2 font-mono">
                                  {item.quantity_received} {item.unit}
                                </td>
                                <td className="text-right px-3 py-2 font-mono">
                                  {pending > 0 ? (
                                    <span className="text-amber-700 font-medium">
                                      {pending} {item.unit}
                                    </span>
                                  ) : (
                                    <span className="text-green-700">
                                      Completo
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <Button
                      size="sm"
                      className="min-h-[44px] w-full sm:w-auto"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRecepcionOcId(po.id);
                      }}
                    >
                      <PackageCheck className="h-4 w-4 mr-2" />
                      Registrar recepción
                    </Button>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <RecepcionDialog
        purchaseOrderId={recepcionOcId}
        onClose={() => setRecepcionOcId(null)}
      />
    </div>
  );
}
