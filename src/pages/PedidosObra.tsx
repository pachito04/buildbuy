import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Building2 } from "lucide-react";

const statusLabels: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }
> = {
  pending_approval:  { label: "Pendiente",         variant: "outline" },
  approved:          { label: "Pendiente",         variant: "outline" },
  in_pool:           { label: "Procesado total",   variant: "default", className: "bg-green-600 text-white border-green-600 hover:bg-green-600" },
  rfq_direct:        { label: "Procesado total",   variant: "default", className: "bg-green-600 text-white border-green-600 hover:bg-green-600" },
  inventario:        { label: "Procesado total",   variant: "default", className: "bg-green-600 text-white border-green-600 hover:bg-green-600" },
  procesado_parcial: { label: "Procesado parcial", variant: "outline", className: "bg-amber-100 text-amber-800 border-amber-300" },
  rejected:          { label: "Rechazado",         variant: "destructive" },
};

const filterOptions = ["all", "pendiente", "procesado_parcial", "procesado_total", "rejected"];
const filterLabels: Record<string, string> = {
  all: "Todos",
  pendiente: "Pendiente",
  procesado_parcial: "Procesado parcial",
  procesado_total: "Procesado total",
  rejected: "Rechazado",
};

export default function PedidosObra() {
  const { obraId } = useParams<{ obraId: string }>();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const isSinObra = obraId === "sin-obra";

  const { data: obra } = useQuery({
    queryKey: ["project", obraId],
    enabled: !isSinObra && !!obraId,
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("id, name").eq("id", obraId!).maybeSingle();
      return data;
    },
  });

  const obraName = isSinObra ? "Sin obra asignada" : obra?.name ?? "Cargando...";

  const { data: requests, isLoading } = useQuery({
    queryKey: ["requests-obra", obraId],
    enabled: !!obraId,
    queryFn: async () => {
      let query = supabase
        .from("requests")
        .select("*, request_items(*), architects:architect_id(full_name), projects:project_id(name)")
        .neq("status", "draft" as any)
        .order("created_at", { ascending: false });

      if (isSinObra) {
        query = query.is("project_id", null);
      } else {
        query = query.eq("project_id", obraId!);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    if (!requests) return [];
    return requests.filter((r) => {
      if (filter === "all") return true;
      if (filter === "pendiente") return ["pending_approval", "approved"].includes(r.status);
      if (filter === "procesado_total") return ["inventario", "rfq_direct", "in_pool"].includes(r.status);
      if (filter === "procesado_parcial") return r.status === "procesado_parcial";
      return r.status === filter;
    });
  }, [requests, filter]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/pedidos")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <h1 className="font-display text-2xl font-bold">{obraName}</h1>
            {requests && (
              <Badge variant="outline">{requests.length} requerimiento{requests.length !== 1 ? "s" : ""}</Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm mt-1">Requerimientos de esta obra</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 flex-wrap">
        {filterOptions.map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            className="text-xs"
            onClick={() => setFilter(f)}
          >
            {filterLabels[f]}
            {f !== "all" && requests && (
              <span className="ml-1 opacity-70">
                ({requests.filter((r) => {
                  if (f === "pendiente") return ["pending_approval", "approved"].includes(r.status);
                  if (f === "procesado_total") return ["inventario", "rfq_direct", "in_pool"].includes(r.status);
                  if (f === "procesado_parcial") return r.status === "procesado_parcial";
                  return r.status === f;
                }).length})
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* Request list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : !filtered.length ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No hay requerimientos{filter !== "all" ? " con ese estado" : ""} en esta obra.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left px-4 py-3 font-medium">N° Pedido</th>
                <th className="text-left px-4 py-3 font-medium">Fecha generación</th>
                <th className="text-left px-4 py-3 font-medium">Fecha entrega</th>
                <th className="text-left px-4 py-3 font-medium">Arquitecto</th>
                <th className="text-left px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const sl = statusLabels[r.status] ?? { label: r.status, variant: "secondary" as const };
                return (
                  <tr
                    key={r.id}
                    className="border-t cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate(`/pedidos/obra/${obraId}/${r.id}`)}
                  >
                    <td className="px-4 py-3 font-mono font-medium">#{r.request_number}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("es-AR")}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.desired_date ? new Date(r.desired_date).toLocaleDateString("es-AR") : "—"}
                    </td>
                    <td className="px-4 py-3">{r.architects?.full_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={sl.variant} className={sl.className}>{sl.label}</Badge>
                      {r.urgency === "urgente" && (
                        <Badge className="ml-1 bg-[#FF2800] text-white border-[#FF2800]">Urgente</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
