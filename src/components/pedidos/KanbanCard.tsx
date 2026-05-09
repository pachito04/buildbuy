import { useDraggable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ItemsProgressBar } from "./ItemsProgressBar";
import type { RequestWithItems, ItemSubState } from "@/lib/kanban-types";

interface KanbanCardProps {
  request: RequestWithItems;
  onClick: () => void;
  isDragOverlay?: boolean;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Sin fecha';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatRequestNumber(num: number): string {
  return `REQ-${num.toString().padStart(4, '0')}`;
}

export function KanbanCard({ request, onClick, isDragOverlay = false }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: request.id,
    disabled: isDragOverlay,
  });

  const itemCount = request.request_items?.length ?? 0;
  const obraName = request.projects?.name ?? 'Sin obra';

  return (
    <Card
      ref={!isDragOverlay ? setNodeRef : undefined}
      {...(!isDragOverlay ? { ...attributes, ...listeners } : {})}
      onClick={!isDragging ? onClick : undefined}
      className={`cursor-pointer transition-shadow hover:shadow-md ${
        isDragOverlay ? 'opacity-80 rotate-3 shadow-xl' : ''
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{formatRequestNumber(request.request_number)}</span>
          {request.urgente && (
            <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-xs">
              Urgente
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{obraName}</p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{itemCount} {itemCount === 1 ? 'ítem' : 'ítems'}</span>
          <span>{formatDate(request.desired_date)}</span>
        </div>
        {itemCount > 0 && (
          <ItemsProgressBar
            items={request.request_items.map(i => ({ status: i.status as ItemSubState }))}
            variant="mini"
          />
        )}
      </CardContent>
    </Card>
  );
}
