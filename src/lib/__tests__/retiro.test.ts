import { describe, it, expect } from 'vitest';
import {
  buildRetiroItems,
  previewRetiroTotal,
  validateRetiro,
} from '../retiro';
import type { RetiroFormRow } from '../retiro';
import type { PrecioProveedorRow } from '../precio-vigencia';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFormRow(overrides: Partial<RetiroFormRow> & { material_id: string; cantidad: number }): RetiroFormRow {
  return {
    material_id: overrides.material_id,
    cantidad: overrides.cantidad,
  };
}

function makePrecio(
  overrides: Partial<PrecioProveedorRow> & {
    material_id: string;
    precio_unitario: number;
    vigencia_desde: string;
  }
): PrecioProveedorRow {
  return {
    id: overrides.id ?? 'precio-1',
    company_id: overrides.company_id ?? null,
    provider_id: overrides.provider_id ?? 'prov-1',
    material_id: overrides.material_id,
    precio_unitario: overrides.precio_unitario,
    unidad_medida: overrides.unidad_medida ?? null,
    vigencia_desde: overrides.vigencia_desde,
    vigencia_hasta: overrides.vigencia_hasta ?? null,
    created_by: overrides.created_by ?? null,
    created_at: overrides.created_at ?? '2024-01-01T00:00:00Z',
  };
}

// ---------------------------------------------------------------------------
// buildRetiroItems
// ---------------------------------------------------------------------------

