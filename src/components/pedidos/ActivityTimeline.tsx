import { Info, type LucideIcon } from "lucide-react";
import type { TimelineEvent } from "@/lib/kanban-types";
import { formatPoolJoinedLabel } from "@/lib/pool-joined-utils";

const EVENT_LABELS: Record<string, string> = {
  creado: "Requerimiento creado",
  pendiente: "Movido a Pendiente",
  en_curso: "En curso",
  recibido: "Recibido",
  rechazado: "Rechazado",
  item_actualizado: "Item actualizado",
  procesado: "Requerimiento procesado",
  nota: "Nota",
  consolidado: "Consolidado",
  pool_joined: "Incorporado a pool de compras",
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface ActivityTimelineProps {
  events: TimelineEvent[];
}

export function ActivityTimeline({ events }: ActivityTimelineProps) {
  if (events.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-6 text-muted-foreground"
        style={{ border: "1px dashed #E0DDD8", borderRadius: 10 }}
      >
        <span className="text-2xl mb-2">📋</span>
        <p className="text-sm">Sin actividad registrada</p>
      </div>
    );
  }

  return (
    <div className="max-h-[300px] overflow-y-auto">
      <div className="relative space-y-4 pl-6">
        <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />
        {events.map((event) => {
          const label =
            EVENT_LABELS[event.tipo] ?? event.tipo;
          const nota =
            event.tipo === "rechazado" && event.metadata?.nota
              ? String(event.metadata.nota)
              : null;

          // pool_joined: derive display text from metadata
          const poolJoinedText =
            event.tipo === "pool_joined" && event.metadata
              ? formatPoolJoinedLabel(
                  Number(event.metadata.pool_number),
                  Array.isArray(event.metadata.companies)
                    ? (event.metadata.companies as string[])
                    : []
                )
              : null;

          return (
            <div key={event.id} className="relative flex gap-3">
              <div
                className="absolute -left-6 mt-1 flex h-5 w-5 items-center justify-center rounded-full"
                style={{ backgroundColor: "#C96A00" }}
              >
                <div className="h-2 w-2 rounded-full bg-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">
                  {formatTimestamp(event.created_at)} · {event.actor_name}
                </p>
                {poolJoinedText && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {poolJoinedText}
                  </p>
                )}
                {!poolJoinedText && event.descripcion && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {event.descripcion}
                  </p>
                )}
                {nota && (
                  <blockquote className="mt-1 border-l-2 border-muted-foreground/30 pl-2 text-xs text-muted-foreground italic">
                    {nota}
                  </blockquote>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
