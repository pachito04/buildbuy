# Design: Consolidated Reception Distribution (#8b)

> No migration — consumes `#8`'s `rfq_item_sources` / `rfq_requests`. Builds the shared distribution util `#9` will reuse.

## Architecture Decisions

### AD-1: Shared pure `distributeByUrgency`

`src/lib/distribucion-utils.ts`:

```ts
interface DistribSource { id: string; requestedQty: number; urgent: boolean; }
interface Allocation { id: string; allocatedQty: number; }

function distributeByUrgency(receivedQty: number, sources: DistribSource[]): Allocation[];
```

Algorithm: stable-sort `urgent` first (preserve input order within each group); walk in that order giving each `min(remaining, requestedQty)`; stop when `remaining` hits 0. Never exceeds `requestedQty`. Returns an allocation per source (0 when nothing left). Pure, TDD. This is the **shared base** — `#9` reuses it to distribute a pooled line across companies (sources = companies).

**Why sequential, not proportional:** Reporte 1805 — "el de mayor urgencia recibe primero las unidades disponibles" (confirmed by user: most-urgent served full, the rest until stock is exhausted).

### AD-2: Resolve sources via the existing chain (no new schema)

For a `purchase_order_items` row, resolve its consolidated sources by:
`purchase_order_items.quote_item_id → quote_items.rfq_item_id → rfq_items.id → rfq_item_sources (request_item_id, request_id, quantity)`.
If no `rfq_item_sources` rows exist for that rfq_item, the line is **non-consolidated** → the distribution step is skipped entirely (existing behavior). Each source also needs its requirement's `desired_date` (for urgency via `isUrgente`) and `request_number`/obra (for display) — one joined query.

### AD-3: Reception UI gates the distribution on sources

`RecepcionDialog` gains, per consolidated line, a per-source allocation sub-section: rows of (req #, obra, requested, **allocated** input), pre-filled by `distributeByUrgency(acceptedQty, sources)`. The allocations are editable (manual override for multi-provider/partial). Confirm is blocked until, for every consolidated line, `Σ allocations === acceptedQty` (the "cannot close until fully assigned" rule). Non-consolidated lines render exactly as today.

### AD-4: Persist per-source, keep existing writes

On confirm, in addition to the existing `purchase_order_items.quantity_received` update and `inventory_movements` write:
- for each source allocation > 0: increment `request_items.quantity_received` by the allocated amount and update its `status` (`recibido` when fully received, else `parcial`) — reuse the same status logic `useItemRecepcion` uses;
- log one `recepcion` `movimiento_producto` per source (reuse `#7`'s `logMovimiento`, best-effort).
Ordering: PO/inventory writes first (unchanged), then the per-source distribution writes.

### AD-5: Proactive detection — `useConsolidationMatches`

A hook `useConsolidationMatches(requestId)` returns, per request item routed to depósito, the OTHER eligible pending requests that contain the same `material_id` (eligibility = the `#8` predicate). Surfaced as a dismissible hint in the Compras request-processing view (`RequestDetailModal`): "Este producto está solicitado en el requerimiento #XXX — ¿Consolidar?", linking to the RFQs → Consolidar tab. No prompt when there are no matches. Read-only; it just routes the user to the existing Consolidar panel.

## Pure logic contract (`src/lib/distribucion-utils.ts`)

```ts
distributeByUrgency(receivedQty: number, sources: { id: string; requestedQty: number; urgent: boolean }[]): { id: string; allocatedQty: number }[];
```

Tests: shortfall serves urgent-first to full then remainder; full coverage → all full; no over-allocation (single source, received > requested); received 0 → all 0; multiple urgent (stable order); empty sources → [].

## Files

| File | Action |
|------|--------|
| `src/lib/distribucion-utils.ts` (+ tests) | New — shared pure distribution (reused by #9) |
| `src/components/deposito/RecepcionDialog.tsx` | Modified — per-source distribution + validation for consolidated lines |
| `src/hooks/useConsolidationMatches.ts` | New — proactive detection query |
| `src/components/pedidos/RequestDetailModal.tsx` | Modified — consolidation hint (compras) |

## Risks

- **Live reception flow**: the highest-risk surface. Mitigated by gating the distribution strictly on `rfq_item_sources` existing (non-consolidated reception is byte-for-byte unchanged) and by the pure tested allocation.
- **Source resolution query**: the PO→sources chain spans 3 joins; if it returns nothing the line is treated as non-consolidated (safe default).
- **Status recompute** on partial multi-source reception: reuse the existing per-item status rule to avoid divergence from `useItemRecepcion`.
