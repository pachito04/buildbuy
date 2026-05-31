import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RequestDetailModalHeader } from "./RequestDetailModalHeader";
import { ActivityTimeline } from "./ActivityTimeline";
import { useViewRole } from "@/hooks/useViewRole";
import { useUrgencyThreshold } from "@/hooks/useUrgencyThreshold";
import { Warehouse, FileText, X } from "lucide-react";
import {
  ITEM_SUB_STATE_COLORS,
  ARCHITECT_ITEM_LABELS,
  isItemReceivable,
  type RequestDetail,
  type TimelineEvent,
  type ItemSubState,
  type ItemRouting,
} from "@/lib/kanban-types";
import { ItemRecepcionForm } from "./ItemRecepcionForm";

const ROUTING_LABELS: Record<ItemRouting, string> = {
  inventario: "Inventario",
  cotizacion: "Cotización",
  orden_directa: "Orden directa",
  pendiente: "Sin destino",
};

const ROUTING_BADGE_CLASSES: Record<ItemRouting, string> = {
  inventario: "bg-green-100 text-green-800 border-green-300",
  cotizacion: "bg-amber-100 text-amber-800 border-amber-300",
  orden_directa: "bg-blue-100 text-blue-800 border-blue-300",
  pendiente: "bg-gray-100 text-gray-500 border-gray-200",
};

const STATUS_STRIP_COLORS: Record<string, string> = {
  pendiente: "#C96A00",
  en_curso: "#F59E0B",
  recibido: "#059669",
  rechazado: "#E04444",
};

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface RequestDetailModalProps {
  requestId: string | null;
  onClose: () => void;
  onReject: (requestId: string, requestNumber: number) => void;
  onSurtir: (
    requestId: string,
    requestNumber: number,
    projectName: string | null,
    createdBy: string | null
  ) => void;
  onSolicitudDirecta: (
    requestId: string,
    requestNumber: number,
    projectName: string | null,
    desiredDate: string | null
  ) => void;
}

