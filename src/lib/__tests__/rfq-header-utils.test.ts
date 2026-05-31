import { describe, it, expect } from 'vitest';
import { diffRfqHeader, RFQ_FIELD_LABELS, isoToDatetimeLocal, datetimeLocalToIso } from '../rfq-header-utils';
import type { RfqHeader } from '../rfq-header-utils';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE: RfqHeader = {
  closing_datetime: '2026-06-15T10:00',
  descripcion: 'Materiales para obra norte',
  price_terms: 'Precios firmes',
  payment_terms: 'cheque_30',
};

// ---------------------------------------------------------------------------
// diffRfqHeader — single field changes
// ---------------------------------------------------------------------------

describe('diffRfqHeader — single field changed', () => {
  it('detects closing_datetime change', () => {
    const after: RfqHeader = { ...BASE, closing_datetime: '2026-07-01T09:00' };
    const result = diffRfqHeader(BASE, after);
    expect(result).toHaveLength(1);
    expect(result[0].field).toBe('closing_datetime');
    expect(result[0].old).toBe('2026-06-15T10:00');
    expect(result[0].new).toBe('2026-07-01T09:00');
  });

  it('detects descripcion change', () => {
    const after: RfqHeader = { ...BASE, descripcion: 'Nueva descripcion' };
    const result = diffRfqHeader(BASE, after);
    expect(result).toHaveLength(1);
    expect(result[0].field).toBe('descripcion');
    expect(result[0].old).toBe('Materiales para obra norte');
    expect(result[0].new).toBe('Nueva descripcion');
  });

  it('detects price_terms change', () => {
    const after: RfqHeader = { ...BASE, price_terms: 'Sujetos a variación' };
    const result = diffRfqHeader(BASE, after);
    expect(result).toHaveLength(1);
    expect(result[0].field).toBe('price_terms');
    expect(result[0].old).toBe('Precios firmes');
    expect(result[0].new).toBe('Sujetos a variación');
  });

  it('detects payment_terms change', () => {
    const after: RfqHeader = { ...BASE, payment_terms: 'transferencia_inmediata' };
    const result = diffRfqHeader(BASE, after);
    expect(result).toHaveLength(1);
    expect(result[0].field).toBe('payment_terms');
    expect(result[0].old).toBe('cheque_30');
    expect(result[0].new).toBe('transferencia_inmediata');
  });
});

// ---------------------------------------------------------------------------
// diffRfqHeader — all four fields changed
// ---------------------------------------------------------------------------

describe('diffRfqHeader — all fields changed', () => {
  it('returns 4 entries when all four fields differ', () => {
    const after: RfqHeader = {
      closing_datetime: '2026-08-01T08:00',
      descripcion: 'Descripcion nueva',
      price_terms: 'A confirmar',
      payment_terms: 'contrato_acopio',
    };
    const result = diffRfqHeader(BASE, after);
    expect(result).toHaveLength(4);
    const fields = result.map((r) => r.field);
    expect(fields).toContain('closing_datetime');
    expect(fields).toContain('descripcion');
    expect(fields).toContain('price_terms');
    expect(fields).toContain('payment_terms');
  });
});

// ---------------------------------------------------------------------------
// diffRfqHeader — no changes
// ---------------------------------------------------------------------------

