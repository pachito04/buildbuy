# Proposal: Consolidación de Requerimientos en Cotización

> ⚠️ **CORRECTION (supersedes inline `destination`/`inventario` language below).**
> An earlier rebase wrongly collapsed two **orthogonal** axes into one column. They are different:
> - **`request_items.routing`** (`inventario | cotizacion | orden_directa | pendiente`) — PROCUREMENT routing: *how* an item is obtained. **Owned by `items-destino-granular`** (migration `012_request_item_routing.sql`). Orthogonal to consolidación.
> - **`request_items.delivery_target`** (`deposito | obra`) — DELIVERY location: *where* the goods physically go. This is the axis consolidación cares about ("solo se consolidan requerimientos con destino **depósito**"). **Consolidación owns this column** (its own migration) — it does NOT exist yet.
>
> Correct eligibility for consolidation = items that need a quote (`routing = 'cotizacion'`, or still `pendiente` and quotable) **AND** `delivery_target = 'deposito'` **AND** `material_id IS NOT NULL`. Note: `routing = 'inventario'` items are fulfilled from stock and never reach an RFQ, so they are **never** consolidation candidates — the old "`destination = 'inventario'`" eligibility was incorrect.
> Every inline mention of `destination`/`deposito→inventario` below is **stale** and must be reworked to this two-axis model when consolidación is resumed.

## Intent

Compras needs to combine eligible request items from multiple obras into a single RFQ to achieve better pricing through volume. Currently, each request generates its own RFQ (1:1), losing purchasing power. This change introduces cross-obra consolidation with full traceability from consolidated RFQ → source request_items, including urgency propagation and partial delivery distribution.

## Scope

### In Scope
- DB migrations: `rfqs.urgente`, `rfq_item_sources` table, `rfq_requests` table, `rfq_type` enum formalization
  - NOTE: `request_items.destination` migration is **NOT** in scope here — it is owned by `items-destino-granular` (migration `012_request_item_destination.sql`). This change consumes the column as a prerequisite.
- Consolidation panel UI as new tab in Cotizaciones (extracted to `ConsolidacionPanel.tsx`)
- `useConsolidacion.ts` hook for eligible item fetching, grouping, and RFQ creation
- Pure consolidation logic in `consolidacion-utils.ts` (grouping by material_id, urgency propagation, partial delivery distribution)
- `destination` selector per item in `CreateRequestDialog.tsx`
- `generateOC` modification for consolidated RFQ traceability via `rfq_item_sources`
- Tests for pure consolidation functions (strict TDD)

### Out of Scope
- Provider-facing urgency indicators (urgente is internal only)
- Splitting OCs by destination (consolidated items are always deposito)
- Consolidation of free-text items (no material_id)
- Auto-consolidation / scheduling
- Changes to Comparativa flow (works as-is for consolidated RFQs)

## Capabilities

### New Capabilities
- `request-item-consolidation`: Cross-obra consolidation of request items into a single RFQ with full traceability, urgency propagation, and partial delivery distribution

### Modified Capabilities
- `deposito-reception`: OCs from consolidated RFQs arrive with `destination=deposito` and carry `request_item_id` traceability — reception flow unchanged but source traceability is now richer

## Approach

1. **Migrations first**: Add `request_items.destination` (default `obra`), `rfqs.urgente`, formalize `rfq_type` enum (`open|closed_bid|consolidated`), create `rfq_item_sources` and `rfq_requests` tables
2. **Pure logic layer**: `consolidacion-utils.ts` — groupByMaterial, calculateUrgency, distributePartialDelivery (TDD)
3. **Hook**: `useConsolidacion.ts` — queries eligible items (status `pendiente` requests, `sin_pedir` + `deposito` + has `material_id` items), groups them, creates consolidated RFQ with `rfq_item_sources` + `rfq_requests` records
4. **UI**: `ConsolidacionPanel.tsx` tab in Cotizaciones — product-grouped view, selection, RFQ creation wizard
5. **OC traceability**: Modify `generateOC` in Cotizaciones.tsx to lookup `rfq_item_sources` and populate `purchase_order_items.request_item_id`
6. **Destination selector**: Add per-item `destination` dropdown in `CreateRequestDialog.tsx`

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/` | New | 3 migrations: urgente col, rfq_item_sources table, rfq_requests table (`request_items.destination` is owned by `items-destino-granular`) |
| `src/integrations/supabase/types.ts` | Modified | Regenerate after migrations (rfq_type, destination, new tables) |
| `src/lib/consolidacion-utils.ts` | New | Pure functions: grouping, urgency, distribution |
| `src/lib/__tests__/consolidacion-utils.test.ts` | New | TDD tests for pure consolidation logic |
| `src/hooks/useConsolidacion.ts` | New | Data fetching + consolidation mutation |
| `src/components/cotizaciones/ConsolidacionPanel.tsx` | New | Consolidation UI panel |
| `src/pages/Cotizaciones.tsx` | Modified | Add Consolidar tab; modify generateOC for traceability |
| `src/components/pedidos/CreateRequestDialog.tsx` | Modified | Add destination selector per request item |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `generateOC` traceability adds query complexity | Med | Use single `rfq_item_sources` lookup before insert; batch operations |
| rfq_type migration on existing data (nulls) | Low | Default existing nulls to `open` in migration |
| Partial quantity selection UX complexity | Med | Start with full-quantity consolidation; partial as follow-up if needed |
| Free-text items confusion | Low | Clear UI badge "No consolidable — sin material vinculado" |

## Rollback Plan

1. Revert migrations in reverse order (drop `rfq_requests`, drop `rfq_item_sources`, drop `rfqs.urgente`). The `request_items.destination` column is owned by `items-destino-granular` — do NOT drop it here.
2. Remove ConsolidacionPanel tab from Cotizaciones.tsx
3. Revert `generateOC` changes (no consolidated RFQ path)
4. Existing RFQs and OCs are unaffected — new tables/columns are additive only

## Dependencies

- **Prerequisite: `items-destino-granular`** — `request_items.destination` is owned by that change. Its migration (`012_request_item_destination.sql`) must be applied before any consolidacion migrations run. The four canonical values are: `inventario | cotizacion | orden_directa | pendiente`. Consolidacion's eligibility criterion uses `destination = 'inventario'` to identify depot-routed items (previously described as `deposito` — align to `inventario`).
- Supabase migrations must run before UI work
- `types.ts` regeneration is NOT needed for destination — already done in `items-destino-granular`
- No external library dependencies

## Success Criteria

- [ ] Compras can see eligible items grouped by material across obras
- [ ] Consolidated RFQ creates with correct `rfq_item_sources` and `rfq_requests` records
- [ ] Urgency propagates: if any source request is urgent, consolidated RFQ is marked urgent
- [ ] OC generation from consolidated RFQ populates `purchase_order_items.request_item_id` correctly
- [ ] Free-text items are visually excluded with explanation
- [ ] Pure consolidation functions have test coverage (strict TDD)
- [ ] Existing RFQ flows (manual, basket, direct) remain unaffected
