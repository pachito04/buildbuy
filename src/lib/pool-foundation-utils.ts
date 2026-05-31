// ---------------------------------------------------------------------------
// pool-foundation-utils.ts
// Pure helpers for the pool interempresa foundation (#9a).
// Zero side-effects, zero imports — safe to test in any environment.
// ---------------------------------------------------------------------------

/**
 * A minimal shape for a company_links row (or compatible subset).
 */
export interface CompanyLinkShape {
  status: string;
  requester_company_id?: string;
  target_company_id?: string;
}

/**
 * A minimal shape for a material_mappings row (or compatible subset).
 */
export interface MaterialMappingShape {
  confirmed_by_requester: boolean;
  confirmed_by_target: boolean;
}

/**
 * Returns true if the link status is exactly 'active'.
 * pending and disabled are both non-active.
 */
export function isLinkActive(link: { status: string }): boolean {
  return link.status === "active";
}

/**
 * A mapping is usable only when BOTH parties have confirmed it.
 * Usable mappings can be consumed by the pool flow (#9b).
 */
export function isMappingUsable(m: {
  confirmed_by_requester: boolean;
  confirmed_by_target: boolean;
}): boolean {
  return m.confirmed_by_requester && m.confirmed_by_target;
}

/**
 * Returns the canonical (ordered) pair [lesser, greater] for two company IDs.
 * The ordering is lexicographic — the same as LEAST()/GREATEST() in Postgres.
 * Use this to deduplicate or compare pairs regardless of which side initiated.
 */
export function normalizeCompanyPair(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a];
}

/**
 * Determines which side of the link the given companyId is.
 * Returns 'requester' if companyId === requester_company_id,
 * 'target' if companyId === target_company_id,
 * null if companyId is not a party of this link (or is null/undefined).
 *
 * The role determines which confirmation flag belongs to the caller
 * (confirmed_by_requester vs confirmed_by_target) and is used in
 * useMaterialMappings to set the right flag on propose/confirm.
 */
export function linkRoleForCompany(
  link: { requester_company_id: string; target_company_id: string },
  companyId: string | null | undefined
): "requester" | "target" | null {
  if (!companyId) return null;
  if (link.requester_company_id === companyId) return "requester";
  if (link.target_company_id === companyId) return "target";
  return null;
}
