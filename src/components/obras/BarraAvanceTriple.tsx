import { formatCurrency } from "@/lib/computo-utils";

interface BarraAvanceTripleProps {
  estimado: number;
  pedido: number;
  recibido: number;
  label: string;
  showAmounts?: boolean;
}

export function BarraAvanceTriple({
  estimado,
  pedido,
  recibido,
  label,
  showAmounts = false,
}: BarraAvanceTripleProps) {
  const total = Math.max(estimado, pedido, 1);
  const pctRecibido = (recibido / total) * 100;
  const pctPedido = (pedido / total) * 100;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium truncate">{label}</span>
        {showAmounts && (
          <span className="text-xs text-muted-foreground shrink-0 ml-2">
            {formatCurrency(recibido)} / {formatCurrency(estimado)}
          </span>
        )}
      </div>
      <div className="relative h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-green-300 transition-all duration-500"
          style={{ width: `${Math.min(pctPedido, 100)}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 bg-green-600 transition-all duration-500"
          style={{ width: `${Math.min(pctRecibido, 100)}%` }}
        />
      </div>
    </div>
  );
}
