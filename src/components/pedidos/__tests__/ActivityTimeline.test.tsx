/**
 * Tests for ActivityTimeline — GAP5 pool_joined event rendering (T28/T29).
 *
 * Strict TDD: written BEFORE the implementation changes.
 *
 * What is tested:
 *  1. pool_joined event renders "Pool #N" from metadata.pool_number.
 *  2. pool_joined event renders all company names from metadata.companies.
 *  3. Regression: existing event types (creado, consolidado, rechazado) still render.
 *  4. Pure helper formatPoolJoinedLabel — unit tests for the text format.
 *
 * Strategy: ActivityTimeline accepts `events` as a prop — pure presentational
 * component, zero Supabase mocks needed. Tests work with jsdom + RTL.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ActivityTimeline } from '../ActivityTimeline';
import { formatPoolJoinedLabel } from '@/lib/pool-joined-utils';
import type { TimelineEvent } from '@/lib/kanban-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<TimelineEvent>): TimelineEvent {
  return {
    id: 'evt-1',
    tipo: 'creado',
    descripcion: null,
    metadata: null,
    created_at: '2025-01-01T10:00:00Z',
    actor_name: 'Ana',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pure helper — formatPoolJoinedLabel
// ---------------------------------------------------------------------------

describe('formatPoolJoinedLabel', () => {
  it('formats pool_number and companies correctly', () => {
    const label = formatPoolJoinedLabel(3, ['Empresa A', 'Empresa B']);
    expect(label).toContain('Pool #3');
    expect(label).toContain('Empresa A');
    expect(label).toContain('Empresa B');
  });

  it('handles a single company', () => {
    const label = formatPoolJoinedLabel(1, ['Solo Corp']);
    expect(label).toContain('Pool #1');
    expect(label).toContain('Solo Corp');
  });

  it('handles three companies with separator', () => {
    const label = formatPoolJoinedLabel(7, ['A', 'B', 'C']);
    expect(label).toContain('Pool #7');
    expect(label).toMatch(/A.*B.*C/);
  });
});

// ---------------------------------------------------------------------------
// ActivityTimeline — pool_joined event rendering
// ---------------------------------------------------------------------------

describe('ActivityTimeline – pool_joined event', () => {
  it('renders "Pool #3" when pool_number is 3', () => {
    const events: TimelineEvent[] = [
      makeEvent({
        tipo: 'pool_joined',
        metadata: {
          pool_number: 3,
          pool_id: 'uuid-pool-1',
          companies: ['Empresa A', 'Empresa B'],
        },
      }),
    ];
    render(<ActivityTimeline events={events} />);
    expect(screen.getByText(/Pool #3/i)).toBeTruthy();
  });

  it('renders company names from metadata.companies', () => {
    const events: TimelineEvent[] = [
      makeEvent({
        tipo: 'pool_joined',
        metadata: {
          pool_number: 5,
          pool_id: 'uuid-pool-2',
          companies: ['Constructora Sur', 'Obras Norte'],
        },
      }),
    ];
    render(<ActivityTimeline events={events} />);
    expect(screen.getByText(/Constructora Sur/i)).toBeTruthy();
    expect(screen.getByText(/Obras Norte/i)).toBeTruthy();
  });

  it('renders pool_joined event alongside other event types without error', () => {
    const events: TimelineEvent[] = [
      makeEvent({ id: 'e1', tipo: 'creado' }),
      makeEvent({
        id: 'e2',
        tipo: 'pool_joined',
        metadata: {
          pool_number: 2,
          pool_id: 'uuid-pool-3',
          companies: ['Empresa X'],
        },
      }),
      makeEvent({ id: 'e3', tipo: 'consolidado', descripcion: 'Consolidado con otro req.' }),
    ];
    render(<ActivityTimeline events={events} />);
    // pool_joined must render
    expect(screen.getByText(/Pool #2/i)).toBeTruthy();
    // creado must still render its label
    expect(screen.getByText(/Requerimiento creado/i)).toBeTruthy();
  });

  it('regression: rechazado event still shows nota from metadata', () => {
    const events: TimelineEvent[] = [
      makeEvent({
        tipo: 'rechazado',
        metadata: { nota: 'Sin presupuesto' },
        descripcion: null,
      }),
    ];
    render(<ActivityTimeline events={events} />);
    expect(screen.getByText(/Sin presupuesto/i)).toBeTruthy();
  });
});
