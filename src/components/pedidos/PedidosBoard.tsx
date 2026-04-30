import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, ChevronDown, ChevronUp } from "lucide-react";

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
  statusFilterOptions,
  statusFilterLabels,
  onCardClick,
  canProcess,
}: PedidosBoardProps) {
  const [expandedObra, setExpandedObra] = useState<string | null>(null);
  const [obraStatusFilter, setObraStatusFilter] = useState<Record<string, string>>({});

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

  const toggleObra = (obraId: string) => {
    setExpandedObra((prev) => (prev === obraId ? null : obraId));
  };

  const filterLabelsForBoard = statusFilterOptions.filter((s) => s !== "all");

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sortedObras.map(([obraId, obra]) => {
        const isExpanded = expandedObra === obraId;
        const summary = getStatusSummary(obra.requests);
        const localFilter = obraStatusFilter[obraId] || "all";
        const filteredReqs =
          localFilter === "all"
            ? obra.requests
            : obra.requests.filter((r: any) => {
                if (canProcess && localFilter === "pendiente") {
                  return ["pending_approval", "approved"].includes(r.status);
                }
                if (canProcess && localFilter === "procesado_total") {
                  return ["inventario", "rfq_direct", "in_pool"].includes(r.status);
                }
                if (canProcess && localFilter === "procesado_parcial") {
                  return r.status === "procesado_parcial";
                }
                return r.status === localFilter;
              });

        return (
          <Card
            key={obraId}
            className={`transition-all duration-200 ${
              isExpanded ? "sm:col-span-2 lg:col-span-3" : "cursor-pointer hover:border-primary/50"
            }`}
            onClick={() => !isExpanded && toggleObra(obraId)}
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
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleObra(obraId);
                  }}
                >
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {!isExpanded && (
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {Object.entries(summary).map(([label, count]) => (
                    <Badge key={label} variant="outline" className="text-[10px]">
                      {label}: {count}
                    </Badge>
                  ))}
                </div>
              )}
            </CardHeader>

            {isExpanded && (
              <CardContent className="space-y-3">
                <div className="flex gap-1.5 flex-wrap">
                  <Button
                    size="sm"
                    variant={localFilter === "all" ? "default" : "outline"}
                    className="h-6 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      setObraStatusFilter((prev) => ({ ...prev, [obraId]: "all" }));
                    }}
                  >
                    Todos ({obra.requests.length})
                  </Button>
                  {filterLabelsForBoard.map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={localFilter === s ? "default" : "outline"}
                      className="h-6 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setObraStatusFilter((prev) => ({ ...prev, [obraId]: s }));
                      }}
                    >
                      {statusFilterLabels[s] ?? s}
                    </Button>
                  ))}
                </div>

                <div className="space-y-2">
                  {filteredReqs.map((r: any) => {
                    const sl = statusLabels[r.status] ?? {
                      label: r.status,
                      variant: "secondary" as const,
                    };
                    return (
                      <div
                        key={r.id}
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCardClick(r);
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-mono text-sm font-medium shrink-0">
                            #{r.request_number}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm truncate">
                              {r.raw_message || "Sin observaciones"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(r.created_at).toLocaleDateString("es-AR")}
                              {r.architects?.full_name && ` · ${r.architects.full_name}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={sl.variant} className={`text-xs ${sl.className || ""}`}>
                            {sl.label}
                          </Badge>
                          {r.urgency === "urgente" && (
                            <Badge className="bg-[#FF2800] text-white border-[#FF2800] text-xs">
                              Urgente
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {!filteredReqs.length && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No hay requerimientos con ese estado en esta obra.
                    </p>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
