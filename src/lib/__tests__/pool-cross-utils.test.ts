import { describe, it, expect } from "vitest";
import { crossPoolItems } from "../pool-cross-utils";
import type { PoolEligibleItem, Mapping, PoolConsolidatedLine } from "../pool-cross-utils";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";

const MAT_A1 = "mat-a1";
const MAT_A2 = "mat-a2";
const MAT_B1 = "mat-b1";
const MAT_B2 = "mat-b2";

function makeItem(
  company_id: string,
  material_id: string,
  description: string,
  quantity: number,
  unit = "m2"
): PoolEligibleItem {
  return { company_id, material_id, description, unit, quantity };
}

function makeMapping(
  material_a_id: string,
  material_b_id: string,
  usable = true
): Mapping {
  return { material_a_id, material_b_id, usable };
}

// ---------------------------------------------------------------------------
// empty input
// ---------------------------------------------------------------------------

describe("crossPoolItems — empty input", () => {
  it("returns [] when items is empty", () => {
    const result = crossPoolItems([], []);
    expect(result).toEqual([]);
  });

  it("returns [] when items is empty but mappings exist", () => {
    const result = crossPoolItems([], [makeMapping(MAT_A1, MAT_B1)]);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// unmapped materials stay separate
// ---------------------------------------------------------------------------

describe("crossPoolItems — unmapped materials stay separate", () => {
  it("returns one line per distinct material when no mappings are provided", () => {
    const items: PoolEligibleItem[] = [
      makeItem(COMPANY_A, MAT_A1, "Cemento Portland", 10),
      makeItem(COMPANY_B, MAT_B1, "Arena gruesa", 20),
    ];

    const result = crossPoolItems(items, []);

    expect(result).toHaveLength(2);

    const lineA = result.find((l) => l.canonicalMaterialId === MAT_A1);
    expect(lineA).toBeDefined();
    expect(lineA!.totalQuantity).toBe(10);
    expect(lineA!.contributions).toHaveLength(1);
    expect(lineA!.contributions[0]).toEqual({ company_id: COMPANY_A, quantity: 10 });

    const lineB = result.find((l) => l.canonicalMaterialId === MAT_B1);
    expect(lineB).toBeDefined();
    expect(lineB!.totalQuantity).toBe(20);
    expect(lineB!.contributions[0]).toEqual({ company_id: COMPANY_B, quantity: 20 });
  });

  it("keeps materials of the same company separate when they have no usable mapping between them", () => {
    const items: PoolEligibleItem[] = [
      makeItem(COMPANY_A, MAT_A1, "Cemento", 5),
      makeItem(COMPANY_A, MAT_A2, "Ladrillos", 100),
    ];

    const result = crossPoolItems(items, []);

    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// non-usable mappings are ignored
// ---------------------------------------------------------------------------

describe("crossPoolItems — non-usable mappings are ignored", () => {
  it("does NOT merge when the only mapping between two materials is usable=false", () => {
    const items: PoolEligibleItem[] = [
      makeItem(COMPANY_A, MAT_A1, "Cemento", 10),
      makeItem(COMPANY_B, MAT_B1, "Cemento fino", 15),
    ];
    const mappings: Mapping[] = [makeMapping(MAT_A1, MAT_B1, false)];

    const result = crossPoolItems(items, mappings);

    expect(result).toHaveLength(2);
    const ids = result.map((l) => l.canonicalMaterialId);
    expect(ids).toContain(MAT_A1);
    expect(ids).toContain(MAT_B1);
  });

  it("merges when usable=true but ignores the non-usable variant of the same pair", () => {
    const items: PoolEligibleItem[] = [
      makeItem(COMPANY_A, MAT_A1, "Cemento", 10),
      makeItem(COMPANY_B, MAT_B1, "Cemento fino", 15),
    ];
    // usable mapping present → should merge; the non-usable one is a no-op
    const mappings: Mapping[] = [
      makeMapping(MAT_A1, MAT_B1, true),
      makeMapping(MAT_A1, MAT_B1, false), // duplicate non-usable — must be ignored
    ];

    const result = crossPoolItems(items, mappings);

    expect(result).toHaveLength(1);
    expect(result[0].totalQuantity).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// two companies' mapped materials merge into one line with both contributions
// ---------------------------------------------------------------------------

describe("crossPoolItems — usable mapping merges two companies into one line", () => {
  it("merges A's material and B's material into a single consolidated line", () => {
    const items: PoolEligibleItem[] = [
      makeItem(COMPANY_A, MAT_A1, "Cemento Portland", 10),
      makeItem(COMPANY_B, MAT_B1, "Cemento gris", 15),
    ];
    const mappings: Mapping[] = [makeMapping(MAT_A1, MAT_B1)];

    const result = crossPoolItems(items, mappings);

    expect(result).toHaveLength(1);

    const line = result[0];
    expect(line.totalQuantity).toBe(25);
    expect(line.contributions).toHaveLength(2);

    const contribA = line.contributions.find((c) => c.company_id === COMPANY_A);
    const contribB = line.contributions.find((c) => c.company_id === COMPANY_B);
    expect(contribA).toBeDefined();
    expect(contribB).toBeDefined();
    expect(contribA!.quantity).toBe(10);
    expect(contribB!.quantity).toBe(15);
  });

  it("canonical material is deterministic (one of the two material IDs)", () => {
    const items: PoolEligibleItem[] = [
      makeItem(COMPANY_A, MAT_A1, "Cemento A", 5),
      makeItem(COMPANY_B, MAT_B1, "Cemento B", 8),
    ];
    const mappings: Mapping[] = [makeMapping(MAT_A1, MAT_B1)];

    const result = crossPoolItems(items, mappings);

    expect(result).toHaveLength(1);
    expect([MAT_A1, MAT_B1]).toContain(result[0].canonicalMaterialId);
  });

  it("the mapping direction (a→b vs b→a) does not affect the merge result", () => {
    const items: PoolEligibleItem[] = [
      makeItem(COMPANY_A, MAT_A1, "Cemento A", 10),
      makeItem(COMPANY_B, MAT_B1, "Cemento B", 15),
    ];

    const forwardResult = crossPoolItems(items, [makeMapping(MAT_A1, MAT_B1)]);
    const reverseResult = crossPoolItems(items, [makeMapping(MAT_B1, MAT_A1)]);

    expect(forwardResult).toHaveLength(1);
    expect(reverseResult).toHaveLength(1);
    expect(forwardResult[0].totalQuantity).toBe(reverseResult[0].totalQuantity);
  });

  it("contributions sum to total quantity", () => {
    const items: PoolEligibleItem[] = [
      makeItem(COMPANY_A, MAT_A1, "Cemento A", 10),
      makeItem(COMPANY_B, MAT_B1, "Cemento B", 15),
    ];
    const mappings: Mapping[] = [makeMapping(MAT_A1, MAT_B1)];

    const result = crossPoolItems(items, mappings);

    for (const line of result) {
      const contributionsSum = line.contributions.reduce(
        (acc, c) => acc + c.quantity,
        0
      );
      expect(contributionsSum).toBeCloseTo(line.totalQuantity, 6);
    }
  });
});

// ---------------------------------------------------------------------------
// mixed scenario: some mapped, some not
// ---------------------------------------------------------------------------

describe("crossPoolItems — mixed mapped and unmapped", () => {
  it("merges only the mapped pair while leaving the unmapped materials separate", () => {
    const items: PoolEligibleItem[] = [
      makeItem(COMPANY_A, MAT_A1, "Cemento", 10),
      makeItem(COMPANY_A, MAT_A2, "Ladrillos", 50, "u"),
      makeItem(COMPANY_B, MAT_B1, "Cemento gris", 20),
      makeItem(COMPANY_B, MAT_B2, "Aridos", 100, "kg"),
    ];
    // Only MAT_A1 ↔ MAT_B1 is usable
    const mappings: Mapping[] = [
      makeMapping(MAT_A1, MAT_B1, true),
      makeMapping(MAT_A2, MAT_B2, false), // non-usable — should NOT merge
    ];

    const result = crossPoolItems(items, mappings);

    // Merged line for A1+B1; separate lines for A2 and B2
    expect(result).toHaveLength(3);

    const mergedLine = result.find((l) => l.totalQuantity === 30);
    expect(mergedLine).toBeDefined();
    expect(mergedLine!.contributions).toHaveLength(2);

    const lineA2 = result.find((l) => l.canonicalMaterialId === MAT_A2);
    expect(lineA2).toBeDefined();
    expect(lineA2!.totalQuantity).toBe(50);

    const lineB2 = result.find((l) => l.canonicalMaterialId === MAT_B2);
    expect(lineB2).toBeDefined();
    expect(lineB2!.totalQuantity).toBe(100);
  });

  it("contributions across all lines sum to the total items quantity", () => {
    const items: PoolEligibleItem[] = [
      makeItem(COMPANY_A, MAT_A1, "Cemento", 10),
      makeItem(COMPANY_A, MAT_A2, "Ladrillos", 50, "u"),
      makeItem(COMPANY_B, MAT_B1, "Cemento gris", 20),
    ];
    const mappings: Mapping[] = [makeMapping(MAT_A1, MAT_B1)];

    const result = crossPoolItems(items, mappings);

    const grandTotal = items.reduce((sum, i) => sum + i.quantity, 0);
    const contributionsTotal = result
      .flatMap((l) => l.contributions)
      .reduce((sum, c) => sum + c.quantity, 0);

    expect(contributionsTotal).toBeCloseTo(grandTotal, 6);
  });
});

// ---------------------------------------------------------------------------
// same company, multiple items of the same material
// ---------------------------------------------------------------------------

describe("crossPoolItems — multiple items of the same material from one company", () => {
  it("aggregates multiple items of the same material from the same company into one contribution", () => {
    const items: PoolEligibleItem[] = [
      makeItem(COMPANY_A, MAT_A1, "Cemento bolsa 50kg", 5),
      makeItem(COMPANY_A, MAT_A1, "Cemento bolsa 25kg", 3),
    ];

    const result = crossPoolItems(items, []);

    expect(result).toHaveLength(1);
    expect(result[0].totalQuantity).toBe(8);
    expect(result[0].contributions).toHaveLength(1);
    expect(result[0].contributions[0]).toEqual({ company_id: COMPANY_A, quantity: 8 });
  });

  it("aggregates items from both companies for the same canonical material", () => {
    const items: PoolEligibleItem[] = [
      makeItem(COMPANY_A, MAT_A1, "Cemento bolsa A", 5),
      makeItem(COMPANY_A, MAT_A1, "Cemento bolsa A extra", 3),
      makeItem(COMPANY_B, MAT_B1, "Cemento B", 12),
    ];
    const mappings: Mapping[] = [makeMapping(MAT_A1, MAT_B1)];

    const result = crossPoolItems(items, mappings);

    expect(result).toHaveLength(1);
    expect(result[0].totalQuantity).toBe(20);

    const contribA = result[0].contributions.find((c) => c.company_id === COMPANY_A);
    expect(contribA!.quantity).toBe(8);

    const contribB = result[0].contributions.find((c) => c.company_id === COMPANY_B);
    expect(contribB!.quantity).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// transitive mappings (union-find — if A↔B and B↔C then A and C merge too)
// ---------------------------------------------------------------------------

describe("crossPoolItems — transitive mapping chains", () => {
  const COMPANY_C = "company-c";
  const MAT_C1 = "mat-c1";

  it("merges three materials connected transitively via usable mappings", () => {
    const items: PoolEligibleItem[] = [
      makeItem(COMPANY_A, MAT_A1, "Cemento A", 10),
      makeItem(COMPANY_B, MAT_B1, "Cemento B", 15),
      makeItem(COMPANY_C, MAT_C1, "Cemento C", 5),
    ];
    const mappings: Mapping[] = [
      makeMapping(MAT_A1, MAT_B1), // A↔B
      makeMapping(MAT_B1, MAT_C1), // B↔C → A↔B↔C transitively
    ];

    const result = crossPoolItems(items, mappings);

    expect(result).toHaveLength(1);
    expect(result[0].totalQuantity).toBe(30);
    expect(result[0].contributions).toHaveLength(3);
  });

  it("does NOT merge when the transitive link has a non-usable hop", () => {
    const items: PoolEligibleItem[] = [
      makeItem(COMPANY_A, MAT_A1, "Cemento A", 10),
      makeItem(COMPANY_B, MAT_B1, "Cemento B", 15),
      makeItem(COMPANY_C, MAT_C1, "Cemento C", 5),
    ];
    const mappings: Mapping[] = [
      makeMapping(MAT_A1, MAT_B1, true),
      makeMapping(MAT_B1, MAT_C1, false), // non-usable: C stays separate
    ];

    const result = crossPoolItems(items, mappings);

    // A+B merge, C stays separate
    expect(result).toHaveLength(2);

    const mergedLine = result.find((l) => l.totalQuantity === 25);
    expect(mergedLine).toBeDefined();

    const cLine = result.find((l) => l.canonicalMaterialId === MAT_C1);
    expect(cLine).toBeDefined();
    expect(cLine!.totalQuantity).toBe(5);
  });
});
