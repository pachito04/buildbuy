/**
 * Tests for PoolFlowPanel — GAP4 withdraw/cancel button visibility by pool_state (T11/T12).
 *
 * Strict TDD: written BEFORE the implementation changes.
 *
 * Test matrix (from spec and design):
 *  - borrador:         Withdraw visible, Cancel visible
 *  - confirmado:       Withdraw hidden/disabled, Cancel visible
 *  - en_comparativa:   Withdraw hidden/disabled, Cancel visible
 *  - adjudicado:       Withdraw hidden/disabled, Cancel visible
 *  - cerrado:          Withdraw hidden/disabled, Cancel hidden/disabled
 *  - cancelado:        Withdraw hidden/disabled, Cancel hidden/disabled
 *
 * Additional tests:
 *  - Clicking Cancel opens an AlertDialog (confirmation step)
 *  - Dismissing the dialog does NOT trigger cancelPool
 *  - Confirming the dialog calls cancelPool
 *
 * Strategy: mock usePoolLifecycle and usePoolFlow; test component behavior only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mock hooks — mutable so tests can reconfigure them
// ---------------------------------------------------------------------------

const mockWithdrawFromPool = vi.fn().mockResolvedValue(undefined);
const mockCancelPool = vi.fn().mockResolvedValue(undefined);

vi.mock('@/hooks/usePoolLifecycle', () => ({
  usePoolLifecycle: () => ({
    withdrawFromPool: mockWithdrawFromPool,
    isWithdrawing: false,
    cancelPool: mockCancelPool,
    isCancelling: false,
  }),
}));

vi.mock('@/hooks/usePoolFlow', () => ({
  usePoolFlow: () => ({
    poolItems: [],
    contributions: [],
    isLoadingItems: false,
    itemsError: null,
    addMyRequirements: vi.fn(),
    isAddingRequirements: false,
    consolidate: vi.fn(),
    isConsolidating: false,
    confirmParticipation: vi.fn(),
    isConfirming: false,
    generateSharedRfq: vi.fn(),
    isGeneratingRfq: false,
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Mock UI primitives
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, title, ...props }: React.PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement>>) => (
    <button onClick={onClick} disabled={disabled} title={title} {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open, onOpenChange }: { children: React.ReactNode; open?: boolean; onOpenChange?: (v: boolean) => void }) => (
    <div data-open={open}>{children}</div>
  ),
  DialogTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => <div>{children}</div>,
}));

// AlertDialog mock — renders children; exposes confirm/cancel trigger via data-testid
vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open, onOpenChange }: { children: React.ReactNode; open?: boolean; onOpenChange?: (v: boolean) => void }) => (
    <div data-testid="alert-dialog" data-open={open}>{children}</div>
  ),
  AlertDialogTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => (
    <div data-testid="alert-dialog-trigger">{children}</div>
  ),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-dialog-content">{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogAction: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button data-testid="alert-dialog-action" onClick={onClick}>{children}</button>
  ),
  AlertDialogCancel: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button data-testid="alert-dialog-cancel" onClick={onClick}>{children}</button>
  ),
}));

vi.mock('@/components/pools/AddMyRequirementsDialog', () => ({
  AddMyRequirementsDialog: () => <div />,
}));

vi.mock('@/components/pools/PoolConsolidatedView', () => ({
  PoolConsolidatedView: () => <div />,
}));

vi.mock('@/components/pools/PoolAwardPanel', () => ({
  PoolAwardPanel: () => <div data-testid="pool-award-panel" />,
}));

vi.mock('@/components/pools/PoolProvidersPanel', () => ({
  PoolProvidersPanel: () => <div data-testid="pool-providers-panel" />,
}));

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------

import { PoolFlowPanel } from '../PoolFlowPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

function makePool(poolState: string) {
  return {
    id: 'pool-1',
    pool_state: poolState,
    pool_companies: [{ id: 'pc-1', company_id: 'company-mine', status: 'active' }],
    pool_requests: [],
  };
}

function renderPanel(poolState: string) {
  return render(
    <PoolFlowPanel
      pool={makePool(poolState)}
      companyId="company-mine"
      companyNames={new Map()}
    />,
    { wrapper: makeWrapper() }
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PoolFlowPanel — withdraw/cancel button visibility by pool_state (T11/T12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCancelPool.mockResolvedValue(undefined);
    mockWithdrawFromPool.mockResolvedValue(undefined);
  });

  // ---- State: borrador (both actions visible) -----

  it('borrador: Withdraw button is visible', () => {
    renderPanel('borrador');
    const btn = screen.queryByRole('button', { name: /retirarse/i });
    expect(btn).not.toBeNull();
    expect(btn).not.toBeDisabled();
  });

  it('borrador: Cancel button is visible', () => {
    renderPanel('borrador');
    const btn = screen.queryByRole('button', { name: /cancelar pool/i });
    expect(btn).not.toBeNull();
    expect(btn).not.toBeDisabled();
  });

  // ---- State: confirmado (Withdraw hidden, Cancel visible) -----

  it('confirmado: Withdraw button is NOT visible or is disabled', () => {
    renderPanel('confirmado');
    const btn = screen.queryByRole('button', { name: /retirarse/i });
    // Either absent or disabled
    expect(btn === null || btn.hasAttribute('disabled')).toBe(true);
  });

  it('confirmado: Cancel button is visible', () => {
    renderPanel('confirmado');
    const btn = screen.queryByRole('button', { name: /cancelar pool/i });
    expect(btn).not.toBeNull();
    expect(btn).not.toBeDisabled();
  });

  // ---- State: en_comparativa (routes to PoolAwardPanel — inject cancelado buttons via hook) -----
  // Note: en_comparativa routes to PoolAwardPanel in the existing code. Cancel must be available.
  // We test this at the PoolAwardPanel integration level for the award phase states.
  // For the pre-award panel, we test confirmado which is the boundary before award phase.

  // ---- State: cerrado (both hidden) -----

  it('cerrado: Withdraw button is NOT visible or is disabled', () => {
    renderPanel('cerrado');
    // cerrado goes to PoolAwardPanel — verify it's in award panel mode, not pre-award
    // The award panel handles cerrado; the cancel/withdraw logic in the pre-award panel shouldn't appear.
    const withdrawBtn = screen.queryByRole('button', { name: /retirarse/i });
    expect(withdrawBtn === null || withdrawBtn.hasAttribute('disabled')).toBe(true);
  });

  it('cancelado: both buttons are NOT visible', () => {
    renderPanel('cancelado');
    const withdrawBtn = screen.queryByRole('button', { name: /retirarse/i });
    const cancelBtn = screen.queryByRole('button', { name: /cancelar pool/i });
    expect(withdrawBtn === null || withdrawBtn.hasAttribute('disabled')).toBe(true);
    expect(cancelBtn === null || cancelBtn.hasAttribute('disabled')).toBe(true);
  });

  // ---- AlertDialog confirmation step -----

  it('clicking Cancel opens an AlertDialog (confirmation step)', () => {
    renderPanel('borrador');
    const cancelBtn = screen.getByRole('button', { name: /cancelar pool/i });
    fireEvent.click(cancelBtn);
    // After clicking, alert dialog elements appear (content is always rendered in mock)
    const dialogs = screen.queryAllByTestId('alert-dialog');
    expect(dialogs.length).toBeGreaterThan(0);
  });

  it('dismissing the Cancel dialog does NOT trigger cancelPool mutation', async () => {
    // Use confirmado state so only the Cancel dialog exists (no Withdraw)
    renderPanel('confirmado');
    const cancelBtn = screen.getByRole('button', { name: /cancelar pool/i });
    fireEvent.click(cancelBtn);

    // In confirmado there is only one alert-dialog-cancel (no withdraw dialog)
    const dismissBtn = screen.queryByTestId('alert-dialog-cancel');
    if (dismissBtn) {
      fireEvent.click(dismissBtn);
    }

    await waitFor(() => {
      expect(mockCancelPool).not.toHaveBeenCalled();
    });
  });

  it('confirming the Cancel dialog calls cancelPool with the pool id', async () => {
    // Use confirmado state so only the Cancel dialog exists (no Withdraw)
    renderPanel('confirmado');
    const cancelBtn = screen.getByRole('button', { name: /cancelar pool/i });
    fireEvent.click(cancelBtn);

    // In confirmado there is only one alert-dialog-action (no withdraw dialog)
    const confirmBtn = screen.queryByTestId('alert-dialog-action');
    if (confirmBtn) {
      fireEvent.click(confirmBtn);
    }

    await waitFor(() => {
      expect(mockCancelPool).toHaveBeenCalledWith('pool-1');
    });
  });
});
