// ---------------------------------------------------------------------------
// recepcion-utils.ts
//
// Pure utility helpers for consolidated reception logic.
// No I/O, no side-effects — all functions are testable in isolation.
// ---------------------------------------------------------------------------

/**
 * Minimal shape required by getDistinctRequestIds.
 * Compatible with RecepcionDialog's ResolvedSource (which has requestId + allocated).
 */
export interface ProcessedSource {
  requestId: string;
  /** Quantity actually allocated to this source (> 0 means it was processed). */
  allocated: number;
}

/**
 * Returns the unique requestIds from `sources` where allocated > 0.
 *
 * Used in RecepcionDialog.mutationFn to call recalcRequestStatus exactly once
 * per distinct requestId after updating all request_items.
 *
 * @param sources - Array of sources with their allocated quantities.
 * @returns Array of unique requestId strings (order is stable, insertion order).
 */
export function getDistinctRequestIds(sources: ProcessedSource[]): string[] {
  const seen = new Set<string>();
  for (const src of sources) {
    if (src.allocated > 0) {
      seen.add(src.requestId);
    }
  }
  return Array.from(seen);
}
