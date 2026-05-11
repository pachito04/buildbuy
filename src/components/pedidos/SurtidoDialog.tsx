import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Warehouse } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useViewRole } from "@/hooks/useViewRole";
import { availableStock, reservationCalc } from "@/lib/deposito-utils";

interface SurtidoDialogProps {
  requestId: string | null;
  requestNumber: number;
  projectName: string | null;
  createdBy: string | null;
  onClose: () => void;
}

export function SurtidoDialog({
  requestId,
  requestNumber,
  projectName,
  createdBy,
  onClose,
}: SurtidoDialogProps) {
  const { user } = useAuth();
  const { companyId } = useViewRole();
  const qc = useQueryClient();

  const { data: surtidoStock } = useQuery({
    queryKey: ["surtido-stock", requestId],
    enabled: !!requestId,
    queryFn: async () => {
      const { data: reqItems, error } = await supabase
        .from("request_items")
        .select("id, material_id, description, quantity, unit")
        .eq("request_id", requestId!);
      if (error) throw error;

      const materialIds = (reqItems ?? []).map((i) => i.material_id).filter(Boolean);
      if (!materialIds.length) return [];

      const { data: inv } = await supabase
        .from("inventory")
        .select("material_id, quantity, reserved")
        .in("material_id", materialIds);

      const stockMap: Record<string, { quantity: number; reserved: number }> = {};
      inv?.forEach((row: any) => {
        stockMap[row.material_id] = {
          quantity: Number(row.quantity),
          reserved: Number(row.reserved),
        };
      });

      return (reqItems ?? []).map((item: any) => {
        const inv = item.material_id ? stockMap[item.material_id] : null;
        const invRow = { quantity: inv?.quantity ?? 0, reserved: inv?.reserved ?? 0, min_stock: 0 };
        const available = availableStock(invRow);
        const requested = Number(item.quantity) || 0;
        const calc = reservationCalc(requested, available);
        return {
          ...item,
          stockTotal: invRow.quantity,
          stockReserved: invRow.reserved,
          available,
          requested,
          toFulfill: calc.toReserve,
          remaining: calc.remaining,
          hasStock: calc.hasStock,
          needsRfq: calc.needsRfq,
        };
      });
    },
  });

  const hasAnyStock = surtidoStock?.some((i: any) => i.hasStock);
  const hasRfqItems = surtidoStock?.some((i: any) => i.needsRfq);
  const allFullyStocked = surtidoStock?.every((i: any) => !i.needsRfq);

  const surtidoMutation = useMutation({
    mutationFn: async () => {
      if (!requestId || !surtidoStock || !companyId || !user)
        throw new Error("Datos incompletos");

      const itemsToFulfill = surtidoStock.filter((i: any) => i.hasStock);
      const itemsForRfq = surtidoStock.filter((i: any) => i.needsRfq);

      // Reserve stock (do NOT deduct quantity)
      for (const item of itemsToFulfill) {
        const newReserved = item.stockReserved + item.toFulfill;
        const { error: invErr } = await supabase
          .from("inventory")
          .update({ reserved: newReserved })
          .eq("material_id", item.material_id);
        if (invErr) throw invErr;
      }

      // Create remito borrador for Depósito
      const { data: project } = await supabase
        .from("requests")
        .select("projects:project_id(name, address)")
        .eq("id", requestId)
        .single();

      const destination = (project as any)?.projects?.address
        || (project as any)?.projects?.name
        || projectName
        || "Obra";

      const { data: remito, error: remErr } = await supabase
        .from("remitos")
        .insert({
          company_id: companyId,
          request_id: requestId,
          status: "borrador" as any,
          destination,
          observations: `Surtido de inventario — Pedido #${requestNumber}`,
          created_by: user.id,
        })
        .select()
        .single();
      if (remErr) throw remErr;

      // Create remito items
      const remitoItems = itemsToFulfill.map((item: any) => ({
        remito_id: (remito as any).id,
        material_id: item.material_id,
        quantity: item.toFulfill,
        request_item_id: item.id,
      }));
      if (remitoItems.length > 0) {
        const { error: riErr } = await supabase.from("remito_items").insert(remitoItems);
        if (riErr) throw riErr;
      }

      // RFQ for shortfall items (unchanged logic)
      let rfqCreated = false;
      if (itemsForRfq.length > 0) {
        const { data: rfq, error: rfqErr } = await supabase
          .from("rfqs")
          .insert({
            company_id: companyId,
            request_id: requestId,
            rfq_type: "open",
            observations: `Generado automáticamente — ítems faltantes del pedido #${requestNumber}`,
            created_by: user.id,
            status: "draft",
          } as any)
          .select()
          .single();
        if (rfqErr) throw rfqErr;

        const rfqItems = itemsForRfq.map((item: any) => ({
          rfq_id: (rfq as any).id,
          description: item.description,
          quantity: item.remaining,
          unit: item.unit,
          ...(item.material_id ? { material_id: item.material_id } : {}),
        }));
        const { error: riErr } = await supabase.from("rfq_items").insert(rfqItems);
        if (riErr) throw riErr;
        rfqCreated = true;
      }

      // Update request status
      const { error: stErr } = await supabase
        .from("requests")
        .update({ status: "en_curso" as any })
        .eq("id", requestId);
      if (stErr) throw stErr;

      // Log event
      try {
        await supabase.from("requerimiento_evento").insert({
          request_id: requestId,
          tipo: "surtido",
          descripcion: allFullyStocked
            ? "Reserva completa de inventario — pendiente despacho por Depósito"
            : `Reserva parcial — ${itemsToFulfill.length} ítem(s) reservado(s), ${itemsForRfq.length} a cotización`,
          created_by: user.id,
        });
      } catch {}

      // Notify architect
      if (createdBy) {
        const pName = projectName || "Sin obra";
        const msg = `Pedido #${requestNumber} — stock reservado`;
        const detail = allFullyStocked
          ? `Tu pedido #${requestNumber} de ${pName} tiene stock reservado en depósito. Pendiente de despacho.`
          : `Tu pedido #${requestNumber} de ${pName} fue parcialmente reservado de inventario. Los faltantes fueron enviados a cotización.`;

        await supabase.from("notificaciones").insert({
          company_id: companyId,
          user_id: createdBy,
          type: "request_approved" as any,
          message: msg,
          metadata: { request_id: requestId, detail_message: detail },
        });
      }

      return { rfqCreated };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["request-detail"] });
      qc.invalidateQueries({ queryKey: ["request-events"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["rfqs"] });
      qc.invalidateQueries({ queryKey: ["remitos"] });
      onClose();
      const msg = result?.rfqCreated
        ? "Stock reservado — solicitud de despacho enviada al Depósito. Se generó cotización para los faltantes."
        : "Stock reservado — solicitud de despacho enviada al Depósito.";
      toast.success(msg);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!requestId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            Reservar de Inventario — Pedido #{requestNumber}
          </DialogTitle>
        </DialogHeader>
        {surtidoStock && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm">
              <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-blue-800">
                {allFullyStocked
                  ? "Se reservará stock y se generará una solicitud de despacho al Depósito. El stock se descontará cuando Depósito confirme el despacho físico."
                  : "Se reservará el stock disponible y se generará solicitud de despacho al Depósito. Los faltantes irán a cotización."}
              </p>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left px-3 py-2">Material</th>
                    <th className="text-right px-3 py-2">Solicitado</th>
                    <th className="text-right px-3 py-2">Disponible</th>
                    <th className="text-right px-3 py-2">A reservar</th>
                    <th className="text-center px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {surtidoStock.map((item: any) => (
                    <tr
                      key={item.id}
                      className={`border-t ${item.needsRfq ? "bg-amber-50/50" : ""}`}
                    >
                      <td className="px-3 py-2">{item.description}</td>
                      <td className="text-right px-3 py-2">
                        {item.requested} {item.unit}
                      </td>
                      <td className="text-right px-3 py-2 font-mono">
                        {item.available} {item.unit}
                      </td>
                      <td className="text-right px-3 py-2 font-mono font-medium">
                        {item.toFulfill} {item.unit}
                      </td>
                      <td className="text-center px-3 py-2">
                        {item.needsRfq ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-amber-700 border-amber-300"
                          >
                            {item.hasStock
                              ? `Faltante: ${item.remaining}`
                              : "Sin stock → Cotización"}
                          </Badge>
                        ) : (
                          <Badge className="text-[10px] bg-green-600">
                            Completo
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {hasRfqItems && (
              <p className="text-xs text-muted-foreground">
                Se creará una solicitud de cotización borrador con{" "}
                {surtidoStock.filter((i: any) => i.needsRfq).length} ítem(s)
                faltante(s).
              </p>
            )}

            {!hasAnyStock && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-red-800">
                  No hay stock disponible para ningún ítem. Considerá generar una
                  solicitud de cotización directa.
                </p>
              </div>
            )}

            <Button
              className="w-full"
              onClick={() => surtidoMutation.mutate()}
              disabled={surtidoMutation.isPending || !hasAnyStock}
            >
              <Warehouse className="h-4 w-4 mr-2" />
              {surtidoMutation.isPending ? "Reservando..." : "Reservar y solicitar despacho"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
