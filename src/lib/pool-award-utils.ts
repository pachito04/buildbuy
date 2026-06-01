/**
 * pool-award-utils.ts
 *
 * Pure utility functions for the pool award (adjudicación) flow.
 * No side effects, no I/O, no Supabase calls — fully unit-testable.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WinningLine {
  /** The canonical material ID shared by the pool's rfq_items. */
  material_id: string;
  description: string;
  unit: string;
  unit_price: number;
}

/**
 * This company's contribution to a pool item.
 * Derived from pool_item_contributions joined to pool_items.material_id.
 */
export interface MyContribution {
  material_id: string;
  quantity: number;
}

/** One line in the per-company purchase order. */
export interface OcLine {
  material_id: string;
  description: string;
  unit: string;
  quantity: number;
  unit_price: number;
}

// ---------------------------------------------------------------------------
// companyOcLines
// ---------------------------------------------------------------------------

/**
 * Builds the purchase order lines for THIS company from the pool award.
 *
 * Algorithm:
 *   1. Index myContribs by material_id for O(1) lookup.
 *   2. For each winning line, check if this company has a contribution.
 *   3. If yes, emit an OcLine with quantity = my contribution and price from
 *      the winning line. Skip otherwise.
 *   4. Contributions that have no matching winning line are ignored (the
 *      material was not adjudicated or was not part of the winning quote).
 *
 * @param winning  - Winning lines from the adjudicated quote (rfq_items +
 *                   quote_items joined, one per material).
 * @param myContribs - This company's pool_item_contributions, joined to the
 *                     pool_item's material_id.
 * @returns        OC lines for this company — one per winning material where
 *                 this company had a contribution.
 */
export function companyOcLines(
  winning: WinningLine[],
  myContribs: MyContribution[]
): OcLine[] {
  // Build a map: material_id → my quantity
  const contribByMaterial = new Map<string, number>();
  for (const c of myContribs) {
    contribByMaterial.set(c.material_id, c.quantity);
  }

  const lines: OcLine[] = [];

  for (const w of winning) {
    const myQty = contribByMaterial.get(w.material_id);
    if (myQty === undefined) {
      // This company did not contribute to this material — skip.
      continue;
    }
    lines.push({
      material_id: w.material_id,
      description: w.description,
      unit: w.unit,
      quantity: myQty,
      unit_price: w.unit_price,
    });
  }

  return lines;
}
