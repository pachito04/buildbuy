/**
 * Tests for PoolProvidersPanel — GAP3 provider selection UI (T25).
 *
 * Strict TDD: written BEFORE the component implementation.
 *
 * Tests:
 *  1. Both candidate providers (one own, one global) are rendered with checkboxes.
 *  2. Checking a provider → selectProvider called with correct id.
 *  3. Unchecking → deselectProvider called.
 *  4. Already-selected provider (in consolidated pool_providers) is rendered as checked.
 *
 * Strategy: mock usePoolProviders; test component rendering and interaction only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Mock usePoolProviders — mutable so tests can reconfigure
// ---------------------------------------------------------------------------

const mockSelectProvider = vi.fn().mockResolvedValue(undefined);
const mockDeselectProvider = vi.fn().mockResolvedValue(undefined);

const mockUsePoolProviders = vi.fn();

vi.mock("@/hooks/usePoolProviders", () => ({
  usePoolProviders: (poolId: string) => mockUsePoolProviders(poolId),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------

import { PoolProvidersPanel } from "../PoolProvidersPanel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const POOL_ID = "pool-111";
const COMPANY_ID = "company-mine";

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

function setupDefaultMock(selectedProviderIds: string[] = []) {
  mockUsePoolProviders.mockReturnValue({
    candidateProviders: [
      { id: "provider-aaa", name: "Provider A", company_id: COMPANY_ID },
      { id: "provider-bbb", name: "Global Provider", company_id: null },
    ],
    poolProviders: selectedProviderIds.map((pid) => ({
      provider_id: pid,
      selected_by_company_id: COMPANY_ID,
    })),
    isLoadingCandidates: false,
    isLoadingPoolProviders: false,
    selectProvider: mockSelectProvider,
    isSelecting: false,
    deselectProvider: mockDeselectProvider,
    isDeselecting: false,
  });
}

function renderPanel() {
  return render(
    <PoolProvidersPanel poolId={POOL_ID} companyId={COMPANY_ID} />,
    { wrapper: makeWrapper() }
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PoolProvidersPanel (T25/T26 — GAP3 provider selection UI)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectProvider.mockResolvedValue(undefined);
    mockDeselectProvider.mockResolvedValue(undefined);
  });

  // ---- T1: Both candidates rendered with checkboxes -------------------------

  it("renders both candidate providers (own and global)", () => {
    setupDefaultMock([]);
    renderPanel();

    expect(screen.getByText("Provider A")).toBeInTheDocument();
    expect(screen.getByText("Global Provider")).toBeInTheDocument();
  });

  it("renders checkboxes for each candidate provider", () => {
    setupDefaultMock([]);
    renderPanel();

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
  });

  // ---- T2: Checking a provider → selectProvider called ----------------------

  it("checking an unselected provider calls selectProvider with the correct id", async () => {
    setupDefaultMock([]); // nothing pre-selected
    renderPanel();

    const checkboxes = screen.getAllByRole("checkbox");
    // First checkbox corresponds to Provider A (provider-aaa)
    fireEvent.click(checkboxes[0]);

    await waitFor(() => {
      expect(mockSelectProvider).toHaveBeenCalledWith("provider-aaa");
    });
    expect(mockDeselectProvider).not.toHaveBeenCalled();
  });

  it("checking global provider calls selectProvider with the global provider id", async () => {
    setupDefaultMock([]);
    renderPanel();

    const checkboxes = screen.getAllByRole("checkbox");
    // Second checkbox corresponds to Global Provider (provider-bbb)
    fireEvent.click(checkboxes[1]);

    await waitFor(() => {
      expect(mockSelectProvider).toHaveBeenCalledWith("provider-bbb");
    });
  });

  // ---- T3: Unchecking → deselectProvider called -----------------------------

  it("unchecking an already-selected provider calls deselectProvider with the correct id", async () => {
    // Pre-select provider-aaa
    setupDefaultMock(["provider-aaa"]);
    renderPanel();

    const checkboxes = screen.getAllByRole("checkbox");
    // First checkbox (Provider A) is checked — clicking it unchecks
    fireEvent.click(checkboxes[0]);

    await waitFor(() => {
      expect(mockDeselectProvider).toHaveBeenCalledWith("provider-aaa");
    });
    expect(mockSelectProvider).not.toHaveBeenCalled();
  });

  // ---- T4: Already-selected provider is rendered as checked -----------------

  it("provider present in consolidated pool_providers is rendered as checked", () => {
    // provider-aaa is already in the pool selection
    setupDefaultMock(["provider-aaa"]);
    renderPanel();

    const checkboxes = screen.getAllByRole("checkbox");
    // First checkbox (Provider A) should be checked
    expect(checkboxes[0]).toBeChecked();
    // Second checkbox (Global Provider) should NOT be checked
    expect(checkboxes[1]).not.toBeChecked();
  });

  it("both providers pre-selected renders both checkboxes as checked", () => {
    setupDefaultMock(["provider-aaa", "provider-bbb"]);
    renderPanel();

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeChecked();
  });

  it("no providers selected renders all checkboxes as unchecked", () => {
    setupDefaultMock([]);
    renderPanel();

    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((cb) => expect(cb).not.toBeChecked());
  });
});
