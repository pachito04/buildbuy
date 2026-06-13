import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Send, Calendar } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useViewRole } from "@/hooks/useViewRole";

interface SolicitudDirectaDialogProps {
  requestId: string | null;
  requestNumber: number;
  projectName: string | null;
  desiredDate: string | null;
  onClose: () => void;
}

export function SolicitudDirectaDialog({
  requestId,
  requestNumber,
  projectName,
  desiredDate,
  onClose,
}: SolicitudDirectaDialogProps) {
  const { user } = useAuth();
  const { companyId } = useViewRole();
  const qc = useQueryClient();

  const [deadline, setDeadline] = useState("");
  const [closing, setClosing] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  const { data: directaItems } = useQuery({
    queryKey: ["directa-items", requestId],
    enabled: !!requestId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("request_items")
        .select("id, material_id, description, quantity, unit")
        .eq("request_id", requestId!)
        .order("description");
      if (error) throw error;
      return data ?? [];
    },
  });

  const createDirectRfq = useMutation({
    mutationFn: async () => {
      if (!requestId || !directaItems?.length) throw new Error("Sin ítems");
      if (!closing) throw new Error("La fecha de cierre es obligatoria");
      if (!deadline) throw new Error("La fecha de entrega es obligatoria");
      if (!location.trim()) throw new Error("El lugar de entrega es obligatorio");
      if (!companyId) throw new Error("Sin empresa");

      const { data: rfq, error } = await supabase
        .from("rfqs")
        .insert({
          company_id: companyId,
          request_id: requestId,
          rfq_type: "open",
          deadline,
          closing_datetime: closing,
          delivery_location: location,
          observations: notes || null,
          created_by: user?.id,
          status: "sent",
        } as any)
        .select()
        .single();
      if (error) throw error;

      const rfqItems = directaItems.map((it: any) => ({
        rfq_id: (rfq as any).id,
        description: it.description,
        quantity: Number(it.quantity) || 1,
        unit: it.unit,
        material_id: it.material_id,
      }));
      const { error: ie } = await supabase.from("rfq_items").insert(rfqItems);
      if (ie) throw ie;

      await supabase
        .from("requests")
        .update({ status: "recibido" as any })
        .eq("id", requestId);

      try {
        await supabase.from("requerimiento_evento").insert({
          request_id: requestId,
          tipo: "solicitud_cotizacion",
          descripcion: "Se generó solicitud de cotización directa y se envió a proveedores",
          created_by: user?.id ?? null,
        });
      } catch {}

      try {
        await supabase.functions.invoke("notify-providers", {
          body: { type: "rfq_sent", rfq_id: (rfq as any).id },
        });
      } catch {}
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["request-detail"] });
      qc.invalidateQueries({ queryKey: ["request-events"] });
      qc.invalidateQueries({ queryKey: ["rfqs"] });
      onClose();
      setDeadline("");
      setClosing("");
      setLocation("");
      setNotes("");
      toast.success("Solicitud de cotización enviada a proveedores.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={!!requestId}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setDeadline("");
          setClosing("");
          setLocation("");
          setNotes("");
        }
      }}
    >
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <span className="eyebrow">Solicitud de cotización</span>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Pedido #{requestNumber}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {projectName && (
            <p className="text-sm">
              <span className="text-muted-foreground">Obra:</span> {projectName}
            </p>
          )}

          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted px-3 py-2 text-xs font-medium">
              Materiales del pedido
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-1.5">Material</th>
                  <th className="text-right px-3 py-1.5">Cantidad</th>
                  <th className="text-left px-3 py-1.5">Unidad</th>
                </tr>
              </thead>
              <tbody>
                {(directaItems ?? []).map((item: any) => (
                  <tr key={item.id} className="border-t">
                    <td className="px-3 py-1.5">{item.description}</td>
                    <td className="text-right px-3 py-1.5 font-medium">
                      {item.quantity}
                    </td>
                    <td className="px-3 py-1.5">{item.unit || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cierre de cotización *</Label>
              <Input
                type="datetime-local"
                value={closing}
                onChange={(e) => setClosing(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Entrega límite *</Label>
              <Input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
              {desiredDate && (
                <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  El arquitecto solicitó entrega para el{" "}
                  {(() => {
                    const d = new Date(desiredDate);
                    const date = d.toLocaleDateString("es-AR");
                    const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
                    return hasTime
                      ? `${date} a las ${d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`
                      : date;
                  })()}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Lugar de entrega *</Label>
            <Input
              placeholder="Ej: Obra Norte, Av. Reforma 123"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Observaciones</Label>
            <Textarea
              placeholder="Notas para proveedores..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <Button
            className="w-full"
            onClick={() => createDirectRfq.mutate()}
            disabled={createDirectRfq.isPending}
          >
            <Send className="h-4 w-4 mr-2" />
            {createDirectRfq.isPending
              ? "Enviando..."
              : "Emitir y Enviar a Proveedores"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
