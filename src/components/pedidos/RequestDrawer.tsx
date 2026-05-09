import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { RequestDrawerHeader } from "./RequestDrawerHeader";
import { ItemsProgressBar } from "./ItemsProgressBar";
import { ActivityTimeline } from "./ActivityTimeline";
import { useViewRole } from "@/hooks/useViewRole";
import { Warehouse, FileText } from "lucide-react";
import {
  ITEM_SUB_STATE_COLORS,
  type RequestDetail,
  type TimelineEvent,
  type ItemSubState,
} from "@/lib/kanban-types";

interface RequestDrawerProps {
  requestId: string | null;
  onClose: () => void;
  onReject: (requestId: string, requestNumber: number) => void;
  onSurtir: (requestId: string, requestNumber: number, projectName: string | null, createdBy: string | null) => void;
  onSolicitudDirecta: (requestId: string, requestNumber: number, projectName: string | null, desiredDate: string | null) => void;
}

export function RequestDrawer({ requestId, onClose, onReject, onSurtir, onSolicitudDirecta }: RequestDrawerProps) {
  const { viewRole: role } = useViewRole();

  const { data: request, isLoading: loadingDetail } = useQuery({
    queryKey: ['request-detail', requestId],
    enabled: !!requestId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('requests')
        .select(`
          *,
          request_items(*, materials:material_id(name, unit)),
          architects:architect_id(full_name),
          projects:project_id(id, name)
        `)
        .eq('id', requestId!)
        .single();
      if (error) throw error;
      return data as unknown as RequestDetail;
    },
  });

  const { data: events = [], isLoading: loadingEvents } = useQuery({
    queryKey: ['request-events', requestId],
    enabled: !!requestId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('requerimiento_evento')
        .select('id, tipo, descripcion, metadata, created_at, created_by')
        .eq('request_id', requestId!)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const userIds = [...new Set((data ?? []).map((e: any) => e.created_by).filter(Boolean))];
      let nameMap: Record<string, string> = {};
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        profiles?.forEach((p: any) => { nameMap[p.id] = p.full_name; });
      }

      return (data ?? []).map((e: any) => ({
        ...e,
        actor_name: e.created_by ? (nameMap[e.created_by] ?? 'Usuario') : 'Sistema',
      })) as TimelineEvent[];
    },
  });

  const isLoading = loadingDetail || loadingEvents;
  const canProcess = role === 'compras' || role === 'admin';
  const canReject = canProcess &&
    request && (request.status === 'pendiente' || request.status === 'en_curso');
  const canSurtir = canProcess &&
    request && (request.status === 'pendiente' || request.status === 'en_curso');
  const canSolicitud = canProcess &&
    request && (request.status === 'pendiente' || request.status === 'en_curso');

  return (
    <Sheet open={!!requestId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[480px] max-w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="sr-only">Detalle del requerimiento</SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-4 pt-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : request ? (
          <div className="space-y-6 pt-4">
            <RequestDrawerHeader request={request} />

            <ItemsProgressBar
              items={request.request_items.map(i => ({ status: i.status as ItemSubState }))}
              variant="full"
            />

            <Separator />

            <div>
              <h3 className="text-sm font-semibold mb-2">Ítems ({request.request_items.length})</h3>
              <div className="space-y-2">
                {request.request_items.map(item => {
                  const subState = item.status as ItemSubState;
                  const colors = ITEM_SUB_STATE_COLORS[subState];
                  return (
                    <div key={item.id} className="flex items-center justify-between gap-2 text-sm border rounded-md p-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {item.materials?.name ?? item.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.quantity} {item.materials?.unit ?? item.unit}
                          {item.quantity_ordered > 0 && ` · Pedido: ${item.quantity_ordered}`}
                          {item.quantity_received > 0 && ` · Recibido: ${item.quantity_received}`}
                        </p>
                        {item.observations && (
                          <p className="text-xs text-muted-foreground italic mt-0.5">{item.observations}</p>
                        )}
                      </div>
                      <Badge variant="outline" className={`text-xs ${colors?.bg ? `${colors.bg} text-white border-transparent` : ''}`}>
                        {colors?.label ?? subState}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="text-sm font-semibold mb-2">Actividad</h3>
              <ActivityTimeline events={events} />
            </div>

            {canProcess && request.status !== 'rechazado' && request.status !== 'recibido' && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Acciones</h3>
                  <div className="flex gap-2 flex-wrap">
                    {canSurtir && (
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() =>
                          onSurtir(
                            request.id,
                            request.request_number,
                            request.projects?.name ?? null,
                            request.created_by,
                          )
                        }
                      >
                        <Warehouse className="h-4 w-4 mr-2" />
                        Surtir de Inventario
                      </Button>
                    )}
                    {canSolicitud && (
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() =>
                          onSolicitudDirecta(
                            request.id,
                            request.request_number,
                            request.projects?.name ?? null,
                            request.desired_date,
                          )
                        }
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Solicitud de Cotización
                      </Button>
                    )}
                  </div>
                  {canReject && (
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={() => onReject(request.id, request.request_number)}
                    >
                      Rechazar
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
