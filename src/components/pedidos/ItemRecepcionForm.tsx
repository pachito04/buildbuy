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
        className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded transition-colors hover:opacity-80"
        style={{
          backgroundColor: "#EFF6FF",
          color: "#2563EB",
          border: "1px solid #BFDBFE",
        }}
      >
        <PackageCheck className="h-3.5 w-3.5" />
        Confirmar recepción
      </button>
    );
  }

  return (
    <div
      className="mt-2 p-2.5 rounded-lg space-y-2"
      style={{ backgroundColor: "#F0F7FF", border: "1px solid #BFDBFE" }}
    >
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground shrink-0">Cantidad:</label>
        <input
          type="number"
          min={0.001}
          max={pending}
          step="any"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="w-24 rounded border px-2 py-1 text-sm"
          style={{ borderColor: "#D1D5DB" }}
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
          className="text-xs font-medium px-3 py-1.5 rounded transition-colors disabled:opacity-50"
          style={{
            backgroundColor: isValid ? "#2563EB" : "#93C5FD",
            color: "white",
          }}
        >
          {mutation.isPending ? "Guardando..." : "Confirmar"}
        </button>
        <button
          onClick={() => {
            setQty("");
            setOpen(false);
          }}
          className="text-xs font-medium px-3 py-1.5 rounded"
          style={{ backgroundColor: "#F3F4F6", color: "#6B7280" }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
