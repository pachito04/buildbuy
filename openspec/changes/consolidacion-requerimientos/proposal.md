# Proposal: Consolidación de Requerimientos (núcleo)

> **Reconciled (supersedes the prior stale draft).** This is the **first-cut / núcleo** of the consolidación module, aligned to the current codebase. Two orthogonal axes are kept separate:
> - **`request_items.routing`** (`inventario | cotizacion | orden_directa | pendiente`) — procurement, owned by `#1`.
> - **`request_items.delivery_target`** (`deposito | obra`) — delivery location, **introduced by this change**. Consolidation gates on `delivery_target = 'deposito'`.
> Deferred to a follow-up (`#8b`): consolidated **reception distribution** (per-obra split by urgency, partial deliveries), **proactive detection** ("este producto está en req #XXX"), and OC-level distribution. This change **captures** the consolidation traceability; `#8b` **consumes** it.

## Intent

Compras must be able to combine eligible request items from multiple obras (own company) into a single RFQ to gain volume pricing, instead of one RFQ per request. This núcleo delivers: per-item delivery target, eligible-item discovery grouped by material across obras, consolidated RFQ creation, and full source traceability (`rfq_item_sources` / `rfq_requests`) with urgency propagation.

## Scope

### In Scope
- **Migration**: `request_items.delivery_target` (`deposito | obra`, default `obra`, CHECK); `rfq_item_sources` table (consolidated line → source request_item + quantity); `rfq_requests` table (consolidated RFQ → source requests). RLS by company on both tables.
- **Per-item delivery selector** in `CreateRequestDialog` (deposito/obra), so eligibility works.
- **Pure logic** `consolidacion-utils.ts` (TDD): `groupEligibleByMaterial`, `consolidatedUrgency` (reusing `isUrgente`), eligibility predicate.
- **Hook** `useConsolidacion.ts`: fetch eligible items, group by material, create a consolidated RFQ (`rfq_type='consolidated'`) with `rfq_items` + `rfq_item_sources` + `rfq_requests` rows.
- **UI** `ConsolidacionPanel.tsx`: a "Consolidar" tab showing eligible items grouped by material across obras (with per-source breakdown), selection, and consolidated-RFQ creation.

### Out of Scope (deferred to #8b)
- Consolidated **reception** distribution per obra / by urgency / partial deliveries.
- `generateOC` distribution of a consolidated line across multiple source request_items (the data is captured in `rfq_item_sources`; consuming it is #8b).
- **Proactive detection** prompt when editing a requirement.
- Free-text items (no `material_id`) — excluded from consolidation with a clear badge.
- Pool de Compras (interempresa) — that's `#9`.

## Capabilities

### New Capabilities
- `request-item-consolidation`: Compras consolidates eligible deposito-bound request items across obras into one RFQ, with material grouping, urgency propagation, and full source traceability.

## Approach

1. **Migration** — `delivery_target` + `rfq_item_sources` + `rfq_requests`. Hand SQL to the user.
2. **types.ts** — new column + two tables.
3. **Pure logic (TDD)** — grouping + urgency + eligibility in `consolidacion-utils.ts`.
4. **Hook** — `useConsolidacion`: eligible query + consolidated-RFQ mutation (RFQ + items + sources + requests, in order).
5. **UI** — `ConsolidacionPanel` tab + the `delivery_target` selector in `CreateRequestDialog`.

## Affected Areas

| Area | Impact |
|------|--------|
| `supabase/migrations/016_consolidacion.sql` | New — `delivery_target` + `rfq_item_sources` + `rfq_requests` |
| `src/integrations/supabase/types.ts` | Modified — column + 2 tables |
| `src/lib/consolidacion-utils.ts` (+ tests) | New — pure grouping/urgency/eligibility |
| `src/hooks/useConsolidacion.ts` | New — eligible query + consolidated RFQ creation |
| `src/components/cotizaciones/ConsolidacionPanel.tsx` | New — consolidation UI |
| `src/pages/Cotizaciones.tsx` or `RFQs.tsx` | Modified — mount the "Consolidar" tab |
| `src/components/pedidos/CreateRequestDialog.tsx` | Modified — per-item `delivery_target` selector |

## Eligibility (reconciled to current statuses)

A request item is consolidation-eligible when:
- its request `status = 'pendiente'` (not yet processed / no active gestión),
- `delivery_target = 'deposito'`,
- `routing IN ('pendiente','cotizacion')` (NOT `inventario`/`orden_directa` — inventario is stock-fulfilled and never reaches an RFQ),
- `material_id IS NOT NULL`,
- item `status = 'sin_pedir'` (no active OC/reception).

## Rollback Plan

- **DB**: additive only — drop `rfq_requests`, `rfq_item_sources`, and `request_items.delivery_target`. No existing data touched.
- **Code**: the Consolidar tab + hook + selector are additive; reverting the files removes them. Existing RFQ flows (manual, basket, direct) are untouched.
- **Risk**: medium — new tables + a new RFQ-creation path; mitigated by pure tested logic and additive schema. Consolidated RFQs flow through the existing comparativa/OC path unchanged (distribution deferred).

## Review Workload (preliminary)

**> 400 lines** (migration + utils + hook + panel + selector). Chained slices: (1) migration + types + pure utils; (2) hook + ConsolidacionPanel + tab; (3) `delivery_target` selector in CreateRequestDialog. Confirm at tasks.

## Strict TDD

`strict_tdd: true`. `consolidacion-utils.ts` (grouping, urgency, eligibility) is written test-first (`vitest run`). Hook/UI via `tsc --noEmit` + manual checklist.
