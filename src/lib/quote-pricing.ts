/**
 * Pure pricing utilities for the provider quote flow.
 * No React, no Supabase — import anywhere, including tests.
 *
 * Pricing model: unit_price is per-unit.
 *   line subtotal = unit_price × quantity
 *   quote total   = Σ line subtotals + shipping
 */

/**
 * Returns unitPrice * quantity.
 * Guards: NaN or negative unitPrice → 0; NaN or negative quantity → 0.
 */
export function lineSubtotal(unitPrice: number, quantity: number): number {
  if (!isFinite(unitPrice) || unitPrice < 0) return 0;
  if (!isFinite(quantity) || quantity < 0) return 0;
  return unitPrice * quantity;
}

/**
 * Sums lineSubtotal for each line and adds shipping.
 * Guards: NaN or negative shipping → treated as 0.
 */
export function quoteTotal(
  lines: { unitPrice: number; quantity: number }[],
  shipping: number,
): number {
  const safeShipping = isFinite(shipping) && shipping > 0 ? shipping : 0;
  return lines.reduce((sum, l) => sum + lineSubtotal(l.unitPrice, l.quantity), safeShipping);
}

export interface ValidateQuoteInput {
  items: { unit_price: string }[];
  deliveryDate: string;
  paymentCondition: string;
  shippingCost: string;
}

/**
 * Validates quote form state.
 * Returns a field→message map; empty object means valid.
 * Keys for item errors: "item_<index>" (0-based).
 */
export function validateQuote(d: ValidateQuoteInput): Record<string, string> {
  const errors: Record<string, string> = {};

  for (let i = 0; i < d.items.length; i++) {
    const raw = d.items[i].unit_price;
    const parsed = parseFloat(raw);
    if (raw === '' || !isFinite(parsed) || parsed <= 0) {
      errors[`item_${i}`] = 'El precio debe ser mayor a 0';
    }
  }

  if (!d.deliveryDate.trim()) {
    errors.deliveryDate = 'La fecha de entrega es obligatoria';
  }

  if (!d.paymentCondition.trim()) {
    errors.paymentCondition = 'La condición de pago es obligatoria';
  }

  const shippingParsed = parseFloat(d.shippingCost);
  if (d.shippingCost === '' || !isFinite(shippingParsed) || shippingParsed <= 0) {
    errors.shippingCost = 'El importe de envío debe ser mayor a 0';
  }

  return errors;
}
