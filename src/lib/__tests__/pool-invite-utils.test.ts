/**
 * Tests for pool-invite-utils.ts (GAP1 — linked-active company derivation).
 *
 * Strict TDD: tests written BEFORE production code.
 * These tests will be RED until pool-invite-utils.ts is created.
 *
 * Pure function tests — zero mocks.
 */
import { describe, it, expect } from "vitest";
import { deriveLinkedCompanies } from "../pool-invite-utils";

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

interface RawLinkRow {
  requester_company_id: string;
  target_company_id: string;
  status: "pending" | "active" | "disabled";
  requester: { id: string; name: string } | null;
  target: { id: string; name: string } | null;
}

const MY_COMPANY = "company-mine";

function makeLink(
  other: string,
  status: "pending" | "active" | "disabled",
  iAmRequester = true
): RawLinkRow {
  return {
    requester_company_id: iAmRequester ? MY_COMPANY : other,
    target_company_id: iAmRequester ? other : MY_COMPANY,
    status,
    requester: { id: iAmRequester ? MY_COMPANY : other, name: iAmRequester ? "My Co" : "Other Co" },
    target: { id: iAmRequester ? other : MY_COMPANY, name: iAmRequester ? "Other Co" : "My Co" },
  };
}

// ---------------------------------------------------------------------------
// deriveLinkedCompanies
// ---------------------------------------------------------------------------

describe("deriveLinkedCompanies", () => {
  it("returns only the active-linked company when one link is active and one is pending", () => {
    const links: RawLinkRow[] = [
      makeLink("company-b", "active"),
      makeLink("company-d", "pending"),
    ];
    const result = deriveLinkedCompanies(links, MY_COMPANY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("company-b");
  });

  it("returns company from the 'target' side when my company is the requester", () => {
    const links: RawLinkRow[] = [
      makeLink("company-b", "active", true),
    ];
    const result = deriveLinkedCompanies(links, MY_COMPANY);
    expect(result[0].id).toBe("company-b");
    expect(result[0].name).toBe("Other Co");
  });

  it("returns company from the 'requester' side when my company is the target", () => {
    const links: RawLinkRow[] = [
      makeLink("company-c", "active", false),
    ];
    const result = deriveLinkedCompanies(links, MY_COMPANY);
    expect(result[0].id).toBe("company-c");
  });

  it("returns empty array when all links are inactive (disabled or pending)", () => {
    const links: RawLinkRow[] = [
      makeLink("company-b", "disabled"),
      makeLink("company-c", "pending"),
    ];
    const result = deriveLinkedCompanies(links, MY_COMPANY);
    expect(result).toHaveLength(0);
  });

  it("returns empty array when links array is empty (zero links case)", () => {
    const result = deriveLinkedCompanies([], MY_COMPANY);
    expect(result).toHaveLength(0);
  });

  it("deduplicates when same company appears twice (both sides of link pair)", () => {
    // Shouldn't happen with proper DB UNIQUE, but defensive test
    const links: RawLinkRow[] = [
      makeLink("company-b", "active", true),
      makeLink("company-b", "active", false),
    ];
    const result = deriveLinkedCompanies(links, MY_COMPANY);
    // Should not contain company-b twice
    const ids = result.map((c) => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("handles multiple active links and returns all of them", () => {
    const links: RawLinkRow[] = [
      makeLink("company-b", "active"),
      makeLink("company-c", "active"),
      makeLink("company-d", "disabled"),
    ];
    const result = deriveLinkedCompanies(links, MY_COMPANY);
    expect(result).toHaveLength(2);
    const ids = result.map((c) => c.id).sort();
    expect(ids).toEqual(["company-b", "company-c"]);
  });

  it("excludes the caller's own company from the result even if it appears in a link", () => {
    // Edge case: a link where both sides resolve to MY_COMPANY (malformed data)
    const links: RawLinkRow[] = [
      {
        requester_company_id: MY_COMPANY,
        target_company_id: MY_COMPANY,
        status: "active",
        requester: { id: MY_COMPANY, name: "My Co" },
        target: { id: MY_COMPANY, name: "My Co" },
      },
    ];
    const result = deriveLinkedCompanies(links, MY_COMPANY);
    expect(result.every((c) => c.id !== MY_COMPANY)).toBe(true);
  });
});
