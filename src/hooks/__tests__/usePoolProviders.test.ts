/**
 * Tests for usePoolProviders — GAP3 manual provider selection per pool (T21).
 *
 * Strict TDD: written BEFORE the hook implementation.
 *
 * Tests:
 *  1. candidateProviders query uses .or("company_id.eq.${myCompanyId},company_id.is.null")
 *  2. selectProvider(providerId) → INSERT called with correct payload including selected_by_company_id
 *  3. deselectProvider(providerId) → DELETE called with correct match predicate
 *  4. Error from INSERT/DELETE propagates
 *
 * No Supabase network calls — mock at module level.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ---------------------------------------------------------------------------
// Mutable mock internals — tests can reconfigure per-test
// ---------------------------------------------------------------------------

const _providersOr = vi.fn();
const _poolProvidersInsert = vi.fn();
const _poolProvidersDeleteMatch = vi.fn();
const _poolProvidersSelect = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const from = vi.fn((table: string) => {
    if (table === "providers") {
      return {
        select: vi.fn().mockReturnValue({
          or: _providersOr,
        }),
      };
    }
    if (table === "pool_providers") {
      return {
        insert: _poolProvidersInsert,
        delete: vi.fn().mockReturnValue({
          match: _poolProvidersDeleteMatch,
        }),
        select: vi.fn().mockReturnValue({
          eq: _poolProvidersSelect,
        }),
      };
    }
    return {};
  });
  return { supabase: { from } };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-abc" } }),
}));

vi.mock("@/hooks/useViewRole", () => ({
  useViewRole: () => ({ companyId: "company-mine" }),
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------

import { usePoolProviders } from "../usePoolProviders";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const POOL_ID = "pool-111";
const COMPANY_ID = "company-mine";
const PROVIDER_ID = "provider-aaa";

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("usePoolProviders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: candidateProviders query resolves with 2 providers (one own, one global)
    _providersOr.mockResolvedValue({
      data: [
        { id: "provider-aaa", name: "Provider A", company_id: COMPANY_ID },
        { id: "provider-bbb", name: "Global Provider", company_id: null },
      ],
      error: null,
    });
    // Default: pool_providers select resolves empty (no pre-selection)
    _poolProvidersSelect.mockResolvedValue({ data: [], error: null });
    // Default: insert and delete resolve ok
    _poolProvidersInsert.mockResolvedValue({ data: null, error: null });
    _poolProvidersDeleteMatch.mockResolvedValue({ error: null });
  });

  // ---- T1: candidateProviders query uses or() with own + null company_id -----

  it("candidateProviders query uses or with own company_id and is.null", async () => {
    const { result } = renderHook(() => usePoolProviders(POOL_ID), {
      wrapper: makeWrapper(),
    });

    // Allow query to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // The or() must have been called with the correct filter string
    expect(_providersOr).toHaveBeenCalledWith(
      `company_id.eq.${COMPANY_ID},company_id.is.null`
    );
  });

  it("candidateProviders returns both own and global providers", async () => {
    const { result } = renderHook(() => usePoolProviders(POOL_ID), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.candidateProviders).toHaveLength(2);
    expect(result.current.candidateProviders[0].id).toBe("provider-aaa");
    expect(result.current.candidateProviders[1].id).toBe("provider-bbb");
  });

  // ---- T2: selectProvider → INSERT with correct payload ---------------------

  it("selectProvider inserts into pool_providers with correct payload including selected_by_company_id", async () => {
    const { result } = renderHook(() => usePoolProviders(POOL_ID), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.selectProvider(PROVIDER_ID);
    });

    expect(_poolProvidersInsert).toHaveBeenCalledWith({
      pool_id: POOL_ID,
      provider_id: PROVIDER_ID,
      selected_by_company_id: COMPANY_ID,
    });
  });

  it("selectProvider does NOT include any other company's id in the payload", async () => {
    const { result } = renderHook(() => usePoolProviders(POOL_ID), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.selectProvider(PROVIDER_ID);
    });

    const call = (_poolProvidersInsert as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Record<string, unknown>;
    expect(call.selected_by_company_id).toBe(COMPANY_ID);
    expect(call.pool_id).toBe(POOL_ID);
    expect(call.provider_id).toBe(PROVIDER_ID);
  });

  // ---- T3: deselectProvider → DELETE with correct match predicate -----------

  it("deselectProvider calls DELETE with pool_id, provider_id, and selected_by_company_id = own company", async () => {
    const { result } = renderHook(() => usePoolProviders(POOL_ID), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.deselectProvider(PROVIDER_ID);
    });

    expect(_poolProvidersDeleteMatch).toHaveBeenCalledWith({
      pool_id: POOL_ID,
      provider_id: PROVIDER_ID,
      selected_by_company_id: COMPANY_ID,
    });
  });

  // ---- T4: errors from INSERT/DELETE propagate --------------------------------

  it("selectProvider propagates Supabase error", async () => {
    _poolProvidersInsert.mockResolvedValue({
      data: null,
      error: { message: "RLS violation" },
    });

    const { result } = renderHook(() => usePoolProviders(POOL_ID), {
      wrapper: makeWrapper(),
    });

    await expect(
      act(async () => {
        await result.current.selectProvider(PROVIDER_ID);
      })
    ).rejects.toThrow("RLS violation");
  });

  it("deselectProvider propagates Supabase error", async () => {
    _poolProvidersDeleteMatch.mockResolvedValue({
      error: { message: "DELETE forbidden" },
    });

    const { result } = renderHook(() => usePoolProviders(POOL_ID), {
      wrapper: makeWrapper(),
    });

    await expect(
      act(async () => {
        await result.current.deselectProvider(PROVIDER_ID);
      })
    ).rejects.toThrow("DELETE forbidden");
  });
});
