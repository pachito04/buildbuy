/**
 * Tests for PoolCard "Invitar Empresa" — GAP1 linked-active filter (T05/T06).
 *
 * Strict TDD: tests written BEFORE the implementation changes.
 *
 * Strategy: PoolCard.companies prop now receives only actively-linked companies.
 * These tests verify that:
 *  1. Only the companies in the `companies` prop appear in the invite select.
 *  2. Inactive/unlinked companies (not in the prop) are absent.
 *  3. Companies already in the pool are excluded from the available list.
 *
 * The pure filtering (active link derivation) is tested separately in
 * pool-invite-utils.test.ts — no need to test the Supabase query here.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PoolCard } from "../PoolCard";

// ---------------------------------------------------------------------------
// Mock all UI primitives and child components that have complex rendering
// ---------------------------------------------------------------------------

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, ...props }: React.PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement>>) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open, onOpenChange }: { children: React.ReactNode; open?: boolean; onOpenChange?: (v: boolean) => void }) => (
    <div data-testid="dialog" data-open={open}>{children}</div>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: { children: React.ReactNode; value: string; onValueChange: (v: string) => void }) => (
    <div data-testid="select-root">{children}</div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <button data-testid="select-trigger">{children}</button>
  ),
  SelectValue: ({ placeholder }: { placeholder: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="select-content">{children}</div>
  ),
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-testid={`select-item-${value}`} data-value={value}>{children}</div>
  ),
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: () => void }) => (
    <input type="checkbox" checked={checked} onChange={onCheckedChange} />
  ),
}));

vi.mock("@/components/pools/PoolStateBadge", () => ({
  PoolStateBadge: ({ state }: { state: string }) => <span data-testid="pool-state-badge">{state}</span>,
}));

vi.mock("@/components/pools/PoolFlowPanel", () => ({
  PoolFlowPanel: () => <div data-testid="pool-flow-panel" />,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const noop = () => {};

function makePool(overrides: Record<string, unknown> = {}) {
  return {
    id: "pool-1",
    name: "Test Pool",
    pool_state: "borrador",
    status: "open",
    is_shared: true,
    deadline: null,
    notes: null,
    pool_requests: [],
    pool_companies: [],
    ...overrides,
  };
}

function renderCard(
  companies: { id: string; name: string }[],
  poolOverrides: Record<string, unknown> = {}
) {
  return render(
    <PoolCard
      pool={makePool(poolOverrides)}
      approvedRequests={[]}
      companies={companies}
      userCompanyId="company-mine"
      onAddRequests={noop}
      onUpdateStatus={noop}
      onInviteCompany={noop}
      addRequestsPending={false}
    />
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PoolCard — Invitar Empresa GAP1 filter", () => {
  it("renders only the active-linked company in the invite select; inactive company absent", () => {
    // companies prop = linked+active only (Empresa B); Empresa D not in the prop (was inactive/unlinked)
    const companies = [{ id: "company-b", name: "Empresa B" }];

    renderCard(companies, { status: "open", pool_companies: [] });

    // Empresa B appears in the invite select content
    expect(screen.getByTestId("select-item-company-b")).toBeInTheDocument();
    // Empresa D was never passed → not in the DOM
    expect(screen.queryByTestId("select-item-company-d")).not.toBeInTheDocument();
  });

  it("shows 'no hay empresas disponibles' when the linked-companies list is empty", () => {
    renderCard([], { status: "open", pool_companies: [] });

    expect(screen.getByText(/no hay empresas disponibles/i)).toBeInTheDocument();
  });

  it("excludes companies already participating in the pool from the available list", () => {
    const companies = [
      { id: "company-b", name: "Empresa B" },
      { id: "company-c", name: "Empresa C" },
    ];

    // company-b is already in the pool
    const pool_companies = [{ id: "pc-1", company_id: "company-b", companies: { name: "Empresa B" } }];

    renderCard(companies, { status: "open", pool_companies });

    // Only company-c should appear (company-b already in pool)
    expect(screen.getByTestId("select-item-company-c")).toBeInTheDocument();
    expect(screen.queryByTestId("select-item-company-b")).not.toBeInTheDocument();
  });
});
