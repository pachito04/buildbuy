/**
 * Pure consolidation logic for Consolidación de Requerimientos (núcleo).
 * All functions are free of side effects and React/Supabase dependencies.
 * Designed for TDD: see src/lib/__tests__/consolidacion-utils.test.ts
 */

import { isUrgente } from '@/hooks/useUrgencyThreshold';

// ---------------------------------------------------------------------------
// Types (AD-4)
// ---------------------------------------------------------------------------

export interface EligibleItem {
  request_item_id: string;
  request_id: string;
  request_number: number;
  obra: string | null;
  material_id: string | null;
  description: string;
  unit: string;
  quantity: number;
  desired_date: string | null;
  /** From parent request */
  request_status: string;
  /** 'deposito' | 'obra' */
  delivery_target: string;
  /** 'inventario' | 'cotizacion' | 'orden_directa' | 'pendiente' */
  routing: string;
  /** 'sin_pedir' | 'en_oc' | 'parcial' | 'recibido' | 'en_consolidacion' */
  item_status: string;
}

export interface ConsolidatedLine {
  material_id: string;
  description: string;
  unit: string;
  totalQuantity: number;
  sources: {
    request_item_id: string;
    request_id: string;
    request_number: number;
    obra: string | null;
    quantity: number;
  }[];
}

// ---------------------------------------------------------------------------
// isConsolidationEligible
// ---------------------------------------------------------------------------

/**
 * Returns true only when all consolidation eligibility conditions are met:
 *   - request_status === 'pendiente'
 *   - delivery_target === 'deposito'
 *   - routing is 'pendiente' or 'cotizacion'
 *   - material_id is truthy (not null/empty)
 *   - item_status === 'sin_pedir'
 */
export function isConsolidationEligible(item: EligibleItem): boolean {
  if (item.request_status !== 'pendiente') return false;
  if (item.delivery_target !== 'deposito') return false;
  if (item.routing !== 'pendiente' && item.routing !== 'cotizacion') return false;
  if (!item.material_id) return false;
  if (item.item_status !== 'sin_pedir') return false;
  return true;
}

// ---------------------------------------------------------------------------
// groupEligibleByMaterial
// ---------------------------------------------------------------------------

/**
 * Groups eligible items by material_id, summing quantities and collecting
 * per-source breakdown (request_item_id, request_id, request_number, obra, quantity).
 *
 * Order is stable: groups appear in the order the first item of that material_id
 * was encountered in the input array.
 */
export function groupEligibleByMaterial(items: EligibleItem[]): ConsolidatedLine[] {
  const orderMap: string[] = [];
  const lineMap = new Map<string, ConsolidatedLine>();

  for (const item of items) {
    // material_id should always be truthy for eligible items, but guard anyway
    const key = item.material_id ?? '';
    if (!key) continue;

    if (!lineMap.has(key)) {
      orderMap.push(key);
      lineMap.set(key, {
        material_id: key,
        description: item.description,
        unit: item.unit,
        totalQuantity: 0,
        sources: [],
      });
    }

    const line = lineMap.get(key)!;
    line.totalQuantity += item.quantity;
    line.sources.push({
      request_item_id: item.request_item_id,
      request_id: item.request_id,
      request_number: item.request_number,
      obra: item.obra,
      quantity: item.quantity,
    });
  }

  return orderMap.map((key) => lineMap.get(key)!);
}

// ---------------------------------------------------------------------------
// consolidatedUrgency
// ---------------------------------------------------------------------------

/**
 * Returns true if ANY desired_date in the list is urgent according to
 * `isUrgente(date, thresholdDays)`.
 * Null dates are treated as non-urgent (matching isUrgente's own behaviour).
 * An empty list returns false.
 */
export function consolidatedUrgency(
  desiredDates: (string | null)[],
  thresholdDays: number,
): boolean {
  return desiredDates.some((date) => isUrgente(date, thresholdDays));
}
