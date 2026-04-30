import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Package, ChevronDown, ChevronRight, ShoppingCart, ArrowDown, ArrowUp } from "lucide-react";

interface ProviderQuote {
  quote_item_id: string;
  provider_id: string;
  provider_name: string;
  unit_price: number;
  delivery_days: number | null;
  observations: string | null;
  total: number;
  awarded: boolean;
}

interface ProductComparisonProps {
  rfqItem: {
    id: string;
    description: string;
    quantity: number;
    unit: string;
  };
  providerQuotes: ProviderQuote[];
  onAward: (quoteItemId: string) => void;
  disabled?: boolean;
}

export function ProductComparison({ rfqItem, providerQuotes, onAward, disabled }: ProductComparisonProps) {
  const [open, setOpen] = useState(false);
  const sorted = [...providerQuotes].sort((a, b) => a.unit_price - b.unit_price);
  const bestPrice = sorted[0]?.unit_price ?? 0;
  const awardedCount = sorted.filter((q) => q.awarded).length;

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 bg-primary/5 hover:bg-primary/10 transition-colors text-left"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <Package className="h-4 w-4 text-primary shrink-0" />
        <span className="font-medium text-sm flex-1">{rfqItem.description}</span>
        <span className="text-xs text-muted-foreground">
          {rfqItem.quantity} {rfqItem.unit}
        </span>
        <Badge variant="outline" className="text-xs">
          {sorted.length} cotización{sorted.length !== 1 ? "es" : ""}
        </Badge>
        {awardedCount > 0 && (
          <Badge className="bg-green-600 text-white text-xs">
            Adjudicado
          </Badge>
        )}
      </button>

      {open && (
        <div className="overflow-x-auto">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sin cotizaciones para este producto</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-2 font-medium">Proveedor</th>
                  <th className="text-right px-4 py-2 font-medium">Precio</th>
                  <th className="text-center px-4 py-2 font-medium">vs Mejor</th>
                  <th className="text-right px-4 py-2 font-medium">Entrega</th>
                  <th className="text-left px-4 py-2 font-medium">Observaciones</th>
                  <th className="text-center px-4 py-2 font-medium w-24">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((q, i) => {
                  const diff = bestPrice > 0 ? ((q.unit_price - bestPrice) / bestPrice) * 100 : 0;
                  const isBest = i === 0;
                  return (
                    <tr
                      key={q.quote_item_id}
                      className={`border-b last:border-b-0 ${isBest ? "bg-green-50 dark:bg-green-950/20" : ""} ${q.awarded ? "bg-primary/5" : ""}`}
                    >
                      <td className="px-4 py-2.5 font-medium">
                        <div className="flex items-center gap-2">
                          {isBest && <Badge className="text-[10px] py-0 bg-green-600">Mejor</Badge>}
                          {q.provider_name}
                        </div>
                      </td>
                      <td className="text-right px-4 py-2.5 font-mono font-semibold">
                        ${q.unit_price.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="text-center px-4 py-2.5">
                        {isBest ? (
                          <span className="inline-flex items-center gap-1 text-green-600 font-medium text-xs">
                            <ArrowDown className="h-3 w-3" /> Mejor
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-500 font-medium text-xs">
                            <ArrowUp className="h-3 w-3" /> +{diff.toFixed(1)}%
                          </span>
                        )}
                      </td>
                      <td className="text-right px-4 py-2.5">
                        {q.delivery_days != null ? `${q.delivery_days} días` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground max-w-[200px] truncate">
                        {q.observations || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {q.awarded ? (
                          <Badge className="bg-green-600 text-white text-xs">Adjudicado</Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={(e) => { e.stopPropagation(); onAward(q.quote_item_id); }}
                            disabled={disabled}
                          >
                            <ShoppingCart className="h-3 w-3 mr-1" />
                            Adjudicar
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
