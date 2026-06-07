import { describe, it, expect } from "vitest";
import { getDistinctRequestIds } from "../recepcion-utils";

// ---------------------------------------------------------------------------
// T08 — getDistinctRequestIds
// Pure helper: given an array of sources (each with a requestId and an
// allocated qty), return the unique requestIds for sources where allocated > 0.
// ---------------------------------------------------------------------------

interface MinimalSource {
  requestId: string;
  allocated: number;
}

describe("getDistinctRequestIds", () => {
  it("returns empty array when sources is empty", () => {
    expect(getDistinctRequestIds([])).toEqual([]);
  });

  it("returns distinct requestIds from processed sources", () => {
    const sources: MinimalSource[] = [
      { requestId: "req-1", allocated: 5 },
      { requestId: "req-2", allocated: 3 },
      { requestId: "req-1", allocated: 2 }, // repeated requestId
    ];
    const result = getDistinctRequestIds(sources);
    expect(result).toHaveLength(2);
    expect(result).toContain("req-1");
    expect(result).toContain("req-2");
  });

  it("excludes sources where allocated is 0", () => {
    const sources: MinimalSource[] = [
      { requestId: "req-1", allocated: 5 },
      { requestId: "req-2", allocated: 0 }, // not processed
      { requestId: "req-3", allocated: 0 }, // not processed
    ];
    const result = getDistinctRequestIds(sources);
    expect(result).toEqual(["req-1"]);
  });

  it("returns empty array when all sources have allocated 0", () => {
    const sources: MinimalSource[] = [
      { requestId: "req-1", allocated: 0 },
      { requestId: "req-2", allocated: 0 },
    ];
    expect(getDistinctRequestIds(sources)).toEqual([]);
  });

  it("handles single source correctly", () => {
    const sources: MinimalSource[] = [{ requestId: "req-abc", allocated: 10 }];
    expect(getDistinctRequestIds(sources)).toEqual(["req-abc"]);
  });

  it("deduplicates when multiple sources share a requestId and all are allocated", () => {
    const sources: MinimalSource[] = [
      { requestId: "req-x", allocated: 2 },
      { requestId: "req-x", allocated: 3 },
      { requestId: "req-y", allocated: 1 },
    ];
    const result = getDistinctRequestIds(sources);
    expect(result).toHaveLength(2);
    expect(result).toContain("req-x");
    expect(result).toContain("req-y");
  });
});
