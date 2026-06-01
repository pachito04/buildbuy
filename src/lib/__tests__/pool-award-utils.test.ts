import { describe, it, expect } from "vitest";
import { companyOcLines } from "../pool-award-utils";
import type { WinningLine, MyContribution, OcLine } from "../pool-award-utils";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const MAT_CEMENTO = "mat-cemento";
const MAT_ARENA = "mat-arena";
const MAT_LADRILLO = "mat-ladrillo";

function makeWinning(
  material_id: string,
  description: string,
  unit: string,
  unit_price: number
): WinningLine {
  return { material_id, description, unit, unit_price };
}

function makeContrib(material_id: string, quantity: number): MyContribution {
  return { material_id, quantity };
}

// ---------------------------------------------------------------------------
// empty inputs
// ---------------------------------------------------------------------------

describe("companyOcLines — empty inputs", () => {
  it("returns [] when both winning and myContribs are empty", () => {
    const result = companyOcLines([], []);
    expect(result).toEqual([]);
  });

  it("returns [] when winning is empty but myContribs exists", () => {
    const result = companyOcLines([], [makeContrib(MAT_CEMENTO, 10)]);
    expect(result).toEqual([]);
  });

  it("returns [] when myContribs is empty but winning lines exist", () => {
    const result = companyOcLines(
      [makeWinning(MAT_CEMENTO, "Cemento Portland", "bolsa", 1200)],
      []
    );
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// only my contribution quantity — not the total pool quantity
// ---------------------------------------------------------------------------

describe("companyOcLines — orders only my contributed quantity", () => {
  it("emits a line with quantity = my contribution, not the full pool total", () => {
    const winning: WinningLine[] = [
      makeWinning(MAT_CEMENTO, "Cemento Portland", "bolsa", 1200),
    ];
    // Pool total might be 25 (A=10 + B=15), but this company contributed 15
    const myContribs: MyContribution[] = [makeContrib(MAT_CEMENTO, 15)];

    const result = companyOcLines(winning, myContribs);

    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(15);
  });

  it("does not include other companies' quantities", () => {
    const winning: WinningLine[] = [
      makeWinning(MAT_CEMENTO, "Cemento Portland", "bolsa", 1200),
    ];
    const myContribs: MyContribution[] = [makeContrib(MAT_CEMENTO, 10)];

    const result = companyOcLines(winning, myContribs);

    expect(result[0].quantity).toBe(10);
    // Ensure no phantom extra lines
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// excludes materials this company did not contribute to
// ---------------------------------------------------------------------------

describe("companyOcLines — excludes non-contributed materials", () => {
  it("skips a winning line when there is no matching contribution", () => {
    const winning: WinningLine[] = [
      makeWinning(MAT_CEMENTO, "Cemento Portland", "bolsa", 1200),
      makeWinning(MAT_ARENA, "Arena fina", "m3", 800),
    ];
    // Company only contributed to cement, not to sand
    const myContribs: MyContribution[] = [makeContrib(MAT_CEMENTO, 10)];

    const result = companyOcLines(winning, myContribs);

    expect(result).toHaveLength(1);
    expect(result[0].material_id).toBe(MAT_CEMENTO);
  });

  it("skips all winning lines when there are no matching contributions", () => {
    const winning: WinningLine[] = [
      makeWinning(MAT_CEMENTO, "Cemento Portland", "bolsa", 1200),
      makeWinning(MAT_ARENA, "Arena fina", "m3", 800),
    ];
    const myContribs: MyContribution[] = [makeContrib(MAT_LADRILLO, 500)];

    const result = companyOcLines(winning, myContribs);

    expect(result).toEqual([]);
  });

  it("a contribution with no matching winning line is silently ignored", () => {
    const winning: WinningLine[] = [
      makeWinning(MAT_CEMENTO, "Cemento Portland", "bolsa", 1200),
    ];
    // Company contributed to both cement AND sand, but sand was not awarded
    const myContribs: MyContribution[] = [
      makeContrib(MAT_CEMENTO, 10),
      makeContrib(MAT_ARENA, 5), // no winning line for this
    ];

    const result = companyOcLines(winning, myContribs);

    expect(result).toHaveLength(1);
    expect(result[0].material_id).toBe(MAT_CEMENTO);
  });
});

// ---------------------------------------------------------------------------
// unit_price comes from the winning line, not from the contribution
// ---------------------------------------------------------------------------

describe("companyOcLines — price from winning line", () => {
  it("uses the winning unit_price for the emitted OC line", () => {
    const winning: WinningLine[] = [
      makeWinning(MAT_CEMENTO, "Cemento Portland", "bolsa", 1350),
    ];
    const myContribs: MyContribution[] = [makeContrib(MAT_CEMENTO, 20)];

    const result = companyOcLines(winning, myContribs);

    expect(result[0].unit_price).toBe(1350);
  });

  it("each OC line carries its own winning price when multiple materials are present", () => {
    const winning: WinningLine[] = [
      makeWinning(MAT_CEMENTO, "Cemento Portland", "bolsa", 1350),
      makeWinning(MAT_ARENA, "Arena fina", "m3", 850),
    ];
    const myContribs: MyContribution[] = [
      makeContrib(MAT_CEMENTO, 20),
      makeContrib(MAT_ARENA, 8),
    ];

    const result = companyOcLines(winning, myContribs);

    expect(result).toHaveLength(2);
    const cementoLine = result.find((l) => l.material_id === MAT_CEMENTO)!;
    const arenaLine = result.find((l) => l.material_id === MAT_ARENA)!;
    expect(cementoLine.unit_price).toBe(1350);
    expect(arenaLine.unit_price).toBe(850);
  });
});

// ---------------------------------------------------------------------------
// multi-line: multiple materials, all fields are correct
// ---------------------------------------------------------------------------

describe("companyOcLines — multi-line output", () => {
  it("emits one OC line per matching material, preserving description and unit from winning", () => {
    const winning: WinningLine[] = [
      makeWinning(MAT_CEMENTO, "Cemento Portland 50kg", "bolsa", 1200),
      makeWinning(MAT_ARENA, "Arena gruesa lavada", "m3", 900),
      makeWinning(MAT_LADRILLO, "Ladrillo común 8x18x33", "u", 45),
    ];
    const myContribs: MyContribution[] = [
      makeContrib(MAT_CEMENTO, 30),
      makeContrib(MAT_ARENA, 12),
      makeContrib(MAT_LADRILLO, 1000),
    ];

    const result = companyOcLines(winning, myContribs);

    expect(result).toHaveLength(3);

    const expected: OcLine[] = [
      {
        material_id: MAT_CEMENTO,
        description: "Cemento Portland 50kg",
        unit: "bolsa",
        quantity: 30,
        unit_price: 1200,
      },
      {
        material_id: MAT_ARENA,
        description: "Arena gruesa lavada",
        unit: "m3",
        quantity: 12,
        unit_price: 900,
      },
      {
        material_id: MAT_LADRILLO,
        description: "Ladrillo común 8x18x33",
        unit: "u",
        quantity: 1000,
        unit_price: 45,
      },
    ];

    for (const exp of expected) {
      const actual = result.find((l) => l.material_id === exp.material_id);
      expect(actual).toEqual(exp);
    }
  });
});

// ---------------------------------------------------------------------------
// output shape is complete and correctly typed
// ---------------------------------------------------------------------------

describe("companyOcLines — output shape", () => {
  it("each returned OcLine has all required fields", () => {
    const winning: WinningLine[] = [
      makeWinning(MAT_CEMENTO, "Cemento Portland", "bolsa", 1200),
    ];
    const myContribs: MyContribution[] = [makeContrib(MAT_CEMENTO, 15)];

    const result = companyOcLines(winning, myContribs);

    expect(result).toHaveLength(1);
    const line = result[0];
    expect(line).toHaveProperty("material_id");
    expect(line).toHaveProperty("description");
    expect(line).toHaveProperty("unit");
    expect(line).toHaveProperty("quantity");
    expect(line).toHaveProperty("unit_price");
  });

  it("description and unit are copied verbatim from the winning line", () => {
    const winning: WinningLine[] = [
      makeWinning(MAT_CEMENTO, "Cemento Portland 50kg", "bolsa", 1200),
    ];
    const myContribs: MyContribution[] = [makeContrib(MAT_CEMENTO, 15)];

    const result = companyOcLines(winning, myContribs);

    expect(result[0].description).toBe("Cemento Portland 50kg");
    expect(result[0].unit).toBe("bolsa");
  });
});
