import { useDraggable } from "@dnd-kit/core";
import { User, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ItemsProgressBar } from "./ItemsProgressBar";
import { isUrgente } from "@/hooks/useUrgencyThreshold";
import type { RequestWithItems, ItemSubState } from "@/lib/kanban-types";
import { getArchitectLabel, ARCHITECT_BADGE_VARIANTS } from "@/lib/kanban-types";

function shortName(full: string | null | undefined): string | null {
  if (!full) return null;
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}

interface KanbanCardProps {
  request: RequestWithItems;
  onClick: () => void;
  isDragOverlay?: boolean;
  thresholdDays: number;
  role?: string | null;
}

function getDiasRestantes(dateStr: string | null, status: string): {
  text: string;
  className: string;
} {
  if (!dateStr) return { text: 'Sin fecha', className: 'text-muted-foreground' };

  if (status === 'recibido') {
    const d = new Date(dateStr);
    const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
    const datePart = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    const timePart = hasTime ? ` ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : '';
    return {
      text: `Entrega: ${datePart}${timePart}`,
      className: 'text-muted-foreground',
    };
  }

  const now = new Date();
  const target = new Date(dateStr);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const targetDay = new Date(target);
  targetDay.setHours(0, 0, 0, 0);
  const diffMs = targetDay.getTime() - today.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  const hasTime = target.getHours() !== 0 || target.getMinutes() !== 0;
  const timeSuffix = hasTime ? ` (${target.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })})` : '';

  if (days < 0) {
    return { text: `Atrasado ${Math.abs(days)}d`, className: 'text-red-600 font-medium' };
  }
  if (days <= 3) {
    return { text: `${days}d restantes${timeSuffix}`, className: 'text-red-600 font-medium' };
  }
  return { text: `${days}d restantes`, className: 'text-muted-foreground' };
}

function formatRequestNumber(num: number): string {
  return `REQ-${num.toString().padStart(4, '0')}`;
}

export function KanbanCard({ request, onClick, isDragOverlay = false, thresholdDays, role }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: request.id,
    disabled: isDragOverlay,
  });

  const itemCount = request.request_items?.length ?? 0;
  const obraName = request.projects?.name ?? 'Sin obra';
  const isRechazado = request.status === 'rechazado';
  const archName = shortName(request.architects?.full_name);

  return (
    <Card
      ref={!isDragOverlay ? setNodeRef : undefined}
      {...(!isDragOverlay ? { ...attributes, ...listeners } : {})}
      onClick={!isDragging ? onClick : undefined}
      className={`cursor-pointer rounded-2xl border-border/70 shadow-soft transition-shadow hover:shadow-card ${
        isDragOverlay ? 'opacity-80 rotate-3 shadow-xl' : ''
      } ${isDragging ? 'opacity-40' : ''} ${isRechazado ? 'opacity-75' : ''}`}
    >
      <CardContent className="p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className={`font-mono text-[11px] tracking-wide text-muted-foreground ${isRechazado ? 'line-through' : ''}`}>
            {formatRequestNumber(request.request_number)}
          </span>
          {isUrgente(request.desired_date, thresholdDays) && (
            <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-xs">
              Urgente
            </Badge>
          )}
        </div>
        {role === 'arquitecto' && (() => {
          const archLabel = getArchitectLabel(request.status, request.request_items ?? []);
          const badgeStyle = ARCHITECT_BADGE_VARIANTS[archLabel];
          return (
            <Badge variant={badgeStyle.variant} className={`text-xs ${badgeStyle.className ?? ''}`}>
              {archLabel}
            </Badge>
          );
        })()}
        <p className="text-sm font-medium truncate">{obraName}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {archName && (
            <>
              <span className="flex items-center gap-1 min-w-0">
                <User className="h-3 w-3 shrink-0" />
                <span className="truncate">{archName}</span>
              </span>
              <span>·</span>
            </>
          )}
          <span className="shrink-0">{itemCount} {itemCount === 1 ? 'ítem' : 'ítems'}</span>
          {(() => {
            const dias = getDiasRestantes(request.desired_date, request.status);
            return (
              <span className={`ml-auto flex shrink-0 items-center gap-1 ${dias.className}`}>
                <Clock className="h-3 w-3" />
                {dias.text}
              </span>
            );
          })()}
        </div>
        {itemCount > 0 && request.status === 'en_curso' && (
          <ItemsProgressBar
            items={request.request_items.map(i => ({ status: i.status as ItemSubState }))}
            variant="mini"
          />
        )}
        {isRechazado && request.motivo_rechazo && (
          <div className="inline-block max-w-full truncate rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
            {request.motivo_rechazo}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
