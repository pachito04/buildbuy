/**
 * Pure formatting utilities for the pool_joined timeline event.
 *
 * Extracted to enable direct unit testing without rendering the full component.
 * Used by ActivityTimeline to render the pool_joined event entry.
 */

/**
 * Formats the display label for a pool_joined event.
 *
 * @param poolNumber  - The correlative pool number (e.g. 3 → "Pool #3")
 * @param companies   - Array of company names that participated
 * @returns           - Human-readable label string
 */
export function formatPoolJoinedLabel(
  poolNumber: number,
  companies: string[]
): string {
  return `Participó en Pool #${poolNumber} junto a ${companies.join(', ')}`;
}
