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
// Types for Mode B (per-company, per-item awards)
// ---------------------------------------------------------------------------

/**
 * One row from pool_company_awards for this company.
 * rfq_item_id → winning_quote_item_id.
 */
export interface PoolCompanyAward {
  rfq_item_id: string;
  winning_quote_item_id: string;
}

/**
 * A quote_item enriched with its parent quote's provider_id and rfq_item context.
 * Built by joining quote_items → quotes → rfq_items.
 */
export interface QuoteItemWithProvider {
  id: string;
  rfq_item_id: string;
  provider_id: string;
  unit_price: number;
  description: string;
  unit: string;
}

/** One item in a per-provider OC descriptor. */
export interface OcDescriptorItem {
  rfq_item_id: string;
  quote_item_id: string;
  unit_price: number;
  description: string;
  unit: string;
}

/**
 * Descriptor for one OC that must be generated for a specific provider.
 * In Mode B a single company may produce N OCs (one per distinct winning provider).
 */
export interface OcDescriptor {
  provider_id: string;
  items: OcDescriptorItem[];
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

// ---------------------------------------------------------------------------
// groupAwardsByProvider (Mode B)
// ---------------------------------------------------------------------------

/**
 * Groups a company's per-item awards by the winning provider.
 *
 * Algorithm:
 *   1. Build a lookup map: quote_item_id → QuoteItemWithProvider.
 *   2. For each award, find the matching quote item to resolve provider_id.
 *      If the quote item is not found, skip the award (graceful degradation).
 *   3. Group all resolved items by provider_id.
 *   4. Return one OcDescriptor per distinct provider.
 *
 * This pure function has no side effects and is fully unit-testable.
 *
 * @param awards      Per-item award rows from pool_company_awards (this company).
 * @param quoteItems  Quote items enriched with provider_id (from quote_items join quotes).
 * @returns           One OcDescriptor per distinct winning provider.
 */
export function groupAwardsByProvider(
  awards: PoolCompanyAward[],
  quoteItems: QuoteItemWithProvider[]
): OcDescriptor[] {
  if (awards.length === 0) return [];

  // Build lookup: quote_item_id → QuoteItemWithProvider
  const quoteItemById = new Map<string, QuoteItemWithProvider>();
  for (const qi of quoteItems) {
    quoteItemById.set(qi.id, qi);
  }

  // Group by provider_id
  const byProvider = new Map<string, OcDescriptorItem[]>();

  for (const award of awards) {
    const qi = quoteItemById.get(award.winning_quote_item_id);
    if (!qi) continue; // skip unresolvable awards

    const item: OcDescriptorItem = {
      rfq_item_id: award.rfq_item_id,
      quote_item_id: award.winning_quote_item_id,
      unit_price: qi.unit_price,
      description: qi.description,
      unit: qi.unit,
    };

    const existing = byProvider.get(qi.provider_id);
    if (existing) {
      existing.push(item);
    } else {
      byProvider.set(qi.provider_id, [item]);
    }
  }

  // Convert map to array of OcDescriptors
  const result: OcDescriptor[] = [];
  for (const [provider_id, items] of byProvider) {
    result.push({ provider_id, items });
  }

  return result;
}
