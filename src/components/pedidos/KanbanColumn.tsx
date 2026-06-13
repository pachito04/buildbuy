import { useDroppable } from "@dnd-kit/core";
import { KanbanCard } from "./KanbanCard";
import type { RequestStatus, RequestWithItems } from "@/lib/kanban-types";

const COL_META: Record<RequestStatus, { dot: string; sub: string }> = {
  pendiente: { dot: "bg-warning",     sub: "esperando proceso" },
  en_curso:  { dot: "bg-primary",     sub: "parcialmente procesado" },
  recibido:  { dot: "bg-success",     sub: "cerrado" },
  rechazado: { dot: "bg-destructive", sub: "requiere revisión" },
};

interface KanbanColumnProps {
  status: RequestStatus;
  title: string;
  headerColor: string;
  cards: RequestWithItems[];
  onCardClick: (requestId: string) => void;
  thresholdDays: number;
  role: string | null;
}

export function KanbanColumn({ status, title, cards, onCardClick, thresholdDays, role }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = COL_META[status];

  return (
    <div className="flex flex-col flex-1 min-w-[250px]">
      <div className="flex items-center gap-2.5 pb-3 mb-1">
        <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-[11px] text-muted-foreground">{meta.sub}</div>
        </div>
        <span className="font-mono text-xs text-muted-foreground">{cards.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex flex-col gap-3 flex-1 min-h-[200px] rounded-2xl p-1.5 transition-colors ${
          isOver ? "bg-primary/5" : ""
        }`}
      >
        {cards.length === 0 ? (
          <div className="flex items-center justify-center flex-1 rounded-xl border border-dashed border-border p-4">
            <p className="text-sm text-muted-foreground">Sin requerimientos</p>
          </div>
        ) : (
          cards.map(card => (
            <KanbanCard
              key={card.id}
              request={card}
              onClick={() => onCardClick(card.id)}
              thresholdDays={thresholdDays}
              role={role}
            />
          ))
        )}
      </div>
    </div>
  );
}
