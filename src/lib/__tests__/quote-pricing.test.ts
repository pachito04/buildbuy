import { describe, it, expect } from 'vitest';
import { lineSubtotal, quoteTotal, validateQuote } from '../quote-pricing';

// ---------------------------------------------------------------------------
// lineSubtotal
// ---------------------------------------------------------------------------
describe('lineSubtotal', () => {
  it('returns unitPrice * quantity for normal inputs', () => {
    expect(lineSubtotal(5, 10)).toBe(50);
    expect(lineSubtotal(12.5, 4)).toBe(50);
    expect(lineSubtotal(1, 1)).toBe(1);
  });

  it('returns 0 when quantity is 0', () => {
    expect(lineSubtotal(100, 0)).toBe(0);
  });

  it('returns 0 when unitPrice is NaN', () => {
    expect(lineSubtotal(NaN, 5)).toBe(0);
  });

  it('returns 0 when unitPrice is negative', () => {
    expect(lineSubtotal(-10, 5)).toBe(0);
  });

  it('returns 0 when quantity is negative', () => {
    expect(lineSubtotal(10, -3)).toBe(0);
  });

  it('returns 0 when both inputs are 0', () => {
    expect(lineSubtotal(0, 0)).toBe(0);
  });

  it('returns 0 when unitPrice is 0', () => {
    expect(lineSubtotal(0, 10)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// quoteTotal
// ---------------------------------------------------------------------------
describe('quoteTotal', () => {
  it('sums line subtotals and adds shipping', () => {
    const lines = [
      { unitPrice: 5, quantity: 10 },  // 50
      { unitPrice: 20, quantity: 3 },  // 60
    ];
    expect(quoteTotal(lines, 15)).toBe(125);
  });

  it('returns shipping only when lines list is empty', () => {
    expect(quoteTotal([], 30)).toBe(30);
  });

  it('returns 0 when lines are empty and shipping is 0', () => {
    expect(quoteTotal([], 0)).toBe(0);
  });

  it('treats NaN shipping as 0', () => {
    const lines = [{ unitPrice: 10, quantity: 2 }];
    expect(quoteTotal(lines, NaN)).toBe(20);
  });

  it('handles negative shipping as 0 (guard)', () => {
    const lines = [{ unitPrice: 10, quantity: 2 }];
    expect(quoteTotal(lines, -5)).toBe(20);
  });

  it('correctly handles a single line', () => {
    expect(quoteTotal([{ unitPrice: 100, quantity: 5 }], 10)).toBe(510);
  });

  it('guards invalid line inputs through lineSubtotal', () => {
    const lines = [
      { unitPrice: -1, quantity: 5 },  // 0 (negative price)
      { unitPrice: 10, quantity: 3 },  // 30
    ];
    expect(quoteTotal(lines, 0)).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// validateQuote
// ---------------------------------------------------------------------------
describe('validateQuote', () => {
  const validInput = {
    items: [
      { unit_price: '100' },
      { unit_price: '250.5' },
    ],
    deliveryDate: '2026-06-15',
    paymentCondition: 'cheque_30',
    shippingCost: '50',
  };

  it('returns empty object for fully valid input', () => {
    expect(validateQuote(validInput)).toEqual({});
  });

  it('flags each line with empty price', () => {
    const errors = validateQuote({
      ...validInput,
      items: [{ unit_price: '' }, { unit_price: '100' }],
    });
    expect(errors).toHaveProperty('item_0');
    expect(errors).not.toHaveProperty('item_1');
  });

  it('flags each line with price "0"', () => {
    const errors = validateQuote({
      ...validInput,
      items: [{ unit_price: '100' }, { unit_price: '0' }],
    });
    expect(errors).not.toHaveProperty('item_0');
    expect(errors).toHaveProperty('item_1');
  });

  it('flags each line with negative price "-1"', () => {
    const errors = validateQuote({
      ...validInput,
      items: [{ unit_price: '-1' }],
    });
    expect(errors).toHaveProperty('item_0');
  });

  it('flags multiple invalid lines individually by index', () => {
    const errors = validateQuote({
      ...validInput,
      items: [{ unit_price: '' }, { unit_price: '0' }, { unit_price: '5' }],
    });
    expect(errors).toHaveProperty('item_0');
    expect(errors).toHaveProperty('item_1');
    expect(errors).not.toHaveProperty('item_2');
  });

  it('flags missing deliveryDate', () => {
    const errors = validateQuote({ ...validInput, deliveryDate: '' });
    expect(errors).toHaveProperty('deliveryDate');
  });

  it('flags missing paymentCondition', () => {
    const errors = validateQuote({ ...validInput, paymentCondition: '' });
    expect(errors).toHaveProperty('paymentCondition');
  });

  it('flags missing shippingCost', () => {
    const errors = validateQuote({ ...validInput, shippingCost: '' });
    expect(errors).toHaveProperty('shippingCost');
  });

  it('flags shippingCost of "0" as invalid', () => {
    const errors = validateQuote({ ...validInput, shippingCost: '0' });
    expect(errors).toHaveProperty('shippingCost');
  });

  it('flags negative shippingCost', () => {
    const errors = validateQuote({ ...validInput, shippingCost: '-10' });
    expect(errors).toHaveProperty('shippingCost');
  });

  it('returns messages as non-empty strings', () => {
    const errors = validateQuote({ ...validInput, deliveryDate: '' });
    expect(typeof errors.deliveryDate).toBe('string');
    expect(errors.deliveryDate.length).toBeGreaterThan(0);
  });

  it('handles empty items array with no item errors', () => {
    const errors = validateQuote({ ...validInput, items: [] });
    expect(errors).toEqual({});
  });
});
