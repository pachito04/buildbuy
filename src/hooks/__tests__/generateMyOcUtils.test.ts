/**
 * generateMyOcUtils.test.ts
 *
 * T19 — Pure function tests for groupAwardsByProvider.
 *
 * groupAwardsByProvider(awards: PoolCompanyAward[], quoteItems: QuoteItemWithProvider[])
 *   → OcDescriptor[]
 *
 * Spec requirement: GAP2 — generateMyOc in Mode B uses company's own selected
 * winner; multi-OC per provider (group awards by provider_id).
 *
 * T19 is RED until T20 creates src/lib/pool-award-utils.ts with the function.
 */

import { describe, it, expect } from "vitest";
import {
  groupAwardsByProvider,
  type PoolCompanyAward,
  type QuoteItemWithProvider,
  type OcDescriptor,
} from "@/lib/pool-award-utils";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const quoteItems: QuoteItemWithProvider[] = [
  {
    id: "qitem-A1",
    rfq_item_id: "item-1",
    provider_id: "provider-PA",
    unit_price: 100,
    description: "Cement",
    unit: "bag",
  },
  {
    id: "qitem-B1",
    rfq_item_id: "item-2",
    provider_id: "provider-PB",
    unit_price: 200,
    description: "Steel",
    unit: "kg",
  },
  {
    id: "qitem-A2",
    rfq_item_id: "item-3",
    provider_id: "provider-PA",
    unit_price: 150,
    description: "Sand",
    unit: "ton",
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("T19 — groupAwardsByProvider", () => {
  it("groups awards for same provider into one OC descriptor", () => {
    // awards for items 1 (PA) and 3 (PA) → 1 OC descriptor for PA
    // award for item 2 (PB) → 1 OC descriptor for PB
    const awards: PoolCompanyAward[] = [
      { rfq_item_id: "item-1", winning_quote_item_id: "qitem-A1" },
      { rfq_item_id: "item-2", winning_quote_item_id: "qitem-B1" },
      { rfq_item_id: "item-3", winning_quote_item_id: "qitem-A2" },
    ];

    const result = groupAwardsByProvider(awards, quoteItems);

    expect(result).toHaveLength(2);

    const ocForPA = result.find((oc) => oc.provider_id === "provider-PA");
    const ocForPB = result.find((oc) => oc.provider_id === "provider-PB");

    expect(ocForPA).toBeDefined();
    expect(ocForPB).toBeDefined();

    // PA OC has 2 items: item-1 and item-3
    expect(ocForPA!.items).toHaveLength(2);
    const itemIds = ocForPA!.items.map((i) => i.rfq_item_id).sort();
    expect(itemIds).toEqual(["item-1", "item-3"]);

    // PB OC has 1 item: item-2
    expect(ocForPB!.items).toHaveLength(1);
    expect(ocForPB!.items[0].rfq_item_id).toBe("item-2");
  });

  it("returns 1 OC descriptor when all awards point to the same provider", () => {
    // All items resolved through quoteItems that map to provider-PA
    const singleProviderQuoteItems: QuoteItemWithProvider[] = [
      {
        id: "qitem-1",
        rfq_item_id: "item-1",
        provider_id: "provider-PA",
        unit_price: 100,
        description: "Cement",
        unit: "bag",
      },
      {
        id: "qitem-2",
        rfq_item_id: "item-2",
        provider_id: "provider-PA",
        unit_price: 200,
        description: "Steel",
        unit: "kg",
      },
    ];

    const awards: PoolCompanyAward[] = [
      { rfq_item_id: "item-1", winning_quote_item_id: "qitem-1" },
      { rfq_item_id: "item-2", winning_quote_item_id: "qitem-2" },
    ];

    const result = groupAwardsByProvider(awards, singleProviderQuoteItems);

    expect(result).toHaveLength(1);
    expect(result[0].provider_id).toBe("provider-PA");
    expect(result[0].items).toHaveLength(2);
  });

  it("returns empty array when awards is empty", () => {
    const result = groupAwardsByProvider([], quoteItems);
    expect(result).toHaveLength(0);
    expect(result).toEqual([]);
  });

  it("skips awards whose winning_quote_item_id is not in quoteItems", () => {
    // award references a qitem that doesn't exist in the quoteItems list
    const awards: PoolCompanyAward[] = [
      { rfq_item_id: "item-1", winning_quote_item_id: "qitem-NONEXISTENT" },
      { rfq_item_id: "item-2", winning_quote_item_id: "qitem-B1" },
    ];

    const result = groupAwardsByProvider(awards, quoteItems);

    // Only item-2 (PB) resolves; item-1 is skipped
    expect(result).toHaveLength(1);
    expect(result[0].provider_id).toBe("provider-PB");
    expect(result[0].items).toHaveLength(1);
    expect(result[0].items[0].rfq_item_id).toBe("item-2");
  });

  it("OcDescriptor items carry unit_price and description from quoteItems", () => {
    const awards: PoolCompanyAward[] = [
      { rfq_item_id: "item-1", winning_quote_item_id: "qitem-A1" },
    ];

    const result = groupAwardsByProvider(awards, quoteItems);

    expect(result).toHaveLength(1);
    const item = result[0].items[0];
    expect(item.unit_price).toBe(100);
    expect(item.description).toBe("Cement");
    expect(item.unit).toBe("bag");
    expect(item.rfq_item_id).toBe("item-1");
    expect(item.quote_item_id).toBe("qitem-A1");
  });
});
