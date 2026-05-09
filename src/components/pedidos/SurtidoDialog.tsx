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
        .select("material_id, quantity")
        .in("material_id", materialIds);

      const stockMap: Record<string, number> = {};
      inv?.forEach((row: any) => {
        stockMap[row.material_id] = Number(row.quantity);
      });

      return (reqItems ?? []).map((item: any) => {
        const stock = item.material_id ? (stockMap[item.material_id] ?? 0) : 0;
        const requested = Number(item.quantity) || 0;
        const toFulfill = Math.min(requested, stock);
        const remaining = requested - toFulfill;
        return {
          ...item,
          stock,
          requested,
          toFulfill,
          remaining,
          hasStock: toFulfill > 0,
          needsRfq: remaining > 0,
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

      for (const item of itemsToFulfill) {
        const { error: mvErr } = await supabase
          .from("inventory_movements")
          .insert({
            company_id: companyId,
            material_id: item.material_id,
            movement_type: "salida",
            quantity: item.toFulfill,
            reason: `Surtido pedido #${requestNumber}`,
            request_id: requestId,
            created_by: user.id,
          });
        if (mvErr) throw mvErr;

        const newQty = item.stock - item.toFulfill;
        const { error: invErr } = await supabase
          .from("inventory")
          .update({ quantity: newQty })
          .eq("material_id", item.material_id);
        if (invErr) throw invErr;
      }

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

      const newStatus = allFullyStocked ? "recibido" : "en_curso";
      const { error: stErr } = await supabase
        .from("requests")
        .update({ status: newStatus as any })
        .eq("id", requestId);
      if (stErr) throw stErr;

      try {
        await supabase.from("requerimiento_evento").insert({
          request_id: requestId,
          tipo: "surtido",
          descripcion: allFullyStocked
            ? "Surtido completo de inventario"
            : `Surtido parcial — ${itemsToFulfill.length} ítem(s) de inventario, ${itemsForRfq.length} a cotización`,
          created_by: user.id,
        });
      } catch {}

      if (createdBy) {
        const pName = projectName || "Sin obra";
        let msg: string;
        let detail: string;

        if (allFullyStocked) {
          msg = `Pedido #${requestNumber} surtido de inventario`;
          detail = `Tu pedido #${requestNumber} de ${pName} fue surtido de inventario.`;
        } else {
          const surtidos = itemsToFulfill
            .map((i: any) => `${i.description} (${i.toFulfill} ${i.unit})`)
            .join(", ");
          msg = `Pedido #${requestNumber} parcialmente surtido`;
          detail = `Tu pedido #${requestNumber} de ${pName} fue parcialmente surtido de inventario en los materiales: ${surtidos}. El resto fue enviado a proveedores.`;
        }

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
      onClose();
      const msg = result?.rfqCreated
        ? "Inventario descontado y solicitud de cotización generada para los faltantes."
        : "Inventario descontado exitosamente.";
      toast.success(msg);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!requestId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            Surtir de Inventario — Pedido #{requestNumber}
          </DialogTitle>
        </DialogHeader>
        {surtidoStock && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-amber-800">
                {allFullyStocked
                  ? "Todos los materiales serán surtidos de inventario."
                  : "Solo se surtirán de inventario los ítems con stock disponible. Para el resto se generará una solicitud de cotización."}
              </p>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left px-3 py-2">Material</th>
                    <th className="text-right px-3 py-2">Solicitado</th>
                    <th className="text-right px-3 py-2">En stock</th>
                    <th className="text-right px-3 py-2">A surtir</th>
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
                        {item.stock} {item.unit}
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
                              : "Sin stock → Solicitud"}
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
              {surtidoMutation.isPending ? "Procesando..." : "Confirmar Surtido"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
