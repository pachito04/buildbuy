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

      // Build the p_lines payload for the RPC.
      // Each line: material_id, description, unit, total_quantity, sources[].
      // Sources carry request_item_id, request_id, quantity — the RPC handles
      // rfq_items, rfq_item_sources, rfq_requests, status lock, and events atomically.
      const p_lines = selectedLines.map((line) => ({
        material_id: line.material_id,
        description: line.description,
        unit: line.unit,
        total_quantity: line.totalQuantity,
        sources: line.sources.map((src) => ({
          request_item_id: src.request_item_id,
          request_id: src.request_id,
          quantity: src.quantity,
        })),
      }));

      const { data: rfqId, error } = await supabase.rpc("create_consolidated_rfq", {
        p_company_id: companyId,
        p_created_by: user.id,
        p_lines,
      });

      if (error) throw new Error(error.message);

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
