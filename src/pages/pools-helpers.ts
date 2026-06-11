/**
 * pools-helpers.ts
 *
 * Pure helper functions for the Pools page.
 * Extracted to enable direct unit testing without rendering the full page.
 */

/**
 * Builds the Supabase update payload for pool state transitions.
 *
 * GAP4: MUST write `pool_state`, NOT the legacy `status` column.
 */
export function buildPoolStatePayload(state: string): { pool_state: string } {
  return { pool_state: state };
}
