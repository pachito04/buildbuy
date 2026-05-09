import { Badge } from "@/components/ui/badge";
import { BarraAvanceTriple } from "./BarraAvanceTriple";
import { formatCurrency, type ComputoAvanceItem } from "@/lib/computo-utils";

interface DashboardMaterialesProps {
  items: ComputoAvanceItem[];
}

export function DashboardMateriales({ items }: DashboardMaterialesProps) {
  const rubros = [...new Set(items.map((i) => i.rubro))];

  return (
    <div className="space-y-6">
      {rubros.map((rubro) => {
        const rubroItems = items.filter((i) => i.rubro === rubro);
        return (
          <div key={rubro}>
            <h3 className="text-sm font-semibold mb-2 border-b pb-1">{rubro}</h3>
            <div className="space-y-3">
              {rubroItems.map((item) => {
                const pendiente = item.cantidad_estimada - item.cantidad_pedida;
                const desvio = item.monto_recibido - item.subtotal_estimado;
                return (
                  <div key={item.computo_item_id} className="border rounded-md p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {item.descripcion_origen}
                        </span>
                        {item.agregado_retroactivamente && (
                          <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">
                            Agregado
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{item.unidad}</span>
                    </div>
                    <BarraAvanceTriple
                      label=""
                      estimado={item.cantidad_estimada}
                      pedido={item.cantidad_pedida}
                      recibido={item.cantidad_recibida}
                    />
                    <div className="grid grid-cols-5 gap-2 text-xs text-muted-foreground">
                      <div>
                        <span className="block text-muted-foreground/70">Estimado</span>
                        <span className="font-medium text-foreground">{item.cantidad_estimada}</span>
                      </div>
                      <div>
                        <span className="block text-muted-foreground/70">Pedido</span>
                        <span className="font-medium text-foreground">{item.cantidad_pedida}</span>
                      </div>
                      <div>
                        <span className="block text-muted-foreground/70">Recibido</span>
                        <span className="font-medium text-foreground">{item.cantidad_recibida}</span>
                      </div>
                      <div>
                        <span className="block text-muted-foreground/70">Pendiente</span>
                        <span className={`font-medium ${pendiente > 0 ? "text-amber-600" : "text-green-600"}`}>
                          {Math.max(pendiente, 0).toFixed(1)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-muted-foreground/70">Desvío</span>
                        <span className={`font-medium ${desvio > 0 ? "text-red-600" : desvio < 0 ? "text-green-600" : "text-foreground"}`}>
                          {formatCurrency(desvio)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
