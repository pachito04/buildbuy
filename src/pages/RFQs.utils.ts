// ---------------------------------------------------------------------------
// RFQs.utils.ts
//
// Pure utility functions for the RFQs page.
// Extracted for testability — no React imports.
// ---------------------------------------------------------------------------

type RfqTab = "nuevo" | "cesta" | "pool" | "consolidar" | "vigentes" | "historico";

const VALID_TABS: RfqTab[] = ["nuevo", "cesta", "pool", "consolidar", "vigentes", "historico"];

/**
 * Derives the initial active tab from `location.state`.
 *
 * Returns the `openTab` value from state if it is a valid RfqTab,
 * otherwise falls back to `"vigentes"`.
 *
 * @param state - The `location.state` value (may be null, undefined, or any object).
 */
export function resolveInitialTab(state: unknown): RfqTab {
  if (state !== null && typeof state === "object" && state !== undefined) {
    const candidate = (state as Record<string, unknown>).openTab;
    if (typeof candidate === "string" && (VALID_TABS as string[]).includes(candidate)) {
      return candidate as RfqTab;
    }
  }
  return "vigentes";
}
