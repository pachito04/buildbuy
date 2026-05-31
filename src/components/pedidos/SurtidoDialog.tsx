import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Warehouse } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useViewRole } from "@/hooks/useViewRole";
import { availableStock, reservationCalc } from "@/lib/deposito-utils";
import { suggestRouting, canProcess, type Routing } from "@/lib/routing-utils";
import { logMovimiento, movimientoOrigenRequerimiento, routingToDestino } from "@/lib/movimiento-utils";

interface SurtidoDialogProps {
  requestId: string | null;
  requestNumber: number;
  projectName: string | null;
  createdBy: string | null;
  onClose: () => void;
}

const ROUTING_LABELS: Record<Routing, string> = {
  inventario: "Inventario",
  cotizacion: "Cotización",
  orden_directa: "Orden directa",
  pendiente: "Sin asignar",
};

const ROUTING_COLORS: Record<Routing, string> = {
  inventario: "bg-green-100 text-green-800 border-green-300",
  cotizacion: "bg-amber-100 text-amber-800 border-amber-300",
  orden_directa: "bg-blue-100 text-blue-800 border-blue-300",
  pendiente: "bg-gray-100 text-gray-600 border-gray-300",
};

interface StockRow {
  id: string;
  material_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  stockTotal: number;
  stockReserved: number;
  available: number;
  requested: number;
  toFulfill: number;
  remaining: number;
  hasStock: boolean;
  needsRfq: boolean;
}

