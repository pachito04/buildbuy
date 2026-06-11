/**
 * pool-invite-utils.ts
 *
 * Pure helpers for the GAP1 invitation guard — deriving the set of companies
 * that a user may invite to a pool (only actively-linked companies).
 *
 * Zero side-effects, zero I/O — fully unit-testable.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Minimal shape of a company_links row with joined company names */
export interface LinkedCompanyRow {
  requester_company_id: string;
  target_company_id: string;
  status: string;
  requester: { id: string; name: string } | null;
  target: { id: string; name: string } | null;
}

/** A selectable company for pool invitations */
export interface SelectableCompany {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// deriveLinkedCompanies
// ---------------------------------------------------------------------------

/**
 * Given a list of company_links rows (any status) and the caller's company ID,
 * returns the set of companies that are ACTIVELY linked to the caller's company.
 *
 * Rules:
 *  1. Only rows with status === 'active' are considered.
 *  2. The "other" company is the one that is NOT the caller's company.
 *  3. The caller's own company is never included in the result.
 *  4. Duplicates are removed (by company id) in case malformed data exists.
 *
 * This is a pure function — it does not query Supabase. The caller is responsible
 * for fetching all company_links rows (active and otherwise) and passing them here.
 */
export function deriveLinkedCompanies(
  links: LinkedCompanyRow[],
  myCompanyId: string
): SelectableCompany[] {
  const seen = new Set<string>();
  const result: SelectableCompany[] = [];

  for (const link of links) {
    if (link.status !== "active") continue;

    // Determine which side is "the other company"
    const isIRequester = link.requester_company_id === myCompanyId;
    const otherCompany = isIRequester ? link.target : link.requester;

    if (!otherCompany) continue;
    // Skip self-links and already-seen companies
    if (otherCompany.id === myCompanyId) continue;
    if (seen.has(otherCompany.id)) continue;

    seen.add(otherCompany.id);
    result.push({ id: otherCompany.id, name: otherCompany.name });
  }

  return result;
}
