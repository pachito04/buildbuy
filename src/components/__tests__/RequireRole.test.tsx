import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock useViewRole — inject role state via mock return value
// ---------------------------------------------------------------------------

const mockUseViewRole = vi.fn();

vi.mock('@/hooks/useViewRole', () => ({
  useViewRole: () => mockUseViewRole(),
}));

// Navigate mock — capture redirect destination
const navigateTo: string[] = [];

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => {
      navigateTo.push(to);
      return React.createElement('div', { 'data-testid': `redirect-${to.replace(/\//g, '')}` });
    },
  };
});

import { RequireRole } from '../RequireRole';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RequireRole', () => {
  it('renders spinner when loading=true (no redirect)', () => {
    mockUseViewRole.mockReturnValue({ actualRole: null, loading: true });
    const { container } = renderWithRouter(
      <RequireRole allowed={['compras', 'admin']}>
        <span data-testid="child">content</span>
      </RequireRole>
    );
    expect(screen.queryByTestId('child')).toBeNull();
    // spinner is rendered (an animate-spin element)
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('redirects to /login when actualRole=null and loading=false', () => {
    mockUseViewRole.mockReturnValue({ actualRole: null, loading: false });
    renderWithRouter(
      <RequireRole allowed={['compras', 'admin']}>
        <span data-testid="child">content</span>
      </RequireRole>
    );
    expect(screen.getByTestId('redirect-login')).toBeTruthy();
    expect(screen.queryByTestId('child')).toBeNull();
  });

  it('redirects to /dashboard when actualRole=arquitecto and allowed=[compras,admin]', () => {
    mockUseViewRole.mockReturnValue({ actualRole: 'arquitecto', loading: false });
    renderWithRouter(
      <RequireRole allowed={['compras', 'admin']}>
        <span data-testid="child">content</span>
      </RequireRole>
    );
    expect(screen.getByTestId('redirect-dashboard')).toBeTruthy();
    expect(screen.queryByTestId('child')).toBeNull();
  });

  it('renders children when actualRole=compras and allowed=[compras,admin]', () => {
    mockUseViewRole.mockReturnValue({ actualRole: 'compras', loading: false });
    renderWithRouter(
      <RequireRole allowed={['compras', 'admin']}>
        <span data-testid="child">content</span>
      </RequireRole>
    );
    expect(screen.getByTestId('child')).toBeTruthy();
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('renders children when actualRole=proveedor and allowed=[proveedor,compras,admin]', () => {
    mockUseViewRole.mockReturnValue({ actualRole: 'proveedor', loading: false });
    renderWithRouter(
      <RequireRole allowed={['proveedor', 'compras', 'admin']}>
        <span data-testid="child">content</span>
      </RequireRole>
    );
    expect(screen.getByTestId('child')).toBeTruthy();
  });

  it('redirects to /dashboard when actualRole=proveedor and allowed=[compras,admin]', () => {
    mockUseViewRole.mockReturnValue({ actualRole: 'proveedor', loading: false });
    renderWithRouter(
      <RequireRole allowed={['compras', 'admin']}>
        <span data-testid="child">content</span>
      </RequireRole>
    );
    expect(screen.getByTestId('redirect-dashboard')).toBeTruthy();
    expect(screen.queryByTestId('child')).toBeNull();
  });

  it('redirects to /dashboard when actualRole=compras and allowed=[proveedor]', () => {
    mockUseViewRole.mockReturnValue({ actualRole: 'compras', loading: false });
    renderWithRouter(
      <RequireRole allowed={['proveedor']}>
        <span data-testid="child">content</span>
      </RequireRole>
    );
    expect(screen.getByTestId('redirect-dashboard')).toBeTruthy();
    expect(screen.queryByTestId('child')).toBeNull();
  });

  it('renders children when actualRole=admin and allowed=[compras,admin]', () => {
    mockUseViewRole.mockReturnValue({ actualRole: 'admin', loading: false });
    renderWithRouter(
      <RequireRole allowed={['compras', 'admin']}>
        <span data-testid="child">content</span>
      </RequireRole>
    );
    expect(screen.getByTestId('child')).toBeTruthy();
  });
});
