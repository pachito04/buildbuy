// ---------------------------------------------------------------------------
// distribucion-utils.ts
//
// Shared pure util for urgency-based quantity distribution across sources.
// Used by: RecepcionDialog (consolidated reception, #8b), pooled reception (#9).
//
// Algorithm (AD-1 from design):
//   1. Stable-sort urgent sources first (preserve input order within each group).
//   2. Walk sorted sources in order; give each min(remaining, requestedQty).
//   3. Stop when remaining hits 0.
//   4. Return one allocation entry per source (allocatedQty may be 0).
//   Pure, no side-effects, no I/O.
// ---------------------------------------------------------------------------

export interface DistribSource {
  id: string;
  requestedQty: number;
  urgent: boolean;
}

export interface Allocation {
  id: string;
  allocatedQty: number;
}

/**
 * Distributes `receivedQty` across `sources` serving urgent sources first.
 *
 * - Stable-sorts urgent sources before non-urgent (preserves relative order
 *   within each group).
 * - Allocates greedily: each source receives min(remaining, requestedQty).
 * - Never allocates more than a source's requestedQty.
 * - Returns one entry per source in the ORIGINAL input order.
 */
export function distributeByUrgency(
  receivedQty: number,
  sources: DistribSource[],
): Allocation[] {
  if (sources.length === 0) return [];

  // Build index map to restore original order at the end.
  const originalIndex = new Map<string, number>(
    sources.map((s, i) => [s.id, i]),
  );

  // Stable-sort: urgent first, then non-urgent; preserve relative order within groups.
  const sorted = [...sources].sort((a, b) => {
    if (a.urgent === b.urgent) return 0;
    return a.urgent ? -1 : 1;
  });

  // Greedy walk
  let remaining = Math.max(0, receivedQty);
  const allocMap = new Map<string, number>();

  for (const source of sorted) {
    const give = Math.min(remaining, Math.max(0, source.requestedQty));
    allocMap.set(source.id, give);
    remaining -= give;
    if (remaining <= 0) break;
  }

  // Any source not visited in the greedy walk (remaining hit 0 early) gets 0.
  for (const source of sources) {
    if (!allocMap.has(source.id)) {
      allocMap.set(source.id, 0);
    }
  }

  // Restore original input order
  return sources
    .slice()
    .sort((a, b) => (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0))
    .map((s) => ({ id: s.id, allocatedQty: allocMap.get(s.id) ?? 0 }));
}
