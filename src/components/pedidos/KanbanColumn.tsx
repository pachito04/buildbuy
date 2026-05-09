import { useDroppable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { KanbanCard } from "./KanbanCard";
import type { RequestStatus, RequestWithItems } from "@/lib/kanban-types";

interface KanbanColumnProps {
  status: RequestStatus;
  title: string;
  headerColor: string;
  cards: RequestWithItems[];
  onCardClick: (requestId: string) => void;
}

export function KanbanColumn({ status, title, headerColor, cards, onCardClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex flex-col flex-1 min-w-[250px]">
      <div className={`flex items-center gap-2 pb-3 mb-3 border-b-2 ${headerColor}`}>
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="secondary" className="text-xs">{cards.length}</Badge>
      </div>
      <div
        ref={setNodeRef}
        className={`flex flex-col gap-2 flex-1 min-h-[200px] p-2 rounded-lg transition-colors ${
          isOver ? 'bg-accent/50' : 'bg-muted/30'
        }`}
      >
        {cards.length === 0 ? (
          <div className="flex items-center justify-center flex-1 border-2 border-dashed border-muted-foreground/20 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Sin requerimientos</p>
          </div>
        ) : (
          cards.map(card => (
            <KanbanCard
              key={card.id}
              request={card}
              onClick={() => onCardClick(card.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
