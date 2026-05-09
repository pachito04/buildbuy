import { AlertCircle } from "lucide-react";
import { AnilloAvance } from "./AnilloAvance";
import { KPICard } from "./KPICard";
import { BarraAvanceTriple } from "./BarraAvanceTriple";
import { formatCurrency, formatPct, type ObraKPIs, type RubroAvance } from "@/lib/computo-utils";

interface DashboardResumenProps {
  kpis: ObraKPIs;
  rubros: RubroAvance[];
  sinPrecios: boolean;
}

export function DashboardResumen({ kpis, rubros, sinPrecios }: DashboardResumenProps) {
  const pctComprometido = kpis.presupuesto > 0
    ? (kpis.comprometido / kpis.presupuesto) * 100
    : 0;

  return (
    <div className="space-y-6">
      {sinPrecios && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-amber-800">
            Cómputo sin precios — las métricas financieras no están disponibles.
          </p>
        </div>
      )}

      <div className="flex items-start gap-8">
        <AnilloAvance
          pctRecibido={kpis.pctEjecutado}
          pctComprometido={pctComprometido}
          label="Avance financiero"
        />
        <div className="flex-1 grid grid-cols-2 gap-3">
          <KPICard
            title="Presupuesto cómputo"
            value={formatCurrency(kpis.presupuesto)}
          />
          <KPICard
            title="Comprometido en OC"
            value={formatCurrency(kpis.comprometido)}
          />
          <KPICard
            title="Recibido en obra"
            value={formatCurrency(kpis.recibido)}
          />
          <KPICard
            title="Desvío total"
            value={formatCurrency(kpis.desvio)}
            className={kpis.desvio > 0 ? "border-red-200" : kpis.desvio < 0 ? "border-green-200" : ""}
            subtitle={kpis.presupuesto > 0 ? formatPct((kpis.desvio / kpis.presupuesto) * 100) : "—"}
          />
        </div>
      </div>

      {rubros.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Avance por rubro</h3>
          <div className="space-y-3">
            {rubros.map((r) => (
              <BarraAvanceTriple
                key={r.rubro}
                label={`${r.rubro} (${r.itemCount} ítems)`}
                estimado={r.presupuesto}
                pedido={r.comprometido}
                recibido={r.recibido}
                showAmounts
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
