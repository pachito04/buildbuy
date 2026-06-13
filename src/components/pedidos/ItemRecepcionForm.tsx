import { useState } from "react";
import { toast } from "sonner";
import { useItemRecepcion } from "@/hooks/useItemRecepcion";
import { PackageCheck } from "lucide-react";
import type { RequestItemWithMaterial } from "@/lib/kanban-types";

interface ItemRecepcionFormProps {
  requestId: string;
  item: RequestItemWithMaterial;
}

export function ItemRecepcionForm({ requestId, item }: ItemRecepcionFormProps) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState("");
  const mutation = useItemRecepcion();

  const pending = Number(item.quantity) - Number(item.quantity_received);
  const materialName = item.materials?.name ?? item.description;
  const unit = item.materials?.unit ?? item.unit;

  const handleConfirm = () => {
    const parsed = parseFloat(qty);
    if (isNaN(parsed) || parsed <= 0 || parsed > pending) return;

    mutation.mutate(
      {
        requestId,
        itemId: item.id,
        materialName,
        unit,
        quantityReceived: parsed,
        newTotalReceived: Number(item.quantity_received) + parsed,
        totalRequired: Number(item.quantity),
      },
      {
        onSuccess: () => {
          toast.success(`Recepción registrada: ${parsed} ${unit}`);
          setQty("");
          setOpen(false);
        },
        onError: () => toast.error("Error al registrar recepción"),
      }
    );
  };

  const parsed = parseFloat(qty);
  const isValid = !isNaN(parsed) && parsed > 0 && parsed <= pending;

  if (!open) {
    return (
      <button
        onClick={() => {
          setQty(String(pending));
          setOpen(true);
        }}
        className="flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
      >
        <PackageCheck className="h-3.5 w-3.5" />
        Confirmar recepción
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5">
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground shrink-0">Cantidad:</label>
        <input
          type="number"
          min={0.001}
          max={pending}
          step="any"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="w-24 rounded border border-input bg-background px-2 py-1 text-sm"
          autoFocus
        />
        <span className="text-xs text-muted-foreground">
          / {pending} {unit}
        </span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={!isValid || mutation.isPending}
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isPending ? "Guardando..." : "Confirmar"}
        </button>
        <button
          onClick={() => {
            setQty("");
            setOpen(false);
          }}
          className="rounded bg-secondary px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
