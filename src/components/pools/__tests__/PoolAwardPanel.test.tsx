/**
 * PoolAwardPanel.test.tsx
 *
 * T17 — PoolAwardPanel renders Mode A (leader) or Mode B (per_company) based
 *        on awardMode from usePoolAward.
 *
 * T17 is RED until T18 implements conditional rendering in PoolAwardPanel.tsx.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Hoisted mocks (must be before any imports that use the mocked modules)
// ---------------------------------------------------------------------------
const mockUsePoolAward = vi.fn();

vi.mock("@/hooks/usePoolAward", () => ({
  usePoolAward: (...args: unknown[]) => mockUsePoolAward(...args),
}));

vi.mock("@/hooks/usePoolLifecycle", () => ({
  usePoolLifecycle: () => ({
    withdrawFromPool: vi.fn(),
    isWithdrawing: false,
    cancelPool: vi.fn(),
    isCancelling: false,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Mock supabase (PoolAwardPanel imports it dynamically for provider names & OC status)
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: () => ({ then: (cb: any) => cb({ data: [], error: null }) }),
        eq: () => ({
          then: (cb: any) => cb({ data: [], error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
          limit: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
        limit: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
    rpc: () => ({ then: (cb: any) => cb({ data: null, error: null }) }),
  },
}));

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------
import { PoolAwardPanel } from "../PoolAwardPanel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const BASE_HOOK_RETURN = {
  poolRfq: null,
  quotes: [],
  poolItems: [],
  contributions: [],
  winningQuoteId: null,
  isLoading: false,
  error: null,
  adjudicate: vi.fn(),
  isAdjudicating: false,
  confirmMyAward: vi.fn(),
  isConfirmingAward: false,
  generateMyOc: vi.fn(),
  isGeneratingOc: false,
};

function renderPanel(
  awardMode: "leader" | "per_company" = "leader",
  poolState: "en_comparativa" | "adjudicado" | "cerrado" = "en_comparativa"
) {
  mockUsePoolAward.mockReturnValue({ ...BASE_HOOK_RETURN, awardMode });

  return render(
    <PoolAwardPanel
      poolId="pool-1"
      poolState={poolState}
      companyNames={new Map([["company-A", "Empresa A"], ["company-B", "Empresa B"]])}
      companyId="company-A"
      memberCompanyIds={["company-A", "company-B"]}
    />,
    { wrapper: makeWrapper() }
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("T17 — PoolAwardPanel Mode A / Mode B conditional rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Mode A: renders adjudication button; no per-item grid; no company progress text", () => {
    renderPanel("leader");

    // Mode A: "Adjudicar cotización seleccionada" button should be present
    const adjBtn = screen.queryByText(/Adjudicar cotizaci/i);
    expect(adjBtn).not.toBeNull();

    // Mode A: no per-item award grid heading
    const perItemGrid = screen.queryByText(/Seleccioná el proveedor ganador por ítem/i);
    expect(perItemGrid).toBeNull();

    // Mode A: no "X de N empresas adjudicaron" progress text
    const progressText = screen.queryByText(/empresas adjudicaron/i);
    expect(progressText).toBeNull();
  });

  it("Mode B: renders per-item grid heading and company progress counter", () => {
    renderPanel("per_company");

    // Mode B: per-item grid heading
    const perItemHeading = screen.getByText(/Seleccioná el proveedor ganador por ítem/i);
    expect(perItemHeading).toBeDefined();

    // Mode B: company progress — 0 of 2 companies have adjudicated
    const progressText = screen.getByText(/0 de 2 empresas adjudicaron/i);
    expect(progressText).toBeDefined();

    // Mode B: "Confirmar mi adjudicación" button
    const confirmBtn = screen.getByText(/Confirmar mi adjudicaci/i);
    expect(confirmBtn).toBeDefined();
  });

  it("Mode A: confirmMyAward button is NOT present in the rendered UI", () => {
    renderPanel("leader");

    const confirmBtn = screen.queryByText(/Confirmar mi adjudicaci/i);
    expect(confirmBtn).toBeNull();
  });

  it("Mode B: Cancel action accessible in en_comparativa state", () => {
    renderPanel("per_company", "en_comparativa");

    // Cancel action should be reachable (carry-over from Slice B design)
    const cancelBtn = screen.queryByText(/Cancelar pool/i);
    expect(cancelBtn).not.toBeNull();
  });
});
