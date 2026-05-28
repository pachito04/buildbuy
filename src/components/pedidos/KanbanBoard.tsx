import { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanCard } from "./KanbanCard";
import {
  KANBAN_COLUMNS,
  ARCHITECT_COLUMN_TITLES,
  getTransitionType,
  type RequestStatus,
  type RequestWithItems,
} from "@/lib/kanban-types";
import { isUrgente } from "@/hooks/useUrgencyThreshold";

interface KanbanBoardProps {
  requests: RequestWithItems[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onCardClick: (requestId: string) => void;
  onStatusChange: (requestId: string, newStatus: RequestStatus) => void;
  onRejectRequest: (requestId: string, requestNumber: number) => void;
  thresholdDays: number;
  role: string | null;
  filters: {
    searchQuery: string;
    urgenteOnly: boolean;
  };
}

export function KanbanBoard({
  requests,
  isLoading,
  isError,
  onRetry,
  onCardClick,
  onStatusChange,
  onRejectRequest,
  thresholdDays,
  role,
  filters,
}: KanbanBoardProps) {
  const [activeRequest, setActiveRequest] = useState<RequestWithItems | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const filtered = useMemo(() => {
    let result = requests;
    if (filters.urgenteOnly) {
      result = result.filter(r => isUrgente(r.desired_date, thresholdDays));
    }
    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      result = result.filter(r =>
        `REQ-${r.request_number.toString().padStart(4, '0')}`.toLowerCase().includes(q) ||
        (r.projects?.name ?? '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [requests, filters, thresholdDays]);

  const columns = useMemo(() => {
    const grouped: Record<RequestStatus, RequestWithItems[]> = {
      pendiente: [],
      en_curso: [],
      recibido: [],
      rechazado: [],
    };
    for (const req of filtered) {
      if (grouped[req.status]) {
        grouped[req.status].push(req);
      }
    }
    return grouped;
  }, [filtered]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const req = requests.find(r => r.id === event.active.id);
    setActiveRequest(req ?? null);
  }, [requests]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveRequest(null);
    const { active, over } = event;
    if (!over) return;

    const req = requests.find(r => r.id === active.id);
    if (!req) return;

    const from = req.status;
    const to = over.id as RequestStatus;
    const transition = getTransitionType(from, to);

    switch (transition) {
      case 'NOOP':
        break;
      case 'BLOCK':
        toast.error('Los requerimientos en este estado no pueden moverse');
        break;
      case 'ALLOW':
        onStatusChange(req.id, to);
        break;
      case 'VALIDATED': {
        const allRecibido = req.request_items.every(i => i.status === 'recibido');
        if (allRecibido) {
          onStatusChange(req.id, to);
        } else {
          toast.error('No se puede mover a Procesado total: hay ítems sin recibir');
        }
        break;
      }
      case 'MODAL':
        onRejectRequest(req.id, req.request_number);
        break;
    }
  }, [requests, onStatusChange, onRejectRequest]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-4 gap-4">
        {KANBAN_COLUMNS.map(col => (
          <div key={col.status} className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <p className="text-muted-foreground">Error al cargar los requerimientos</p>
        <Button variant="outline" onClick={onRetry}>Reintentar</Button>
      </div>
    );
  }

  const totalCount = filtered.length;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-4 gap-4">
        {KANBAN_COLUMNS.map(col => (
          <KanbanColumn
            key={col.status}
            status={col.status}
            title={role === 'arquitecto' ? ARCHITECT_COLUMN_TITLES[col.status] : col.title}
            headerColor={col.headerColor}
            cards={columns[col.status]}
            onCardClick={onCardClick}
            thresholdDays={thresholdDays}
            role={role}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t mt-4">
        <span>{totalCount} requerimiento{totalCount !== 1 ? 's' : ''}</span>
        <div className="flex gap-4">
          {KANBAN_COLUMNS.map(col => (
            <span key={col.status}>
              {role === 'arquitecto' ? ARCHITECT_COLUMN_TITLES[col.status] : col.title}: {columns[col.status].length}
            </span>
          ))}
        </div>
      </div>
      <DragOverlay>
        {activeRequest && (
          <KanbanCard request={activeRequest} onClick={() => {}} isDragOverlay thresholdDays={thresholdDays} role={role} />
        )}
      </DragOverlay>
    </DndContext>
  );
}
