import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewRole } from "@/hooks/useViewRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ClipboardList,
  PackageCheck,
  Truck,
  Clock,
  ChevronDown,
  ChevronUp,
  Warehouse,
} from "lucide-react";
import { DespachoDialog } from "@/components/deposito/DespachoDialog";

type TabKey = "borrador" | "confirmado" | "en_transito";

const tabs: { key: TabKey; label: string; icon: typeof Clock }[] = [
  { key: "borrador", label: "Pendientes", icon: Clock },
  { key: "confirmado", label: "En preparación", icon: PackageCheck },
  { key: "en_transito", label: "Despachados", icon: Truck },
];

const statusBadge: Record<string, { label: string; className: string }> = {
  borrador: { label: "Pendiente", className: "bg-amber-100 text-amber-800 border-amber-300" },
  confirmado: { label: "En preparación", className: "bg-blue-100 text-blue-800 border-blue-300" },
  en_transito: { label: "Despachado", className: "bg-green-100 text-green-800 border-green-300" },
};

export default function SolicitudesDeposito() {
  const { user } = useAuth();
  const { companyId } = useViewRole();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>("borrador");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [despachoRemitoId, setDespachoRemitoId] = useState<string | null>(null);

  const { data: remitos, isLoading } = useQuery({
    queryKey: ["deposito-solicitudes", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remitos")
        .select(
          "*, requests:request_id(request_number, project_id, projects:project_id(name))"
        )
        .eq("company_id", companyId!)
        .in("status", ["borrador", "confirmado", "en_transito"])
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: remitoItemsMap } = useQuery({
    queryKey: ["deposito-solicitudes-items", remitos?.map((r: any) => r.id).join(",")],
    enabled: !!remitos?.length,
    queryFn: async () => {
      const ids = remitos!.map((r: any) => r.id);
      const { data, error } = await supabase
        .from("remito_items")
        .select("*, materials:material_id(name, unit)")
        .in("remito_id", ids);
      if (error) throw error;

      const map: Record<string, any[]> = {};
      for (const item of data ?? []) {
        if (!map[item.remito_id]) map[item.remito_id] = [];
        map[item.remito_id].push(item);
      }
      return map;
    },
  });

  const iniciarPreparacion = useMutation({
    mutationFn: async (remitoId: string) => {
      const { error } = await supabase
        .from("remitos")
        .update({ status: "confirmado" as any })
        .eq("id", remitoId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deposito-solicitudes"] });
      qc.invalidateQueries({ queryKey: ["remitos"] });
      toast.success("Remito en preparación");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = { borrador: 0, confirmado: 0, en_transito: 0 };
    for (const r of remitos ?? []) {
      const s = (r as any).status as TabKey;
      if (s in counts) counts[s]++;
    }
    return counts;
  }, [remitos]);

  const filtered = useMemo(
    () => (remitos ?? []).filter((r: any) => r.status === activeTab),
    [remitos, activeTab]
  );

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold">Solicitudes de Despacho</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Materiales pendientes de preparación y despacho a obra
        </p>
      </div>

      {/* Tabs — horizontal scroll on mobile */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              className={`px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap min-h-[44px] ${
                activeTab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTab(t.key)}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              {tabCounts[t.key] > 0 && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {tabCounts[t.key]}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : !filtered.length ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <Warehouse className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">
              {activeTab === "borrador"
                ? "No hay solicitudes pendientes."
                : activeTab === "confirmado"
                ? "No hay remitos en preparación."
                : "No hay despachos en tránsito."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((remito: any) => {
            const items = remitoItemsMap?.[remito.id] ?? [];
            const request = remito.requests;
            const projectName = request?.projects?.name;
            const isExpanded = expandedId === remito.id;

            return (
              <Card key={remito.id} className="overflow-hidden">
                <CardHeader
                  className="pb-2 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : remito.id)}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ClipboardList className="h-4 w-4 text-primary shrink-0" />
                      <CardTitle className="text-sm font-display">
                        {request?.request_number
                          ? `Pedido #${request.request_number}`
                          : `Remito ${remito.id.slice(0, 8)}`}
                      </CardTitle>
                      <Badge
                        variant="outline"
                        className={statusBadge[remito.status]?.className}
                      >
                        {statusBadge[remito.status]?.label ?? remito.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {new Date(remito.updated_at).toLocaleDateString("es-AR")}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                    {projectName && <span>Obra: {projectName}</span>}
                    <span>Destino: {remito.destination || "—"}</span>
                    <span>{items.length} ítem(s)</span>
                    {remito.transportista_id && <span>Transportista asignado</span>}
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0 space-y-3">
                    {remito.observations && (
                      <p className="text-xs text-muted-foreground italic">
                        {remito.observations}
                      </p>
                    )}

                    {/* Items table — responsive */}
                    <div className="border rounded-lg overflow-x-auto">
                      <table className="w-full text-sm min-w-[400px]">
                        <thead className="bg-muted">
                          <tr>
                            <th className="text-left px-3 py-2">Material</th>
                            <th className="text-right px-3 py-2">Solicitado</th>
                            {remito.status === "en_transito" && (
                              <th className="text-right px-3 py-2">Despachado</th>
                            )}
                            {remito.status === "en_transito" && (
                              <th className="text-right px-3 py-2">Pendiente</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item: any) => {
                            const saldo = item.quantity - item.quantity_delivered;
                            return (
                              <tr key={item.id} className="border-t">
                                <td className="px-3 py-2">
                                  {item.materials?.name || "Material sin nombre"}
                                </td>
                                <td className="text-right px-3 py-2 font-mono">
                                  {item.quantity} {item.materials?.unit || ""}
                                </td>
                                {remito.status === "en_transito" && (
                                  <td className="text-right px-3 py-2 font-mono">
                                    {item.quantity_delivered} {item.materials?.unit || ""}
                                  </td>
                                )}
                                {remito.status === "en_transito" && (
                                  <td className="text-right px-3 py-2 font-mono">
                                    {saldo > 0 ? (
                                      <span className="text-amber-700 font-medium">
                                        {saldo} {item.materials?.unit || ""}
                                      </span>
                                    ) : (
                                      <span className="text-green-700">Completo</span>
                                    )}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row gap-2">
                      {remito.status === "borrador" && (
                        <Button
                          size="sm"
                          className="min-h-[44px] w-full sm:w-auto"
                          onClick={(e) => {
                            e.stopPropagation();
                            iniciarPreparacion.mutate(remito.id);
                          }}
                          disabled={iniciarPreparacion.isPending}
                        >
                          <PackageCheck className="h-4 w-4 mr-2" />
                          {iniciarPreparacion.isPending
                            ? "Actualizando..."
                            : "Iniciar preparación"}
                        </Button>
                      )}
                      {remito.status === "confirmado" && (
                        <Button
                          size="sm"
                          className="min-h-[44px] w-full sm:w-auto"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDespachoRemitoId(remito.id);
                          }}
                        >
                          <Truck className="h-4 w-4 mr-2" />
                          Confirmar despacho
                        </Button>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <DespachoDialog
        remitoId={despachoRemitoId}
        onClose={() => setDespachoRemitoId(null)}
      />
    </div>
  );
}
