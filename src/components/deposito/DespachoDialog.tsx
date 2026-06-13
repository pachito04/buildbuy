import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewRole } from "@/hooks/useViewRole";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Truck } from "lucide-react";
import { inventoryAfterDispatch } from "@/lib/deposito-utils";
import { logMovimiento } from "@/lib/movimiento-utils";

interface DespachoDialogProps {
  remitoId: string | null;
  onClose: () => void;
}

export function DespachoDialog({ remitoId, onClose }: DespachoDialogProps) {
  const { user } = useAuth();
  const { companyId } = useViewRole();
  const qc = useQueryClient();

  const [transportista, setTransportista] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const { data: remito } = useQuery({
    queryKey: ["despacho-remito", remitoId],
    enabled: !!remitoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remitos")
        .select("*, requests:request_id(request_number, created_by, project_id, projects:project_id(name))")
        .eq("id", remitoId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: items } = useQuery({
    queryKey: ["despacho-items", remitoId],
    enabled: !!remitoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remito_items")
        .select("*, materials:material_id(name, unit)")
        .eq("remito_id", remitoId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (items) {
      const initial: Record<string, number> = {};
      for (const item of items) {
        const pending = item.quantity - item.quantity_delivered;
        initial[item.id] = Math.max(0, pending);
      }
      setQuantities(initial);
    }
  }, [items]);

  const totalToDispatch = Object.values(quantities).reduce((a, b) => a + b, 0);
  const hasAnyToDispatch = totalToDispatch > 0;

  const despachoMutation = useMutation({
    mutationFn: async () => {
      if (!remitoId || !items || !companyId || !user)
        throw new Error("Datos incompletos");
      if (!transportista.trim())
        throw new Error("Ingresá el transportista");

      // OBS-004: human-readable destination for the per-product audit log.
      const obraName = (remito as any)?.requests?.projects?.name;
      const despachoDestino = obraName ? `Obra ${obraName}` : "Obra";

      for (const item of items) {
        const qtyToDispatch = quantities[item.id] ?? 0;
        if (qtyToDispatch <= 0) continue;

        const pending = item.quantity - item.quantity_delivered;
        if (qtyToDispatch > pending)
          throw new Error(`Cantidad a despachar supera el pendiente para ${item.materials?.name}`);

        const newDelivered = item.quantity_delivered + qtyToDispatch;
        const { error: riErr } = await supabase
          .from("remito_items")
          .update({ quantity_delivered: newDelivered })
          .eq("id", item.id);
        if (riErr) throw riErr;

        const { data: inv } = await supabase
          .from("inventory")
          .select("id, quantity, reserved")
          .eq("material_id", item.material_id)
          .eq("company_id", companyId!)
          .single();

        if (inv) {
          const after = inventoryAfterDispatch(
            { quantity: Number(inv.quantity), reserved: Number(inv.reserved), min_stock: 0 },
            qtyToDispatch
          );
          const { error: invErr } = await supabase
            .from("inventory")
            .update({ quantity: after.quantity, reserved: after.reserved })
            .eq("id", inv.id);
          if (invErr) throw invErr;
        }

        const { error: movErr } = await supabase
          .from("inventory_movements")
          .insert({
            company_id: companyId!,
            material_id: item.material_id,
            movement_type: "salida",
            quantity: qtyToDispatch,
            reason: `Despacho a obra — Remito ${remitoId.slice(0, 8)}`,
            request_id: (remito as any)?.request_id ?? null,
            created_by: user.id,
          });
        if (movErr) throw movErr;

        // OBS-004: per-product movement audit — dispatch leaves inventory toward
        // the obra. Best-effort, logged only after this item's primary writes succeed.
        if (item.request_item_id) {
          await logMovimiento(supabase, {
            request_item_id: item.request_item_id,
            material_id: item.material_id,
            tipo: "despacho",
            origen: "Inventario",
            destino: despachoDestino,
            cantidad: qtyToDispatch,
            ref_type: "remito",
            ref_id: remitoId,
            created_by: user.id,
          });
        }
      }

      const { error: remErr } = await supabase
        .from("remitos")
        .update({
          status: "en_transito" as any,
          transportista_id: transportista.trim(),
        })
        .eq("id", remitoId);
      if (remErr) throw remErr;

      const request = (remito as any)?.requests;
      if (request?.created_by) {
        const projectName = request?.projects?.name || "Obra";
        await supabase.from("notificaciones").insert({
          company_id: companyId!,
          user_id: request.created_by,
          type: "remito_dispatched",
          message: `Pedido #${request.request_number} — material despachado`,
          metadata: {
            request_id: (remito as any)?.request_id,
            remito_id: remitoId,
            detail_message: `El material de tu pedido #${request.request_number} (${projectName}) fue despachado. Transportista: ${transportista.trim()}.`,
          },
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deposito-solicitudes"] });
      qc.invalidateQueries({ queryKey: ["deposito-solicitudes-items"] });
      qc.invalidateQueries({ queryKey: ["remitos"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory-movements"] });
      toast.success("Despacho confirmado — material en tránsito");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!remitoId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <span className="eyebrow">Depósito · despacho</span>
          <DialogTitle>
            Confirmar Despacho
            {(remito as any)?.requests?.request_number &&
              ` — Pedido #${(remito as any).requests.request_number}`}
          </DialogTitle>
        </DialogHeader>

        {items && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="transportista">Transportista</Label>
              <Input
                id="transportista"
                placeholder="Nombre del transportista o vehículo"
                value={transportista}
                onChange={(e) => setTransportista(e.target.value)}
                className="min-h-[44px]"
              />
            </div>

            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm min-w-[360px]">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left px-3 py-2">Material</th>
                    <th className="text-right px-3 py-2">Pendiente</th>
                    <th className="text-right px-3 py-2">A despachar</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item: any) => {
                    const pending = item.quantity - item.quantity_delivered;
                    const unit = item.materials?.unit || "";
                    return (
                      <tr key={item.id} className="border-t">
                        <td className="px-3 py-2">
                          {item.materials?.name || "—"}
                        </td>
                        <td className="text-right px-3 py-2 font-mono text-muted-foreground">
                          {pending} {unit}
                        </td>
                        <td className="text-right px-3 py-2">
                          <Input
                            type="number"
                            min={0}
                            max={pending}
                            value={quantities[item.id] ?? 0}
                            onChange={(e) =>
                              setQuantities((prev) => ({
                                ...prev,
                                [item.id]: Math.min(
                                  Number(e.target.value) || 0,
                                  pending
                                ),
                              }))
                            }
                            className="w-20 text-right ml-auto min-h-[44px]"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!hasAnyToDispatch && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-amber-800">
                  Ingresá al menos una cantidad a despachar.
                </p>
              </div>
            )}

            <Button
              className="w-full min-h-[44px]"
              onClick={() => despachoMutation.mutate()}
              disabled={
                despachoMutation.isPending ||
                !hasAnyToDispatch ||
                !transportista.trim()
              }
            >
              <Truck className="h-4 w-4 mr-2" />
              {despachoMutation.isPending
                ? "Despachando..."
                : "Confirmar despacho"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
