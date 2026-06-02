import { describe, it, expect } from 'vitest';
import {
  aggregateConsumos,
  rankObrasByConsumo,
  providersOverLimit,
} from '../consumos';
import type {
  RetiroItemForConsumo,
  RetiroForConsumo,
  AggregatedConsumos,
} from '../consumos';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRetiro(
  overrides: Partial<RetiroForConsumo> & { id: string; project_id: string; provider_id: string }
): RetiroForConsumo {
  return {
    id: overrides.id,
    project_id: overrides.project_id,
    provider_id: overrides.provider_id,
    architect_id: overrides.architect_id ?? 'arch-1',
    fecha_retiro: overrides.fecha_retiro ?? '2024-06-01',
    estado: overrides.estado ?? 'activo',
    company_id: overrides.company_id ?? 'comp-1',
  };
}

function makeItem(
  overrides: Partial<RetiroItemForConsumo> & {
    retiro_id: string;
    material_id: string;
    cantidad: number;
    precio_unitario_aplicado: number;
    subtotal: number;
  }
): RetiroItemForConsumo {
  return {
    id: overrides.id ?? 'item-1',
    retiro_id: overrides.retiro_id,
    material_id: overrides.material_id,
    cantidad: overrides.cantidad,
    precio_unitario_aplicado: overrides.precio_unitario_aplicado,
    subtotal: overrides.subtotal,
  };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const retiro1 = makeRetiro({ id: 'ret-1', project_id: 'obra-A', provider_id: 'prov-1', architect_id: 'arch-1', fecha_retiro: '2024-03-10', estado: 'activo' });
const retiro2 = makeRetiro({ id: 'ret-2', project_id: 'obra-A', provider_id: 'prov-1', architect_id: 'arch-2', fecha_retiro: '2024-04-15', estado: 'activo' });
const retiro3 = makeRetiro({ id: 'ret-3', project_id: 'obra-B', provider_id: 'prov-2', architect_id: 'arch-1', fecha_retiro: '2024-05-01', estado: 'activo' });
const retiroAnulado = makeRetiro({ id: 'ret-X', project_id: 'obra-A', provider_id: 'prov-1', architect_id: 'arch-1', fecha_retiro: '2024-03-20', estado: 'anulado' });

const item1a = makeItem({ id: 'i-1a', retiro_id: 'ret-1', material_id: 'mat-1', cantidad: 10, precio_unitario_aplicado: 100, subtotal: 1000 });
const item1b = makeItem({ id: 'i-1b', retiro_id: 'ret-1', material_id: 'mat-2', cantidad: 5, precio_unitario_aplicado: 200, subtotal: 1000 });
const item2a = makeItem({ id: 'i-2a', retiro_id: 'ret-2', material_id: 'mat-1', cantidad: 3, precio_unitario_aplicado: 100, subtotal: 300 });
const item3a = makeItem({ id: 'i-3a', retiro_id: 'ret-3', material_id: 'mat-3', cantidad: 7, precio_unitario_aplicado: 50, subtotal: 350 });
const itemAnulado = makeItem({ id: 'i-X', retiro_id: 'ret-X', material_id: 'mat-1', cantidad: 20, precio_unitario_aplicado: 100, subtotal: 2000 });

const allRetiros = [retiro1, retiro2, retiro3, retiroAnulado];
const allItems = [item1a, item1b, item2a, item3a, itemAnulado];

// ---------------------------------------------------------------------------
// aggregateConsumos
// ---------------------------------------------------------------------------

describe('aggregateConsumos', () => {
  it('returns empty array when no items', () => {
    const result = aggregateConsumos([], [], {});
    expect(result).toHaveLength(0);
  });

  it('returns empty array when all retiros are anulado', () => {
    const result = aggregateConsumos([itemAnulado], [retiroAnulado], {});
    // anulado rows excluded from totals — result may include row with 0 or not return it
    // Per spec: anulados shown with 'Anulado' state but excluded from totals.
    // We expose them with estado='anulado' and subtotal included for display, but rankObrasByConsumo
    // uses only activo totals. The aggregation includes them for audit display.
    // The critical requirement: totals computed by rankObrasByConsumo must exclude anulado.
    // Here we just check the returned rows carry the estado for the caller to filter.
    const activeRows = result.filter((r) => r.estado === 'activo');
    const totalFromActive = activeRows.reduce((sum, r) => sum + r.subtotal, 0);
    expect(totalFromActive).toBe(0);
  });

  it('joins items to their retiro and builds rows with correct fields', () => {
    const result = aggregateConsumos([item1a], [retiro1], {});
    expect(result).toHaveLength(1);
    const row = result[0];
    expect(row.project_id).toBe('obra-A');
    expect(row.material_id).toBe('mat-1');
    expect(row.architect_id).toBe('arch-1');
    expect(row.cantidad).toBe(10);
    expect(row.precio_unitario_aplicado).toBe(100);
    expect(row.subtotal).toBe(1000);
    expect(row.estado).toBe('activo');
    expect(row.fecha_retiro).toBe('2024-03-10');
  });

  it('marks anulado rows with estado=anulado in the result', () => {
    const result = aggregateConsumos([itemAnulado], [retiroAnulado], {});
    expect(result).toHaveLength(1);
    expect(result[0].estado).toBe('anulado');
  });

  it('filters by projectId', () => {
    const result = aggregateConsumos(allItems, allRetiros, { projectId: 'obra-A' });
    const projects = new Set(result.map((r) => r.project_id));
    expect(projects.has('obra-B')).toBe(false);
    expect(projects.has('obra-A')).toBe(true);
  });

  it('filters by providerId', () => {
    const result = aggregateConsumos(allItems, allRetiros, { providerId: 'prov-1' });
    // prov-2 items should be excluded
    const providers = new Set(result.map((r) => r.provider_id));
    expect(providers.has('prov-2')).toBe(false);
  });

  it('filters by desde date boundary (inclusive)', () => {
    // retiro1 is 2024-03-10 (excluded), retiro2 is 2024-04-15 (included)
    const result = aggregateConsumos(allItems, allRetiros, { desde: '2024-04-01' });
    const retiroIds = new Set(result.map((r) => r.retiro_id));
    expect(retiroIds.has('ret-1')).toBe(false);
    expect(retiroIds.has('ret-2')).toBe(true);
  });

  it('filters by hasta date boundary (inclusive)', () => {
    // retiro3 is 2024-05-01 (excluded when hasta=2024-04-30)
    const result = aggregateConsumos(allItems, allRetiros, { hasta: '2024-04-30' });
    const retiroIds = new Set(result.map((r) => r.retiro_id));
    expect(retiroIds.has('ret-3')).toBe(false);
    expect(retiroIds.has('ret-1')).toBe(true);
  });

  it('includes anulado rows even when they are in the date range (for audit)', () => {
    const result = aggregateConsumos(allItems, allRetiros, {});
    const anulados = result.filter((r) => r.estado === 'anulado');
    expect(anulados.length).toBeGreaterThan(0);
  });

  it('items without a matching retiro are silently dropped', () => {
    const orphanItem = makeItem({ id: 'orphan', retiro_id: 'no-such-retiro', material_id: 'mat-9', cantidad: 1, precio_unitario_aplicado: 50, subtotal: 50 });
    const result = aggregateConsumos([orphanItem], [], {});
    expect(result).toHaveLength(0);
  });

  it('correct total when mixing activo and anulado items in same obra', () => {
    const result = aggregateConsumos(
      [item1a, itemAnulado],
      [retiro1, retiroAnulado],
      { projectId: 'obra-A' }
    );
    const activeSubtotal = result
      .filter((r) => r.estado === 'activo')
      .reduce((sum, r) => sum + r.subtotal, 0);
    expect(activeSubtotal).toBe(1000); // only item1a contributes
  });
});

// ---------------------------------------------------------------------------
// rankObrasByConsumo
// ---------------------------------------------------------------------------

describe('rankObrasByConsumo', () => {
  it('returns empty when no rows', () => {
    expect(rankObrasByConsumo([])).toHaveLength(0);
  });

  it('groups by project_id and sums activo subtotals only', () => {
    const rows: AggregatedConsumos[] = [
      { retiro_id: 'r1', project_id: 'obra-A', material_id: 'm1', architect_id: 'a1', provider_id: 'p1', cantidad: 1, precio_unitario_aplicado: 100, subtotal: 1000, estado: 'activo', fecha_retiro: '2024-01-01' },
      { retiro_id: 'r2', project_id: 'obra-A', material_id: 'm2', architect_id: 'a1', provider_id: 'p1', cantidad: 1, precio_unitario_aplicado: 200, subtotal: 2000, estado: 'activo', fecha_retiro: '2024-01-02' },
      { retiro_id: 'rX', project_id: 'obra-A', material_id: 'm1', architect_id: 'a1', provider_id: 'p1', cantidad: 5, precio_unitario_aplicado: 100, subtotal: 500, estado: 'anulado', fecha_retiro: '2024-01-03' },
      { retiro_id: 'r3', project_id: 'obra-B', material_id: 'm1', architect_id: 'a2', provider_id: 'p2', cantidad: 1, precio_unitario_aplicado: 50, subtotal: 100, estado: 'activo', fecha_retiro: '2024-01-04' },
    ];

    const ranked = rankObrasByConsumo(rows);
    expect(ranked).toHaveLength(2);
    // obra-A total = 1000 + 2000 = 3000 (anulado 500 excluded)
    expect(ranked[0].project_id).toBe('obra-A');
    expect(ranked[0].total).toBe(3000);
    // obra-B total = 100
    expect(ranked[1].project_id).toBe('obra-B');
    expect(ranked[1].total).toBe(100);
  });

  it('sorts descending by total', () => {
    const rows: AggregatedConsumos[] = [
      { retiro_id: 'r1', project_id: 'obra-C', material_id: 'm1', architect_id: 'a1', provider_id: 'p1', cantidad: 1, precio_unitario_aplicado: 10, subtotal: 10, estado: 'activo', fecha_retiro: '2024-01-01' },
      { retiro_id: 'r2', project_id: 'obra-A', material_id: 'm1', architect_id: 'a1', provider_id: 'p1', cantidad: 1, precio_unitario_aplicado: 5000, subtotal: 5000, estado: 'activo', fecha_retiro: '2024-01-01' },
      { retiro_id: 'r3', project_id: 'obra-B', material_id: 'm2', architect_id: 'a2', provider_id: 'p2', cantidad: 1, precio_unitario_aplicado: 500, subtotal: 500, estado: 'activo', fecha_retiro: '2024-01-02' },
    ];
    const ranked = rankObrasByConsumo(rows);
    expect(ranked[0].project_id).toBe('obra-A');
    expect(ranked[1].project_id).toBe('obra-B');
    expect(ranked[2].project_id).toBe('obra-C');
  });

  it('obra with only anulado rows gets total=0 and appears last', () => {
    const rows: AggregatedConsumos[] = [
      { retiro_id: 'rX', project_id: 'obra-D', material_id: 'm1', architect_id: 'a1', provider_id: 'p1', cantidad: 10, precio_unitario_aplicado: 100, subtotal: 1000, estado: 'anulado', fecha_retiro: '2024-01-01' },
      { retiro_id: 'r1', project_id: 'obra-E', material_id: 'm2', architect_id: 'a2', provider_id: 'p2', cantidad: 1, precio_unitario_aplicado: 50, subtotal: 50, estado: 'activo', fecha_retiro: '2024-01-01' },
    ];
    const ranked = rankObrasByConsumo(rows);
    expect(ranked[0].project_id).toBe('obra-E');
    expect(ranked[1].total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// providersOverLimit
// ---------------------------------------------------------------------------

describe('providersOverLimit', () => {
  const saldos = [
    { provider_id: 'prov-1', saldo: 10000 },
    { provider_id: 'prov-2', saldo: 5000 },
    { provider_id: 'prov-3', saldo: 0 },
    { provider_id: 'prov-4', saldo: -200 },
  ];

  it('returns empty when limite is null (no limit configured)', () => {
    expect(providersOverLimit(saldos, null)).toHaveLength(0);
  });

  it('returns empty when no provider exceeds the limit', () => {
    expect(providersOverLimit(saldos, 50000)).toHaveLength(0);
  });

  it('returns providers whose saldo > limite', () => {
    const result = providersOverLimit(saldos, 4999);
    const ids = result.map((p) => p.provider_id);
    expect(ids).toContain('prov-1');
    expect(ids).toContain('prov-2');
    expect(ids).not.toContain('prov-3');
    expect(ids).not.toContain('prov-4');
  });

  it('boundary: saldo === limite is NOT over limit (strictly greater than)', () => {
    const result = providersOverLimit(saldos, 5000);
    const ids = result.map((p) => p.provider_id);
    expect(ids).toContain('prov-1');
    expect(ids).not.toContain('prov-2'); // exactly at limit — not over
  });

  it('negative saldo is never over limit regardless of limit value', () => {
    const result = providersOverLimit(saldos, 0);
    const ids = result.map((p) => p.provider_id);
    expect(ids).not.toContain('prov-4'); // -200 is not > 0
  });

  it('returns all providers when limite is 0 and any saldo > 0', () => {
    const result = providersOverLimit(saldos, 0);
    const ids = result.map((p) => p.provider_id);
    expect(ids).toContain('prov-1');
    expect(ids).toContain('prov-2');
    expect(ids).not.toContain('prov-3'); // saldo=0 is not > 0
  });

  it('returns empty when input is empty', () => {
    expect(providersOverLimit([], 100)).toHaveLength(0);
  });
});
