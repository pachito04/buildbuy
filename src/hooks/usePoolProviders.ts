/**
 * usePoolProviders.ts
 *
 * GAP3 — Manual provider selection per pool.
 *
 * Responsibilities:
 *  - candidateProviders  — providers eligible for selection: own (company_id = viewer's company)
 *                          union global (company_id IS NULL). RLS providers_tenant already
 *                          enforces this from the server side.
 *  - poolProviders       — consolidated member-wide selection for this pool
 *                          (which providers have been brought to the pool by any member).
 *  - selectProvider      — INSERT {pool_id, provider_id, selected_by_company_id} into pool_providers.
 *  - deselectProvider    — DELETE WHERE pool_id + provider_id + selected_by_company_id = own company.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewRole } from "@/hooks/useViewRole";

// ---------------------------------------------------------------------------
// Row-shape helpers
// ---------------------------------------------------------------------------

export interface ProviderRow {
  id: string;
  name: string;
  company_id: string | null;
}

export interface PoolProviderSelectionRow {
  provider_id: string;
  selected_by_company_id: string;
}

// ---------------------------------------------------------------------------
// Query key factories
// ---------------------------------------------------------------------------

const candidateProvidersKey = (companyId: string | null) =>
  ["candidate-providers", companyId] as const;

const poolProvidersKey = (poolId: string | null) =>
  ["pool-providers", poolId] as const;

// ---------------------------------------------------------------------------
// Hook result type
// ---------------------------------------------------------------------------

export interface UsePoolProvidersResult {
  /** Providers eligible for the viewer's company to select: own + global. */
  candidateProviders: ProviderRow[];
  /** Consolidated member-wide selection for this pool (any member's selections). */
  poolProviders: PoolProviderSelectionRow[];
  isLoadingCandidates: boolean;
  isLoadingPoolProviders: boolean;

  /** Add a provider to this pool on behalf of the viewer's company. */
  selectProvider: (providerId: string) => Promise<void>;
  isSelecting: boolean;

  /** Remove a provider from this pool (own company's selection only). */
  deselectProvider: (providerId: string) => Promise<void>;
  isDeselecting: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePoolProviders(poolId: string | null): UsePoolProvidersResult {
  const { user } = useAuth();
  const { companyId } = useViewRole();
  const qc = useQueryClient();

  // ---- candidateProviders query ---------------------------------------------
  // own providers (company_id = mine) ∪ global providers (company_id IS NULL)
  // RLS providers_tenant already enforces this server-side; .or() is belt-and-
  // suspenders from the client to avoid fetching unrelated tenant providers if
  // the RLS policy were to relax in the future.

  const {
    data: candidateProviders,
    isLoading: isLoadingCandidates,
  } = useQuery({
    queryKey: candidateProvidersKey(companyId),
    enabled: !!companyId,
    queryFn: async (): Promise<ProviderRow[]> => {
      const { data, error } = await supabase
        .from("providers")
        .select("id,name,company_id")
        .or(`company_id.eq.${companyId},company_id.is.null`);
      if (error) throw error;
      return (data ?? []) as ProviderRow[];
    },
  });

  // ---- poolProviders query (consolidated member-wide selection) -------------

  const {
    data: poolProviders,
    isLoading: isLoadingPoolProviders,
  } = useQuery({
    queryKey: poolProvidersKey(poolId),
    enabled: !!poolId,
    queryFn: async (): Promise<PoolProviderSelectionRow[]> => {
      if (!poolId) return [];
      const { data, error } = await supabase
        .from("pool_providers")
        .select("provider_id, selected_by_company_id")
        .eq("pool_id", poolId);
      if (error) throw error;
      return (data ?? []) as PoolProviderSelectionRow[];
    },
  });

  // ---- selectProvider mutation ----------------------------------------------

  const selectMutation = useMutation({
    mutationFn: async ({ providerId }: { providerId: string }) => {
      if (!companyId) throw new Error("No company_id");
      if (!poolId) throw new Error("No poolId");

      const { error } = await supabase.from("pool_providers").insert({
        pool_id: poolId,
        provider_id: providerId,
        selected_by_company_id: companyId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: poolProvidersKey(poolId) });
    },
    onError: (e: Error) => {
      console.error("[usePoolProviders] selectProvider failed:", e.message);
    },
  });

  // ---- deselectProvider mutation --------------------------------------------

  const deselectMutation = useMutation({
    mutationFn: async ({ providerId }: { providerId: string }) => {
      if (!companyId) throw new Error("No company_id");
      if (!poolId) throw new Error("No poolId");

      const { error } = await supabase
        .from("pool_providers")
        .delete()
        .match({
          pool_id: poolId,
          provider_id: providerId,
          selected_by_company_id: companyId,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: poolProvidersKey(poolId) });
    },
    onError: (e: Error) => {
      console.error("[usePoolProviders] deselectProvider failed:", e.message);
    },
  });

  // ---- Public surface -------------------------------------------------------

  return {
    candidateProviders: candidateProviders ?? [],
    poolProviders: poolProviders ?? [],
    isLoadingCandidates,
    isLoadingPoolProviders,

    selectProvider: async (providerId) => {
      await selectMutation.mutateAsync({ providerId });
    },
    isSelecting: selectMutation.isPending,

    deselectProvider: async (providerId) => {
      await deselectMutation.mutateAsync({ providerId });
    },
    isDeselecting: deselectMutation.isPending,
  };
}
