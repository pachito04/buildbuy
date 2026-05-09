import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { REJECTION_REASONS } from "@/lib/kanban-types";

interface RejectionModalProps {
  open: boolean;
  requestNumber: number;
  onConfirm: (reason: string, note: string | null) => void;
  onCancel: () => void;
  isPending: boolean;
}

export function RejectionModal({ open, requestNumber, onConfirm, onCancel, isPending }: RejectionModalProps) {
  const [selectedReason, setSelectedReason] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setSelectedReason('');
      setNote('');
    }
  }, [open]);

  const paddedNumber = requestNumber.toString().padStart(4, '0');

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rechazar REQ-{paddedNumber}</DialogTitle>
          <DialogDescription>
            Esta accion es irreversible. El requerimiento no podra ser reactivado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Motivo del rechazo</Label>
            <Select value={selectedReason} onValueChange={setSelectedReason}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar motivo..." />
              </SelectTrigger>
              <SelectContent>
                {REJECTION_REASONS.map(reason => (
                  <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Nota adicional (opcional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Agregar una nota..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(selectedReason, note.trim() || null)}
            disabled={!selectedReason || isPending}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Rechazar requerimiento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
