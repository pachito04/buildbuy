/**
 * Pure utilities for RFQ header diffing and audit log labels.
 * No side effects. No imports from React or Supabase.
 * Fully unit-tested — keep all change-detection logic here, not in JSX.
 */

export type RfqHeaderField =
  | 'closing_datetime'
  | 'descripcion'
  | 'price_terms'
  | 'payment_terms';

export interface RfqHeader {
  closing_datetime: string;
  descripcion: string;
  price_terms: string;
  payment_terms: string;
}

export interface RfqFieldDiff {
  field: RfqHeaderField;
  old: string;
  new: string;
}

/** Human-readable labels for each header field used in the audit history UI. */
export const RFQ_FIELD_LABELS: Record<RfqHeaderField, string> = {
  closing_datetime: 'Fecha de cierre',
  descripcion: 'Descripción',
  price_terms: 'Condición de precios',
  payment_terms: 'Condición de pago',
};

/**
 * Normalizes a raw field value for comparison:
 * - null/undefined → ''
 * - any string → trimmed
 */
function normalize(value: string | null | undefined): string {
  if (value == null) return '';
  return value.trim();
}

/** The ordered list of fields we track. */
const HEADER_FIELDS: RfqHeaderField[] = [
  'closing_datetime',
  'descripcion',
  'price_terms',
  'payment_terms',
];

/**
 * Compares two RFQ header snapshots and returns only fields that actually changed.
 * Normalization: null/undefined are treated as '', and values are trimmed before comparison.
 * Returns [] when nothing changed (no-op save).
 */
export function diffRfqHeader(before: RfqHeader, after: RfqHeader): RfqFieldDiff[] {
  const changes: RfqFieldDiff[] = [];

  for (const field of HEADER_FIELDS) {
    const oldVal = normalize(before[field]);
    const newVal = normalize(after[field]);

    if (oldVal !== newVal) {
      changes.push({ field, old: oldVal, new: newVal });
    }
  }

  return changes;
}

/**
 * Format a stored ISO / TIMESTAMPTZ string into the `YYYY-MM-DDTHH:mm` shape
 * required by `<input type="datetime-local">` (local time). Empty/invalid → ''.
 *
 * Without this, a full ISO value (with seconds + offset) is rejected by the
 * input and rendered blank, which makes a no-op save look like the date was
 * cleared — silently nulling `closing_datetime` and logging a spurious change.
 */
export function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Convert a `datetime-local` input value (`YYYY-MM-DDTHH:mm`, local time) back
 * into an ISO string for storage in a TIMESTAMPTZ column. Empty/invalid → ''.
 */
export function datetimeLocalToIso(local: string | null | undefined): string {
  if (!local) return '';
  const d = new Date(local);
  if (isNaN(d.getTime())) return '';
  return d.toISOString();
}
