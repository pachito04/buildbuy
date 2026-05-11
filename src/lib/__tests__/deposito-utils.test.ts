import { describe, it, expect } from "vitest";
import {
  availableStock,
  isLowStock,
  reservationCalc,
  dispatchCalc,
  inventoryAfterDispatch,
  receptionValidation,
  inventoryAfterReception,
} from "../deposito-utils";

describe("availableStock", () => {
  it("returns quantity minus reserved", () => {
    expect(availableStock({ quantity: 100, reserved: 30, min_stock: 10 })).toBe(70);
  });

  it("returns 0 when reserved exceeds quantity", () => {
    expect(availableStock({ quantity: 10, reserved: 15, min_stock: 5 })).toBe(0);
  });

  it("returns full quantity when nothing reserved", () => {
    expect(availableStock({ quantity: 50, reserved: 0, min_stock: 5 })).toBe(50);
  });
});

describe("isLowStock", () => {
  it("true when available equals min_stock", () => {
    expect(isLowStock({ quantity: 20, reserved: 10, min_stock: 10 })).toBe(true);
  });

  it("true when available is below min_stock", () => {
    expect(isLowStock({ quantity: 20, reserved: 15, min_stock: 10 })).toBe(true);
  });

  it("false when available exceeds min_stock", () => {
    expect(isLowStock({ quantity: 100, reserved: 10, min_stock: 10 })).toBe(false);
  });

  it("true when all stock is reserved", () => {
    expect(isLowStock({ quantity: 50, reserved: 50, min_stock: 0 })).toBe(true);
  });
});

describe("reservationCalc", () => {
  it("reserves full amount when stock is sufficient", () => {
    const result = reservationCalc(10, 50);
    expect(result).toEqual({
      toReserve: 10,
      remaining: 0,
      hasStock: true,
      needsRfq: false,
      fullyStocked: true,
    });
  });

  it("reserves partial when stock is insufficient", () => {
    const result = reservationCalc(20, 8);
    expect(result).toEqual({
      toReserve: 8,
      remaining: 12,
      hasStock: true,
      needsRfq: true,
      fullyStocked: false,
    });
  });

  it("reserves nothing when no stock available", () => {
    const result = reservationCalc(10, 0);
    expect(result).toEqual({
      toReserve: 0,
      remaining: 10,
      hasStock: false,
      needsRfq: true,
      fullyStocked: false,
    });
  });

  it("handles negative available as zero", () => {
    const result = reservationCalc(5, -3);
    expect(result.toReserve).toBe(0);
    expect(result.remaining).toBe(5);
  });
});

describe("dispatchCalc", () => {
  it("dispatches full pending amount", () => {
    const result = dispatchCalc({ quantity: 20, quantity_delivered: 0 }, 20);
    expect(result).toEqual({
      pending: 20,
      dispatched: 20,
      newDelivered: 20,
      remainingAfter: 0,
      isComplete: true,
    });
  });

  it("dispatches partial amount", () => {
    const result = dispatchCalc({ quantity: 20, quantity_delivered: 0 }, 12);
    expect(result).toEqual({
      pending: 20,
      dispatched: 12,
      newDelivered: 12,
      remainingAfter: 8,
      isComplete: false,
    });
  });

  it("clamps to pending when dispatch exceeds", () => {
    const result = dispatchCalc({ quantity: 10, quantity_delivered: 5 }, 100);
    expect(result.dispatched).toBe(5);
    expect(result.isComplete).toBe(true);
  });

  it("handles already partially delivered", () => {
    const result = dispatchCalc({ quantity: 30, quantity_delivered: 10 }, 15);
    expect(result.pending).toBe(20);
    expect(result.dispatched).toBe(15);
    expect(result.newDelivered).toBe(25);
    expect(result.remainingAfter).toBe(5);
  });

  it("clamps negative dispatch to zero", () => {
    const result = dispatchCalc({ quantity: 10, quantity_delivered: 0 }, -5);
    expect(result.dispatched).toBe(0);
  });
});

describe("inventoryAfterDispatch", () => {
  it("decrements both quantity and reserved", () => {
    const result = inventoryAfterDispatch(
      { quantity: 100, reserved: 30, min_stock: 10 },
      20
    );
    expect(result).toEqual({ quantity: 80, reserved: 10 });
  });

  it("floors at zero", () => {
    const result = inventoryAfterDispatch(
      { quantity: 5, reserved: 3, min_stock: 0 },
      10
    );
    expect(result).toEqual({ quantity: 0, reserved: 0 });
  });
});

describe("receptionValidation", () => {
  it("valid when accepted within pending", () => {
    const result = receptionValidation({ accepted: 10, rejected: 0, pending: 20 });
    expect(result.valid).toBe(true);
    expect(result.newQuantityReceived).toBe(10);
  });

  it("valid with mixed accepted and rejected", () => {
    const result = receptionValidation({ accepted: 8, rejected: 2, pending: 10 });
    expect(result.valid).toBe(true);
  });

  it("invalid when total exceeds pending", () => {
    const result = receptionValidation({ accepted: 15, rejected: 10, pending: 20 });
    expect(result.valid).toBe(false);
    expect(result.overPending).toBe(true);
  });

  it("invalid when nothing received", () => {
    const result = receptionValidation({ accepted: 0, rejected: 0, pending: 10 });
    expect(result.valid).toBe(false);
    expect(result.empty).toBe(true);
  });

  it("valid with full rejection", () => {
    const result = receptionValidation({ accepted: 0, rejected: 5, pending: 10 });
    expect(result.valid).toBe(true);
  });
});

describe("inventoryAfterReception", () => {
  it("increments stock by accepted amount", () => {
    expect(inventoryAfterReception(100, 25)).toBe(125);
  });

  it("no change when zero accepted", () => {
    expect(inventoryAfterReception(50, 0)).toBe(50);
  });
});
