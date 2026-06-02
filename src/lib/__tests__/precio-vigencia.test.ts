import { describe, it, expect } from 'vitest';
import {
  isVigente,
  resolvePrecioVigente,
  hasVigenciaOverlap,
} from '../precio-vigencia';
import type { PrecioProveedorRow } from '../precio-vigencia';

// ---------------------------------------------------------------------------
// Helpers to build minimal price rows for testing
// ---------------------------------------------------------------------------

function makeRow(
  overrides: Partial<PrecioProveedorRow> & {
    vigencia_desde: string;
    precio_unitario: number;
  }
): PrecioProveedorRow {
  return {
    id: overrides.id ?? 'row-1',
    company_id: overrides.company_id ?? null,
    provider_id: overrides.provider_id ?? 'prov-1',
    material_id: overrides.material_id ?? 'mat-1',
    precio_unitario: overrides.precio_unitario,
    unidad_medida: overrides.unidad_medida ?? null,
    vigencia_desde: overrides.vigencia_desde,
    vigencia_hasta: overrides.vigencia_hasta ?? null,
    created_by: overrides.created_by ?? null,
    created_at: overrides.created_at ?? '2024-01-01T00:00:00Z',
  };
}

// ---------------------------------------------------------------------------
// isVigente
// ---------------------------------------------------------------------------

