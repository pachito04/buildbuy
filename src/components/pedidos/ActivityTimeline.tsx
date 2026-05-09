import {
  FileText,
  Clock,
  Layers,
  CheckCircle,
  XCircle,
  Package,
  MessageSquare,
  Info,
  type LucideIcon,
} from "lucide-react";
import type { TimelineEvent } from "@/lib/kanban-types";

const EVENT_CONFIG: Record<string, { icon: LucideIcon; color: string; label: string }> = {
  creado:            { icon: FileText,      color: 'text-gray-500',  label: 'Requerimiento creado' },
  pendiente:         { icon: Clock,         color: 'text-gray-500',  label: 'Movido a Pendiente' },
  en_curso:          { icon: Layers,        color: 'text-amber-500', label: 'En curso' },
  recibido:          { icon: CheckCircle,   color: 'text-green-500', label: 'Recibido' },
  rechazado:         { icon: XCircle,       color: 'text-red-500',   label: 'Rechazado' },
  item_actualizado:  { icon: Package,       color: 'text-blue-500',  label: 'Item actualizado' },
  nota:              { icon: MessageSquare,  color: 'text-gray-500',  label: 'Nota' },
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

interface ActivityTimelineProps {
  events: TimelineEvent[];
}

export function ActivityTimeline({ events }: ActivityTimelineProps) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">Sin actividad registrada</p>;
  }

  return (
    <div className="max-h-[300px] overflow-y-auto">
      <div className="relative space-y-4 pl-6">
        <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
        {events.map(event => {
          const config = EVENT_CONFIG[event.tipo] ?? { icon: Info, color: 'text-gray-400', label: event.tipo };
          const Icon = config.icon;
          const nota = event.tipo === 'rechazado' && event.metadata?.nota
            ? String(event.metadata.nota)
            : null;

          return (
            <div key={event.id} className="relative flex gap-3">
              <div className={`absolute -left-6 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-background border ${config.color}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{config.label}</p>
                <p className="text-xs text-muted-foreground">
                  {formatTimestamp(event.created_at)} · {event.actor_name}
                </p>
                {event.descripcion && (
                  <p className="text-xs text-muted-foreground mt-0.5">{event.descripcion}</p>
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
