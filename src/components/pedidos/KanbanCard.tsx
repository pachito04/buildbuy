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

function getDiasRestantes(dateStr: string | null, status: string): {
  text: string;
  className: string;
} {
  if (!dateStr) return { text: 'Sin fecha', className: 'text-muted-foreground' };

  if (status === 'recibido') {
    const d = new Date(dateStr);
    return {
      text: `Entregado ${d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}`,
      className: 'text-muted-foreground',
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - today.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (days < 0) {
    return { text: `Atrasado ${Math.abs(days)}d`, className: 'text-red-600 font-medium' };
  }
  if (days <= 3) {
    return { text: `${days}d restantes`, className: 'text-red-600 font-medium' };
  }
  return { text: `${days}d restantes`, className: 'text-muted-foreground' };
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
  const isRechazado = request.status === 'rechazado';

  return (
    <Card
      ref={!isDragOverlay ? setNodeRef : undefined}
      {...(!isDragOverlay ? { ...attributes, ...listeners } : {})}
      onClick={!isDragging ? onClick : undefined}
      className={`cursor-pointer transition-shadow hover:shadow-md ${
        isDragOverlay ? 'opacity-80 rotate-3 shadow-xl' : ''
      } ${isDragging ? 'opacity-40' : ''} ${isRechazado ? 'opacity-75' : ''}`}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className={`text-sm font-semibold ${isRechazado ? 'line-through text-muted-foreground' : ''}`}>
            {formatRequestNumber(request.request_number)}
          </span>
          {request.urgente && (
            <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-xs">
              Urgente
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{obraName}</p>
        {isRechazado && request.motivo_rechazo && (
          <p className="text-xs text-red-600 truncate">{request.motivo_rechazo}</p>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{itemCount} {itemCount === 1 ? 'ítem' : 'ítems'}</span>
          {(() => {
            const dias = getDiasRestantes(request.desired_date, request.status);
            return <span className={dias.className}>{dias.text}</span>;
          })()}
        </div>
        {itemCount > 0 && request.status === 'en_curso' && (
          <ItemsProgressBar
            items={request.request_items.map(i => ({ status: i.status as ItemSubState }))}
            variant="mini"
          />
        )}
      </CardContent>
    </Card>
  );
}
