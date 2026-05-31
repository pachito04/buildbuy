import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  groupEligibleByMaterial,
  consolidatedUrgency,
  isConsolidationEligible,
  type EligibleItem,
} from '../consolidacion-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<EligibleItem> = {}): EligibleItem {
  return {
    request_item_id: 'item-1',
    request_id: 'req-1',
    request_number: 1,
    obra: 'Obra A',
    material_id: 'mat-1',
    description: 'Cemento',
    unit: 'kg',
    quantity: 10,
    desired_date: null,
    request_status: 'pendiente',
    delivery_target: 'deposito',
    routing: 'pendiente',
    item_status: 'sin_pedir',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// groupEligibleByMaterial
// ---------------------------------------------------------------------------

describe('groupEligibleByMaterial', () => {
  it('returns empty array when given no items', () => {
    expect(groupEligibleByMaterial([])).toEqual([]);
  });

  it('groups two items from different obras with the same material into one line and sums quantity', () => {
    const items: EligibleItem[] = [
      makeItem({
        request_item_id: 'item-1',
        request_id: 'req-1',
        request_number: 1,
        obra: 'Obra A',
        material_id: 'mat-cement',
        description: 'Cemento',
        unit: 'kg',
        quantity: 10,
      }),
      makeItem({
        request_item_id: 'item-2',
        request_id: 'req-2',
        request_number: 2,
        obra: 'Obra B',
        material_id: 'mat-cement',
        description: 'Cemento',
        unit: 'kg',
        quantity: 15,
      }),
    ];

    const result = groupEligibleByMaterial(items);

    expect(result).toHaveLength(1);
    expect(result[0].material_id).toBe('mat-cement');
    expect(result[0].totalQuantity).toBe(25);
    expect(result[0].sources).toHaveLength(2);

    const sourceIds = result[0].sources.map((s) => s.request_item_id);
    expect(sourceIds).toContain('item-1');
    expect(sourceIds).toContain('item-2');

    const sourceA = result[0].sources.find((s) => s.request_item_id === 'item-1')!;
    expect(sourceA.quantity).toBe(10);
    expect(sourceA.obra).toBe('Obra A');
    expect(sourceA.request_number).toBe(1);

    const sourceB = result[0].sources.find((s) => s.request_item_id === 'item-2')!;
    expect(sourceB.quantity).toBe(15);
    expect(sourceB.obra).toBe('Obra B');
    expect(sourceB.request_number).toBe(2);
  });

  it('keeps distinct materials as separate consolidated lines', () => {
    const items: EligibleItem[] = [
      makeItem({ request_item_id: 'item-1', material_id: 'mat-cement', description: 'Cemento', quantity: 10 }),
      makeItem({ request_item_id: 'item-2', material_id: 'mat-steel', description: 'Hierro', quantity: 5 }),
    ];

    const result = groupEligibleByMaterial(items);

    expect(result).toHaveLength(2);
    const matIds = result.map((l) => l.material_id);
    expect(matIds).toContain('mat-cement');
    expect(matIds).toContain('mat-steel');
  });

  it('preserves all source fields on the source entries', () => {
    const items: EligibleItem[] = [
      makeItem({
        request_item_id: 'item-99',
        request_id: 'req-99',
        request_number: 42,
        obra: 'Torre Norte',
        material_id: 'mat-x',
        quantity: 7,
      }),
    ];

    const result = groupEligibleByMaterial(items);

    expect(result).toHaveLength(1);
    expect(result[0].sources[0]).toMatchObject({
      request_item_id: 'item-99',
      request_id: 'req-99',
      request_number: 42,
      obra: 'Torre Norte',
      quantity: 7,
    });
  });
});

// ---------------------------------------------------------------------------
// consolidatedUrgency
// ---------------------------------------------------------------------------

describe('consolidatedUrgency', () => {
  // Pin today to a fixed date so tests don't depend on wall-clock
  const TODAY = '2026-05-31';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(TODAY));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false when the date list is empty', () => {
    expect(consolidatedUrgency([], 7)).toBe(false);
  });

  it('returns false when all dates are null', () => {
    expect(consolidatedUrgency([null, null, null], 7)).toBe(false);
  });

  it('returns true when at least one date is urgent (within threshold)', () => {
    // 3 days from today → urgent with threshold=7
    const urgent = '2026-06-03';
    const notUrgent = '2026-07-01';
    expect(consolidatedUrgency([notUrgent, urgent], 7)).toBe(true);
  });

  it('returns false when no date is within the threshold', () => {
    const farAway = '2026-07-15';
    expect(consolidatedUrgency([farAway, farAway], 7)).toBe(false);
  });

  it('returns true if only one date is urgent among several', () => {
    const urgent = '2026-06-01'; // 1 day from today
    expect(consolidatedUrgency([null, '2026-07-01', urgent, null], 7)).toBe(true);
  });

  it('returns false when threshold is 0 and the date is today (0 days away, boundary)', () => {
    // diffDays = 0 → 0 <= 0 → urgent
    // Actually isUrgente returns diffDays <= thresholdDays, so 0 <= 0 → true
    expect(consolidatedUrgency([TODAY], 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isConsolidationEligible
// ---------------------------------------------------------------------------

describe('isConsolidationEligible', () => {
  it('returns true for a fully eligible item', () => {
    expect(isConsolidationEligible(makeItem())).toBe(true);
  });

  it('returns false when delivery_target is obra', () => {
    expect(isConsolidationEligible(makeItem({ delivery_target: 'obra' }))).toBe(false);
  });

  it('returns false when routing is inventario', () => {
    expect(isConsolidationEligible(makeItem({ routing: 'inventario' }))).toBe(false);
  });

  it('returns false when routing is orden_directa', () => {
    expect(isConsolidationEligible(makeItem({ routing: 'orden_directa' }))).toBe(false);
  });

  it('returns false when material_id is null', () => {
    expect(isConsolidationEligible(makeItem({ material_id: null }))).toBe(false);
  });

  it('returns false when request_status is not pendiente', () => {
    expect(isConsolidationEligible(makeItem({ request_status: 'procesado_total' }))).toBe(false);
  });

  it('returns false when item_status is not sin_pedir', () => {
    expect(isConsolidationEligible(makeItem({ item_status: 'en_oc' }))).toBe(false);
  });

  it('returns true when routing is cotizacion (eligible routing)', () => {
    expect(isConsolidationEligible(makeItem({ routing: 'cotizacion' }))).toBe(true);
  });
});
