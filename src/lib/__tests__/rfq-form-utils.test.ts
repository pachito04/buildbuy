import { describe, it, expect } from 'vitest';
import {
  serializeDraft,
  deserializeDraft,
  isDetalleComplete,
  hasValidItems,
  EMPTY_DRAFT,
} from '../rfq-form-utils';
import type { RfqDraft } from '../rfq-form-utils';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FULL_DRAFT: RfqDraft = {
  rfqType: 'open',
  closingDatetime: '2026-06-15T10:00',
  deadline: '2026-06-20T10:00',
  descripcion: 'Materiales para obra norte',
  categoria: 'Construcción',
  deliveryLocation: 'Obra Norte, CABA',
  priceTerms: 'Precios firmes',
  paymentTerms: 'transferencia_inmediata',
  notes: 'Urgente',
  items: [
    {
      material_id: 'mat-1',
      description: 'Arena fina',
      quantity: '10',
      unit: 'tn',
      observations: 'Seca',
    },
  ],
  selectedProviders: ['prov-1'],
};

const FULL_DRAFT_NO_ITEMS: RfqDraft = {
  ...FULL_DRAFT,
  items: [],
  selectedProviders: [],
};

// ---------------------------------------------------------------------------
// serialize ↔ deserialize round-trip
// ---------------------------------------------------------------------------

describe('serializeDraft / deserializeDraft round-trip', () => {
  it('round-trips a full draft without loss', () => {
    const serialized = serializeDraft(FULL_DRAFT);
    const result = deserializeDraft(serialized, EMPTY_DRAFT);
    expect(result).toEqual(FULL_DRAFT);
  });

  it('produces valid JSON', () => {
    const serialized = serializeDraft(FULL_DRAFT);
    expect(() => JSON.parse(serialized)).not.toThrow();
  });

  it('round-trips EMPTY_DRAFT', () => {
    const result = deserializeDraft(serializeDraft(EMPTY_DRAFT), FULL_DRAFT);
    expect(result).toEqual(EMPTY_DRAFT);
  });
});

// ---------------------------------------------------------------------------
// deserializeDraft — defensive / fallback
// ---------------------------------------------------------------------------