export function RequestDetailModal({
  requestId,
  onClose,
  onReject,
  onSurtir,
  onSolicitudDirecta,
}: RequestDetailModalProps) {
  const { viewRole: role } = useViewRole();
  const thresholdDays = useUrgencyThreshold();

  const { data: request, isLoading: loadingDetail } = useQuery({
    queryKey: ["request-detail", requestId],
    enabled: !!requestId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requests")
        .select(
          `
          *,
          request_items(*, materials:material_id(name, unit)),
          architects:architect_id(full_name),
          projects:project_id(id, name)
        `
        )
        .eq("id", requestId!)
        .single();
      if (error) throw error;
      return data as unknown as RequestDetail;
    },
  });

  const { data: events = [], isLoading: loadingEvents } = useQuery({
    queryKey: ["request-events", requestId],
    enabled: !!requestId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requerimiento_evento")
        .select("id, tipo, descripcion, metadata, created_at, created_by")
        .eq("request_id", requestId!)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const userIds = [
        ...new Set(
          (data ?? []).map((e: any) => e.created_by).filter(Boolean)
        ),
      ];
      let nameMap: Record<string, string> = {};
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        profiles?.forEach((p: any) => {
          nameMap[p.id] = p.full_name;
        });
      }

      return (data ?? []).map((e: any) => ({
        ...e,
        actor_name: e.created_by
          ? (nameMap[e.created_by] ?? "Usuario")
          : "Sistema",
      })) as TimelineEvent[];
    },
  });

  useEffect(() => {
    if (!requestId) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [requestId, onClose]);

  if (!requestId) return null;

  const isLoading = loadingDetail || loadingEvents;
  const canProcess = role === "compras" || role === "admin";
  const showActions =
    canProcess &&
    request &&
    request.status !== "rechazado" &&
    request.status !== "recibido";

  const stripColor =
    STATUS_STRIP_COLORS[request?.status ?? "pendiente"] ?? "#C96A00";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        backgroundColor: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(2px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex flex-col bg-white shadow-xl"
        style={{
          width: 400,
          maxWidth: "88vw",
          maxHeight: "78vh",
          borderRadius: 18,
          overflow: "hidden",
        }}
      >
        {/* Color strip */}
        <div
          className="shrink-0"
          style={{ height: 5, backgroundColor: stripColor }}
        />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute z-10 flex items-center justify-center rounded-md"
          style={{
            top: 14,
            right: 14,
            width: 28,
            height: 28,
            backgroundColor: "#F5F4F1",
          }}
        >
          <X className="h-4 w-4" />
        </button>

        {isLoading ? (
          <div style={{ padding: "14px 18px" }} className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : request ? (
          <>
            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto" style={{ padding: "14px 18px" }}>
              <RequestDetailModalHeader request={request} thresholdDays={thresholdDays} role={role} />

              {/* Items */}
              <div className="mt-4 pt-4 border-t">
                <h3
                  className="font-semibold uppercase tracking-wider text-muted-foreground mb-2"
                  style={{ fontSize: 11 }}
                >
                  Ítems ({request.request_items.length})
                </h3>
                <div className="space-y-2">
                  {request.request_items.map((item) => {
                    const subState = item.status as ItemSubState;
                    const colors = ITEM_SUB_STATE_COLORS[subState];
                    const isArq = role === 'arquitecto';
                    const receivable = isArq && isItemReceivable(
                      subState,
                      Number(item.quantity_received),
                      Number(item.quantity),
                    );
                    const hasPartialQty = Number(item.quantity_received) > 0 && subState !== 'recibido';
                    return (
                      <div
                        key={item.id}
                        className="p-3"
                        style={{
                          backgroundColor: "#FAFAF8",
                          border: "1px solid #F0EDE8",
                          borderRadius: 10,
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm">
                              {capitalize(
                                item.materials?.name ?? item.description
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {item.quantity}{" "}
                              {item.materials?.unit ?? item.unit}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Badge variant="outline" className="text-xs">
                              {isArq
                                ? ARCHITECT_ITEM_LABELS[subState] ?? subState
                                : colors?.label ?? subState}
                            </Badge>
                            {item.routing && (
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${ROUTING_BADGE_CLASSES[item.routing as ItemRouting] ?? ""}`}
                              >
                                {ROUTING_LABELS[item.routing as ItemRouting] ?? item.routing}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {isArq && hasPartialQty && (
                          <p className="text-xs text-muted-foreground mt-1.5">
                            Recibido: {item.quantity_received} de {item.quantity}{" "}
                            {item.materials?.unit ?? item.unit}
                          </p>
                        )}
                        {receivable && (
                          <ItemRecepcionForm requestId={request.id} item={item} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Activity */}
              <div className="mt-4 pt-4 border-t">
                <h3
                  className="font-semibold uppercase tracking-wider text-muted-foreground mb-2"
                  style={{ fontSize: 11 }}
                >
                  Actividad
                </h3>
                <ActivityTimeline events={events} />
              </div>
            </div>

            {/* Fixed footer actions */}
            {showActions && (
              <div
                className="shrink-0 border-t"
                style={{ padding: "12px 18px" }}
              >
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button
                    onClick={() =>
                      onSurtir(
                        request.id,
                        request.request_number,
                        request.projects?.name ?? null,
                        request.created_by
                      )
                    }
                    className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors hover:opacity-80"
                    style={{
                      backgroundColor: "#F5F4F1",
                      border: "1px solid #E0DDD8",
                    }}
                  >
                    <Warehouse className="h-4 w-4 shrink-0" />
                    Surtir de Inventario
                  </button>
                  <button
                    onClick={() =>
                      onSolicitudDirecta(
                        request.id,
                        request.request_number,
                        request.projects?.name ?? null,
                        request.desired_date
                      )
                    }
                    className="py-2.5 rounded-lg text-sm font-medium transition-colors hover:opacity-80 text-center"
                    style={{
                      backgroundColor: "#F5F4F1",
                      border: "1px solid #E0DDD8",
                    }}
                  >
                    <FileText className="h-4 w-4 inline align-text-bottom mr-1.5" />
                    Solicitud de Cotización
                  </button>
                </div>
                <button
                  onClick={() =>
                    onReject(request.id, request.request_number)
                  }
                  className="w-full py-2.5 rounded-lg text-sm font-medium transition-colors hover:opacity-80"
                  style={{
                    backgroundColor: "#FEF2F2",
                    color: "#E04444",
                    border: "1px solid #FECACA",
                  }}
                >
                  Rechazar requerimiento
                </button>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