describe('isVigente', () => {
  it('returns true when fecha equals vigencia_desde and vigencia_hasta is null', () => {
    const row = makeRow({ vigencia_desde: '2024-03-01', precio_unitario: 100 });
    expect(isVigente(row, '2024-03-01')).toBe(true);
  });

  it('returns true when fecha is after vigencia_desde and vigencia_hasta is null', () => {
    const row = makeRow({ vigencia_desde: '2024-01-01', precio_unitario: 100 });
    expect(isVigente(row, '2025-06-01')).toBe(true);
  });

  it('returns false when fecha is before vigencia_desde', () => {
    const row = makeRow({ vigencia_desde: '2024-06-01', precio_unitario: 100 });
    expect(isVigente(row, '2024-05-31')).toBe(false);
  });

  it('returns false when fecha equals vigencia_hasta (half-open window, exclusive upper)', () => {
    const row = makeRow({
      vigencia_desde: '2024-01-01',
      vigencia_hasta: '2024-06-01',
      precio_unitario: 100,
    });
    expect(isVigente(row, '2024-06-01')).toBe(false);
  });

  it('returns true when fecha is strictly before vigencia_hasta', () => {
    const row = makeRow({
      vigencia_desde: '2024-01-01',
      vigencia_hasta: '2024-06-01',
      precio_unitario: 100,
    });
    expect(isVigente(row, '2024-05-31')).toBe(true);
  });

  it('returns false when vigencia_hasta has passed', () => {
    const row = makeRow({
      vigencia_desde: '2023-01-01',
      vigencia_hasta: '2023-12-31',
      precio_unitario: 100,
    });
    expect(isVigente(row, '2024-01-01')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolvePrecioVigente
// ---------------------------------------------------------------------------

describe('resolvePrecioVigente', () => {
  it('returns null for empty list', () => {
    expect(resolvePrecioVigente([], '2024-06-01')).toBeNull();
  });

  it('returns null when no price is vigente at fecha', () => {
    const rows = [
      makeRow({ vigencia_desde: '2024-01-01', vigencia_hasta: '2024-03-01', precio_unitario: 50 }),
    ];
    expect(resolvePrecioVigente(rows, '2024-06-01')).toBeNull();
  });

  it('returns the single vigente price', () => {
    const row = makeRow({ vigencia_desde: '2024-01-01', precio_unitario: 200 });
    expect(resolvePrecioVigente([row], '2024-06-01')).toBe(row);
  });

  // Company override takes precedence over global (null company_id)
  it('prefers company override (company_id != null) over global price', () => {
    const global = makeRow({
      id: 'global',
      company_id: null,
      vigencia_desde: '2024-01-01',
      precio_unitario: 100,
    });
    const override = makeRow({
      id: 'override',
      company_id: 'comp-abc',
      vigencia_desde: '2024-01-01',
      precio_unitario: 120,
    });
    const result = resolvePrecioVigente([global, override], '2024-06-01');
    expect(result?.id).toBe('override');
  });

  it('falls back to global when no company override is vigente', () => {
    const global = makeRow({
      id: 'global',
      company_id: null,
      vigencia_desde: '2024-01-01',
      precio_unitario: 100,
    });
    // company override expired
    const override = makeRow({
      id: 'override',
      company_id: 'comp-abc',
      vigencia_desde: '2024-01-01',
      vigencia_hasta: '2024-03-01',
      precio_unitario: 120,
    });
    const result = resolvePrecioVigente([global, override], '2024-06-01');
    expect(result?.id).toBe('global');
  });

  // Tiebreak: latest vigencia_desde wins
  it('tiebreaks on latest vigencia_desde when multiple candidates match', () => {
    const older = makeRow({
      id: 'older',
      vigencia_desde: '2024-01-01',
      created_at: '2024-01-01T00:00:00Z',
      precio_unitario: 100,
    });
    const newer = makeRow({
      id: 'newer',
      vigencia_desde: '2024-04-01',
      created_at: '2024-04-01T00:00:00Z',
      precio_unitario: 110,
    });
    const result = resolvePrecioVigente([older, newer], '2024-06-01');
    expect(result?.id).toBe('newer');
  });

  // Tiebreak: when vigencia_desde is equal, latest created_at wins
  it('tiebreaks on latest created_at when vigencia_desde is equal', () => {
    const first = makeRow({
      id: 'first',
      vigencia_desde: '2024-04-01',
      created_at: '2024-04-01T08:00:00Z',
      precio_unitario: 100,
    });
    const second = makeRow({
      id: 'second',
      vigencia_desde: '2024-04-01',
      created_at: '2024-04-01T12:00:00Z',
      precio_unitario: 115,
    });
    const result = resolvePrecioVigente([first, second], '2024-06-01');
    expect(result?.id).toBe('second');
  });

  // Boundary: vigencia_desde == fecha is inclusive
  it('includes price when fecha equals vigencia_desde exactly', () => {
    const row = makeRow({ vigencia_desde: '2024-06-01', precio_unitario: 200 });
    const result = resolvePrecioVigente([row], '2024-06-01');
    expect(result).not.toBeNull();
  });

  // Boundary: vigencia_hasta == fecha is exclusive
  it('excludes price when fecha equals vigencia_hasta exactly', () => {
    const row = makeRow({
      vigencia_desde: '2024-01-01',
      vigencia_hasta: '2024-06-01',
      precio_unitario: 200,
    });
    const result = resolvePrecioVigente([row], '2024-06-01');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolvePrecioVigente — company-scoped filtering (companyId param)
// ---------------------------------------------------------------------------

describe('resolvePrecioVigente — company-scoped filtering', () => {
  const global = makeRow({
    id: 'global',
    company_id: null,
    vigencia_desde: '2024-01-01',
    precio_unitario: 100,
  });
  const overrideA = makeRow({
    id: 'override-a',
    company_id: 'comp-a',
    vigencia_desde: '2024-01-01',
    precio_unitario: 150,
  });
  const overrideB = makeRow({
    id: 'override-b',
    company_id: 'comp-b',
    vigencia_desde: '2024-01-01',
    precio_unitario: 200,
  });
  const allRows = [global, overrideA, overrideB];

  it('when companyId matches override, returns that company override (not global, not other company)', () => {
    const result = resolvePrecioVigente(allRows, '2024-06-01', 'comp-a');
    expect(result?.id).toBe('override-a');
  });

  it('when companyId is provided but no override exists for it, falls back to global', () => {
    const result = resolvePrecioVigente([global, overrideA], '2024-06-01', 'comp-b');
    expect(result?.id).toBe('global');
  });

  it('when companyId is provided and no override exists for it and no global, returns null', () => {
    const result = resolvePrecioVigente([overrideA], '2024-06-01', 'comp-b');
    expect(result).toBeNull();
  });

  it('override for OTHER company is ignored even if vigente, when companyId does not match', () => {
    // Only overrideB is present (no global). Querying for comp-a should get null.
    const result = resolvePrecioVigente([overrideB], '2024-06-01', 'comp-a');
    expect(result).toBeNull();
  });

  it('when companyId is omitted, returns the company override (old behavior unchanged)', () => {
    // Without filtering, overrides win over global regardless of which company.
    // In the old (no-param) call the tiebreak picks either override — we just need the result to
    // NOT be the global row when an override is vigente.
    const result = resolvePrecioVigente(allRows, '2024-06-01');
    expect(result?.id).not.toBe('global');
  });

  it('when companyId is null explicitly, treats it the same as omitted (back-compat: no filtering)', () => {
    // Passing null should not narrow results — same as calling without the param.
    const result = resolvePrecioVigente(allRows, '2024-06-01', null);
    expect(result?.id).not.toBe('global');
  });
});

// ---------------------------------------------------------------------------
// hasVigenciaOverlap
// ---------------------------------------------------------------------------

describe('hasVigenciaOverlap', () => {
  // Two open-ended ranges always overlap if both have same provider+material scope
  it('returns true for two open-ended (null vigencia_hasta) ranges', () => {
    const existing = makeRow({ vigencia_desde: '2024-01-01', precio_unitario: 100 });
    const nuevo = makeRow({ vigencia_desde: '2024-06-01', precio_unitario: 110 });
    expect(hasVigenciaOverlap([existing], nuevo)).toBe(true);
  });

  it('returns false for adjacent non-overlapping ranges (closed + open)', () => {
    // existing: [2024-01-01, 2024-06-01)
    // nuevo:    [2024-06-01, ∞)
    const existing = makeRow({
      vigencia_desde: '2024-01-01',
      vigencia_hasta: '2024-06-01',
      precio_unitario: 100,
    });
    const nuevo = makeRow({ vigencia_desde: '2024-06-01', precio_unitario: 110 });
    expect(hasVigenciaOverlap([existing], nuevo)).toBe(false);
  });

  it('returns true for partially overlapping closed ranges', () => {
    // existing: [2024-01-01, 2024-07-01)
    // nuevo:    [2024-06-01, 2024-12-01)
    const existing = makeRow({
      vigencia_desde: '2024-01-01',
      vigencia_hasta: '2024-07-01',
      precio_unitario: 100,
    });
    const nuevo = makeRow({
      vigencia_desde: '2024-06-01',
      vigencia_hasta: '2024-12-01',
      precio_unitario: 110,
    });
    expect(hasVigenciaOverlap([existing], nuevo)).toBe(true);
  });

  it('returns false for two non-overlapping closed ranges', () => {
    // existing: [2024-01-01, 2024-03-01)
    // nuevo:    [2024-06-01, 2024-12-01)
    const existing = makeRow({
      vigencia_desde: '2024-01-01',
      vigencia_hasta: '2024-03-01',
      precio_unitario: 100,
    });
    const nuevo = makeRow({
      vigencia_desde: '2024-06-01',
      vigencia_hasta: '2024-12-01',
      precio_unitario: 110,
    });
    expect(hasVigenciaOverlap([existing], nuevo)).toBe(false);
  });

  it('returns false when existing list is empty', () => {
    const nuevo = makeRow({ vigencia_desde: '2024-01-01', precio_unitario: 100 });
    expect(hasVigenciaOverlap([], nuevo)).toBe(false);
  });

  it('returns false when existing row has different provider_id', () => {
    const existing = makeRow({
      provider_id: 'prov-X',
      vigencia_desde: '2024-01-01',
      precio_unitario: 100,
    });
    const nuevo = makeRow({
      provider_id: 'prov-Y',
      vigencia_desde: '2024-01-01',
      precio_unitario: 110,
    });
    expect(hasVigenciaOverlap([existing], nuevo)).toBe(false);
  });

  it('returns false when existing row has different material_id', () => {
    const existing = makeRow({
      material_id: 'mat-A',
      vigencia_desde: '2024-01-01',
      precio_unitario: 100,
    });
    const nuevo = makeRow({
      material_id: 'mat-B',
      vigencia_desde: '2024-01-01',
      precio_unitario: 110,
    });
    expect(hasVigenciaOverlap([existing], nuevo)).toBe(false);
  });

  // Scoping: company_id=null (global) and company_id='comp-1' are different scopes
  it('returns false when scopes differ (global vs company override)', () => {
    const existing = makeRow({
      company_id: null,
      vigencia_desde: '2024-01-01',
      precio_unitario: 100,
    });
    const nuevo = makeRow({
      company_id: 'comp-1',
      vigencia_desde: '2024-01-01',
      precio_unitario: 110,
    });
    expect(hasVigenciaOverlap([existing], nuevo)).toBe(false);
  });

  it('returns true when scopes match and ranges overlap (both company overrides)', () => {
    const existing = makeRow({
      company_id: 'comp-1',
      vigencia_desde: '2024-01-01',
      precio_unitario: 100,
    });
    const nuevo = makeRow({
      company_id: 'comp-1',
      vigencia_desde: '2024-06-01',
      precio_unitario: 110,
    });
    expect(hasVigenciaOverlap([existing], nuevo)).toBe(true);
  });

  it('handles nuevo with explicit vigencia_hasta correctly (closed+closed overlap)', () => {
    // existing: [2024-01-01, ∞)
    // nuevo:    [2023-06-01, 2024-03-01) — starts before existing, ends inside
    const existing = makeRow({
      vigencia_desde: '2024-01-01',
      precio_unitario: 100,
    });
    const nuevo = makeRow({
      vigencia_desde: '2023-06-01',
      vigencia_hasta: '2024-03-01',
      precio_unitario: 110,
    });
    expect(hasVigenciaOverlap([existing], nuevo)).toBe(true);
  });
});
