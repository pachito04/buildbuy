import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useViewRole } from "@/hooks/useViewRole";
import { groupMatchRows, type ConsolidationMatch, type RawMatchRow } from "@/lib/consolidacion-match-utils";

// ---------------------------------------------------------------------------
// Public result type
// ---------------------------------------------------------------------------

export type { ConsolidationMatch };

export interface UseConsolidationMatchesResult {
  matches: ConsolidationMatch[];
  isLoading: boolean;
  error: Error | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * For a given `requestId`, returns — per item of THAT request that is routed
 * to depósito and consolidation-eligible — the OTHER eligible pending requests
 * (same company) that contain the same `material_id`.
 *
 * Only runs for compras / admin roles.
 *
 * Eligibility mirrors `isConsolidationEligible` / `useConsolidacion`'s server
 * filters:
 *   - request.status = 'pendiente'
 *   - delivery_target = 'deposito'
 *   - routing IN ('pendiente', 'cotizacion')
 *   - material_id IS NOT NULL
 *   - item status = 'sin_pedir'
 *
 * The current request is excluded from the results so a request never
 * surfaces itself as its own "other" match.
 */
export function useConsolidationMatches(
  requestId: string | null,
): UseConsolidationMatchesResult {
  const { viewRole: role, companyId } = useViewRole();

  const canRun =
    !!requestId &&
    !!companyId &&
    (role === "compras" || role === "admin");

  const { data, isLoading, error } = useQuery({
    queryKey: ["consolidation-matches", requestId, companyId],
    enabled: canRun,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<ConsolidationMatch[]> => {
      // Step 1: fetch the material_ids of THIS request's deposito-eligible items.
      // We only care about items that pass all eligibility filters.
      const { data: thisItems, error: thisErr } = await supabase
        .from("request_items")
        .select("material_id")
        .eq("request_id", requestId!)
        .eq("delivery_target", "deposito")
        .eq("status", "sin_pedir")
        .in("routing", ["pendiente", "cotizacion"])
        .not("material_id", "is", null);

      if (thisErr) throw thisErr;

      const materialIds = [
        ...new Set(
          (thisItems ?? [])
            .map((r: { material_id: string | null }) => r.material_id)
            .filter((id): id is string => !!id),
        ),
      ];

      if (materialIds.length === 0) return [];

      // Step 2: query ALL other eligible pending request_items (same company)
      // that share any of those material_ids.
      // Server-side filters mirror isConsolidationEligible.
      const { data: otherRows, error: otherErr } = await supabase
        .from("request_items")
        .select(
          `id,
           request_id,
           material_id,
           description,
           requests!inner(
             id,
             request_number,
             status,
             company_id
           )`,
        )
        .in("material_id", materialIds)
        .eq("delivery_target", "deposito")
        .eq("status", "sin_pedir")
        .in("routing", ["pendiente", "cotizacion"])
        .eq("requests.status", "pendiente")
        .eq("requests.company_id", companyId!);

      if (otherErr) throw otherErr;

      // Shape the raw rows, excluding the current request itself.
      const rawRows = (otherRows ?? []).map((row: any) => ({
        id: row.id,
        request_id: row.request_id,
        material_id: row.material_id,
        description: row.description,
        requests: row.requests
          ? { id: row.requests.id, request_number: row.requests.request_number }
          : null,
      })) as RawMatchRow[];

      return groupMatchRows(rawRows, requestId!);
    },
  });

  return {
    matches: data ?? [],
    isLoading: canRun ? isLoading : false,
    error: error as Error | null,
  };
}
