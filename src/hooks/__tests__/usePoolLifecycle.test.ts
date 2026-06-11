/**
 * Tests for usePoolLifecycle — GAP4 withdraw/cancel mutations (T07).
 *
 * Strict TDD: written BEFORE the hook implementation.
 *
 * Tests:
 *  1. withdrawFromPool DELETEs own pool_companies row (by pool_id + company_id)
 *  2. cancelPool writes pool_state='cancelado' on purchase_pools (NOT legacy status)
 *  3. Error from Supabase propagates from both mutations
 *
 * No Supabase network calls — mock at the module level.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ---------------------------------------------------------------------------
// Supabase mock — must be declared before the hook import (hoisting rules).
// The factory returns mutable `_deleteResult` / `_updateResult` so tests can
// change them without re-declaring the mock.
// ---------------------------------------------------------------------------

const _deleteMatch = vi.fn();
const _deleteFrom = vi.fn();
const _updateEq = vi.fn();
const _updateFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => {
  const from = vi.fn((table: string) => {
    if (table === 'pool_companies') {
      return {
        delete: () => ({ match: _deleteMatch }),
      };
    }
    if (table === 'purchase_pools') {
      return {
        update: () => ({ eq: _updateEq }),
      };
    }
    return {};
  });
  return { supabase: { from } };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-abc' } }),
}));

vi.mock('@/hooks/useViewRole', () => ({
  useViewRole: () => ({ companyId: 'company-xyz' }),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { usePoolLifecycle } from '../usePoolLifecycle';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const POOL_ID = 'pool-111';
const COMPANY_ID = 'company-xyz';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePoolLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- T1: withdrawFromPool DELETEs pool_companies row ----------------------

  it('withdrawFromPool calls DELETE on pool_companies with pool_id and own company_id', async () => {
    _deleteMatch.mockResolvedValue({ error: null });

    const { result } = renderHook(() => usePoolLifecycle(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.withdrawFromPool(POOL_ID);
    });

    expect(_deleteMatch).toHaveBeenCalledWith({
      pool_id: POOL_ID,
      company_id: COMPANY_ID,
    });
    // MUST NOT write to legacy status column via this path
    expect(_updateEq).not.toHaveBeenCalled();
  });

  // ---- T2: cancelPool writes pool_state='cancelado' (NOT status) -----------

  it('cancelPool writes pool_state=cancelado and does NOT write legacy status', async () => {
    _updateEq.mockResolvedValue({ error: null });

    const { result } = renderHook(() => usePoolLifecycle(), {
      wrapper: makeWrapper(),
    });

    // Capture what update() is called with
    const updateSpy = vi.fn(() => ({ eq: _updateEq }));
    // Re-route supabase.from('purchase_pools').update to our spy
    const { supabase } = await import('@/integrations/supabase/client');
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'purchase_pools') return { update: updateSpy };
      return { delete: () => ({ match: _deleteMatch }) };
    });

    await act(async () => {
      await result.current.cancelPool(POOL_ID);
    });

    // Should be called with pool_state, not status
    expect(updateSpy).toHaveBeenCalledWith({ pool_state: 'cancelado' });
    expect(updateSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: expect.anything() })
    );
    expect(_updateEq).toHaveBeenCalledWith('id', POOL_ID);
  });

  // ---- T3: errors from Supabase propagate ----------------------------------

  it('withdrawFromPool propagates Supabase error', async () => {
    _deleteMatch.mockResolvedValue({ error: { message: 'DB error withdraw' } });

    const { result } = renderHook(() => usePoolLifecycle(), {
      wrapper: makeWrapper(),
    });

    await expect(
      act(async () => {
        await result.current.withdrawFromPool(POOL_ID);
      })
    ).rejects.toThrow('DB error withdraw');
  });

  it('cancelPool propagates Supabase error', async () => {
    _updateEq.mockResolvedValue({ error: { message: 'DB error cancel' } });

    const { result } = renderHook(() => usePoolLifecycle(), {
      wrapper: makeWrapper(),
    });

    await expect(
      act(async () => {
        await result.current.cancelPool(POOL_ID);
      })
    ).rejects.toThrow('DB error cancel');
  });
});
