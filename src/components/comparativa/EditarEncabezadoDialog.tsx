import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { diffRfqHeader, datetimeLocalToIso } from "@/lib/rfq-header-utils";
import type { RfqHeader } from "@/lib/rfq-header-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Option sets — mirrored from RfqNuevo (design AD-5)
// ---------------------------------------------------------------------------

const PRICE_TERMS_OPTIONS = [
  { value: "Precios firmes", label: "Precios firmes" },
  { value: "Sujetos a variación", label: "Sujetos a variación" },
  { value: "A confirmar", label: "A confirmar" },
] as const;

const PAYMENT_TERMS_OPTIONS = [
  { value: "cheque_30", label: "Cheque a 30 días" },
  { value: "cheque_60", label: "Cheque a 60 días" },
  { value: "cheque_90", label: "Cheque a 90 días" },
  { value: "transferencia_inmediata", label: "Transferencia inmediata" },
  { value: "contrato_acopio", label: "Contrato por Acopio" },
] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EditarEncabezadoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rfqId: string;
  current: RfqHeader;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EditarEncabezadoDialog({
  open,
  onOpenChange,
  rfqId,
  current,
}: EditarEncabezadoDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Local form state — pre-filled from current values
  const [form, setForm] = useState<RfqHeader>(current);

  // Sync form when the dialog opens with fresh current values
  useEffect(() => {
    if (open) {
      setForm(current);
    }
  }, [open, current]);

  const saveMutation = useMutation({
    mutationFn: async (edited: RfqHeader) => {
      // Compute changed fields using the pure tested diff
      const changes = diffRfqHeader(current, edited);

      // No-op: nothing changed → close without writing
      if (changes.length === 0) {
        return { noOp: true };
      }

      // Build the partial update object — only changed fields.
      // closing_datetime is edited as datetime-local; convert back to ISO for the
      // TIMESTAMPTZ column. Other fields are plain text.
      const updatePayload: Partial<RfqHeader> = {};
      for (const change of changes) {
        const stored =
          change.field === "closing_datetime"
            ? datetimeLocalToIso(change.new) || null
            : change.new || null;
        updatePayload[change.field] = stored as unknown as string;
      }

      // 1. Update rfqs with only the changed header fields
      const { error: updateError } = await supabase
        .from("rfqs")
        .update(updatePayload as any)
        .eq("id", rfqId);

      if (updateError) throw updateError;

      // 2. Batch-insert one rfq_change_log row per changed field
      const logRows = changes.map((change) => ({
        rfq_id: rfqId,
        field: change.field,
        old_value: change.old || null,
        new_value: change.new || null,
        changed_by: user?.id ?? null,
      }));

      const { error: logError } = await supabase
        .from("rfq_change_log" as any)
        .insert(logRows);

      if (logError) throw logError;

      return { noOp: false, changeCount: changes.length };
    },
    onSuccess: (result) => {
      if (result.noOp) {
        onOpenChange(false);
        return;
      }

      // Invalidate both the rfq data and the history query
      qc.invalidateQueries({ queryKey: ["comparativa-rfq", rfqId] });
      qc.invalidateQueries({ queryKey: ["rfq-change-log", rfqId] });

      toast({
        title: "Encabezado actualizado",
        description: `Se registraron ${result.changeCount} cambio${result.changeCount !== 1 ? "s" : ""} en el historial.`,
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error al guardar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    saveMutation.mutate(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Editar encabezado</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Fecha de cierre */}
          <div className="space-y-2">
            <Label htmlFor="edit-closing-datetime">Fecha de cierre</Label>
            <Input
              id="edit-closing-datetime"
              type="datetime-local"
              value={form.closing_datetime ?? ""}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, closing_datetime: e.target.value }))
              }
            />
          </div>

          {/* Descripción */}
          <div className="space-y-2">
            <Label htmlFor="edit-descripcion">Descripción</Label>
            <Input
              id="edit-descripcion"
              type="text"
              placeholder="Describí brevemente el alcance de esta solicitud..."
              value={form.descripcion ?? ""}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, descripcion: e.target.value }))
              }
            />
          </div>

          {/* Condición de precios */}
          <div className="space-y-2">
            <Label>Condición de precios</Label>
            <Select
              value={form.price_terms ?? ""}
              onValueChange={(v) =>
                setForm((prev) => ({ ...prev, price_terms: v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccioná..." />
              </SelectTrigger>
              <SelectContent>
                {PRICE_TERMS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Condición de pago */}
          <div className="space-y-2">
            <Label>Condición de pago</Label>
            <Select
              value={form.payment_terms ?? ""}
              onValueChange={(v) =>
                setForm((prev) => ({ ...prev, payment_terms: v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccioná..." />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_TERMS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saveMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              "Guardar cambios"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
