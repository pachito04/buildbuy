/**
 * Tests for useConsolidacion — focused on createMutation (RPC call + invalidations).
 * Mocks:
 *   - @/integrations/supabase/client (supabase.rpc + supabase.from)
 *   - @/hooks/useAuth (returns a fixed user)
 *   - @/hooks/useUrgencyThreshold (returns a fixed threshold)
 *
 * The eligible-items query is set to return empty so we can focus on the mutation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ConsolidatedLine } from '@/lib/consolidacion-utils';

// ---------------------------------------------------------------------------
// Mocks — factories must NOT reference outer variables (hoisting rules)
// ---------------------------------------------------------------------------

vi.mock('@/integrations/supabase/client', () => {
  const rpc = vi.fn();
  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          not: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
          })),
        })),
      })),
    })),
  }));
  return { supabase: { rpc, from } };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-abc' } }),
}));

vi.mock('@/hooks/useUrgencyThreshold', () => ({
  useUrgencyThreshold: () => 7,
  isUrgente: () => false,
}));

// ---------------------------------------------------------------------------
// Import hook and supabase client AFTER mocks are declared
// ---------------------------------------------------------------------------

import { useConsolidacion } from '../useConsolidacion';
import { supabase } from '@/integrations/supabase/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COMPANY_ID = 'company-xyz';
const FAKE_RFQ_ID = 'fake-rfq-uuid';

function makeWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeLine(overrides: Partial<ConsolidatedLine> = {}): ConsolidatedLine {
  return {
    material_id: 'mat-001',
    description: 'Cemento',
    unit: 'kg',
    totalQuantity: 25,
    sources: [
      {
        request_item_id: 'item-001',
        request_id: 'req-001',
        request_number: 1,
        obra: 'Obra A',
        quantity: 10,
      },
      {
        request_item_id: 'item-002',
        request_id: 'req-002',
        request_number: 2,
        obra: 'Obra B',
        quantity: 15,
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useConsolidacion — createConsolidatedRfq mutation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    // Reset the from mock to return empty eligible items (default happy path for query)
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            not: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  in: vi.fn().mockResolvedValue({ data: [], error: null }),
                })),
              })),
            })),
          })),
        })),
      })),
    } as any);
  });

  // -------------------------------------------------------------------------
  // Happy path: RPC called with correct payload
  // -------------------------------------------------------------------------

  it('calls supabase.rpc("create_consolidated_rfq") with the correct payload', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: FAKE_RFQ_ID, error: null } as any);
    vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(async () => {});

    const { result } = renderHook(
      () => useConsolidacion(COMPANY_ID),
      { wrapper: makeWrapper(queryClient) },
    );

    const line = makeLine();

    await act(async () => {
      result.current.createConsolidatedRfq([line]);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(vi.mocked(supabase.rpc)).toHaveBeenCalledWith('create_consolidated_rfq', {
      p_company_id: COMPANY_ID,
      p_created_by: 'user-abc',
      p_lines: [
        {
          material_id: 'mat-001',
          description: 'Cemento',
          unit: 'kg',
          total_quantity: 25,
          sources: [
            { request_item_id: 'item-001', request_id: 'req-001', quantity: 10 },
            { request_item_id: 'item-002', request_id: 'req-002', quantity: 15 },
          ],
        },
      ],
    });
  });

  // -------------------------------------------------------------------------
  // Happy path: invalidations fired on success
  // -------------------------------------------------------------------------

  it('invalidates ["rfqs"] and the consolidacion-eligible query key on success', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: FAKE_RFQ_ID, error: null } as any);
    const invalidateSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation(async () => {});

    const { result } = renderHook(
      () => useConsolidacion(COMPANY_ID),
      { wrapper: makeWrapper(queryClient) },
    );

    await act(async () => {
      result.current.createConsolidatedRfq([makeLine()]);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    const calledKeys = invalidateSpy.mock.calls.map(call => call[0]);

    const rfqsInvalidated = calledKeys.some(
      arg =>
        Array.isArray((arg as any)?.queryKey) && (arg as any).queryKey[0] === 'rfqs',
    );
    const eligibleInvalidated = calledKeys.some(
      arg =>
        Array.isArray((arg as any)?.queryKey) &&
        (arg as any).queryKey[0] === 'consolidacion-eligible' &&
        (arg as any).queryKey[1] === COMPANY_ID,
    );

    expect(rfqsInvalidated, 'Should invalidate ["rfqs"] key').toBe(true);
    expect(eligibleInvalidated, 'Should invalidate consolidacion-eligible key').toBe(true);
  });

  // -------------------------------------------------------------------------
  // Error propagation — generic DB error
  // -------------------------------------------------------------------------

  it('propagates error when supabase.rpc returns an error object', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: 'db error' },
    } as any);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(
      () => useConsolidacion(COMPANY_ID),
      { wrapper: makeWrapper(queryClient) },
    );

    await act(async () => {
      result.current.createConsolidatedRfq([makeLine()]);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // onError handler in the hook logs the error
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[useConsolidacion] createConsolidatedRfq failed:',
      expect.any(String),
    );

    consoleErrorSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Error propagation — race condition (item already consolidated)
  // -------------------------------------------------------------------------

  it('exposes createError with the RPC message when a race-condition error occurs', async () => {
    const RACE_MSG =
      'Uno o más ítems ya fueron incluidos en otra cotización consolidada. Refrescá la pantalla.';

    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: RACE_MSG, code: 'P0001' },
    } as any);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(
      () => useConsolidacion(COMPANY_ID),
      { wrapper: makeWrapper(queryClient) },
    );

    // createError starts null before any mutation
    expect(result.current.createError).toBeNull();

    await act(async () => {
      result.current.createConsolidatedRfq([makeLine()]);
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // createError must carry the RPC error message
    expect(result.current.createError).not.toBeNull();
    expect(result.current.createError?.message).toBe(RACE_MSG);

    // onError still logs (backward-compatible)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[useConsolidacion] createConsolidatedRfq failed:',
      RACE_MSG,
    );

    consoleErrorSpy.mockRestore();
  });
});
