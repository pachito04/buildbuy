import { describe, it, expect } from "vitest";
import { distributeByUrgency } from "../distribucion-utils";

describe("distributeByUrgency", () => {
  it("empty sources returns empty array", () => {
    expect(distributeByUrgency(10, [])).toEqual([]);
  });

  it("received 0 allocates 0 to all sources", () => {
    const result = distributeByUrgency(0, [
      { id: "a", requestedQty: 10, urgent: true },
      { id: "b", requestedQty: 5, urgent: false },
    ]);
    expect(result).toEqual([
      { id: "a", allocatedQty: 0 },
      { id: "b", allocatedQty: 0 },
    ]);
  });

  it("shortfall: urgent source served first to full, remainder to non-urgent", () => {
    // A req10 urgent + B req10 not, received 12 → A=10, B=2
    const result = distributeByUrgency(12, [
      { id: "A", requestedQty: 10, urgent: true },
      { id: "B", requestedQty: 10, urgent: false },
    ]);
    expect(result).toEqual([
      { id: "A", allocatedQty: 10 },
      { id: "B", allocatedQty: 2 },
    ]);
  });

  it("full coverage: received >= total requested allocates everyone fully", () => {
    const result = distributeByUrgency(30, [
      { id: "x", requestedQty: 10, urgent: false },
      { id: "y", requestedQty: 15, urgent: true },
      { id: "z", requestedQty: 5, urgent: false },
    ]);
    expect(result).toEqual([
      { id: "x", allocatedQty: 10 },
      { id: "y", allocatedQty: 15 },
      { id: "z", allocatedQty: 5 },
    ]);
  });

  it("no over-allocation: single source requested 10, received 100 → allocated 10", () => {
    const result = distributeByUrgency(100, [
      { id: "sole", requestedQty: 10, urgent: false },
    ]);
    expect(result).toEqual([{ id: "sole", allocatedQty: 10 }]);
  });

  it("multiple urgent sources: stable order preserved within urgent group", () => {
    // U1 req5 urgent, U2 req8 urgent, N1 req10 not-urgent; received 10
    // sorted: U1, U2, N1 → U1=5, U2=5, N1=0
    const result = distributeByUrgency(10, [
      { id: "U1", requestedQty: 5, urgent: true },
      { id: "U2", requestedQty: 8, urgent: true },
      { id: "N1", requestedQty: 10, urgent: false },
    ]);
    expect(result).toEqual([
      { id: "U1", allocatedQty: 5 },
      { id: "U2", allocatedQty: 5 },
      { id: "N1", allocatedQty: 0 },
    ]);
  });

  it("multiple non-urgent: stable order preserved within non-urgent group", () => {
    // N1 req6, N2 req6 (both not urgent); received 8 → N1=6, N2=2
    const result = distributeByUrgency(8, [
      { id: "N1", requestedQty: 6, urgent: false },
      { id: "N2", requestedQty: 6, urgent: false },
    ]);
    expect(result).toEqual([
      { id: "N1", allocatedQty: 6 },
      { id: "N2", allocatedQty: 2 },
    ]);
  });

  it("urgent source after non-urgent in input: urgent is still served first", () => {
    // Input order: non-urgent first, urgent second — urgent must still be prioritized
    const result = distributeByUrgency(8, [
      { id: "notUrgent", requestedQty: 10, urgent: false },
      { id: "urgent", requestedQty: 6, urgent: true },
    ]);
    expect(result).toEqual([
      { id: "notUrgent", allocatedQty: 2 },
      { id: "urgent", allocatedQty: 6 },
    ]);
  });

  it("received exactly equals one source's requested (full allocation to urgent, nothing for others)", () => {
    const result = distributeByUrgency(5, [
      { id: "A", requestedQty: 5, urgent: true },
      { id: "B", requestedQty: 10, urgent: false },
    ]);
    expect(result).toEqual([
      { id: "A", allocatedQty: 5 },
      { id: "B", allocatedQty: 0 },
    ]);
  });
});
