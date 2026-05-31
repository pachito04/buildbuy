# Proposal: Consolidated Reception Distribution (#8b)

## Intent

The consolidación núcleo (`#8`) captures source traceability (`rfq_item_sources` / `rfq_requests`) but does not yet **distribute** received merchandise back to the originating requirements. Report 1805 ("Recepción de mercadería consolidada") requires that, on reception of a consolidated OC, the received units be split across the source request_items/obras — automatically when fully covered, by **urgency** on shortfall, with manual override for multi-provider/partial cases — and that the reception cannot be closed until every source is assigned. This change adds that distribution, built on a **shared pure distribution util** that `#9` (pool) will reuse.

## Scope

### In Scope
- **Shared pure distribution util** `distribucion-utils.ts` (TDD): `distributeByUrgency(receivedQty, sources[])` → per-source allocations. Urgent sources first (sequential), then non-urgent; never over-allocates a source beyond its requested quantity. Reused by `#9`.
- **Consolidated reception distribution** in the deposito reception flow: when a PO item belongs to a consolidated rfq_item (has `rfq_item_sources`), resolve the sources, propose an allocation via the util, let Compras adjust (manual override), persist the per-source `request_items.quantity_received`/status updates, and **block closing** until the accepted quantity is fully assigned across sources.
- **Per-source breakdown UI** in the reception dialog (req #, obra, requested, allocated).
- Movement logging: a `recepcion` `movimiento_producto` row per source (reuse `#7`'s `logMovimiento`).

### Out of Scope
- Non-consolidated OC reception — unchanged (the distribution path activates ONLY when `rfq_item_sources` exist for the line).
- `generateOC` changes (consolidated PO items already carry `request_item_id=null`; distribution is a reception concern). Optional `oc_emitida`-per-source logging is deferred.
- **Proactive detection** — see decision below.
- Pool interempresa — that's `#9` (which reuses this change's distribution util).

### Decision needed (see questions)
- **Proactive detection** ("este producto está en req #XXX") — include as a slice, or defer to a tiny follow-up? (Independent of the reception core.)
- **Shortfall policy** — confirm sequential-by-urgency (most urgent gets full requested first) vs proportional. Report says "el de mayor urgencia recibe primero" → sequential by urgency (proposed).

## Capabilities

### New Capabilities
- `consolidated-reception`: Received units of a consolidated OC are distributed back to the source request_items by urgency, with manual override, and reception cannot close until fully assigned.

### Modified Capabilities
- Deposito reception (`RecepcionDialog`): consolidated lines gain a per-source distribution step; non-consolidated lines unchanged.

## Approach

1. **Pure util (TDD)** — `distributeByUrgency` in `distribucion-utils.ts`.
2. **Resolve sources** — for each PO item, look up its rfq_item's `rfq_item_sources` (via `quote_item_id → rfq_items.id`).
3. **Reception UI** — when sources exist, show the per-source allocation (pre-filled by the util), editable; validate full assignment before allowing close.
4. **Persist** — update each source `request_items.quantity_received`/status; log `recepcion` movements; keep the existing `purchase_order_items.quantity_received` + `inventory_movements` writes.

## Affected Areas

| Area | Impact |
|------|--------|
| `src/lib/distribucion-utils.ts` (+ tests) | New — shared pure distribution (reused by #9) |
| `src/components/deposito/RecepcionDialog.tsx` | Modified — consolidated per-source distribution + validation |
| `src/hooks/` (a reception-distribution helper, if extracted) | New/Modified |
| (optional) `src/components/pedidos/CreateRequestDialog.tsx` | proactive detection — only if included |

## Rollback Plan

- **No migration** (consumes existing `#8` tables). Rollback = revert the reception-flow files; the distribution path is gated on `rfq_item_sources` existing, so non-consolidated reception is untouched.
- **Risk**: medium — touches the live reception/deposito flow and writes back to request_items. Mitigated by the gated activation (only consolidated lines), the pure tested distribution, and keeping the existing PO/inventory writes intact.

## Review Workload (preliminary)

Likely **2 slices**: (1) `distribucion-utils` (+tests) + the reception distribution + validation; (2) per-source UI polish (+ proactive detection if included). Confirm at tasks.

## Strict TDD

`strict_tdd: true`. `distributeByUrgency` is written test-first (`vitest run`). Reception UI via `tsc --noEmit` + manual checklist.
