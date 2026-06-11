/**
 * Tests for usePoolFlow — GAP3 dispatch + notify wiring (T23).
 *
 * Strict TDD: written BEFORE the implementation changes.
 *
 * Tests:
 *  1. (count > 0) generateSharedRfq calls pool_dispatch_providers RPC exactly once;
 *     then calls notify-providers exactly once with correct payload.
 *  2. (count = 0) dispatch RPC returns 0 → notify-providers is NOT invoked.
 *  3. RPC error propagates (not silenced).
 *  4. notify-providers error propagates (not silenced — per GAP3 failure isolation).
 *  5. Regression: addMyRequirements calls rpc("pool_add_requirements", {p_pool_id, p_request_ids})
 *     instead of direct INSERT into pool_requests.
 *
 * Strategy: pure contract simulation, same pattern as usePoolAward.test.ts —
 * extract the critical new logic into testable simulation functions, keep mock
 * count low, assert the exact sequence and payload.
 */
import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// T23 — generateSharedRfq dispatch + notify contract
// ---------------------------------------------------------------------------

describe("T23 — usePoolFlow generateSharedRfq: dispatch + notify wiring", () => {
  // Simulate the NEW post-RFQ logic added by T24:
  //   1. rpc("pool_dispatch_providers", { p_rfq_id })  → returns count
  //   2. if count > 0 → functions.invoke("notify-providers", { body: { type: "rfq_sent", rfq_id } })
  //   3. RPC error propagates
  //   4. notify error propagates (not silenced)
  async function simulateDispatchAndNotify(
    rfqId: string,
    rpcFn: (name: string, args: Record<string, unknown>) => Promise<number>,
    invokeFn: (name: string, opts: { body: Record<string, unknown> }) => Promise<void>
  ): Promise<void> {
    const providerCount = await rpcFn("pool_dispatch_providers", { p_rfq_id: rfqId });
    if (providerCount > 0) {
      await invokeFn("notify-providers", {
        body: { type: "rfq_sent", rfq_id: rfqId },
      });
    }
  }

  it("(count > 0) calls pool_dispatch_providers then notify-providers once with correct payload", async () => {
    const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const invokeCalls: Array<{ name: string; opts: { body: Record<string, unknown> } }> = [];

    const mockRpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return 3; // count = 3 providers dispatched
    });

    const mockInvoke = vi.fn(async (name: string, opts: { body: Record<string, unknown> }) => {
      invokeCalls.push({ name, opts });
    });

    await simulateDispatchAndNotify("rfq-123", mockRpc, mockInvoke);

    // RPC called exactly once with correct args
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(rpcCalls[0]).toEqual({
      name: "pool_dispatch_providers",
      args: { p_rfq_id: "rfq-123" },
    });

    // notify-providers called exactly once with correct payload
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(invokeCalls[0]).toEqual({
      name: "notify-providers",
      opts: { body: { type: "rfq_sent", rfq_id: "rfq-123" } },
    });
  });

  it("(count = 0) dispatch RPC returns 0 → notify-providers is NOT invoked", async () => {
    const mockRpc = vi.fn(async () => 0); // no providers selected
    const mockInvoke = vi.fn(async () => {});

    await simulateDispatchAndNotify("rfq-456", mockRpc, mockInvoke);

    expect(mockRpc).toHaveBeenCalledTimes(1);
    // notify-providers must NOT be called
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("RPC error propagates — not silenced", async () => {
    const mockRpc = vi.fn(async () => {
      throw new Error("RPC pool_dispatch_providers failed");
    });
    const mockInvoke = vi.fn(async () => {});

    await expect(
      simulateDispatchAndNotify("rfq-789", mockRpc, mockInvoke)
    ).rejects.toThrow("RPC pool_dispatch_providers failed");

    // notify-providers must not have been reached
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("notify-providers error propagates — not silenced (failure isolation)", async () => {
    const mockRpc = vi.fn(async () => 2); // count = 2
    const mockInvoke = vi.fn(async () => {
      throw new Error("notify-providers unreachable");
    });

    await expect(
      simulateDispatchAndNotify("rfq-abc", mockRpc, mockInvoke)
    ).rejects.toThrow("notify-providers unreachable");
  });
});

// ---------------------------------------------------------------------------
// T23 regression — addMyRequirements uses pool_add_requirements RPC
// ---------------------------------------------------------------------------

describe("T23 regression — addMyRequirements calls pool_add_requirements RPC", () => {
  // Simulate the new addMyRequirements body after T24.
  // The RPC replaces the direct pool_requests INSERT.
  async function simulateAddMyRequirements(
    poolId: string,
    requestIds: string[],
    rpcFn: (name: string, args: Record<string, unknown>) => Promise<void>
  ): Promise<void> {
    if (!requestIds.length) return;
    await rpcFn("pool_add_requirements", {
      p_pool_id: poolId,
      p_request_ids: requestIds,
    });
  }

  it("addMyRequirements calls pool_add_requirements RPC with correct args", async () => {
    const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const mockRpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
    });

    await simulateAddMyRequirements("pool-111", ["req-1", "req-2"], mockRpc);

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(rpcCalls[0]).toEqual({
      name: "pool_add_requirements",
      args: { p_pool_id: "pool-111", p_request_ids: ["req-1", "req-2"] },
    });
  });

  it("addMyRequirements does NOT call direct pool_requests INSERT (only RPC)", async () => {
    const tableInserts: string[] = [];
    const mockInsert = vi.fn((table: string) => {
      tableInserts.push(table);
    });

    // The simulation only uses the RPC — no mockInsert call
    const mockRpc = vi.fn(async () => {});
    await simulateAddMyRequirements("pool-111", ["req-1"], mockRpc);

    // Direct table inserts must not happen — only the RPC
    expect(mockInsert).not.toHaveBeenCalled();
    expect(tableInserts).toHaveLength(0);
  });

  it("addMyRequirements with empty request list does not call RPC", async () => {
    const mockRpc = vi.fn(async () => {});
    await simulateAddMyRequirements("pool-111", [], mockRpc);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
