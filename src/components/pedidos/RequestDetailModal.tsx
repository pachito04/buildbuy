import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RequestDetailModalHeader } from "./RequestDetailModalHeader";
import { ActivityTimeline } from "./ActivityTimeline";
import { useViewRole } from "@/hooks/useViewRole";
import { useUrgencyThreshold } from "@/hooks/useUrgencyThreshold";
import { useConsolidationMatches } from "@/hooks/useConsolidationMatches";
import { useBasket } from "@/contexts/BasketContext";
import { useToast } from "@/hooks/use-toast";
import { Warehouse, FileText, X, GitMerge, ShoppingCart } from "lucide-react";
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
  const navigate = useNavigate();
  const { matches } = useConsolidationMatches(requestId);
  const basket = useBasket();
  const { toast } = useToast();
  const [hintDismissed, setHintDismissed] = useState(false);

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
    // Reset hint dismiss state whenever a different request is opened
    setHintDismissed(false);
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

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex flex-col overflow-hidden rounded-3xl border bg-card shadow-card"
        style={{
          width: 460,
          maxWidth: "90vw",
          maxHeight: "82vh",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>

        {isLoading ? (
          <div className="space-y-4 px-6 py-6">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : request ? (
          <>
            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <RequestDetailModalHeader request={request} thresholdDays={thresholdDays} role={role} />

              {/* Items */}
              <div className="mt-6 pt-6 border-t">
                <h3 className="eyebrow mb-3">
                  Ítems ({request.request_items.length})
                </h3>

                {/* Consolidation hint — compras/admin only, when matches exist and not dismissed */}
                {canProcess && !hintDismissed && matches.length > 0 && (
                  <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <GitMerge className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-amber-800 leading-snug">
                        {matches.length === 1 && matches[0].otherRequests.length === 1
                          ? `"${matches[0].description}" también aparece en el requerimiento #${matches[0].otherRequests[0].request_number}.`
                          : matches.length === 1
                          ? `"${matches[0].description}" aparece en ${matches[0].otherRequests.length} otros requerimientos (${matches[0].otherRequests.map((r) => `#${r.request_number}`).join(", ")}).`
                          : `${matches.length} materiales aparecen en otros requerimientos pendientes.`}
                      </p>
                      <button
                        onClick={() => {
                          onClose();
                          navigate("/rfqs", { state: { openTab: "consolidar" } });
                        }}
                        className="mt-1 text-xs font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900 transition-colors"
                      >
                        Ver pestaña Consolidar
                      </button>
                    </div>
                    <button
                      onClick={() => setHintDismissed(true)}
                      className="shrink-0 rounded p-0.5 text-amber-500 hover:text-amber-800 hover:bg-amber-100 transition-colors"
                      aria-label="Cerrar sugerencia"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}

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
                        className="rounded-xl border border-border bg-background p-3"
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
              <div className="mt-6 pt-6 border-t">
                <h3 className="eyebrow mb-3">
                  Actividad
                </h3>
                <ActivityTimeline events={events} />
              </div>
            </div>

            {/* Fixed footer actions */}
            {showActions && (
              <div className="shrink-0 border-t px-6 py-4">
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
                    className="flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary py-2.5 text-sm font-medium transition-colors hover:bg-muted"
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
                    className="rounded-lg border border-border bg-secondary py-2.5 text-center text-sm font-medium transition-colors hover:bg-muted"
                  >
                    <FileText className="h-4 w-4 inline align-text-bottom mr-1.5" />
                    Solicitud de Cotización
                  </button>
                </div>
                <button
                  onClick={() => {
                    const itemsWithMaterial = request.request_items.filter(
                      (item) => !!item.material_id
                    );
                    if (itemsWithMaterial.length === 0) {
                      toast({
                        title: "Sin ítems cotizables",
                        description:
                          "Este requerimiento no tiene ítems con material asignado.",
                        variant: "destructive",
                      });
                      return;
                    }
                    itemsWithMaterial.forEach((item) => {
                      basket.addItem(
                        {
                          material_id: item.material_id!,
                          name: item.materials?.name ?? item.description,
                          unit: item.materials?.unit ?? (item.unit ?? ""),
                          origen: `Requerimiento #${request.request_number}`,
                          request_id: request.id,
                          request_item_id: item.id,
                        },
                        Number(item.quantity)
                      );
                    });
                    toast({
                      title: `${itemsWithMaterial.length} ítem(s) agregados a la cesta`,
                      description: `Requerimiento #${request.request_number}`,
                    });
                    onClose();
                  }}
                  className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 py-2.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
                >
                  <ShoppingCart className="h-4 w-4 shrink-0" />
                  Agregar a cesta de cotización
                </button>
                <button
                  onClick={() =>
                    onReject(request.id, request.request_number)
                  }
                  className="w-full rounded-lg border border-destructive/20 bg-destructive/10 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/15"
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
