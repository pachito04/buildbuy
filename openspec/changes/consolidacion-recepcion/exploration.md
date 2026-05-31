# Exploration: Consolidated Reception Distribution (#8b)

Source: `Reporte 1805.docx` — Módulo Consolidación, "Recepción de mercadería consolidada". Follow-up to the consolidación núcleo (`#8`), which CAPTURED the traceability this change CONSUMES.

## Report requirements (#8b)

- On reception of consolidated merchandise, show how many units correspond to each obra/requirement of origin.
- **Single provider** → automatic assignment per the consolidated quantities.
- **Multiple providers / partial coverage** → Compras resolves the distribution manually.
- **Shortfall** → distribution respects the **urgency order** of each source requirement (most urgent receives available units first).
- **Cannot close** the reception without having assigned the quantities to each source requirement.
- (Related) Proactive detection: while editing a requirement, if a product is also in other pending requirements, prompt "este producto está en req #XXX — ¿consolidar?".

## Current state (evidence)

- Reception runs through `src/components/deposito/RecepcionDialog.tsx`: it loads a `purchase_orders` with `purchase_order_items(*)`, lets the user accept quantities, updates `purchase_order_items.quantity_received`, and writes `inventory_movements`. It operates at the **PO-item level** and does NOT touch the source `request_items`.
- `purchase_order_items` has `quote_item_id`, `request_item_id` (null for consolidated lines — correct, they're multi-source), `quantity`, `quantity_received`.
- **The source chain for a consolidated PO item**: `purchase_order_items.quote_item_id → quote_items.rfq_item_id → rfq_items.id → rfq_item_sources` (rows: `request_item_id`, `request_id`, `quantity`). This resolves "which request_items/obras and how many units" — exactly what reception must distribute back to.
- A consolidated OC is identifiable: its RFQ has `rfq_type='consolidated'` and its rfq_items have `rfq_item_sources` rows (núcleo).
- Per-item reception already updates `request_items.quantity_received`/status via `useItemRecepcion` (arquitecto path) — the same target fields the distribution will write.
- Movement logging (`#7`) logs `recepcion` per request_item — reusable here.

## What #8b must add

1. **Shared pure distribution util** (`distribuir cantidad recibida entre fuentes, por urgencia en faltante`) — the base `#9` (pool) will also reuse. Pure, TDD.
2. **Reception distribution**: when a consolidated PO item is received, resolve its `rfq_item_sources`, distribute the accepted quantity across the source `request_items` (auto when it covers the total; by urgency on shortfall; manual override), update each `request_items.quantity_received`/status, and block closing until every source is assigned.
3. (Optional) Surface the per-obra/requirement breakdown in the reception UI.

## Scope notes / decisions for the proposal

- **generateOC is essentially untouched** — consolidated PO items already carry `request_item_id=null`; distribution is a reception concern. (Optional small add: log `oc_emitida` per source via `rfq_item_sources` at OC time — defer unless wanted.)
- **Proactive detection** is a separate UX concern (requirement creation/editing), independent of the reception distribution. Candidate to include as its own slice OR defer to a tiny follow-up — flag for the user.
- Non-consolidated OC reception MUST stay exactly as today (the distribution path only activates when `rfq_item_sources` exist for the PO item's rfq_item).

## Open questions for the user

1. **Proactive detection** — include in #8b (a slice) or defer? (The reception distribution is the core/heaviest part; detection is independent.)
2. **Distribution policy on shortfall** — confirm: most-urgent source requirements get their full requested quantity first, then the next, until the received quantity runs out (sequential by urgency), with a manual override for multi-provider/partial. (Alternative: proportional split — but the report says "el de mayor urgencia recibe primero", i.e. sequential by urgency.)