describe('buildRetiroItems', () => {
  it('maps rows to the JSONB payload shape', () => {
    const rows: RetiroFormRow[] = [
      { material_id: 'mat-1', cantidad: 5 },
      { material_id: 'mat-2', cantidad: 10 },
    ];
    const result = buildRetiroItems(rows);
    expect(result).toEqual([
      { material_id: 'mat-1', cantidad: 5 },
      { material_id: 'mat-2', cantidad: 10 },
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(buildRetiroItems([])).toEqual([]);
  });

  it('preserves decimal cantidad', () => {
    const rows: RetiroFormRow[] = [{ material_id: 'mat-1', cantidad: 2.5 }];
    const result = buildRetiroItems(rows);
    expect(result[0].cantidad).toBe(2.5);
  });
});

// ---------------------------------------------------------------------------
// previewRetiroTotal
// ---------------------------------------------------------------------------

describe('previewRetiroTotal', () => {
  const precios: PrecioProveedorRow[] = [
    makePrecio({ id: 'p1', material_id: 'mat-1', precio_unitario: 100, vigencia_desde: '2024-01-01' }),
    makePrecio({ id: 'p2', material_id: 'mat-2', precio_unitario: 50, vigencia_desde: '2024-01-01' }),
  ];

  it('computes subtotals for all items with vigente price', () => {
    const rows: RetiroFormRow[] = [
      { material_id: 'mat-1', cantidad: 3 },
      { material_id: 'mat-2', cantidad: 4 },
    ];
    const result = previewRetiroTotal(rows, precios, '2024-06-01');
    expect(result.total).toBe(500); // 3*100 + 4*50
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ material_id: 'mat-1', cantidad: 3, subtotal: 300, hasPrice: true });
    expect(result.items[1]).toMatchObject({ material_id: 'mat-2', cantidad: 4, subtotal: 200, hasPrice: true });
    expect(result.missingPrices).toHaveLength(0);
  });

  it('flags items without a vigente price', () => {
    const rows: RetiroFormRow[] = [
      { material_id: 'mat-1', cantidad: 2 },
      { material_id: 'mat-unknown', cantidad: 1 },
    ];
    const result = previewRetiroTotal(rows, precios, '2024-06-01');
    expect(result.missingPrices).toEqual(['mat-unknown']);
    expect(result.items[1]).toMatchObject({ material_id: 'mat-unknown', hasPrice: false, subtotal: 0 });
  });

  it('returns 0 total when all items lack price', () => {
    const rows: RetiroFormRow[] = [{ material_id: 'no-price-mat', cantidad: 5 }];
    const result = previewRetiroTotal(rows, precios, '2024-06-01');
    expect(result.total).toBe(0);
    expect(result.missingPrices).toEqual(['no-price-mat']);
  });

  it('returns empty result for empty rows', () => {
    const result = previewRetiroTotal([], precios, '2024-06-01');
    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
    expect(result.missingPrices).toHaveLength(0);
  });

  it('uses expired precio on date that is past vigencia_hasta', () => {
    const expiredPrecio = makePrecio({
      material_id: 'mat-exp',
      precio_unitario: 200,
      vigencia_desde: '2023-01-01',
      vigencia_hasta: '2023-12-31',
    });
    const rows: RetiroFormRow[] = [{ material_id: 'mat-exp', cantidad: 1 }];
    const result = previewRetiroTotal(rows, [expiredPrecio], '2024-01-01');
    // Half-open: vigencia_hasta='2023-12-31' means the price is NOT active on 2024-01-01
    expect(result.missingPrices).toEqual(['mat-exp']);
    expect(result.items[0].hasPrice).toBe(false);
  });

  it('applies companyId scoping via resolvePrecioVigente', () => {
    const globalPrecio = makePrecio({ id: 'g1', material_id: 'mat-1', precio_unitario: 100, vigencia_desde: '2024-01-01', company_id: null });
    const companyOverride = makePrecio({ id: 'c1', material_id: 'mat-1', precio_unitario: 150, vigencia_desde: '2024-01-01', company_id: 'comp-1' });
    const rows: RetiroFormRow[] = [{ material_id: 'mat-1', cantidad: 2 }];
    // With company scoping: company override wins
    const resultScoped = previewRetiroTotal(rows, [globalPrecio, companyOverride], '2024-06-01', 'comp-1');
    expect(resultScoped.items[0].precioUnitario).toBe(150);
    expect(resultScoped.total).toBe(300);
    // Without company scoping: global price is used
    const resultGlobal = previewRetiroTotal(rows, [globalPrecio], '2024-06-01');
    expect(resultGlobal.items[0].precioUnitario).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// validateRetiro
// ---------------------------------------------------------------------------

describe('validateRetiro', () => {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  function validInput(): Parameters<typeof validateRetiro>[0] {
    return {
      projectId: 'proj-1',
      architectId: 'arch-1',
      fechaRetiro: today,
      items: [{ material_id: 'mat-1', cantidad: 1 }],
      missingPrices: [],
    };
  }

  it('returns no errors for a valid retiro', () => {
    expect(validateRetiro(validInput())).toHaveLength(0);
  });

  it('errors when projectId is missing', () => {
    const errors = validateRetiro({ ...validInput(), projectId: '' });
    expect(errors).toContain('Seleccioná una obra.');
  });

  it('errors when architectId is missing', () => {
    const errors = validateRetiro({ ...validInput(), architectId: '' });
    expect(errors).toContain('Seleccioná un arquitecto.');
  });

  it('errors when fecha_retiro is in the future', () => {
    const errors = validateRetiro({ ...validInput(), fechaRetiro: tomorrow });
    expect(errors).toContain('La fecha de retiro no puede ser futura.');
  });

  it('accepts today as a valid fecha_retiro', () => {
    const errors = validateRetiro({ ...validInput(), fechaRetiro: today });
    expect(errors).not.toContain('La fecha de retiro no puede ser futura.');
  });

  it('accepts yesterday as a valid fecha_retiro', () => {
    const errors = validateRetiro({ ...validInput(), fechaRetiro: yesterday });
    expect(errors).not.toContain('La fecha de retiro no puede ser futura.');
  });

  it('errors when there are no items', () => {
    const errors = validateRetiro({ ...validInput(), items: [] });
    expect(errors).toContain('Agregá al menos un ítem al retiro.');
  });

  it('errors when missingPrices is non-empty', () => {
    const errors = validateRetiro({ ...validInput(), missingPrices: ['mat-1'] });
    expect(errors).toContain('Hay ítems sin precio vigente. Actualizá la lista de precios antes de confirmar.');
  });

  it('accumulates multiple errors', () => {
    const errors = validateRetiro({
      projectId: '',
      architectId: '',
      fechaRetiro: tomorrow,
      items: [],
      missingPrices: ['mat-1'],
    });
    expect(errors.length).toBeGreaterThanOrEqual(4);
  });
});
