import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MOVIMIENTO_TIPO_LABELS, type MovimientoTipo } from "@/lib/movimiento-utils";
import { ArrowRight, Clock, PackageOpen } from "lucide-react";

interface MovimientosProductoProps {
  requestItemId: string;
}

interface MovimientoRow {
  id: string;
  tipo: string;
  origen: string | null;
  destino: string | null;
  cantidad: number | null;
  created_at: string;
  created_by: string | null;
  profiles: { full_name: string | null } | null;
}

const TIPO_COLOR: Record<MovimientoTipo, string> = {
  destino_asignado: "bg-amber-100 text-amber-800 border-amber-200",
  oc_emitida: "bg-blue-100 text-blue-800 border-blue-200",
  recepcion: "bg-green-100 text-green-800 border-green-200",
};

export function MovimientosProducto({ requestItemId }: MovimientosProductoProps) {
  const { data: movimientos, isLoading } = useQuery({
    queryKey: ["movimientos-producto", requestItemId],
    enabled: !!requestItemId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movimiento_producto")
        .select("id, tipo, origen, destino, cantidad, created_at, created_by, profiles:created_by(full_name)")
        .eq("request_item_id", requestItemId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MovimientoRow[];
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2 py-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (!movimientos || movimientos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
        <PackageOpen className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-sm">Sin movimientos registrados para este ítem.</p>
        <p className="text-xs mt-1 opacity-70">
          Los movimientos aparecen al confirmar destinos, emitir OC o registrar recepciones.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical connector line */}
      <div className="absolute left-4 top-5 bottom-5 w-px bg-border" />

      <div className="space-y-3 pl-10">
        {movimientos.map((mov) => {
          const tipoLabel =
            MOVIMIENTO_TIPO_LABELS[mov.tipo as MovimientoTipo] ?? mov.tipo;
          const colorClass =
            TIPO_COLOR[mov.tipo as MovimientoTipo] ??
            "bg-gray-100 text-gray-700 border-gray-200";
          const userName =
            (mov.profiles as any)?.full_name ?? "Usuario desconocido";

          return (
            <div key={mov.id} className="relative">
              {/* Timeline dot */}
              <div className="absolute -left-[1.875rem] top-3 h-3 w-3 rounded-full border-2 border-background bg-border" />

              <div className="border rounded-lg p-3 bg-card hover:border-primary/30 transition-colors">
                {/* Header: tipo badge + datetime */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium ${colorClass}`}
                  >
                    {tipoLabel}
                  </span>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                    <Clock className="h-3 w-3" />
                    {new Date(mov.created_at).toLocaleString("es-AR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>

                {/* Origen → Destino */}
                <div className="flex items-center gap-1.5 text-sm min-w-0">
                  {mov.origen && (
                    <>
                      <span className="text-muted-foreground truncate max-w-[140px]">
                        {mov.origen}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </>
                  )}
                  <span className="font-medium truncate max-w-[160px]">
                    {mov.destino ?? "—"}
                  </span>
                  {mov.cantidad != null && (
                    <span className="ml-auto text-xs font-mono text-muted-foreground shrink-0">
                      {Number(mov.cantidad).toLocaleString("es-AR")}&nbsp;u.
                    </span>
                  )}
                </div>

                {/* User */}
                <p className="text-[11px] text-muted-foreground mt-1">
                  {userName}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
