/**
 * Pure shaping utilities for `useConsolidationMatches`.
 * No React, no Supabase — designed for TDD.
 * See src/lib/__tests__/consolidacion-match-utils.test.ts
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw row shape returned by the eligible-items query (subset used for matching). */
export interface RawMatchRow {
  id: string;
  request_id: string;
  material_id: string;
  description: string;
  requests: {
    id: string;
    request_number: number;
  } | null;
}

/** A material that is present in OTHER eligible pending requests. */
export interface ConsolidationMatch {
  material_id: string;
  description: string;
  /** Deduplicated list of OTHER requests that also contain this material. */
  otherRequests: { request_id: string; request_number: number }[];
}

// ---------------------------------------------------------------------------
// groupMatchRows
// ---------------------------------------------------------------------------

/**
 * Groups raw query rows by `material_id`, collecting the distinct OTHER
 * requests that contain that material.
 *
 * Rows whose `request_id` equals `excludeRequestId` are excluded (the current
 * request being viewed must not appear as its own "other" match).
 *
 * Only materials with at least one other request are returned.
 * Stable order: materials appear in the order their first qualifying row was
 * encountered. Requests within a material are deduplicated by `request_id`.
 */
export function groupMatchRows(
  rows: RawMatchRow[],
  excludeRequestId: string,
): ConsolidationMatch[] {
  const orderMap: string[] = [];
  const byMaterial = new Map<
    string,
    { description: string; seenRequests: Set<string>; otherRequests: { request_id: string; request_number: number }[] }
  >();

  for (const row of rows) {
    // Skip rows that belong to the current (viewed) request
    if (row.request_id === excludeRequestId) continue;
    // Guard: requests join must have resolved
    if (!row.requests) continue;

    const key = row.material_id;

    if (!byMaterial.has(key)) {
      orderMap.push(key);
      byMaterial.set(key, {
        description: row.description,
        seenRequests: new Set(),
        otherRequests: [],
      });
    }

    const entry = byMaterial.get(key)!;

    // Deduplicate: same request_id may appear multiple times (multiple items)
    if (!entry.seenRequests.has(row.request_id)) {
      entry.seenRequests.add(row.request_id);
      entry.otherRequests.push({
        request_id: row.requests.id,
        request_number: row.requests.request_number,
      });
    }
  }

  return orderMap
    .map((key) => {
      const entry = byMaterial.get(key)!;
      return {
        material_id: key,
        description: entry.description,
        otherRequests: entry.otherRequests,
      };
    })
    .filter((m) => m.otherRequests.length > 0);
}
