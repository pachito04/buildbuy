import { describe, it, expect } from 'vitest';
import { filterRetiros } from '../filterRetiros';
import type { RetiroRow } from '../filterRetiros';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRetiro(overrides: Partial<RetiroRow> & { id: string }): RetiroRow {
  return {
    id: overrides.id,
    project_id: overrides.project_id ?? 'obra-1',
    provider_id: overrides.provider_id ?? 'prov-1',
    architect_id: overrides.architect_id ?? 'arch-1',
    material_id: overrides.material_id ?? 'mat-1',
    fecha_retiro: overrides.fecha_retiro ?? '2024-06-01',
    estado: overrides.estado ?? 'activo',
  };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const r1 = makeRetiro({ id: 'r1', project_id: 'obra-A', provider_id: 'prov-1', architect_id: 'arch-1', material_id: 'mat-1', fecha_retiro: '2024-01-15', estado: 'activo' });
const r2 = makeRetiro({ id: 'r2', project_id: 'obra-B', provider_id: 'prov-2', architect_id: 'arch-2', material_id: 'mat-2', fecha_retiro: '2024-03-20', estado: 'activo' });
const r3 = makeRetiro({ id: 'r3', project_id: 'obra-A', provider_id: 'prov-1', architect_id: 'arch-1', material_id: 'mat-2', fecha_retiro: '2024-05-10', estado: 'activo' });
const rAnulado = makeRetiro({ id: 'rX', project_id: 'obra-A', provider_id: 'prov-1', architect_id: 'arch-1', material_id: 'mat-1', fecha_retiro: '2024-04-01', estado: 'anulado' });

const allRows = [r1, r2, r3, rAnulado];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('filterRetiros', () => {
  it('empty filter returns all non-anulados', () => {
    const result = filterRetiros(allRows, {});
    expect(result).toHaveLength(3);
    expect(result.every((r) => r.estado !== 'anulado')).toBe(true);
  });

  it('always excludes anulado regardless of other filters', () => {
    const result = filterRetiros(allRows, { proveedor: 'prov-1' });
    expect(result.find((r) => r.id === 'rX')).toBeUndefined();
  });

  it('empty input returns empty array', () => {
    expect(filterRetiros([], {})).toHaveLength(0);
  });

  it('filters by obra (project_id)', () => {
    const result = filterRetiros(allRows, { obra: 'obra-A' });
    expect(result.every((r) => r.project_id === 'obra-A')).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result.find((r) => r.project_id === 'obra-B')).toBeUndefined();
  });

  it('filters by proveedor (provider_id)', () => {
    const result = filterRetiros(allRows, { proveedor: 'prov-2' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r2');
  });

  it('filters by material (material_id — NOT material_codigo)', () => {
    const result = filterRetiros(allRows, { material: 'mat-2' });
    expect(result.every((r) => r.material_id === 'mat-2')).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('filters by arquitecto using architect_id (NOT created_by)', () => {
    const result = filterRetiros(allRows, { arquitecto: 'arch-2' });
    expect(result).toHaveLength(1);
    expect(result[0].architect_id).toBe('arch-2');
  });

  it('filters by desde date boundary (inclusive)', () => {
    const result = filterRetiros(allRows, { desde: '2024-03-20' });
    expect(result.find((r) => r.id === 'r1')).toBeUndefined(); // 2024-01-15 < desde
    expect(result.find((r) => r.id === 'r2')).toBeDefined(); // 2024-03-20 === desde
    expect(result.find((r) => r.id === 'r3')).toBeDefined(); // 2024-05-10 > desde
  });

  it('filters by hasta date boundary (inclusive)', () => {
    const result = filterRetiros(allRows, { hasta: '2024-03-20' });
    expect(result.find((r) => r.id === 'r1')).toBeDefined(); // 2024-01-15 <= hasta
    expect(result.find((r) => r.id === 'r2')).toBeDefined(); // 2024-03-20 === hasta
    expect(result.find((r) => r.id === 'r3')).toBeUndefined(); // 2024-05-10 > hasta
  });

  it('applies all 5 filters as AND — only rows matching all pass', () => {
    // Only r1 matches all: obra-A, prov-1, mat-1, arch-1, within date range
    const result = filterRetiros(allRows, {
      obra: 'obra-A',
      proveedor: 'prov-1',
      material: 'mat-1',
      arquitecto: 'arch-1',
      desde: '2024-01-01',
      hasta: '2024-02-28',
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r1');
  });

  it('all-anulados input returns empty', () => {
    const result = filterRetiros([rAnulado], {});
    expect(result).toHaveLength(0);
  });
});
