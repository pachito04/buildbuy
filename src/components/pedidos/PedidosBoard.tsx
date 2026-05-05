import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, ChevronRight } from "lucide-react";

interface StatusConfig {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  className?: string;
}

interface PedidosBoardProps {
  requests: any[];
  statusLabels: Record<string, StatusConfig>;
  statusFilterOptions: string[];
  statusFilterLabels: Record<string, string>;
  onCardClick: (r: any) => void;
  canProcess: boolean;
}

export function PedidosBoard({
  requests,
  statusLabels,
}: PedidosBoardProps) {
  const navigate = useNavigate();

  if (!requests.length) {
    return (
      <Card>
        <CardContent className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No hay requerimientos con esos filtros.</p>
        </CardContent>
      </Card>
    );
  }

  const grouped: Record<string, { name: string; requests: any[] }> = {};
  requests.forEach((r) => {
    const obraId = r.project_id || "sin-obra";
    const obraName = r.projects?.name || "Sin obra asignada";
    if (!grouped[obraId]) {
      grouped[obraId] = { name: obraName, requests: [] };
    }
    grouped[obraId].requests.push(r);
  });

  const sortedObras = Object.entries(grouped).sort(([, a], [, b]) => {
    if (a.name === "Sin obra asignada") return 1;
    if (b.name === "Sin obra asignada") return -1;
    return a.name.localeCompare(b.name);
  });

  const getStatusSummary = (reqs: any[]) => {
    const counts: Record<string, number> = {};
    reqs.forEach((r) => {
      const sl = statusLabels[r.status];
      const label = sl?.label || r.status;
      counts[label] = (counts[label] || 0) + 1;
    });
    return counts;
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sortedObras.map(([obraId, obra]) => {
        const summary = getStatusSummary(obra.requests);

        return (
          <Card
            key={obraId}
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => navigate(`/pedidos/obra/${obraId}`)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-display">{obra.name}</CardTitle>
                  <Badge variant="outline" className="text-xs">
                    {obra.requests.length}
                  </Badge>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent className="pb-3">
              <div className="flex gap-1.5 flex-wrap">
                {Object.entries(summary).map(([label, count]) => (
                  <Badge key={label} variant="outline" className="text-[10px]">
                    {label}: {count}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
