import { describe, it, expect } from 'vitest';
import {
  computeSaldo,
  filterMovimientos,
} from '../cuenta-corriente';
import type { MovimientoRow } from '../cuenta-corriente';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMovimiento(
  overrides: Partial<MovimientoRow> & { tipo: 'debito' | 'credito'; monto: number }
): MovimientoRow {
  return {
    id: overrides.id ?? 'mov-1',
    company_id: overrides.company_id ?? 'comp-1',
    provider_id: overrides.provider_id ?? 'prov-1',
    tipo: overrides.tipo,
    retiro_id: overrides.retiro_id ?? null,
    monto: overrides.monto,
    fecha: overrides.fecha ?? '2024-06-01',
    concepto: overrides.concepto ?? null,
    medio_pago: overrides.medio_pago ?? null,
    referencia: overrides.referencia ?? null,
    created_by: overrides.created_by ?? null,
    created_at: overrides.created_at ?? '2024-06-01T00:00:00Z',
    project_id: overrides.project_id ?? null,
  };
}

// ---------------------------------------------------------------------------
// computeSaldo
// ---------------------------------------------------------------------------

describe('computeSaldo', () => {
  it('returns 0 for empty list', () => {
    expect(computeSaldo([])).toBe(0);
  });

  it('returns the monto for a single debito', () => {
    const movs = [makeMovimiento({ tipo: 'debito', monto: 1000 })];
    expect(computeSaldo(movs)).toBe(1000);
  });

  it('returns negative value for a single credito', () => {
    const movs = [makeMovimiento({ tipo: 'credito', monto: 500 })];
    expect(computeSaldo(movs)).toBe(-500);
  });

  it('sums debitos minus creditos correctly', () => {
    const movs = [
      makeMovimiento({ tipo: 'debito', monto: 3000 }),
      makeMovimiento({ tipo: 'debito', monto: 1500 }),
      makeMovimiento({ tipo: 'credito', monto: 1000 }),
    ];
    expect(computeSaldo(movs)).toBe(3500);
  });

  it('returns 0 when debitos equal creditos', () => {
    const movs = [
      makeMovimiento({ tipo: 'debito', monto: 2000 }),
      makeMovimiento({ tipo: 'credito', monto: 2000 }),
    ];
    expect(computeSaldo(movs)).toBe(0);
  });

  it('handles decimal amounts correctly', () => {
    const movs = [
      makeMovimiento({ tipo: 'debito', monto: 1234.56 }),
      makeMovimiento({ tipo: 'credito', monto: 234.56 }),
    ];
    expect(computeSaldo(movs)).toBeCloseTo(1000, 5);
  });

  it('returns negative saldo when creditos exceed debitos', () => {
    const movs = [
      makeMovimiento({ tipo: 'debito', monto: 100 }),
      makeMovimiento({ tipo: 'credito', monto: 500 }),
    ];
    expect(computeSaldo(movs)).toBe(-400);
  });
});

// ---------------------------------------------------------------------------
// filterMovimientos
// ---------------------------------------------------------------------------

describe('filterMovimientos', () => {
  const movs: MovimientoRow[] = [
    makeMovimiento({ id: 'm1', tipo: 'debito', monto: 1000, fecha: '2024-01-10', project_id: 'proj-a', retiro_id: 'ret-1' }),
    makeMovimiento({ id: 'm2', tipo: 'credito', monto: 500, fecha: '2024-02-15', project_id: 'proj-b', retiro_id: null }),
    makeMovimiento({ id: 'm3', tipo: 'debito', monto: 2000, fecha: '2024-03-20', project_id: 'proj-a', retiro_id: 'ret-2' }),
    makeMovimiento({ id: 'm4', tipo: 'credito', monto: 300, fecha: '2024-04-05', project_id: null, retiro_id: null }),
  ];

  it('returns all when no filter provided', () => {
    expect(filterMovimientos(movs, {})).toHaveLength(4);
  });

  it('filters by tipo debito', () => {
    const result = filterMovimientos(movs, { tipo: 'debito' });
    expect(result).toHaveLength(2);
    expect(result.every((m) => m.tipo === 'debito')).toBe(true);
  });

  it('filters by tipo credito', () => {
    const result = filterMovimientos(movs, { tipo: 'credito' });
    expect(result).toHaveLength(2);
    expect(result.every((m) => m.tipo === 'credito')).toBe(true);
  });

  it('filters by desde (inclusive)', () => {
    const result = filterMovimientos(movs, { desde: '2024-02-15' });
    expect(result.map((m) => m.id)).toEqual(['m2', 'm3', 'm4']);
  });

  it('filters by hasta (inclusive)', () => {
    const result = filterMovimientos(movs, { hasta: '2024-02-15' });
    expect(result.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('filters by desde and hasta range', () => {
    const result = filterMovimientos(movs, { desde: '2024-02-01', hasta: '2024-03-31' });
    expect(result.map((m) => m.id)).toEqual(['m2', 'm3']);
  });

  it('filters by projectId', () => {
    const result = filterMovimientos(movs, { projectId: 'proj-a' });
    expect(result.map((m) => m.id)).toEqual(['m1', 'm3']);
  });

  it('combines tipo and date filters', () => {
    const result = filterMovimientos(movs, { tipo: 'debito', desde: '2024-02-01' });
    expect(result.map((m) => m.id)).toEqual(['m3']);
  });

  it('returns empty when no movement matches', () => {
    const result = filterMovimientos(movs, { desde: '2025-01-01' });
    expect(result).toHaveLength(0);
  });

  it('returns empty list when input is empty', () => {
    expect(filterMovimientos([], { tipo: 'debito' })).toHaveLength(0);
  });

  it('excludes manual movements (no retiro / project_id null) when projectId filter is set', () => {
    // m4 is a manual credito with project_id: null (no associated retiro)
    // When filtering by project, manual payments have no project and must be excluded.
    // This is intentional: manual pagos/NC don't belong to any obra.
    const result = filterMovimientos(movs, { projectId: 'proj-a' });
    const ids = result.map((m) => m.id);
    expect(ids).not.toContain('m4'); // manual movement excluded
    expect(ids).toEqual(['m1', 'm3']); // only retiro-linked debitos for proj-a
  });

  it('includes manual movements when no projectId filter is set', () => {
    const result = filterMovimientos(movs, {});
    expect(result.map((m) => m.id)).toContain('m4');
  });
});
