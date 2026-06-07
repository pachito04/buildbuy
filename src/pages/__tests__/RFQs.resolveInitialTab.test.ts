import { describe, it, expect } from "vitest";
import { resolveInitialTab } from "../RFQs.utils";

// ---------------------------------------------------------------------------
// T10 — resolveInitialTab
// Pure function: derives the initial RfqTab from location.state.
// ---------------------------------------------------------------------------

type RfqTab = "nuevo" | "cesta" | "pool" | "consolidar" | "vigentes" | "historico";

describe("resolveInitialTab", () => {
  it('returns "consolidar" when state.openTab is "consolidar"', () => {
    expect(resolveInitialTab({ openTab: "consolidar" })).toBe<RfqTab>("consolidar");
  });

  it('returns "vigentes" when state is null', () => {
    expect(resolveInitialTab(null)).toBe<RfqTab>("vigentes");
  });

  it('returns "vigentes" when state is undefined', () => {
    expect(resolveInitialTab(undefined)).toBe<RfqTab>("vigentes");
  });

  it('returns "vigentes" when state.openTab is an unknown value', () => {
    // Unknown values fall back to "vigentes" (safe default)
    expect(resolveInitialTab({ openTab: "unknown-tab" })).toBe<RfqTab>("vigentes");
  });

  it('returns "historico" when state.openTab is "historico"', () => {
    expect(resolveInitialTab({ openTab: "historico" })).toBe<RfqTab>("historico");
  });

  it('returns "nuevo" when state.openTab is "nuevo"', () => {
    expect(resolveInitialTab({ openTab: "nuevo" })).toBe<RfqTab>("nuevo");
  });

  it('returns "vigentes" when state has no openTab property', () => {
    expect(resolveInitialTab({})).toBe<RfqTab>("vigentes");
  });
});
