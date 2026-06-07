import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewRole } from "@/hooks/useViewRole";
import { useUrgencyThreshold, isUrgente } from "@/hooks/useUrgencyThreshold";
import { distributeByUrgency } from "@/lib/distribucion-utils";
import { getDistinctRequestIds } from "@/lib/recepcion-utils";
import { recalcRequestStatus } from "@/lib/recalcRequestStatus";
import { logMovimiento } from "@/lib/movimiento-utils";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, PackageCheck, Info } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecepcionDialogProps {
  purchaseOrderId: string | null;
  onClose: () => void;
}

interface ItemReception {
  itemId: string;
  accepted: number;
  rejected: number;
  reason: string;
}

/** Map of requestId → current request status (used for recalcRequestStatus). */
type RequestStatusById = Record<string, string>;

/** A resolved consolidated source for one PO item line. */
interface ResolvedSource {
  /** rfq_item_sources.id */
  sourceId: string;
  /** request_items.id */
  requestItemId: string;
  /** requests.id */
  requestId: string;
  requestNumber: number;
  /** Project name (obra) */
  obraName: string;
  /** rfq_item_sources.quantity — how much this requirement requested */
  requestedQty: number;
  /** requests.desired_date — used for urgency */
  desiredDate: string | null;
  urgent: boolean;
  /** Current quantity_received on the request_item (to compute new total) */
  currentReceived: number;
  /** request_items.quantity — total quantity required */
  totalRequired: number;
  /** Material id (for movimiento) */
  materialId: string | null;
}

