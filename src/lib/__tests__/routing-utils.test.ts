import { describe, it, expect } from 'vitest';
import { suggestRouting, canProcess } from '../routing-utils';

// ---------------------------------------------------------------------------
// suggestRouting
// ---------------------------------------------------------------------------

describe('suggestRouting', () => {
  it('returns inventario when available >= quantity (full stock)', () => {
    expect(suggestRouting({ quantity: 10 }, { available: 10 })).toBe('inventario');
  });

  it('returns inventario when available exceeds quantity', () => {
    expect(suggestRouting({ quantity: 5 }, { available: 100 })).toBe('inventario');
  });

  it('returns cotizacion when available < quantity (partial stock)', () => {
    expect(suggestRouting({ quantity: 10 }, { available: 5 })).toBe('cotizacion');
  });

  it('returns cotizacion when available is 0 (no stock)', () => {
    expect(suggestRouting({ quantity: 10 }, { available: 0 })).toBe('cotizacion');
  });

  it('returns cotizacion when available is negative (oversold)', () => {
    expect(suggestRouting({ quantity: 5 }, { available: -3 })).toBe('cotizacion');
  });

  it('returns inventario for zero quantity (nothing needed)', () => {
    // Zero quantity: nothing to procure, default to inventario
    expect(suggestRouting({ quantity: 0 }, { available: 0 })).toBe('inventario');
  });

  it('returns cotizacion when material_id is null (no stock record)', () => {
    // material_id=null means no inventory lookup possible
    expect(suggestRouting({ quantity: 5, material_id: null }, { available: 0 })).toBe('cotizacion');
  });

  it('returns cotizacion when material_id is null even with positive available param', () => {
    // Caller should pass available=0 when material_id is null; function
    // also handles the null check directly.
    expect(suggestRouting({ quantity: 5, material_id: null }, { available: 99 })).toBe('cotizacion');
  });
});

// ---------------------------------------------------------------------------
// canProcess
// ---------------------------------------------------------------------------

describe('canProcess', () => {
  it('returns false for empty list (nothing to process)', () => {
    expect(canProcess([])).toBe(false);
  });

  it('returns true when all items have a committed routing', () => {
    expect(
      canProcess([
        { routing: 'inventario' },
        { routing: 'cotizacion' },
        { routing: 'orden_directa' },
      ])
    ).toBe(true);
  });

  it('returns false when any item is pendiente', () => {
    expect(
      canProcess([
        { routing: 'inventario' },
        { routing: 'pendiente' },
      ])
    ).toBe(false);
  });

  it('returns false when all items are pendiente', () => {
    expect(
      canProcess([
        { routing: 'pendiente' },
        { routing: 'pendiente' },
      ])
    ).toBe(false);
  });

  it('returns true for a single non-pendiente item', () => {
    expect(canProcess([{ routing: 'cotizacion' }])).toBe(true);
  });
});
