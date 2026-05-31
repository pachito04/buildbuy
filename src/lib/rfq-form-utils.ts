/**
 * Pure utility functions for the RFQ creation form.
 * No React, no Supabase. Unit-testable in isolation.
 */

export interface RfqDraft {
  rfqType: 'open' | 'closed_bid' | '';
  closingDatetime: string;
  deadline: string;
  descripcion: string;
  categoria: string;
  deliveryLocation: string;
  priceTerms: string;
  paymentTerms: string;
  notes: string;
  items: {
    material_id: string;
    description: string;
    quantity: string;
    unit: string;
    observations: string;
  }[];
  selectedProviders: string[];
}

export const EMPTY_DRAFT: RfqDraft = {
  rfqType: '',
  closingDatetime: '',
  deadline: '',
  descripcion: '',
  categoria: '',
  deliveryLocation: '',
  priceTerms: '',
  paymentTerms: '',
  notes: '',
  items: [],
  selectedProviders: [],
};

/**
 * Serialize a draft to a stable JSON string for localStorage.
 */
export function serializeDraft(d: RfqDraft): string {
  return JSON.stringify(d);
}

/**
 * Deserialize a draft from a raw localStorage string.
 * Tolerant of:
 *   - null / empty string → returns fallback
 *   - invalid JSON → returns fallback
 *   - JSON that is not an object → returns fallback
 *   - missing / extra keys → merges with fallback (forward-compat)
 *   - corrupted items / selectedProviders arrays → falls back to []
 */
export function deserializeDraft(raw: string | null, fallback: RfqDraft): RfqDraft {
  if (!raw) return { ...fallback };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...fallback };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ...fallback };
  }

  const obj = parsed as Record<string, unknown>;

  const items = Array.isArray(obj.items)
    ? (obj.items as RfqDraft['items'])
    : fallback.items;

  const selectedProviders = Array.isArray(obj.selectedProviders)
    ? (obj.selectedProviders as string[])
    : fallback.selectedProviders;

  return {
    rfqType:
      obj.rfqType === 'open' || obj.rfqType === 'closed_bid' || obj.rfqType === ''
        ? (obj.rfqType as RfqDraft['rfqType'])
        : fallback.rfqType,
    closingDatetime:
      typeof obj.closingDatetime === 'string' ? obj.closingDatetime : fallback.closingDatetime,
    deadline:
      typeof obj.deadline === 'string' ? obj.deadline : fallback.deadline,
    descripcion:
      typeof obj.descripcion === 'string' ? obj.descripcion : fallback.descripcion,
    categoria:
      typeof obj.categoria === 'string' ? obj.categoria : fallback.categoria,
    deliveryLocation:
      typeof obj.deliveryLocation === 'string' ? obj.deliveryLocation : fallback.deliveryLocation,
    priceTerms:
      typeof obj.priceTerms === 'string' ? obj.priceTerms : fallback.priceTerms,
    paymentTerms:
      typeof obj.paymentTerms === 'string' ? obj.paymentTerms : fallback.paymentTerms,
    notes: typeof obj.notes === 'string' ? obj.notes : fallback.notes,
    items,
    selectedProviders,
  };
}

/**
 * Returns true when all required Section-1 (Detalle) fields are non-empty.
 * Required: rfqType, closingDatetime, deadline, descripcion, categoria,
 *           deliveryLocation, priceTerms, paymentTerms.
 */
export function isDetalleComplete(d: RfqDraft): boolean {
  const required: string[] = [
    d.rfqType,
    d.closingDatetime,
    d.deadline,
    d.descripcion,
    d.categoria,
    d.deliveryLocation,
    d.priceTerms,
    d.paymentTerms,
  ];
  return required.every((v) => v.trim().length > 0);
}

/**
 * Returns true when the draft has at least one item with a non-empty material_id.
 */
export function hasValidItems(d: RfqDraft): boolean {
  return d.items.some((item) => item.material_id.trim().length > 0);
}
