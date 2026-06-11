import { describe, it, expect } from 'vitest';
import { buildTimeSeries } from '../buildTimeSeries';
import type { RetiroItemWithFecha, TimeSeriesPoint } from '../buildTimeSeries';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<RetiroItemWithFecha> & {
  material_id: string;
  fecha_retiro: string;
}): RetiroItemWithFecha {
  return {
    id: overrides.id ?? 'item-1',
    retiro_id: overrides.retiro_id ?? 'ret-1',
    material_id: overrides.material_id,
    descripcion: overrides.descripcion ?? 'Material ' + overrides.material_id,
    cantidad: overrides.cantidad ?? 1,
    subtotal: overrides.subtotal ?? 100,
    fecha_retiro: overrides.fecha_retiro,
    estado: overrides.estado ?? 'activo',
  };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

// mat-1: two rows in 2024-01, one in 2024-02
const i1 = makeItem({ id: 'i1', material_id: 'mat-1', descripcion: 'Cemento', fecha_retiro: '2024-01-10', cantidad: 3, subtotal: 300 });
const i2 = makeItem({ id: 'i2', material_id: 'mat-1', descripcion: 'Cemento', fecha_retiro: '2024-01-25', cantidad: 7, subtotal: 700 });
const i3 = makeItem({ id: 'i3', material_id: 'mat-1', descripcion: 'Cemento', fecha_retiro: '2024-02-05', cantidad: 5, subtotal: 500 });
// mat-2: one row in 2024-01
const i4 = makeItem({ id: 'i4', material_id: 'mat-2', descripcion: 'Arena', fecha_retiro: '2024-01-20', cantidad: 10, subtotal: 200 });
// anulado
const iAnulado = makeItem({ id: 'iX', material_id: 'mat-1', descripcion: 'Cemento', fecha_retiro: '2024-01-15', cantidad: 100, subtotal: 10000, estado: 'anulado' });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildTimeSeries', () => {
  it('empty items returns empty array', () => {
    const result = buildTimeSeries([], { metric: 'cantidad', period: 'month' });
    expect(result).toEqual([]);
  });

  it('all-anulados input returns empty array', () => {
    const result = buildTimeSeries([iAnulado], { metric: 'cantidad', period: 'month' });
    expect(result).toEqual([]);
  });

  it('metric=cantidad sums cantidad by (YYYY-MM, material_id)', () => {
    const result = buildTimeSeries([i1, i2, i3], { metric: 'cantidad', period: 'month' });
    // mat-1: 2024-01 → 3+7=10, 2024-02 → 5
    const jan = result.find((r) => r.period === '2024-01' && r.material_codigo === 'mat-1');
    const feb = result.find((r) => r.period === '2024-02' && r.material_codigo === 'mat-1');
    expect(jan).toBeDefined();
    expect(jan!.total).toBe(10);
    expect(feb).toBeDefined();
    expect(feb!.total).toBe(5);
  });

  it('metric=monto sums subtotal by (YYYY-MM, material_id)', () => {
    const result = buildTimeSeries([i1, i2, i3], { metric: 'monto', period: 'month' });
    const jan = result.find((r) => r.period === '2024-01' && r.material_codigo === 'mat-1');
    expect(jan).toBeDefined();
    expect(jan!.total).toBe(1000); // 300 + 700
  });

  it('anulado rows are excluded from totals', () => {
    const result = buildTimeSeries([i1, iAnulado], { metric: 'cantidad', period: 'month' });
    const jan = result.find((r) => r.period === '2024-01' && r.material_codigo === 'mat-1');
    expect(jan).toBeDefined();
    expect(jan!.total).toBe(3); // only i1, not iAnulado (100)
  });

  it('multiple materials produce separate series entries', () => {
    const result = buildTimeSeries([i1, i4], { metric: 'cantidad', period: 'month' });
    const mat1Jan = result.find((r) => r.period === '2024-01' && r.material_codigo === 'mat-1');
    const mat2Jan = result.find((r) => r.period === '2024-01' && r.material_codigo === 'mat-2');
    expect(mat1Jan).toBeDefined();
    expect(mat2Jan).toBeDefined();
    expect(mat1Jan!.total).toBe(3);
    expect(mat2Jan!.total).toBe(10);
  });

  it('range filter reduces results to matching months', () => {
    const result = buildTimeSeries([i1, i2, i3], {
      metric: 'cantidad',
      period: 'month',
      range: { desde: '2024-02-01', hasta: '2024-02-28' },
    });
    expect(result.find((r) => r.period === '2024-01')).toBeUndefined();
    expect(result.find((r) => r.period === '2024-02')).toBeDefined();
  });

  it('result shape has period, material_codigo, descripcion, total', () => {
    const result = buildTimeSeries([i4], { metric: 'cantidad', period: 'month' });
    expect(result).toHaveLength(1);
    const point: TimeSeriesPoint = result[0];
    expect(point.period).toBe('2024-01');
    expect(point.material_codigo).toBe('mat-2');
    expect(point.descripcion).toBe('Arena');
    expect(typeof point.total).toBe('number');
  });

  it('obra filter via range reduces items before aggregation', () => {
    // rows before range start are excluded
    const result = buildTimeSeries([i1, i3], {
      metric: 'monto',
      period: 'month',
      range: { desde: '2024-02-01' },
    });
    expect(result).toHaveLength(1);
    expect(result[0].period).toBe('2024-02');
    expect(result[0].total).toBe(500);
  });
});
