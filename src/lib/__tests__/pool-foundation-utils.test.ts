import { describe, it, expect } from "vitest";
import {
  isLinkActive,
  isMappingUsable,
  normalizeCompanyPair,
  linkRoleForCompany,
} from "../pool-foundation-utils";

// ---------------------------------------------------------------------------
// isLinkActive
// ---------------------------------------------------------------------------

describe("isLinkActive", () => {
  it("returns true for status active", () => {
    expect(isLinkActive({ status: "active" })).toBe(true);
  });

  it("returns false for status pending", () => {
    expect(isLinkActive({ status: "pending" })).toBe(false);
  });

  it("returns false for status disabled", () => {
    expect(isLinkActive({ status: "disabled" })).toBe(false);
  });

  it("returns false for unknown status strings", () => {
    expect(isLinkActive({ status: "unknown" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isMappingUsable
// ---------------------------------------------------------------------------

describe("isMappingUsable", () => {
  it("returns true when both confirmed_by_requester and confirmed_by_target are true", () => {
    expect(
      isMappingUsable({ confirmed_by_requester: true, confirmed_by_target: true })
    ).toBe(true);
  });

  it("returns false when confirmed_by_requester is false and confirmed_by_target is true", () => {
    expect(
      isMappingUsable({ confirmed_by_requester: false, confirmed_by_target: true })
    ).toBe(false);
  });

  it("returns false when confirmed_by_requester is true and confirmed_by_target is false", () => {
    expect(
      isMappingUsable({ confirmed_by_requester: true, confirmed_by_target: false })
    ).toBe(false);
  });

  it("returns false when both are false", () => {
    expect(
      isMappingUsable({ confirmed_by_requester: false, confirmed_by_target: false })
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// normalizeCompanyPair
// ---------------------------------------------------------------------------

describe("normalizeCompanyPair", () => {
  it("returns [a, b] when a < b lexicographically", () => {
    const result = normalizeCompanyPair("aaa", "bbb");
    expect(result).toEqual(["aaa", "bbb"]);
  });

  it("returns [a, b] sorted so that the smaller UUID comes first regardless of argument order", () => {
    const id1 = "00000000-0000-0000-0000-000000000001";
    const id2 = "00000000-0000-0000-0000-000000000002";
    expect(normalizeCompanyPair(id1, id2)).toEqual([id1, id2]);
    expect(normalizeCompanyPair(id2, id1)).toEqual([id1, id2]);
  });

  it("produces the same result regardless of argument order", () => {
    const a = "company-z";
    const b = "company-a";
    const forward = normalizeCompanyPair(a, b);
    const backward = normalizeCompanyPair(b, a);
    expect(forward).toEqual(backward);
  });

  it("returns [a, a] when both arguments are the same (degenerate case)", () => {
    expect(normalizeCompanyPair("x", "x")).toEqual(["x", "x"]);
  });
});

// ---------------------------------------------------------------------------
// linkRoleForCompany
// ---------------------------------------------------------------------------

describe("linkRoleForCompany", () => {
  const link = {
    requester_company_id: "company-a",
    target_company_id: "company-b",
    status: "active",
  };

  it("returns requester when companyId matches requester_company_id", () => {
    expect(linkRoleForCompany(link, "company-a")).toBe("requester");
  });

  it("returns target when companyId matches target_company_id", () => {
    expect(linkRoleForCompany(link, "company-b")).toBe("target");
  });

  it("returns null when companyId is not a party of the link", () => {
    expect(linkRoleForCompany(link, "company-c")).toBeNull();
  });

  it("returns null when companyId is null", () => {
    expect(linkRoleForCompany(link, null)).toBeNull();
  });

  it("returns requester even for a pending link", () => {
    const pendingLink = { ...link, status: "pending" };
    expect(linkRoleForCompany(pendingLink, "company-a")).toBe("requester");
  });
});