/** Per-source editable allocation for one consolidated PO item. */
type SourceAllocations = Record<string, number>; // sourceId → allocatedQty

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecepcionDialog({ purchaseOrderId, onClose }: RecepcionDialogProps) {
  const { user } = useAuth();
  const { companyId } = useViewRole();
  const qc = useQueryClient();
  const urgencyThreshold = useUrgencyThreshold();

  // Per-PO-item reception state (accepted / rejected / reason)
  const [receptions, setReceptions] = useState<Record<string, ItemReception>>({});

  // Per-PO-item consolidated sources (only populated for consolidated lines)
  const [consolidatedSources, setConsolidatedSources] = useState<
    Record<string, ResolvedSource[]>
  >({});

  // Per-PO-item per-source allocations (only for consolidated lines)
  const [sourceAllocations, setSourceAllocations] = useState<
    Record<string, SourceAllocations>
  >({});

  // ---------------------------------------------------------------------------
  // Primary PO query (unchanged from original)
  // ---------------------------------------------------------------------------

  const { data: poData } = useQuery({
    queryKey: ["recepcion-po", purchaseOrderId],
    enabled: !!purchaseOrderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*, providers:provider_id(name), purchase_order_items(*)")
        .eq("id", purchaseOrderId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const items = (poData as any)?.purchase_order_items ?? [];

  // ---------------------------------------------------------------------------
  // Resolve consolidated sources for each PO item (AD-2)
  //
  // Chain: purchase_order_items.quote_item_id
  //        → quote_items.rfq_item_id
  //        → rfq_items.id
  //        → rfq_item_sources (request_item_id, request_id, quantity)
  //        + requests.desired_date, request_number, project_id
  //        + projects.name
  //        + request_items.quantity_received, quantity, material_id
  //
  // If a PO item has no quote_item_id or no rfq_item_sources rows →
  // the line is NON-CONSOLIDATED (no entry in consolidatedSources).
  // ---------------------------------------------------------------------------

  const { data: sourcesData } = useQuery({
    queryKey: ["recepcion-sources", purchaseOrderId, items.length],
    enabled: !!purchaseOrderId && items.length > 0,
    queryFn: async () => {
      // Collect quote_item_ids that exist
      const quoteItemIds: string[] = items
        .map((i: any) => i.quote_item_id)
        .filter(Boolean);

      if (quoteItemIds.length === 0) return {};

      // Step 1: quote_items → rfq_item_id
      const { data: quoteItems, error: qiErr } = await supabase
        .from("quote_items")
        .select("id, rfq_item_id")
        .in("id", quoteItemIds);
      if (qiErr) throw qiErr;

      const rfqItemIds = (quoteItems ?? [])
        .map((qi: any) => qi.rfq_item_id)
        .filter(Boolean);

      if (rfqItemIds.length === 0) return {};

      // Step 2: rfq_item_sources for those rfq_items
      const { data: sources, error: srcErr } = await supabase
        .from("rfq_item_sources")
        .select("id, rfq_item_id, request_item_id, request_id, quantity")
        .in("rfq_item_id", rfqItemIds);
      if (srcErr) throw srcErr;

      if (!sources || sources.length === 0) return {};

      // Step 3: fetch requests (desired_date, request_number, project_id)
      const requestIds = [...new Set(sources.map((s: any) => s.request_id))];
      const { data: requests, error: reqErr } = await supabase
        .from("requests")
        .select("id, request_number, desired_date, project_id, status")
        .in("id", requestIds);
      if (reqErr) throw reqErr;

      // Step 4: fetch projects (name / obra)
      const projectIds = [
        ...new Set(
          (requests ?? []).map((r: any) => r.project_id).filter(Boolean),
        ),
      ];
      let projectMap: Record<string, string> = {};
      if (projectIds.length > 0) {
        const { data: projects, error: projErr } = await supabase
          .from("projects")
          .select("id, name")
          .in("id", projectIds);
        if (projErr) throw projErr;
        projectMap = Object.fromEntries(
          (projects ?? []).map((p: any) => [p.id, p.name]),
        );
      }

      // Step 5: fetch request_items (quantity_received, quantity, material_id)
      const requestItemIds = [...new Set(sources.map((s: any) => s.request_item_id))];
      const { data: requestItems, error: riErr } = await supabase
        .from("request_items")
        .select("id, quantity, quantity_received, material_id")
        .in("id", requestItemIds);
      if (riErr) throw riErr;

      // Build lookup maps
      const requestMap = Object.fromEntries(
        (requests ?? []).map((r: any) => [r.id, r]),
      );
      const requestItemMap = Object.fromEntries(
        (requestItems ?? []).map((ri: any) => [ri.id, ri]),
      );
      const quoteItemToRfqItem = Object.fromEntries(
        (quoteItems ?? []).map((qi: any) => [qi.id, qi.rfq_item_id]),
      );

      // Group sources by rfq_item_id
      const sourcesByRfqItem: Record<string, any[]> = {};
      for (const src of sources) {
        if (!sourcesByRfqItem[src.rfq_item_id]) {
          sourcesByRfqItem[src.rfq_item_id] = [];
        }
        sourcesByRfqItem[src.rfq_item_id].push(src);
      }

      // Build requestStatusById: requestId → status (for recalcRequestStatus after update)
      const requestStatusById: RequestStatusById = Object.fromEntries(
        (requests ?? []).map((r: any) => [r.id, r.status ?? "pendiente"]),
      );

      // Build result: poItemId → ResolvedSource[]
      const result: Record<string, ResolvedSource[]> = {};
      for (const item of items) {
        const qiId = item.quote_item_id;
        if (!qiId) continue;
        const rfqItemId = quoteItemToRfqItem[qiId];
        if (!rfqItemId) continue;
        const srcs = sourcesByRfqItem[rfqItemId];
        if (!srcs || srcs.length === 0) continue;

        result[item.id] = srcs.map((src: any): ResolvedSource => {
          const req = requestMap[src.request_id] ?? {};
          const ri = requestItemMap[src.request_item_id] ?? {};
          const obraName = req.project_id ? (projectMap[req.project_id] ?? "—") : "—";
          return {
            sourceId: src.id,
            requestItemId: src.request_item_id,
            requestId: src.request_id,
            requestNumber: req.request_number ?? 0,
            obraName,
            requestedQty: Number(src.quantity),
            desiredDate: req.desired_date ?? null,
            urgent: false, // filled below after threshold is known
            currentReceived: Number(ri.quantity_received ?? 0),
            totalRequired: Number(ri.quantity ?? 0),
            materialId: ri.material_id ?? null,
          };
        });
      }

      return { sources: result, requestStatusById };
    },
  });

  // Unpack the query result into the two maps used downstream.
  const consolidatedSourcesData = sourcesData?.sources ?? {};
  const requestStatusById = sourcesData?.requestStatusById ?? {};

  // ---------------------------------------------------------------------------
  // Initialize receptions + consolidated state when data lands
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!items.length) return;

    // Initialize receptions (unchanged logic)
    const initial: Record<string, ItemReception> = {};
    for (const item of items) {
      const pending = Number(item.quantity) - Number(item.quantity_received);
      initial[item.id] = {
        itemId: item.id,
        accepted: Math.max(0, pending),
        rejected: 0,
        reason: "",
      };
    }
    setReceptions(initial);
  }, [items.length, purchaseOrderId]);

  useEffect(() => {
    if (!consolidatedSourcesData || !items.length) return;

    // Apply urgency flag now that urgencyThreshold is known
    const withUrgency: Record<string, ResolvedSource[]> = {};
    for (const [itemId, srcs] of Object.entries(consolidatedSourcesData)) {
      withUrgency[itemId] = srcs.map((s) => ({
        ...s,
        urgent: isUrgente(s.desiredDate, urgencyThreshold),
      }));
    }
    setConsolidatedSources(withUrgency);
  }, [sourcesData, urgencyThreshold, items.length]);

  // Whenever consolidated sources or accepted quantities change,
  // recompute the proposed distribution for each consolidated line.
  useEffect(() => {
    if (!Object.keys(consolidatedSources).length) return;

    setSourceAllocations((prev) => {
      const next = { ...prev };
      for (const [itemId, srcs] of Object.entries(consolidatedSources)) {
        const accepted = receptions[itemId]?.accepted ?? 0;
        const proposed = distributeByUrgency(
          accepted,
          srcs.map((s) => ({
            id: s.sourceId,
            requestedQty: s.requestedQty,
            urgent: s.urgent,
          })),
        );
        // Only overwrite if user hasn't manually edited (or on first run)
        // For simplicity: always re-propose when accepted qty changes.
        // The effect runs when receptions changes, so we always re-propose.
        const proposedMap: SourceAllocations = {};
        for (const alloc of proposed) {
          proposedMap[alloc.id] = alloc.allocatedQty;
        }
        next[itemId] = proposedMap;
      }
      return next;
    });
  }, [consolidatedSources, receptions]);

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  const hasAnyReception = Object.values(receptions).some(
    (r) => r.accepted > 0 || r.rejected > 0,
  );

  const hasRejectionWithoutReason = Object.values(receptions).some(
    (r) => r.rejected > 0 && !r.reason.trim(),
  );

  /**
   * For each consolidated line, check that sum of source allocations equals
   * the accepted quantity. Returns the list of unbalanced item ids.
   */
  const unbalancedConsolidatedItems = items
    .filter((item: any) => {
      const srcs = consolidatedSources[item.id];
      if (!srcs || srcs.length === 0) return false; // non-consolidated — skip
      const accepted = receptions[item.id]?.accepted ?? 0;
      if (accepted === 0) return false; // nothing to distribute
      const allocs = sourceAllocations[item.id] ?? {};
      const total = Object.values(allocs).reduce((s: number, v) => s + (v as number), 0);
      return total !== accepted;
    })
    .map((item: any) => item.id);

  const hasUnbalancedConsolidated = unbalancedConsolidatedItems.length > 0;

  // ---------------------------------------------------------------------------
  // Mutation (AD-4)
  // ---------------------------------------------------------------------------

  const recepcionMutation = useMutation({
    mutationFn: async () => {
      if (!purchaseOrderId || !companyId || !user)
        throw new Error("Datos incompletos");

      for (const item of items) {
        const rec = receptions[item.id];
        if (!rec) continue;

        const pending = Number(item.quantity) - Number(item.quantity_received);
        if (rec.accepted + rec.rejected > pending)
          throw new Error(
            `${item.description}: aceptados + rechazados supera el pendiente (${pending})`,
          );

        // ------------------------------------------------------------------
        // EXISTING WRITES: PO item quantity_received + inventory + movement
        // These are unchanged for both consolidated and non-consolidated lines.
        // ------------------------------------------------------------------

        if (rec.accepted > 0) {
          const newReceived = Number(item.quantity_received) + rec.accepted;
          const { error: poiErr } = await supabase
            .from("purchase_order_items")
            .update({ quantity_received: newReceived })
            .eq("id", item.id);
          if (poiErr) throw poiErr;

          if (item.material_id) {
            const { data: inv } = await supabase
              .from("inventory")
              .select("id, quantity")
              .eq("material_id", item.material_id)
              .eq("company_id", companyId!)
              .maybeSingle();

            if (inv) {
              const { error: invErr } = await supabase
                .from("inventory")
                .update({ quantity: Number(inv.quantity) + rec.accepted })
                .eq("id", inv.id);
              if (invErr) throw invErr;
            } else {
              const { error: invErr } = await supabase
                .from("inventory")
                .insert({
                  company_id: companyId!,
                  material_id: item.material_id,
                  quantity: rec.accepted,
                });
              if (invErr) throw invErr;
            }

            const { error: movErr } = await supabase
              .from("inventory_movements")
              .insert({
                company_id: companyId!,
                material_id: item.material_id,
                movement_type: "entrada",
                quantity: rec.accepted,
                reason: `Recepción OC #${purchaseOrderId.slice(0, 8)} — ${(poData as any)?.providers?.name || "proveedor"}`,
                created_by: user.id,
              });
            if (movErr) throw movErr;
          }
        }

        if (rec.rejected > 0) {
          const { error: rejErr } = await supabase
            .from("oc_rejections")
            .insert({
              company_id: companyId!,
              purchase_order_id: purchaseOrderId,
              purchase_order_item_id: item.id,
              material_id: item.material_id,
              quantity_rejected: rec.rejected,
              reason: rec.reason,
              created_by: user.id,
            });
          if (rejErr) throw rejErr;

          // OBS-004: per-product audit — rejected goods at reception.
          if (item.request_item_id) {
            await logMovimiento(supabase, {
              request_item_id: item.request_item_id,
              material_id: item.material_id,
              tipo: "rechazo",
              origen: (poData as any)?.providers?.name
                ? `Proveedor ${(poData as any).providers.name}`
                : null,
              destino: "Rechazado",
              cantidad: rec.rejected,
              ref_type: "purchase_order" as any,
              ref_id: purchaseOrderId,
              created_by: user.id,
            });
          }
        }

        // ------------------------------------------------------------------
        // CONSOLIDATED WRITES (AD-4): per-source request_items update + log
        // Only runs when rfq_item_sources exist for this PO item.
        // ------------------------------------------------------------------

        const srcs = consolidatedSources[item.id];
        if (srcs && srcs.length > 0 && rec.accepted > 0) {
          const allocs = sourceAllocations[item.id] ?? {};

          for (const src of srcs) {
            const allocated = allocs[src.sourceId] ?? 0;
            if (allocated <= 0) continue;

            const newTotalReceived = src.currentReceived + allocated;
            const newStatus =
              newTotalReceived >= src.totalRequired ? "recibido" : "parcial";

            // Increment request_items.quantity_received + set status
            const { error: riErr } = await supabase
              .from("request_items")
              .update({
                quantity_received: newTotalReceived,
                status: newStatus as any,
              })
              .eq("id", src.requestItemId);
            if (riErr) throw riErr;

            // Log one recepcion movimiento_producto per source (best-effort)
            await logMovimiento(supabase, {
              request_item_id: src.requestItemId,
              material_id: src.materialId,
              tipo: "recepcion",
              origen: null,
              destino: "Inventario",
              cantidad: allocated,
              ref_type: "remito" as any,
              ref_id: null,
              created_by: user.id,
            });
          }
        }
      }

      // ------------------------------------------------------------------
      // Recalc parent request status once per distinct requestId (GAP 3)
      // Collect all sources that had allocated > 0 across all processed items.
      // ------------------------------------------------------------------

      const allProcessedSources: Array<{ requestId: string; allocated: number }> = [];
      for (const item of items) {
        const srcs = consolidatedSources[item.id];
        if (!srcs || srcs.length === 0) continue;
        const rec = receptions[item.id];
        if (!rec || rec.accepted <= 0) continue;
        const allocs = sourceAllocations[item.id] ?? {};
        for (const src of srcs) {
          const allocated = allocs[src.sourceId] ?? 0;
          if (allocated > 0) {
            allProcessedSources.push({ requestId: src.requestId, allocated });
          }
        }
      }

      const distinctReqIds = getDistinctRequestIds(allProcessedSources);
      for (const reqId of distinctReqIds) {
        const currentStatus = requestStatusById[reqId] ?? "pendiente";
        await recalcRequestStatus(reqId, currentStatus, user.id, companyId, qc);
      }

      // ------------------------------------------------------------------
      // Notification (unchanged)
      // ------------------------------------------------------------------

      const totalAccepted = Object.values(receptions).reduce(
        (s, r) => s + r.accepted,
        0,
      );
      const totalRejected = Object.values(receptions).reduce(
        (s, r) => s + r.rejected,
        0,
      );

      if ((poData as any)?.created_by) {
        await supabase.from("notificaciones").insert({
          company_id: companyId!,
          user_id: (poData as any).created_by,
          type: "material_received" as any,
          message: `Recepción registrada — OC #${purchaseOrderId.slice(0, 8)}`,
          metadata: {
            purchase_order_id: purchaseOrderId,
            detail_message: `Se recibieron ${totalAccepted} unidad(es)${totalRejected > 0 ? ` y se rechazaron ${totalRejected} unidad(es) por no conformidad` : ""}.`,
          },
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deposito-recepciones"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory-movements"] });
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["request-items"] });
      toast.success("Recepción registrada");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const updateReception = (
    itemId: string,
    field: keyof ItemReception,
    value: number | string,
  ) => {
    setReceptions((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  const updateSourceAllocation = (
    itemId: string,
    sourceId: string,
    value: number,
    maxQty: number,
  ) => {
    // Clamp to [0, requestedQty]: a source must never be allocated more than it
    // requested (the line-total gate alone wouldn't catch a single over-allocation).
    setSourceAllocations((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] ?? {}),
        [sourceId]: Math.max(0, Math.min(value, maxQty)),
      },
    }));
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Dialog open={!!purchaseOrderId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            Registrar Recepción
            {(poData as any)?.po_number && ` — OC #${(poData as any).po_number}`}
          </DialogTitle>
        </DialogHeader>

        {items.length > 0 && (
          <div className="space-y-4">
            {items.map((item: any) => {
              const pending = Number(item.quantity) - Number(item.quantity_received);
              if (pending <= 0) return null;
              const rec = receptions[item.id];
              if (!rec) return null;

              const srcs = consolidatedSources[item.id];
              const isConsolidated = srcs && srcs.length > 0;
              const allocs = sourceAllocations[item.id] ?? {};
              const allocTotal = Object.values(allocs).reduce(
                (s: number, v) => s + (v as number),
                0,
              );
              const unassigned = rec.accepted - allocTotal;
              const isUnbalanced = isConsolidated && rec.accepted > 0 && unassigned !== 0;

              return (
                <div key={item.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex justify-between items-start">
                    <p className="text-sm font-medium">{item.description}</p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                      Pendiente: {pending} {item.unit}
                    </span>
                  </div>

                  {/* Accepted / Rejected inputs — unchanged for all lines */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Aceptados</Label>
                      <Input
                        type="number"
                        min={0}
                        max={pending}
                        value={rec.accepted}
                        onChange={(e) => {
                          const val = Math.min(Number(e.target.value) || 0, pending);
                          updateReception(item.id, "accepted", val);
                          if (val + rec.rejected > pending) {
                            updateReception(item.id, "rejected", pending - val);
                          }
                        }}
                        className="min-h-[44px]"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Rechazados</Label>
                      <Input
                        type="number"
                        min={0}
                        max={pending}
                        value={rec.rejected}
                        onChange={(e) => {
                          const val = Math.min(Number(e.target.value) || 0, pending);
                          updateReception(item.id, "rejected", val);
                          if (rec.accepted + val > pending) {
                            updateReception(item.id, "accepted", pending - val);
                          }
                        }}
                        className="min-h-[44px]"
                      />
                    </div>
                  </div>

                  {rec.rejected > 0 && (
                    <div>
                      <Label className="text-xs">
                        Motivo de rechazo <span className="text-red-500">*</span>
                      </Label>
                      <Textarea
                        value={rec.reason}
                        onChange={(e) =>
                          updateReception(item.id, "reason", e.target.value)
                        }
                        placeholder="Describí el motivo de no conformidad..."
                        className="min-h-[60px] text-sm"
                      />
                    </div>
                  )}

                  {/* --------------------------------------------------------
                      CONSOLIDATED: per-source distribution sub-section (AD-3)
                      Only rendered when rfq_item_sources exist for this line.
                  --------------------------------------------------------- */}
                  {isConsolidated && rec.accepted > 0 && (
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Info className="h-3.5 w-3.5" />
                        <span>Distribución por requerimiento</span>
                      </div>

                      <div className="rounded-md border divide-y text-xs">
                        {/* Header row */}
                        <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 px-3 py-1.5 bg-muted/40 text-muted-foreground font-medium">
                          <span>Req.</span>
                          <span>Obra</span>
                          <span className="text-right">Solicitado</span>
                          <span className="text-right">Asignar</span>
                        </div>

                        {srcs.map((src) => (
                          <div
                            key={src.sourceId}
                            className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center px-3 py-1.5"
                          >
                            <span className="font-mono text-xs">
                              #{src.requestNumber}
                              {src.urgent && (
                                <span className="ml-1 text-amber-600 font-medium">
                                  (urgente)
                                </span>
                              )}
                            </span>
                            <span
                              className="truncate text-xs text-muted-foreground"
                              title={src.obraName}
                            >
                              {src.obraName}
                            </span>
                            <span className="text-right tabular-nums">
                              {src.requestedQty}
                            </span>
                            <Input
                              type="number"
                              min={0}
                              max={src.requestedQty}
                              value={allocs[src.sourceId] ?? 0}
                              onChange={(e) =>
                                updateSourceAllocation(
                                  item.id,
                                  src.sourceId,
                                  Number(e.target.value) || 0,
                                  src.requestedQty,
                                )
                              }
                              className="h-7 w-16 text-xs text-right px-1 py-0"
                            />
                          </div>
                        ))}
                      </div>

                      {/* Running total / unassigned feedback */}
                      <div
                        className={`flex items-center justify-between text-xs px-1 ${
                          isUnbalanced ? "text-amber-700" : "text-green-700"
                        }`}
                      >
                        <span>
                          Asignado: {allocTotal} / {rec.accepted}
                        </span>
                        {isUnbalanced && (
                          <span className="font-medium">
                            {unassigned > 0
                              ? `Quedan ${unassigned} sin asignar`
                              : `Exceso de ${Math.abs(unassigned)}`}
                          </span>
                        )}
                        {!isUnbalanced && <span>Todo asignado</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Rejection reason validation banner (unchanged) */}
            {hasRejectionWithoutReason && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-red-800">
                  Completá el motivo de rechazo para todos los ítems rechazados.
                </p>
              </div>
            )}

            {/* Consolidated balance validation banner (AD-3) */}
            {hasUnbalancedConsolidated && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-amber-800">
                  Todos los ítems consolidados deben tener sus unidades aceptadas
                  completamente asignadas a los requerimientos de origen antes de confirmar.
                </p>
              </div>
            )}

            <Button
              className="w-full min-h-[44px]"
              onClick={() => recepcionMutation.mutate()}
              disabled={
                recepcionMutation.isPending ||
                !hasAnyReception ||
                hasRejectionWithoutReason ||
                hasUnbalancedConsolidated
              }
            >
              <PackageCheck className="h-4 w-4 mr-2" />
              {recepcionMutation.isPending
                ? "Registrando..."
                : "Confirmar recepción"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
