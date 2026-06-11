/**
 * usePoolLifecycle.ts
 *
 * GAP4 — withdraw/cancel pool state transitions.
 *
 * Mutations:
 *  - withdrawFromPool(poolId): DELETE own pool_companies row.
 *    Allowed only in 'borrador' state (DB trigger trg_pool_companies_withdraw_guard
 *    is the hard guard; UI only offers the action when pool_state='borrador').
 *    If the caller is the pool creator and no other members remain, the DB-side
 *    trigger handles the state transition (or the caller may do it explicitly —
 *    per design the UI calls cancelPool afterward if needed).
 *
 *  - cancelPool(poolId): UPDATE purchase_pools SET pool_state='cancelado'.
 *    DB trigger trg_purchase_pools_state_guard blocks cancel from cerrado/cancelado.
 *    NEVER writes the legacy status column.
 *
 * Both mutations invalidate the pools query on success.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useViewRole } from '@/hooks/useViewRole';

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UsePoolLifecycleResult {
  /** DELETE the caller's own pool_companies row. Only allowed when pool_state='borrador'. */
  withdrawFromPool: (poolId: string) => Promise<void>;
  isWithdrawing: boolean;

  /** SET pool_state='cancelado' on the pool. Never writes legacy status. */
  cancelPool: (poolId: string) => Promise<void>;
  isCancelling: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePoolLifecycle(): UsePoolLifecycleResult {
  const { companyId } = useViewRole();
  const qc = useQueryClient();

  // ---- withdrawFromPool ----------------------------------------------------

  const withdrawMutation = useMutation({
    mutationFn: async ({ poolId }: { poolId: string }) => {
      if (!companyId) throw new Error('No company_id');

      const { error } = await supabase
        .from('pool_companies')
        .delete()
        .match({ pool_id: poolId, company_id: companyId });

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pools'] });
    },
  });

  // ---- cancelPool ----------------------------------------------------------

  const cancelMutation = useMutation({
    mutationFn: async ({ poolId }: { poolId: string }) => {
      const { error } = await supabase
        .from('purchase_pools')
        .update({ pool_state: 'cancelado' })
        .eq('id', poolId);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pools'] });
    },
  });

  // ---- Public surface ------------------------------------------------------

  return {
    withdrawFromPool: async (poolId) => {
      await withdrawMutation.mutateAsync({ poolId });
    },
    isWithdrawing: withdrawMutation.isPending,

    cancelPool: async (poolId) => {
      await cancelMutation.mutateAsync({ poolId });
    },
    isCancelling: cancelMutation.isPending,
  };
}