describe('diffRfqHeader — no changes', () => {
  it('returns empty array when before and after are identical', () => {
    const result = diffRfqHeader(BASE, { ...BASE });
    expect(result).toEqual([]);
  });

  it('returns empty array when all fields are empty strings and equal', () => {
    const empty: RfqHeader = {
      closing_datetime: '',
      descripcion: '',
      price_terms: '',
      payment_terms: '',
    };
    const result = diffRfqHeader(empty, { ...empty });
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// diffRfqHeader — normalization: whitespace / null / undefined → ''
// ---------------------------------------------------------------------------

describe('diffRfqHeader — normalization (whitespace and null↔\'\' are no-ops)', () => {
  it('whitespace-only change is NOT a real change (trimmed to same value)', () => {
    // '  Precios firmes  ' trims to 'Precios firmes' — same as before
    const after: RfqHeader = { ...BASE, price_terms: '  Precios firmes  ' };
    const result = diffRfqHeader(BASE, after);
    // price_terms is unchanged after trim → no entry
    const priceEntry = result.find((r) => r.field === 'price_terms');
    expect(priceEntry).toBeUndefined();
  });

  it('null treated as empty string — no change when before is empty string', () => {
    const beforeEmpty: RfqHeader = { ...BASE, descripcion: '' };
    const afterNull: RfqHeader = { ...BASE, descripcion: null as unknown as string };
    const result = diffRfqHeader(beforeEmpty, afterNull);
    const descEntry = result.find((r) => r.field === 'descripcion');
    expect(descEntry).toBeUndefined();
  });

  it('undefined treated as empty string — no change when before is empty string', () => {
    const beforeEmpty: RfqHeader = { ...BASE, descripcion: '' };
    const afterUndef: RfqHeader = { ...BASE, descripcion: undefined as unknown as string };
    const result = diffRfqHeader(beforeEmpty, afterUndef);
    const descEntry = result.find((r) => r.field === 'descripcion');
    expect(descEntry).toBeUndefined();
  });

  it('null → real value IS a change', () => {
    const beforeNull: RfqHeader = { ...BASE, descripcion: null as unknown as string };
    const afterReal: RfqHeader = { ...BASE, descripcion: 'Nueva descripcion' };
    const result = diffRfqHeader(beforeNull, afterReal);
    const descEntry = result.find((r) => r.field === 'descripcion');
    expect(descEntry).toBeDefined();
    expect(descEntry!.old).toBe('');
    expect(descEntry!.new).toBe('Nueva descripcion');
  });
});

// ---------------------------------------------------------------------------
// diffRfqHeader — correct old/new values in each entry
// ---------------------------------------------------------------------------

describe('diffRfqHeader — correct old and new values', () => {
  it('captures correct old and new for two changed fields', () => {
    const after: RfqHeader = {
      ...BASE,
      closing_datetime: '2026-09-01T12:00',
      payment_terms: 'cheque_60',
    };
    const result = diffRfqHeader(BASE, after);
    expect(result).toHaveLength(2);

    const dtEntry = result.find((r) => r.field === 'closing_datetime')!;
    expect(dtEntry.old).toBe('2026-06-15T10:00');
    expect(dtEntry.new).toBe('2026-09-01T12:00');

    const ptEntry = result.find((r) => r.field === 'payment_terms')!;
    expect(ptEntry.old).toBe('cheque_30');
    expect(ptEntry.new).toBe('cheque_60');
  });
});

// ---------------------------------------------------------------------------
// RFQ_FIELD_LABELS — human-readable labels for all four fields
// ---------------------------------------------------------------------------

describe('RFQ_FIELD_LABELS', () => {
  it('has all four field labels', () => {
    expect(RFQ_FIELD_LABELS.closing_datetime).toBeDefined();
    expect(RFQ_FIELD_LABELS.descripcion).toBeDefined();
    expect(RFQ_FIELD_LABELS.price_terms).toBeDefined();
    expect(RFQ_FIELD_LABELS.payment_terms).toBeDefined();
  });

  it('closing_datetime label is "Fecha de cierre"', () => {
    expect(RFQ_FIELD_LABELS.closing_datetime).toBe('Fecha de cierre');
  });

  it('descripcion label is "Descripción"', () => {
    expect(RFQ_FIELD_LABELS.descripcion).toBe('Descripción');
  });

  it('price_terms label is "Condición de precios"', () => {
    expect(RFQ_FIELD_LABELS.price_terms).toBe('Condición de precios');
  });

  it('payment_terms label is "Condición de pago"', () => {
    expect(RFQ_FIELD_LABELS.payment_terms).toBe('Condición de pago');
  });
});

// ---------------------------------------------------------------------------
// datetime-local ↔ ISO conversion (closing_datetime round-trip)
// ---------------------------------------------------------------------------

describe('isoToDatetimeLocal', () => {
  it('returns "" for empty/null/undefined', () => {
    expect(isoToDatetimeLocal('')).toBe('');
    expect(isoToDatetimeLocal(null)).toBe('');
    expect(isoToDatetimeLocal(undefined)).toBe('');
  });

  it('returns "" for an invalid date string', () => {
    expect(isoToDatetimeLocal('not-a-date')).toBe('');
  });

  it('produces a YYYY-MM-DDTHH:mm value (16 chars, no seconds/offset)', () => {
    const out = isoToDatetimeLocal('2026-06-15T10:00:00+00:00');
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(out).toHaveLength(16);
  });
});

describe('datetimeLocalToIso', () => {
  it('returns "" for empty/null/undefined/invalid', () => {
    expect(datetimeLocalToIso('')).toBe('');
    expect(datetimeLocalToIso(null)).toBe('');
    expect(datetimeLocalToIso('garbage')).toBe('');
  });

  it('produces a parseable ISO string', () => {
    const iso = datetimeLocalToIso('2026-06-15T10:00');
    expect(new Date(iso).getTime()).not.toBeNaN();
    expect(iso).toContain('T');
  });
});

describe('closing_datetime round-trip (no spurious diff)', () => {
  it('local → iso → local preserves the original local value', () => {
    const local = '2026-06-15T10:00';
    expect(isoToDatetimeLocal(datetimeLocalToIso(local))).toBe(local);
  });

  it('a stored ISO normalized to local, unedited, yields NO diff', () => {
    const storedIso = '2026-06-15T10:00:00.000Z';
    const baseline = isoToDatetimeLocal(storedIso); // what `current` + the input now use
    const edited = baseline;                        // user opened modal, changed nothing
    const before: RfqHeader = { closing_datetime: baseline, descripcion: '', price_terms: '', payment_terms: '' };
    const after: RfqHeader = { closing_datetime: edited, descripcion: '', price_terms: '', payment_terms: '' };
    expect(diffRfqHeader(before, after)).toHaveLength(0);
  });
});
