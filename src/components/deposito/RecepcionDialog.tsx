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
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, PackageCheck } from "lucide-react";

interface RecepcionDialogProps {
  purchaseOrderId: string | null;
  onClose: () => void;
}

interface ItemReception {
  itemId: string;
  accepted: number;
  rejected: number;
  reason: string;
}

export function RecepcionDialog({ purchaseOrderId, onClose }: RecepcionDialogProps) {
  const { user } = useAuth();
  const { companyId } = useViewRole();
  const qc = useQueryClient();

  const [receptions, setReceptions] = useState<Record<string, ItemReception>>({});

  const { data: poData } = useQuery({
    queryKey: ["recepcion-po", purchaseOrderId],
    enabled: !!purchaseOrderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*, providers:provider_id(name), purchase_order_items(*)")
        .eq("id", purchaseOrderId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const items = (poData as any)?.purchase_order_items ?? [];

  useEffect(() => {
    if (items.length) {
      const initial: Record<string, ItemReception> = {};
      for (const item of items) {
        const pending = Number(item.quantity) - Number(item.quantity_received);
        initial[item.id] = {
          itemId: item.id,
          accepted: Math.max(0, pending),
          rejected: 0,
          reason: "",
        };
      }
      setReceptions(initial);
    }
  }, [items.length, purchaseOrderId]);

  const hasAnyReception = Object.values(receptions).some(
    (r) => r.accepted > 0 || r.rejected > 0
  );

  const hasRejectionWithoutReason = Object.values(receptions).some(
    (r) => r.rejected > 0 && !r.reason.trim()
  );

  const recepcionMutation = useMutation({
    mutationFn: async () => {
      if (!purchaseOrderId || !companyId || !user)
        throw new Error("Datos incompletos");

      for (const item of items) {
        const rec = receptions[item.id];
        if (!rec) continue;

        const pending = Number(item.quantity) - Number(item.quantity_received);
        if (rec.accepted + rec.rejected > pending)
          throw new Error(
            `${item.description}: aceptados + rechazados supera el pendiente (${pending})`
          );

        if (rec.accepted > 0) {
          const newReceived = Number(item.quantity_received) + rec.accepted;
          const { error: poiErr } = await supabase
            .from("purchase_order_items")
            .update({ quantity_received: newReceived })
            .eq("id", item.id);
          if (poiErr) throw poiErr;

          if (item.material_id) {
            const { data: inv } = await supabase
              .from("inventory")
              .select("id, quantity")
              .eq("material_id", item.material_id)
              .eq("company_id", companyId!)
              .maybeSingle();

            if (inv) {
              const { error: invErr } = await supabase
                .from("inventory")
                .update({ quantity: Number(inv.quantity) + rec.accepted })
                .eq("id", inv.id);
              if (invErr) throw invErr;
            } else {
              const { error: invErr } = await supabase
                .from("inventory")
                .insert({
                  company_id: companyId!,
                  material_id: item.material_id,
                  quantity: rec.accepted,
                });
              if (invErr) throw invErr;
            }

            const { error: movErr } = await supabase
              .from("inventory_movements")
              .insert({
                company_id: companyId!,
                material_id: item.material_id,
                movement_type: "entrada",
                quantity: rec.accepted,
                reason: `Recepción OC #${purchaseOrderId.slice(0, 8)} — ${(poData as any)?.providers?.name || "proveedor"}`,
                created_by: user.id,
              });
            if (movErr) throw movErr;
          }
        }

        if (rec.rejected > 0) {
          const { error: rejErr } = await supabase
            .from("oc_rejections")
            .insert({
              company_id: companyId!,
              purchase_order_id: purchaseOrderId,
              purchase_order_item_id: item.id,
              material_id: item.material_id,
              quantity_rejected: rec.rejected,
              reason: rec.reason,
              created_by: user.id,
            });
          if (rejErr) throw rejErr;
        }
      }

      const totalAccepted = Object.values(receptions).reduce((s, r) => s + r.accepted, 0);
      const totalRejected = Object.values(receptions).reduce((s, r) => s + r.rejected, 0);

      if ((poData as any)?.created_by) {
        await supabase.from("notificaciones").insert({
          company_id: companyId!,
          user_id: (poData as any).created_by,
          type: "material_received" as any,
          message: `Recepción registrada — OC #${purchaseOrderId.slice(0, 8)}`,
          metadata: {
            purchase_order_id: purchaseOrderId,
            detail_message: `Se recibieron ${totalAccepted} unidad(es)${totalRejected > 0 ? ` y se rechazaron ${totalRejected} unidad(es) por no conformidad` : ""}.`,
          },
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deposito-recepciones"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory-movements"] });
      toast.success("Recepción registrada");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateReception = (
    itemId: string,
    field: keyof ItemReception,
    value: number | string
  ) => {
    setReceptions((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  return (
    <Dialog open={!!purchaseOrderId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            Registrar Recepción
            {(poData as any)?.po_number && ` — OC #${(poData as any).po_number}`}
          </DialogTitle>
        </DialogHeader>

        {items.length > 0 && (
          <div className="space-y-4">
            {items.map((item: any) => {
              const pending = Number(item.quantity) - Number(item.quantity_received);
              if (pending <= 0) return null;
              const rec = receptions[item.id];
              if (!rec) return null;

              return (
                <div
                  key={item.id}
                  className="border rounded-lg p-3 space-y-2"
                >
                  <div className="flex justify-between items-start">
                    <p className="text-sm font-medium">{item.description}</p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                      Pendiente: {pending} {item.unit}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Aceptados</Label>
                      <Input
                        type="number"
                        min={0}
                        max={pending}
                        value={rec.accepted}
                        onChange={(e) => {
                          const val = Math.min(Number(e.target.value) || 0, pending);
                          updateReception(item.id, "accepted", val);
                          if (val + rec.rejected > pending) {
                            updateReception(item.id, "rejected", pending - val);
                          }
                        }}
                        className="min-h-[44px]"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Rechazados</Label>
                      <Input
                        type="number"
                        min={0}
                        max={pending}
                        value={rec.rejected}
                        onChange={(e) => {
                          const val = Math.min(Number(e.target.value) || 0, pending);
                          updateReception(item.id, "rejected", val);
                          if (rec.accepted + val > pending) {
                            updateReception(item.id, "accepted", pending - val);
                          }
                        }}
                        className="min-h-[44px]"
                      />
                    </div>
                  </div>

                  {rec.rejected > 0 && (
                    <div>
                      <Label className="text-xs">
                        Motivo de rechazo <span className="text-red-500">*</span>
                      </Label>
                      <Textarea
                        value={rec.reason}
                        onChange={(e) =>
                          updateReception(item.id, "reason", e.target.value)
                        }
                        placeholder="Describí el motivo de no conformidad..."
                        className="min-h-[60px] text-sm"
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {hasRejectionWithoutReason && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-red-800">
                  Completá el motivo de rechazo para todos los ítems rechazados.
                </p>
              </div>
            )}

            <Button
              className="w-full min-h-[44px]"
              onClick={() => recepcionMutation.mutate()}
              disabled={
                recepcionMutation.isPending ||
                !hasAnyReception ||
                hasRejectionWithoutReason
              }
            >
              <PackageCheck className="h-4 w-4 mr-2" />
              {recepcionMutation.isPending
                ? "Registrando..."
                : "Confirmar recepción"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
