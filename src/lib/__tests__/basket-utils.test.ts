import { describe, it, expect } from "vitest";
import { basketLineId, mergeBasketItem } from "../basket-utils";
import type { BasketItem } from "../basket-utils";

describe("basketLineId", () => {
  it("returns <material_id>::libre when request_item_id is null", () => {
    expect(basketLineId("mat-1", null)).toBe("mat-1::libre");
  });

  it("returns <material_id>::<request_item_id> for a requisition item", () => {
    expect(basketLineId("mat-1", "req-item-42")).toBe("mat-1::req-item-42");
  });

  it("different origins produce different ids for the same material", () => {
    const id1 = basketLineId("mat-1", null);
    const id2 = basketLineId("mat-1", "req-item-5");
    expect(id1).not.toBe(id2);
  });
});

describe("mergeBasketItem", () => {
  const base: BasketItem = {
    id: "mat-A::libre",
    material_id: "mat-A",
    name: "Cemento",
    unit: "kg",
    quantity: 10,
    origen: "Libre",
    request_id: null,
    request_item_id: null,
  };

  it("sums quantity when same id already exists", () => {
    const incoming: BasketItem = { ...base, quantity: 5 };
    const result = mergeBasketItem([base], incoming);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(15);
  });

  it("keeps lines separate for different origins of the same material", () => {
    const fromReq: BasketItem = {
      id: "mat-A::req-item-1",
      material_id: "mat-A",
      name: "Cemento",
      unit: "kg",
      quantity: 20,
      origen: "Requerimiento #1",
      request_id: "req-1",
      request_item_id: "req-item-1",
    };
    const result = mergeBasketItem([base], fromReq);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("mat-A::libre");
    expect(result[1].id).toBe("mat-A::req-item-1");
  });

  it("appends a new item when id does not exist yet", () => {
    const newItem: BasketItem = {
      id: "mat-B::libre",
      material_id: "mat-B",
      name: "Arena",
      unit: "m3",
      quantity: 3,
      origen: "Libre",
      request_id: null,
      request_item_id: null,
    };
    const result = mergeBasketItem([base], newItem);
    expect(result).toHaveLength(2);
    expect(result[1].material_id).toBe("mat-B");
  });

  it("does not mutate the original array", () => {
    const arr = [base];
    const incoming: BasketItem = { ...base, quantity: 5 };
    mergeBasketItem(arr, incoming);
    expect(arr[0].quantity).toBe(10);
  });
});
