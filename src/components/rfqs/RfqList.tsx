import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Eye, Send, Users, Clock, TrendingDown } from "lucide-react";

const rfqStatusLabels: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviado",
  responded: "Respondido",
  closed: "Cerrado",
};

function compactARS(n: number): string {
  if (Math.abs(n) >= 1e6) return `AR$ ${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `AR$ ${(n / 1e3).toFixed(0)}K`;
  return `AR$ ${Math.round(n)}`;
}

function venceInfo(deadline: string | null): { text: string; urgent: boolean } | null {
  if (!deadline) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(deadline); target.setHours(0, 0, 0, 0);
  const days = Math.ceil((target.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { text: "vencida", urgent: true };
  if (days === 0) return { text: "hoy", urgent: true };
  if (days === 1) return { text: "mañana", urgent: true };
  return { text: `en ${days} días`, urgent: false };
}

interface RfqListProps {
  rfqs: any[];
  isLoading: boolean;
  emptyMessage: string;
  emptySubMessage: string;
  onDetail: (id: string) => void;
  onSend?: (id: string) => void;
}

export function RfqList({ rfqs, isLoading, emptyMessage, emptySubMessage, onDetail, onSend }: RfqListProps) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!rfqs.length) {
    return (
      <Card>
        <CardContent className="text-center py-12 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">{emptyMessage}</p>
          <p className="text-xs mt-1">{emptySubMessage}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {rfqs.map((rfq) => {
        const code = rfq.rfq_number
          ? `RFQ-${String(rfq.rfq_number).padStart(4, "0")}`
          : `SC-${rfq.id.slice(0, 6)}`;
        const title =
          rfq.requests?.projects?.name ??
          rfq.purchase_pools?.name ??
          (rfq.requests?.request_number ? `Pedido #${rfq.requests.request_number}` : `SC #${rfq.rfq_number ?? rfq.id.slice(0, 8)}`);
        const nItems = (rfq.rfq_items as any[])?.length || 0;
        const nProv = (rfq.rfq_providers as any[])?.length || 0;
        const statusLabel = rfqStatusLabels[rfq.status] || rfq.status;

        // Mejor oferta + ahorro vs mediana (dato real desde quotes)
        const quotes = ((rfq.quotes as any[]) ?? []).filter((q) => Number(q.total_price) > 0);
        const totals = quotes.map((q) => Number(q.total_price)).sort((a, b) => a - b);
        let mejorProvider: string | null = null;
        let mejorAmount: number | null = null;
        let ahorro: number | null = null;
        if (quotes.length) {
          const best = quotes.reduce((m, q) => (Number(q.total_price) < Number(m.total_price) ? q : m));
          mejorProvider = best.providers?.name ?? "Proveedor";
          mejorAmount = Number(best.total_price);
          if (totals.length >= 2) {
            const mid = Math.floor(totals.length / 2);
            const median = totals.length % 2 ? totals[mid] : (totals[mid - 1] + totals[mid]) / 2;
            if (median > 0) ahorro = Math.round(((median - totals[0]) / median) * 100);
          }
        }
        const ahorroColor =
          ahorro == null ? "" : ahorro >= 15 ? "text-success" : ahorro >= 10 ? "text-primary" : "text-warning";

        const vence = venceInfo(rfq.deadline);

        return (
          <Card
            key={rfq.id}
            className="cursor-pointer rounded-2xl border-border/70 shadow-soft transition-shadow hover:shadow-card"
            onClick={() => onDetail(rfq.id)}
          >
            <CardContent className="grid items-center gap-5 p-5 md:grid-cols-[1.6fr_1fr_1.5fr_0.8fr_auto]">
              {/* Identidad */}
              <div className="min-w-0">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">{code}</span>
                  <span className="rounded-full border border-border bg-background px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {statusLabel}
                  </span>
                </div>
                <div className="truncate text-base font-medium">{title}</div>
              </div>

              {/* Conteos */}
              <div className="text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 shrink-0" /> {nProv} prov.
                </div>
                <div className="mt-1">{nItems} ítems</div>
              </div>

              {/* Mejor oferta */}
              <div className="min-w-0">
                <div className="eyebrow mb-1">Mejor oferta</div>
                {mejorAmount != null ? (
                  <div className="truncate text-sm font-medium">
                    {mejorProvider} · {compactARS(mejorAmount)}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Sin cotizaciones</div>
                )}
              </div>

              {/* Ahorro */}
              <div className={`flex items-center gap-1.5 ${ahorroColor}`}>
                {ahorro != null ? (
                  <>
                    <TrendingDown className="h-4 w-4 shrink-0" />
                    <span className="font-display text-2xl font-semibold">{ahorro}%</span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </div>

              {/* Vence + acciones */}
              <div className="flex flex-col items-end gap-2">
                {vence && (
                  <span className={`flex items-center gap-1.5 text-xs ${vence.urgent ? "text-destructive" : "text-muted-foreground"}`}>
                    <Clock className="h-3.5 w-3.5 shrink-0" /> {vence.text}
                  </span>
                )}
                <div className="flex gap-2">
                  {rfq.status === "draft" && onSend && (
                    <Button size="sm" onClick={(e) => { e.stopPropagation(); onSend(rfq.id); }}>
                      <Send className="h-3 w-3 mr-1" />Enviar
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onDetail(rfq.id); }}>
                    <Eye className="h-3 w-3 mr-1" />Ver
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
