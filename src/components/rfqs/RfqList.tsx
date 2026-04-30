import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Eye, Send } from "lucide-react";

const rfqStatusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Borrador", variant: "secondary" },
  sent: { label: "Enviado", variant: "default" },
  responded: { label: "Respondido", variant: "outline" },
  closed: { label: "Cerrado", variant: "destructive" },
};

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
      {rfqs.map((rfq) => (
        <Card key={rfq.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onDetail(rfq.id)}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-3 flex-wrap">
              <FileText className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-display">
                {rfq.requests?.request_number
                  ? `Pedido #${rfq.requests.request_number}`
                  : rfq.purchase_pools?.name
                    ? `Pool: ${rfq.purchase_pools.name}`
                    : `SC #${rfq.id.slice(0, 8)}`}
              </CardTitle>
              <Badge variant={rfqStatusLabels[rfq.status]?.variant || "secondary"}>
                {rfqStatusLabels[rfq.status]?.label || rfq.status}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {rfq.rfq_type === "closed_bid" ? "Licitación Cerrada" : "Pedido Abierto"}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{(rfq.rfq_items as any[])?.length || 0} ítems</span>
              <span>{(rfq.rfq_providers as any[])?.length || 0} proveedores</span>
              <span>{new Date(rfq.created_at).toLocaleDateString("es-AR")}</span>
            </div>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="flex gap-4 text-xs text-muted-foreground">
              {rfq.delivery_location && <span className="truncate max-w-[200px]">📍 {rfq.delivery_location}</span>}
              {rfq.deadline && <span>📅 Entrega: {new Date(rfq.deadline).toLocaleDateString("es-AR")}</span>}
              {rfq.closing_datetime && <span>⏰ Cierre: {new Date(rfq.closing_datetime).toLocaleString("es-AR")}</span>}
            </div>
            <div className="flex gap-2 mt-2">
              {rfq.status === "draft" && onSend && (
                <Button size="sm" onClick={(e) => { e.stopPropagation(); onSend(rfq.id); }}>
                  <Send className="h-3 w-3 mr-1" />Enviar
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onDetail(rfq.id); }}>
                <Eye className="h-3 w-3 mr-1" />Ver Detalle
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