describe('deserializeDraft — null / garbage / missing keys', () => {
  it('returns fallback for null input', () => {
    const result = deserializeDraft(null, EMPTY_DRAFT);
    expect(result).toEqual(EMPTY_DRAFT);
  });

  it('returns fallback for empty string', () => {
    const result = deserializeDraft('', EMPTY_DRAFT);
    expect(result).toEqual(EMPTY_DRAFT);
  });

  it('returns fallback for invalid JSON', () => {
    const result = deserializeDraft('not-json!!{', EMPTY_DRAFT);
    expect(result).toEqual(EMPTY_DRAFT);
  });

  it('returns fallback for JSON that is not an object (array)', () => {
    const result = deserializeDraft('[1, 2, 3]', EMPTY_DRAFT);
    expect(result).toEqual(EMPTY_DRAFT);
  });

  it('returns fallback for JSON null value', () => {
    const result = deserializeDraft('null', EMPTY_DRAFT);
    expect(result).toEqual(EMPTY_DRAFT);
  });

  it('fills missing keys with fallback values (forward-compat older shape)', () => {
    // Simulate a persisted draft that is missing the newer fields
    const olderShape = JSON.stringify({
      rfqType: 'closed_bid',
      closingDatetime: '2026-06-15T10:00',
      deadline: '2026-06-20',
      // descripcion, categoria, priceTerms are missing — newer additions
      deliveryLocation: 'Obra Sur',
      paymentTerms: 'cheque_30',
      notes: '',
      items: [],
      selectedProviders: [],
    });
    const result = deserializeDraft(olderShape, EMPTY_DRAFT);
    // Known fields survive
    expect(result.rfqType).toBe('closed_bid');
    expect(result.deliveryLocation).toBe('Obra Sur');
    // Missing fields fall back to EMPTY_DRAFT values, not undefined
    expect(result.descripcion).toBe(EMPTY_DRAFT.descripcion);
    expect(result.categoria).toBe(EMPTY_DRAFT.categoria);
    expect(result.priceTerms).toBe(EMPTY_DRAFT.priceTerms);
    // items is always an array
    expect(Array.isArray(result.items)).toBe(true);
  });

  it('items array is always safe (falls back to [] when corrupted)', () => {
    const corrupt = JSON.stringify({ ...FULL_DRAFT, items: 'not-an-array' });
    const result = deserializeDraft(corrupt, EMPTY_DRAFT);
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items).toEqual([]);
  });

  it('selectedProviders array is always safe', () => {
    const corrupt = JSON.stringify({ ...FULL_DRAFT, selectedProviders: null });
    const result = deserializeDraft(corrupt, EMPTY_DRAFT);
    expect(Array.isArray(result.selectedProviders)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isDetalleComplete — required Section-1 fields
// ---------------------------------------------------------------------------
// Required: rfqType, closingDatetime, descripcion, categoria,
//           deliveryLocation, priceTerms, paymentTerms, deadline

describe('isDetalleComplete', () => {
  it('returns true when all required Section-1 fields are present', () => {
    expect(isDetalleComplete(FULL_DRAFT)).toBe(true);
  });

  it('returns false when rfqType is empty', () => {
    expect(isDetalleComplete({ ...FULL_DRAFT, rfqType: '' as RfqDraft['rfqType'] })).toBe(false);
  });

  it('returns false when closingDatetime is empty', () => {
    expect(isDetalleComplete({ ...FULL_DRAFT, closingDatetime: '' })).toBe(false);
  });

  it('returns false when descripcion is empty', () => {
    expect(isDetalleComplete({ ...FULL_DRAFT, descripcion: '' })).toBe(false);
  });

  it('returns false when categoria is empty', () => {
    expect(isDetalleComplete({ ...FULL_DRAFT, categoria: '' })).toBe(false);
  });

  it('returns false when deliveryLocation is empty', () => {
    expect(isDetalleComplete({ ...FULL_DRAFT, deliveryLocation: '' })).toBe(false);
  });

  it('returns false when priceTerms is empty', () => {
    expect(isDetalleComplete({ ...FULL_DRAFT, priceTerms: '' })).toBe(false);
  });

  it('returns false when paymentTerms is empty', () => {
    expect(isDetalleComplete({ ...FULL_DRAFT, paymentTerms: '' })).toBe(false);
  });

  it('returns false when deadline is empty', () => {
    expect(isDetalleComplete({ ...FULL_DRAFT, deadline: '' })).toBe(false);
  });

  it('returns false for EMPTY_DRAFT', () => {
    expect(isDetalleComplete(EMPTY_DRAFT)).toBe(false);
  });

  it('trims whitespace — whitespace-only is considered empty', () => {
    expect(isDetalleComplete({ ...FULL_DRAFT, descripcion: '   ' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hasValidItems
// ---------------------------------------------------------------------------

describe('hasValidItems', () => {
  it('returns false for empty items array', () => {
    expect(hasValidItems({ ...FULL_DRAFT, items: [] })).toBe(false);
  });

  it('returns false when all items have no material_id', () => {
    expect(
      hasValidItems({
        ...FULL_DRAFT,
        items: [{ material_id: '', description: 'X', quantity: '1', unit: 'un', observations: '' }],
      })
    ).toBe(false);
  });

  it('returns false when material_id is whitespace only', () => {
    expect(
      hasValidItems({
        ...FULL_DRAFT,
        items: [{ material_id: '   ', description: 'X', quantity: '1', unit: 'un', observations: '' }],
      })
    ).toBe(false);
  });

  it('returns true when at least one item has a valid material_id', () => {
    expect(hasValidItems(FULL_DRAFT)).toBe(true);
  });

  it('returns true even when some items have no material_id, as long as ≥1 does', () => {
    expect(
      hasValidItems({
        ...FULL_DRAFT,
        items: [
          { material_id: '', description: 'No material', quantity: '1', unit: 'un', observations: '' },
          { material_id: 'mat-42', description: 'With material', quantity: '5', unit: 'tn', observations: '' },
        ],
      })
    ).toBe(true);
  });

  it('returns false for EMPTY_DRAFT', () => {
    expect(hasValidItems(EMPTY_DRAFT)).toBe(false);
  });
});
