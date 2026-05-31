import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUrgencyThreshold } from "@/hooks/useUrgencyThreshold";
import {
  EligibleItem,
  ConsolidatedLine,
  groupEligibleByMaterial,
  consolidatedUrgency,
} from "@/lib/consolidacion-utils";

// ---------------------------------------------------------------------------
// Public result type
// ---------------------------------------------------------------------------

export interface UseConsolidacionResult {
  /** Grouped eligible lines, ready to render in the panel. */
  lines: ConsolidatedLine[];
  /**
   * Per-material urgency flag derived from source desired_dates.
   * Key = material_id, value = whether ANY source is urgent.
   */
  urgencyByMaterialId: Record<string, boolean>;
  isLoading: boolean;
  error: Error | null;
  createConsolidatedRfq: (selectedLines: ConsolidatedLine[]) => void;
  isCreating: boolean;
}

// ---------------------------------------------------------------------------
// Raw row returned by the eligible-items query (Supabase join shape)
// ---------------------------------------------------------------------------

interface RawEligibleRow {
  id: string;
  request_id: string;
  description: string;
  unit: string;
  quantity: number;
  material_id: string | null;
  delivery_target: string;
  routing: string;
  status: string;
  requests: {
    id: string;
    request_number: number;
    status: string;
    company_id: string;
    desired_date: string | null;
    projects: { name: string } | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

const eligibleKey = (companyId: string | null) =>
  ["consolidacion-eligible", companyId] as const;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useConsolidacion(companyId: string | null): UseConsolidacionResult {
  const { user } = useAuth();
  const qc = useQueryClient();
  const thresholdDays = useUrgencyThreshold();

  // ---- Eligible items query -----------------------------------------------

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: eligibleKey(companyId),
    enabled: !!companyId,
    queryFn: async (): Promise<{
      lines: ConsolidatedLine[];
      urgencyByMaterialId: Record<string, boolean>;
    }> => {
      // Join request_items → requests → projects.
      // Server-side filters mirror the isConsolidationEligible predicate to
      // avoid fetching ineligible rows.
      const { data: rows, error } = await supabase
        .from("request_items")
        .select(
          `id,
           request_id,
           description,
           unit,
           quantity,
           material_id,
           delivery_target,
           routing,
           status,
           requests!inner(
             id,
             request_number,
             status,
             company_id,
             desired_date,
             projects:project_id(name)
           )`
        )
        .eq("delivery_target", "deposito")
        .eq("status", "sin_pedir")
        .not("material_id", "is", null)
        .eq("requests.status", "pendiente")
        .eq("requests.company_id", companyId!)
        .in("routing", ["pendiente", "cotizacion"]);

      if (error) throw error;

      const rawRows = (rows ?? []) as unknown as RawEligibleRow[];

      // Map to EligibleItem[], collecting desired_date per item for urgency.
      const items: EligibleItem[] = [];
      // material_id → list of desired_dates across its sources
      const datesByMaterial: Record<string, (string | null)[]> = {};

      for (const row of rawRows) {
        if (!row.requests || !row.material_id) continue;

        const item: EligibleItem = {
          request_item_id: row.id,
          request_id: row.request_id,
          request_number: row.requests.request_number,
          obra: row.requests.projects?.name ?? null,
          material_id: row.material_id,
          description: row.description,
          unit: row.unit,
          quantity: row.quantity,
          desired_date: row.requests.desired_date,
          // Fields required by isConsolidationEligible (already filtered server-side)
          request_status: row.requests.status,
          delivery_target: row.delivery_target,
          routing: row.routing,
          item_status: row.status,
        };

        items.push(item);

        if (!datesByMaterial[row.material_id]) {
          datesByMaterial[row.material_id] = [];
        }
        datesByMaterial[row.material_id].push(row.requests.desired_date);
      }

      const lines = groupEligibleByMaterial(items);

      // Compute urgency per material
      const urgencyByMaterialId: Record<string, boolean> = {};
      for (const [materialId, dates] of Object.entries(datesByMaterial)) {
        urgencyByMaterialId[materialId] = consolidatedUrgency(dates, thresholdDays);
      }

      return { lines, urgencyByMaterialId };
    },
  });

  // ---- Create mutation -----------------------------------------------------

  const createMutation = useMutation({
    mutationFn: async (selectedLines: ConsolidatedLine[]) => {
      if (!companyId) throw new Error("No company_id available");
      if (!user?.id) throw new Error("Not authenticated");
      if (selectedLines.length === 0) throw new Error("No lines selected");

      // Step 1: INSERT rfqs (rfq_type='consolidated' — free-text column, cast via any)
      const { data: rfq, error: rfqErr } = await supabase
        .from("rfqs")
        .insert({
          company_id: companyId,
          created_by: user.id,
          status: "sent",
          rfq_type: "consolidated",
        } as any)
        .select("id")
        .single();
      if (rfqErr) throw rfqErr;
      const rfqId = (rfq as { id: string }).id;

      // Step 2: INSERT rfq_items (one per consolidated line, total quantity)
      const rfqItemsPayload = selectedLines.map((line) => ({
        rfq_id: rfqId,
        description: line.description,
        quantity: line.totalQuantity,
        unit: line.unit,
        material_id: line.material_id,
      }));

      const { data: insertedRfqItems, error: itemsErr } = await supabase
        .from("rfq_items")
        .insert(rfqItemsPayload)
        .select("id, material_id");
      if (itemsErr) throw itemsErr;

      const rfqItemRows = (insertedRfqItems ?? []) as {
        id: string;
        material_id: string | null;
      }[];

      // Step 3: INSERT rfq_item_sources (one per source contribution per line)
      const sourcesPayload: {
        rfq_item_id: string;
        request_item_id: string;
        request_id: string;
        quantity: number;
      }[] = [];

      for (const line of selectedLines) {
        const rfqItem = rfqItemRows.find((r) => r.material_id === line.material_id);
        if (!rfqItem) continue;

        for (const src of line.sources) {
          sourcesPayload.push({
            rfq_item_id: rfqItem.id,
            request_item_id: src.request_item_id,
            request_id: src.request_id,
            quantity: src.quantity,
          });
        }
      }

      if (sourcesPayload.length > 0) {
        const { error: sourcesErr } = await supabase
          .from("rfq_item_sources")
          .insert(sourcesPayload);
        if (sourcesErr) throw sourcesErr;
      }

      // Step 4: INSERT rfq_requests (distinct source request_ids)
      const distinctRequestIds = [
        ...new Set(
          selectedLines.flatMap((line) => line.sources.map((s) => s.request_id))
        ),
      ];

      if (distinctRequestIds.length > 0) {
        const rfqRequestsPayload = distinctRequestIds.map((requestId) => ({
          rfq_id: rfqId,
          request_id: requestId,
        }));
        const { error: reqErr } = await supabase
          .from("rfq_requests")
          .insert(rfqRequestsPayload);
        if (reqErr) throw reqErr;
      }

      return { rfqId };
    },

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rfqs"] });
      qc.invalidateQueries({ queryKey: eligibleKey(companyId) });
    },

    onError: (e: Error) => {
      console.error("[useConsolidacion] createConsolidatedRfq failed:", e.message);
    },
  });

  return {
    lines: data?.lines ?? [],
    urgencyByMaterialId: data?.urgencyByMaterialId ?? {},
    isLoading,
    error: error as Error | null,
    createConsolidatedRfq: createMutation.mutate,
    isCreating: createMutation.isPending,
  };
}
