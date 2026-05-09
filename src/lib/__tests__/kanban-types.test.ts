import { describe, it, expect } from 'vitest';
import {
  getTransitionType,
  REQUEST_STATUSES,
  ITEM_SUB_STATES,
  STATUS_LABELS,
  STATUS_BADGE_VARIANTS,
  ITEM_SUB_STATE_COLORS,
  KANBAN_COLUMNS,
  REJECTION_REASONS,
  type RequestStatus,
} from '../kanban-types';

describe('getTransitionType', () => {
  it('returns NOOP for same-status transitions', () => {
    for (const status of REQUEST_STATUSES) {
      expect(getTransitionType(status, status)).toBe('NOOP');
    }
  });

  it('returns BLOCK for any transition FROM rechazado', () => {
    const targets: RequestStatus[] = ['pendiente', 'en_curso', 'recibido'];
    for (const to of targets) {
      expect(getTransitionType('rechazado', to)).toBe('BLOCK');
    }
  });

  it('returns MODAL for any transition TO rechazado', () => {
    const sources: RequestStatus[] = ['pendiente', 'en_curso', 'recibido'];
    for (const from of sources) {
      expect(getTransitionType(from, 'rechazado')).toBe('MODAL');
    }
  });

  it('returns BLOCK for transitions FROM recibido (except to rechazado)', () => {
    expect(getTransitionType('recibido', 'pendiente')).toBe('BLOCK');
    expect(getTransitionType('recibido', 'en_curso')).toBe('BLOCK');
  });

  it('returns VALIDATED for transitions TO recibido', () => {
    expect(getTransitionType('pendiente', 'recibido')).toBe('VALIDATED');
    expect(getTransitionType('en_curso', 'recibido')).toBe('VALIDATED');
  });

  it('returns ALLOW for pendiente <-> en_curso', () => {
    expect(getTransitionType('pendiente', 'en_curso')).toBe('ALLOW');
    expect(getTransitionType('en_curso', 'pendiente')).toBe('ALLOW');
  });

  it('covers all 16 from×to combinations', () => {
    const expected: Record<string, string> = {
      'pendiente->pendiente': 'NOOP',
      'pendiente->en_curso': 'ALLOW',
      'pendiente->recibido': 'VALIDATED',
      'pendiente->rechazado': 'MODAL',
      'en_curso->pendiente': 'ALLOW',
      'en_curso->en_curso': 'NOOP',
      'en_curso->recibido': 'VALIDATED',
      'en_curso->rechazado': 'MODAL',
      'recibido->pendiente': 'BLOCK',
      'recibido->en_curso': 'BLOCK',
      'recibido->recibido': 'NOOP',
      'recibido->rechazado': 'MODAL',
      'rechazado->pendiente': 'BLOCK',
      'rechazado->en_curso': 'BLOCK',
      'rechazado->recibido': 'BLOCK',
      'rechazado->rechazado': 'NOOP',
    };

    for (const from of REQUEST_STATUSES) {
      for (const to of REQUEST_STATUSES) {
        const key = `${from}->${to}`;
        expect(getTransitionType(from, to), `Transition ${key}`).toBe(expected[key]);
      }
    }
  });
});

describe('constants', () => {
  it('REQUEST_STATUSES has exactly 4 values', () => {
    expect(REQUEST_STATUSES).toHaveLength(4);
    expect(REQUEST_STATUSES).toEqual([
      'pendiente', 'en_curso', 'recibido', 'rechazado',
    ]);
  });

  it('ITEM_SUB_STATES has exactly 4 values', () => {
    expect(ITEM_SUB_STATES).toHaveLength(4);
    expect(ITEM_SUB_STATES).toEqual(['sin_pedir', 'en_oc', 'parcial', 'recibido']);
  });

  it('STATUS_LABELS covers all statuses', () => {
    for (const status of REQUEST_STATUSES) {
      expect(STATUS_LABELS[status]).toBeDefined();
      expect(typeof STATUS_LABELS[status]).toBe('string');
    }
  });

  it('STATUS_BADGE_VARIANTS covers all statuses', () => {
    for (const status of REQUEST_STATUSES) {
      expect(STATUS_BADGE_VARIANTS[status]).toBeDefined();
      expect(STATUS_BADGE_VARIANTS[status].variant).toBeDefined();
    }
  });

  it('ITEM_SUB_STATE_COLORS covers all sub-states', () => {
    for (const state of ITEM_SUB_STATES) {
      expect(ITEM_SUB_STATE_COLORS[state]).toBeDefined();
      expect(ITEM_SUB_STATE_COLORS[state].bg).toBeDefined();
      expect(ITEM_SUB_STATE_COLORS[state].label).toBeDefined();
    }
  });

  it('KANBAN_COLUMNS has 4 columns in correct order', () => {
    expect(KANBAN_COLUMNS).toHaveLength(4);
    expect(KANBAN_COLUMNS[0].status).toBe('pendiente');
    expect(KANBAN_COLUMNS[1].status).toBe('en_curso');
    expect(KANBAN_COLUMNS[2].status).toBe('recibido');
    expect(KANBAN_COLUMNS[3].status).toBe('rechazado');
  });

  it('REJECTION_REASONS has exactly 6 reasons', () => {
    expect(REJECTION_REASONS).toHaveLength(6);
    expect(REJECTION_REASONS).toContain('Sin presupuesto disponible');
    expect(REJECTION_REASONS).toContain('Otro');
  });
});