export function SurtidoDialog({
  requestId,
  requestNumber,
  projectName,
  createdBy,
  onClose,
}: SurtidoDialogProps) {
  const { user } = useAuth();
  const { companyId } = useViewRole();
  const qc = useQueryClient();

  // Per-item routing state: itemId → Routing
  const [routings, setRoutings] = useState<Record<string, Routing>>({});

  const { data: surtidoStock, isLoading } = useQuery({
    queryKey: ["surtido-stock", requestId],
    enabled: !!requestId,
    queryFn: async () => {
      const { data: reqItems, error } = await supabase
        .from("request_items")
        .select("id, material_id, description, quantity, unit")
        .eq("request_id", requestId!);
      if (error) throw error;

      const materialIds = (reqItems ?? [])
        .map((i: any) => i.material_id)
        .filter(Boolean);

      let stockMap: Record<string, { quantity: number; reserved: number }> = {};
      if (materialIds.length) {
        const { data: inv } = await supabase
          .from("inventory")
          .select("material_id, quantity, reserved")
          .in("material_id", materialIds);
        inv?.forEach((row: any) => {
          stockMap[row.material_id] = {
            quantity: Number(row.quantity),
            reserved: Number(row.reserved),
          };
        });
      }

      return (reqItems ?? []).map((item: any) => {
        const inv = item.material_id ? stockMap[item.material_id] : null;
        const invRow = {
          quantity: inv?.quantity ?? 0,
          reserved: inv?.reserved ?? 0,
          min_stock: 0,
        };
        const available = availableStock(invRow);
        const requested = Number(item.quantity) || 0;
        const calc = reservationCalc(requested, available);
        return {
          ...item,
          stockTotal: invRow.quantity,
          stockReserved: invRow.reserved,
          available,
          requested,
          toFulfill: calc.toReserve,
          remaining: calc.remaining,
          hasStock: calc.hasStock,
          needsRfq: calc.needsRfq,
        } as StockRow;
      });
    },
  });

  // Initialize routing suggestions once data loads
  useEffect(() => {
    if (!surtidoStock) return;
    setRoutings((prev) => {
      const next = { ...prev };
      for (const item of surtidoStock) {
        if (next[item.id] === undefined) {
          next[item.id] = suggestRouting(
            { quantity: item.requested, material_id: item.material_id },
            { available: item.available },
          );
        }
      }
      return next;
    });
  }, [surtidoStock]);

  // Reset routings when dialog closes
  useEffect(() => {
    if (!requestId) {
      setRoutings({});
    }
  }, [requestId]);

  const itemsWithRouting = (surtidoStock ?? []).map((item) => ({
    ...item,
    routing: routings[item.id] ?? "pendiente" as Routing,
  }));

  const processable = canProcess(itemsWithRouting);

  const surtidoMutation = useMutation({
    mutationFn: async () => {
      if (!requestId || !surtidoStock || !companyId || !user)
        throw new Error("Datos incompletos");

      const committed = itemsWithRouting;
      const itemsInventario = committed.filter((i) => i.routing === "inventario");
      const itemsCotizacion = committed.filter((i) => i.routing === "cotizacion");
      const itemsOrdenDirecta = committed.filter((i) => i.routing === "orden_directa");

      // ---------------------------------------------------------------
      // inventario → existing reserve + remito-borrador path
      // ---------------------------------------------------------------
      if (itemsInventario.length > 0) {
        for (const item of itemsInventario) {
          const newReserved = item.stockReserved + item.toFulfill;
          const { error: invErr } = await supabase
            .from("inventory")
            .update({ reserved: newReserved })
            .eq("material_id", item.material_id);
          if (invErr) throw invErr;
        }

        const { data: project } = await supabase
          .from("requests")
          .select("projects:project_id(name, address)")
          .eq("id", requestId)
          .single();

        // NOTE: `destination` here is the remito's OWN delivery-address column
        // (where the goods physically go), NOT the request-item procurement routing.
        const remitoDestination =
          (project as any)?.projects?.address ||
          (project as any)?.projects?.name ||
          projectName ||
          "Obra";

        const { data: remito, error: remErr } = await supabase
          .from("remitos")
          .insert({
            company_id: companyId,
            request_id: requestId,
            status: "borrador" as any,
            destination: remitoDestination,
            observations: `Surtido de inventario — Pedido #${requestNumber}`,
            created_by: user.id,
          })
          .select()
          .single();
        if (remErr) throw remErr;

        const remitoItems = itemsInventario.map((item) => ({
          remito_id: (remito as any).id,
          material_id: item.material_id,
          quantity: item.toFulfill,
          request_item_id: item.id,
        }));
        if (remitoItems.length > 0) {
          const { error: riErr } = await supabase
            .from("remito_items")
            .insert(remitoItems);
          if (riErr) throw riErr;
        }
      }

      // ---------------------------------------------------------------
      // cotizacion → existing RFQ/basket path
      // ---------------------------------------------------------------
      let rfqCreated = false;
      if (itemsCotizacion.length > 0) {
        const { data: rfq, error: rfqErr } = await supabase
          .from("rfqs")
          .insert({
            company_id: companyId,
            request_id: requestId,
            rfq_type: "open",
            observations: `Generado automáticamente — ítems a cotización del pedido #${requestNumber}`,
            created_by: user.id,
            status: "draft",
          } as any)
          .select()
          .single();
        if (rfqErr) throw rfqErr;

        const rfqItems = itemsCotizacion.map((item) => ({
          rfq_id: (rfq as any).id,
          description: item.description,
          quantity: item.remaining > 0 ? item.remaining : item.requested,
          unit: item.unit,
          // Link back to the originating request_item so generateOC can
          // resolve request_item_id via quote_items -> rfq_items.request_item_id.
          request_item_id: item.id,
          ...(item.material_id ? { material_id: item.material_id } : {}),
        }));
        const { error: rfqItemsErr } = await supabase
          .from("rfq_items")
          .insert(rfqItems);
        if (rfqItemsErr) throw rfqItemsErr;
        rfqCreated = true;
      }

      // ---------------------------------------------------------------
      // orden_directa → persist routing only (flow wired later)
      // ---------------------------------------------------------------
      // No immediate side effect beyond persisting the routing below.

      // ---------------------------------------------------------------
      // Persist each item's committed routing
      // ---------------------------------------------------------------
      for (const item of committed) {
        const { error: routeErr } = await supabase
          .from("request_items")
          .update({ routing: item.routing })
          .eq("id", item.id);
        if (routeErr) throw routeErr;
      }

      // ---------------------------------------------------------------
      // Update request status
      // ---------------------------------------------------------------
      const { error: stErr } = await supabase
        .from("requests")
        .update({ status: "en_curso" as any })
        .eq("id", requestId);
      if (stErr) throw stErr;

      // ---------------------------------------------------------------
      // Log event summarizing chosen routings
      // ---------------------------------------------------------------
      const parts: string[] = [];
      if (itemsInventario.length > 0)
        parts.push(`${itemsInventario.length} ítem(s) → inventario`);
      if (itemsCotizacion.length > 0)
        parts.push(`${itemsCotizacion.length} ítem(s) → cotización`);
      if (itemsOrdenDirecta.length > 0)
        parts.push(`${itemsOrdenDirecta.length} ítem(s) → orden directa`);

      try {
        await supabase.from("requerimiento_evento").insert({
          request_id: requestId,
          tipo: "procesado",
          descripcion: `Destinos confirmados: ${parts.join(", ")}`,
          created_by: user.id,
        });
      } catch {
        // Non-fatal — event logging should not block the flow
      }

      // ---------------------------------------------------------------
      // Log per-item movement (best-effort — must not block the flow)
      // ---------------------------------------------------------------
      for (const item of committed) {
        await logMovimiento(supabase, {
          request_item_id: item.id,
          material_id: item.material_id ?? null,
          tipo: "destino_asignado",
          origen: movimientoOrigenRequerimiento(requestNumber),
          destino: routingToDestino(item.routing),
          cantidad: item.requested,
          ref_type: "requerimiento",
          ref_id: requestId,
          created_by: user.id,
        });
      }

      // ---------------------------------------------------------------
      // Notify architect
      // ---------------------------------------------------------------
      if (createdBy) {
        const pName = projectName || "Sin obra";
        const msg = `Pedido #${requestNumber} — destinos confirmados`;
        const detail = `Tu pedido #${requestNumber} de ${pName} fue procesado: ${parts.join(", ")}.`;

        await supabase.from("notificaciones").insert({
          company_id: companyId,
          user_id: createdBy,
          type: "request_approved" as any,
          message: msg,
          metadata: { request_id: requestId, detail_message: detail },
        });
      }

      return { rfqCreated, inventarioCount: itemsInventario.length };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["request-detail"] });
      qc.invalidateQueries({ queryKey: ["request-events"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["rfqs"] });
      qc.invalidateQueries({ queryKey: ["remitos"] });
      onClose();
      const parts: string[] = [];
      if (result.inventarioCount > 0)
        parts.push("Stock reservado — solicitud enviada a Depósito.");
      if (result.rfqCreated)
        parts.push("Solicitud de cotización generada para los faltantes.");
      toast.success(parts.join(" ") || "Pedido procesado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pendingCount = itemsWithRouting.filter(
    (i) => i.routing === "pendiente",
  ).length;

  return (
    <Dialog open={!!requestId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            Procesar Requerimiento — Pedido #{requestNumber}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-2 py-4">
            <div className="h-4 bg-muted rounded animate-pulse" />
            <div className="h-4 bg-muted rounded animate-pulse w-4/5" />
            <div className="h-4 bg-muted rounded animate-pulse w-3/5" />
          </div>
        )}

        {surtidoStock && (
          <div className="space-y-4">
            {/* Info banner */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm">
              <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-blue-800">
                Asigná un destino a cada ítem. El sistema sugiere un destino según el
                stock disponible, pero podés cambiarlo antes de confirmar. Ninguna
                reserva ni cotización se genera hasta que confirmés.
              </p>
            </div>

            {/* Per-item routing table */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left px-3 py-2">Material</th>
                    <th className="text-right px-3 py-2 whitespace-nowrap">Solicitado</th>
                    <th className="text-right px-3 py-2 whitespace-nowrap">Disponible</th>
                    <th className="text-center px-3 py-2">Destino</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsWithRouting.map((item) => (
                    <tr
                      key={item.id}
                      className={`border-t ${
                        item.routing === "pendiente" ? "bg-amber-50/40" : ""
                      }`}
                    >
                      <td className="px-3 py-2 max-w-[180px] truncate">
                        {item.description}
                      </td>
                      <td className="text-right px-3 py-2 font-mono tabular-nums">
                        {item.requested} {item.unit}
                      </td>
                      <td className="text-right px-3 py-2 font-mono tabular-nums">
                        {item.available} {item.unit}
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={item.routing}
                          onValueChange={(value) =>
                            setRoutings((prev) => ({
                              ...prev,
                              [item.id]: value as Routing,
                            }))
                          }
                        >
                          <SelectTrigger className="h-8 text-xs min-w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pendiente">
                              Sin asignar
                            </SelectItem>
                            <SelectItem value="inventario">
                              Inventario
                            </SelectItem>
                            <SelectItem value="cotizacion">
                              Cotización
                            </SelectItem>
                            <SelectItem value="orden_directa">
                              Orden directa
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary badges */}
            <div className="flex flex-wrap gap-2">
              {(["inventario", "cotizacion", "orden_directa", "pendiente"] as Routing[])
                .filter((d) => itemsWithRouting.some((i) => i.routing === d))
                .map((d) => {
                  const count = itemsWithRouting.filter((i) => i.routing === d).length;
                  return (
                    <Badge
                      key={d}
                      variant="outline"
                      className={`text-[11px] ${ROUTING_COLORS[d]}`}
                    >
                      {ROUTING_LABELS[d]}: {count}
                    </Badge>
                  );
                })}
            </div>

            {/* Block message when pendiente items remain */}
            {!processable && pendingCount > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-amber-800">
                  {pendingCount === 1
                    ? "1 ítem no tiene destino asignado."
                    : `${pendingCount} ítems no tienen destino asignado.`}{" "}
                  Todos los ítems deben tener un destino para continuar.
                </p>
              </div>
            )}

            {/* Confirm button */}
            <Button
              className="w-full"
              onClick={() => surtidoMutation.mutate()}
              disabled={surtidoMutation.isPending || !processable}
            >
              <Warehouse className="h-4 w-4 mr-2" />
              {surtidoMutation.isPending
                ? "Procesando..."
                : "Confirmar destinos y procesar"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
