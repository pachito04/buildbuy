/**
 * usePoolFlow.ts
 *
 * Data and mutations for the interempresa pool flow (#9b — Slice 2).
 *
 * Responsibilities:
 *  - addMyRequirements   — insert pool_requests for the viewer's own eligible requests (RLS enforces own-only). Never writes requests.status.
 *  - consolidate         — fetch viewer's own contributed request_items, get viewer's usable material mappings,
 *                          run crossPoolItems, upsert pool_item_contributions, maintain pool_items.total_quantity.
 *  - confirmParticipation — set pool_companies.status='active'; if ALL companies are active → pool_state='confirmado'.
 *  - generateSharedRfq   — build one rfqs row (rfq_type='pool', pool_id) + rfq_items from pool_items; set pool_state='en_comparativa'.
 *  - queries             — pool_items + pool_item_contributions for a pool (member-visible).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewRole } from "@/hooks/useViewRole";
import { crossPoolItems } from "@/lib/pool-cross-utils";
import type { PoolEligibleItem, Mapping } from "@/lib/pool-cross-utils";

// ---------------------------------------------------------------------------
// Query key factories
// ---------------------------------------------------------------------------

const poolItemsKey = (poolId: string | null) =>
  ["pool-items", poolId] as const;

const poolContributionsKey = (poolId: string | null) =>
  ["pool-item-contributions", poolId] as const;

// ---------------------------------------------------------------------------
// Row-shape helpers (inferred from the Supabase types)
// ---------------------------------------------------------------------------

interface PoolItemRow {
  id: string;
  pool_id: string;
  material_id: string | null;
  description: string;
  unit: string;
  total_quantity: number;
}

interface PoolItemContributionRow {
  id: string;
  pool_item_id: string;
  company_id: string;
  quantity: number;
}

// ---------------------------------------------------------------------------
// Hook result type
// ---------------------------------------------------------------------------

export interface UsePoolFlowResult {
  /** Consolidated items for the pool (member-visible). */
  poolItems: PoolItemRow[];
  /** Per-company contribution rows for the pool (member-visible). */
  contributions: PoolItemContributionRow[];
  isLoadingItems: boolean;
  itemsError: Error | null;

  /** Insert pool_requests for the viewer's OWN requests. Never writes requests.status. */
  addMyRequirements: (poolId: string, requestIds: string[]) => Promise<void>;
  isAddingRequirements: boolean;

  /**
   * Gather viewer's own contributed request_items for this pool,
   * get viewer's usable material mappings, run crossPoolItems,
   * upsert pool_item_contributions, recompute pool_items.total_quantity.
   */
  consolidate: (poolId: string) => Promise<void>;
  isConsolidating: boolean;

  /** Set pool_companies.status='active'; if all companies active → pool_state='confirmado'. */
  confirmParticipation: (poolId: string) => Promise<void>;
  isConfirming: boolean;

  /** Create shared rfq from pool_items; set pool_state='en_comparativa'. */
  generateSharedRfq: (poolId: string) => Promise<string>;
  isGeneratingRfq: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePoolFlow(poolId: string | null): UsePoolFlowResult {
  const { user } = useAuth();
  const { companyId } = useViewRole();
  const qc = useQueryClient();

  // ---- pool_items query -----------------------------------------------------

  const {
    data: poolItems,
    isLoading: isLoadingItems,
    error: itemsError,
  } = useQuery({
    queryKey: poolItemsKey(poolId),
    enabled: !!poolId,
    queryFn: async (): Promise<PoolItemRow[]> => {
      const { data, error } = await supabase
        .from("pool_items")
        .select("id, pool_id, material_id, description, unit, total_quantity")
        .eq("pool_id", poolId!);
      if (error) throw error;
      return (data ?? []) as PoolItemRow[];
    },
  });

  // ---- pool_item_contributions query ----------------------------------------

  const { data: contributions } = useQuery({
    queryKey: poolContributionsKey(poolId),
    enabled: !!poolId,
    queryFn: async (): Promise<PoolItemContributionRow[]> => {
      if (!poolId) return [];
      // Join through pool_items to filter by pool_id
      const { data, error } = await supabase
        .from("pool_item_contributions")
        .select(
          `id, pool_item_id, company_id, quantity,
           pool_items!inner(pool_id)`
        )
        .eq("pool_items.pool_id", poolId);
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        id: row.id,
        pool_item_id: row.pool_item_id,
        company_id: row.company_id,
        quantity: row.quantity,
      }));
    },
  });

  // ---- addMyRequirements mutation -------------------------------------------

  const addRequirementsMutation = useMutation({
    mutationFn: async ({
      poolId,
      requestIds,
    }: {
      poolId: string;
      requestIds: string[];
    }) => {
      if (!requestIds.length) return;

      const inserts = requestIds.map((rid) => ({
        pool_id: poolId,
        request_id: rid,
      }));

      const { error } = await supabase.from("pool_requests").insert(inserts);
      if (error) throw error;
      // NOTE: intentionally NOT writing requests.status='in_pool' (AD-6).
    },
    onSuccess: (_data, { poolId }) => {
      qc.invalidateQueries({ queryKey: ["pools"] });
      qc.invalidateQueries({ queryKey: poolItemsKey(poolId) });
    },
    onError: (e: Error) => {
      console.error("[usePoolFlow] addMyRequirements failed:", e.message);
    },
  });

  // ---- consolidate mutation --------------------------------------------------

  const consolidateMutation = useMutation({
    mutationFn: async ({ poolId }: { poolId: string }) => {
      if (!companyId) throw new Error("No company_id");

      // Step 1: Fetch the viewer's own pool_requests for this pool.
      // RLS on pool_requests guarantees only the viewer's own requests are returned.
      const { data: poolRequestRows, error: prErr } = await supabase
        .from("pool_requests")
        .select("request_id")
        .eq("pool_id", poolId);
      if (prErr) throw prErr;

      const myRequestIds = (poolRequestRows ?? []).map(
        (r: { request_id: string }) => r.request_id
      );

      if (myRequestIds.length === 0) {
        // Nothing contributed yet — nothing to consolidate.
        return;
      }

      // Step 2: Fetch request_items from those requests that are pool-eligible.
      // Eligible: material_id not null, item status = sin_pedir, request status = pendiente,
      // delivery_target = deposito — mirrors useConsolidacion's pattern.
      const { data: itemRows, error: itemErr } = await supabase
        .from("request_items")
        .select(
          `id, description, unit, quantity, material_id,
           requests!inner(id, status, company_id)`
        )
        .in("request_id", myRequestIds)
        .eq("status", "sin_pedir")
        .not("material_id", "is", null)
        .eq("requests.status", "pendiente")
        .eq("requests.company_id", companyId)
        .eq("delivery_target", "deposito");
      if (itemErr) throw itemErr;

      const eligibleItems: PoolEligibleItem[] = (itemRows ?? [])
        .filter((row: any) => row.material_id != null)
        .map((row: any) => ({
          company_id: companyId,
          material_id: row.material_id as string,
          description: row.description as string,
          unit: row.unit as string,
          quantity: row.quantity as number,
        }));

      // Step 3: Fetch the viewer's usable material mappings.
      // Usable = both confirmed, on an active company_link.
      const { data: mappingRows, error: mapErr } = await supabase
        .from("material_mappings")
        .select(
          `material_a_id, material_b_id,
           confirmed_by_requester, confirmed_by_target,
           company_links!inner(status)`
        )
        .eq("confirmed_by_requester", true)
        .eq("confirmed_by_target", true)
        .eq("company_links.status", "active");
      if (mapErr) throw mapErr;

      const usableMappings: Mapping[] = (mappingRows ?? []).map(
        (row: any) => ({
          material_a_id: row.material_a_id as string,
          material_b_id: row.material_b_id as string,
          usable: true, // already filtered: both confirmed + active link
        })
      );

      // Step 4: Cross-consolidate using the pure util.
      const consolidated = crossPoolItems(eligibleItems, usableMappings);

      // Step 5: For each consolidated line, ensure a pool_items row exists
      //         (find-or-create by pool_id + material_id), then upsert
      //         pool_item_contributions, then recompute total_quantity.
      for (const line of consolidated) {
        const canonicalMaterialId = line.canonicalMaterialId;

        // Find-or-create pool_items row for this canonical material.
        let poolItemId: string;

        const { data: existingItems, error: findErr } = await supabase
          .from("pool_items")
          .select("id")
          .eq("pool_id", poolId)
          .eq("material_id", canonicalMaterialId)
          .limit(1);
        if (findErr) throw findErr;

        if (existingItems && existingItems.length > 0) {
          poolItemId = (existingItems[0] as { id: string }).id;
        } else {
          // Insert a new pool_items row with our quantity as initial total.
          const { data: newItem, error: insertErr } = await supabase
            .from("pool_items")
            .insert({
              pool_id: poolId,
              material_id: canonicalMaterialId,
              description: line.description,
              unit: line.unit,
              total_quantity: line.totalQuantity,
            })
            .select("id")
            .single();
          if (insertErr) throw insertErr;
          poolItemId = (newItem as { id: string }).id;
        }

        // Upsert the viewer's own contribution for this pool_item.
        // ON CONFLICT (pool_item_id, company_id) → update quantity.
        const { error: upsertErr } = await supabase
          .from("pool_item_contributions")
          .upsert(
            {
              pool_item_id: poolItemId,
              company_id: companyId,
              quantity: line.totalQuantity,
            },
            { onConflict: "pool_item_id,company_id" }
          );
        if (upsertErr) throw upsertErr;

        // Recompute pool_items.total_quantity = sum of all contributions for this pool_item.
        // All member contributions are visible (RLS: member of the pool).
        const { data: contribRows, error: sumErr } = await supabase
          .from("pool_item_contributions")
          .select("quantity")
          .eq("pool_item_id", poolItemId);
        if (sumErr) throw sumErr;

        const newTotal = (contribRows ?? []).reduce(
          (acc: number, r: { quantity: number }) => acc + r.quantity,
          0
        );

        const { error: updateErr } = await supabase
          .from("pool_items")
          .update({ total_quantity: newTotal })
          .eq("id", poolItemId);
        if (updateErr) throw updateErr;
      }
    },
    onSuccess: (_data, { poolId }) => {
      qc.invalidateQueries({ queryKey: poolItemsKey(poolId) });
      qc.invalidateQueries({ queryKey: poolContributionsKey(poolId) });
      qc.invalidateQueries({ queryKey: ["pools"] });
    },
    onError: (e: Error) => {
      console.error("[usePoolFlow] consolidate failed:", e.message);
    },
  });

  // ---- confirmParticipation mutation ----------------------------------------

  const confirmMutation = useMutation({
    mutationFn: async ({ poolId }: { poolId: string }) => {
      if (!companyId) throw new Error("No company_id");

      // Set the viewer's pool_companies row to 'active'.
      // RLS pool_companies_own_update: only own row (company_id = viewer's company).
      const { error: updateErr } = await supabase
        .from("pool_companies")
        .update({ status: "active" })
        .eq("pool_id", poolId)
        .eq("company_id", companyId);
      if (updateErr) throw updateErr;

      // Check if ALL companies in the pool are now active.
      const { data: allCompanies, error: fetchErr } = await supabase
        .from("pool_companies")
        .select("status")
        .eq("pool_id", poolId);
      if (fetchErr) throw fetchErr;

      const rows = (allCompanies ?? []) as { status: string }[];
      const allActive =
        rows.length > 0 && rows.every((r) => r.status === "active");

      if (allActive) {
        const { error: stateErr } = await supabase
          .from("purchase_pools")
          .update({ pool_state: "confirmado" })
          .eq("id", poolId);
        if (stateErr) throw stateErr;
      }
    },
    onSuccess: (_data, { poolId }) => {
      qc.invalidateQueries({ queryKey: ["pools"] });
      qc.invalidateQueries({ queryKey: poolItemsKey(poolId) });
    },
    onError: (e: Error) => {
      console.error("[usePoolFlow] confirmParticipation failed:", e.message);
    },
  });

  // ---- generateSharedRfq mutation -------------------------------------------

  const generateRfqMutation = useMutation({
    mutationFn: async ({ poolId }: { poolId: string }): Promise<string> => {
      if (!companyId) throw new Error("No company_id");
      if (!user?.id) throw new Error("Not authenticated");

      // Fetch the pool's consolidated items.
      const { data: items, error: itemsErr } = await supabase
        .from("pool_items")
        .select("id, description, unit, total_quantity, material_id")
        .eq("pool_id", poolId);
      if (itemsErr) throw itemsErr;

      const poolItemRows = (items ?? []) as PoolItemRow[];

      if (poolItemRows.length === 0) {
        throw new Error(
          "Cannot generate RFQ: no consolidated items in the pool."
        );
      }

      // Create the shared RFQ.
      // rfq_type='pool' is cast via any (free-text column per consolidacion pattern).
      const { data: rfq, error: rfqErr } = await supabase
        .from("rfqs")
        .insert({
          company_id: companyId,
          created_by: user.id,
          status: "sent",
          pool_id: poolId,
          rfq_type: "pool",
        } as any)
        .select("id")
        .single();
      if (rfqErr) throw rfqErr;

      const rfqId = (rfq as { id: string }).id;

      // Insert rfq_items — one per consolidated pool_items line.
      const rfqItemsPayload = poolItemRows.map((item) => ({
        rfq_id: rfqId,
        description: item.description,
        quantity: item.total_quantity,
        unit: item.unit,
        material_id: item.material_id,
      }));

      const { error: rfqItemsErr } = await supabase
        .from("rfq_items")
        .insert(rfqItemsPayload);
      if (rfqItemsErr) throw rfqItemsErr;

      // Advance pool_state to 'en_comparativa'.
      const { error: stateErr } = await supabase
        .from("purchase_pools")
        .update({ pool_state: "en_comparativa" })
        .eq("id", poolId);
      if (stateErr) throw stateErr;

      return rfqId;
    },
    onSuccess: (_rfqId, { poolId }) => {
      qc.invalidateQueries({ queryKey: ["pools"] });
      qc.invalidateQueries({ queryKey: ["rfqs"] });
      qc.invalidateQueries({ queryKey: poolItemsKey(poolId) });
    },
    onError: (e: Error) => {
      console.error("[usePoolFlow] generateSharedRfq failed:", e.message);
    },
  });

  // ---- Public surface -------------------------------------------------------

  return {
    poolItems: poolItems ?? [],
    contributions: contributions ?? [],
    isLoadingItems,
    itemsError: itemsError as Error | null,

    addMyRequirements: async (poolId, requestIds) => {
      await addRequirementsMutation.mutateAsync({ poolId, requestIds });
    },
    isAddingRequirements: addRequirementsMutation.isPending,

    consolidate: async (poolId) => {
      await consolidateMutation.mutateAsync({ poolId });
    },
    isConsolidating: consolidateMutation.isPending,

    confirmParticipation: async (poolId) => {
      await confirmMutation.mutateAsync({ poolId });
    },
    isConfirming: confirmMutation.isPending,

    generateSharedRfq: async (poolId) => {
      return await generateRfqMutation.mutateAsync({ poolId });
    },
    isGeneratingRfq: generateRfqMutation.isPending,
  };
}
