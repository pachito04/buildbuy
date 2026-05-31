# Proposal: Item-level Routing & Granular Processing Control

> **Naming**: `routing` = PROCUREMENT routing (how an item is obtained: `inventario | cotizacion | orden_directa | pendiente`). It is **orthogonal** to delivery location (`deposito | obra`), which is a separate `delivery_target` field owned by the future consolidación change. This change does NOT model delivery.

## Intent

When Compras processes a request with mixed items (some in stock, some not), the system currently auto-decides each item's fate — reserving in-stock items and auto-creating a draft RFQ for the rest — with **no per-item confirmation** (`SurtidoDialog.tsx`). Report 1805 flags this as INC-001 (🔴 CRÍTICO) and mandates: *no action on inventory or quotation may execute without explicit user control at the product level.*

This change introduces an explicit **routing** dimension per request item (`inventario | cotizacion | orden_directa | pendiente`) and rewrites the processing flow so the user assigns and confirms each item's routing before any side effect runs. It also lays the structural foundation the report requires ([ALTA — ESTRUCTURAL]): each product carries its own routing, decoupled from the parent, with parent status derived from items (derivation already exists).

INC-001 verdict: **designed-but-mis-specified, not a calculation bug.** The fix is to insert an explicit per-item decision step, not to patch stock math.

## Scope

### In Scope
- DB migration: add `request_items.routing` (`inventario | cotizacion | orden_directa | pendiente`, default `pendiente`) + CHECK constraint.
- DB migration: extend `requerimiento_evento.tipo` CHECK to allow `'procesado'` (the processing event was being silently rejected by the migration-004 CHECK).
- `src/integrations/supabase/types.ts`: extend `request_items` with `routing`.
- Pure logic: `suggestRouting` (advisory default from stock, never auto-commit) + `canProcess` (guard: every item has a non-`pendiente` routing).
- Rewrite `SurtidoDialog.tsx` (now "Procesar requerimiento") so each item row has a **user-selectable routing**; no reservation/RFQ happens until the user confirms explicit per-item routings.
- Surface per-item routing in `RequestDetailModal` rows (read-only display).
- Keep existing per-item status lifecycle and `recalcRequestStatus` derivation; verify they remain correct under the new flow.

### Out of Scope
- The persistent Cesta de Cotización and free (sin-requerimiento) RFQs — separate change (roadmap #3).
- Full audit trail per product (OBS-004) — separate change (roadmap #7).
- Delivery location (`deposito | obra`) modeling — a separate `delivery_target` field owned by consolidación.
- Consolidación and Pool — separate changes.
- `orden_directa` end-to-end flow (direct PO without RFQ) beyond recording the routing — the value is modeled now, the flow wired in a later slice.

### Relationship to consolidación
- `consolidacion-requerimientos` is rebased: it does NOT re-add a procurement column. It depends on `routing` existing (orthogonal) and will introduce its own `delivery_target` (`deposito | obra`) for depot-eligibility. The earlier rebase that mapped `deposito → inventario` was incorrect and is corrected in that change's docs.

## Capabilities

### New Capabilities
- `request-item-routing`: Each request item carries an explicit procurement routing assigned by the user; no inventory/RFQ side effect executes until per-item routings are confirmed.

### Modified Capabilities
- Request processing flow (`SurtidoDialog`): from stock-driven auto-decision to user-driven per-item routing assignment.

## Approach

1. **Migration first** — add `request_items.routing` (CHECK + default `pendiente`) and extend the `requerimiento_evento.tipo` CHECK with `'procesado'`.
2. **Types** — extend `request_items` Row/Insert/Update in `types.ts`.
3. **Pure logic (TDD)** — `suggestRouting(item, stock)` and `canProcess(items)`; unit-tested in `src/lib/__tests__/`.
4. **UI rewrite** — replace the single auto-action button with a per-item routing selector; the confirm action only acts on the routings the user committed.
5. **Detail display** — show each item's routing in `RequestDetailModal`.
6. **Rebase consolidación** — correct its docs to the two-axis model.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/012_request_item_routing.sql` | New | Add `routing` column + CHECK + backfill; extend evento tipo CHECK with `procesado` |
| `src/integrations/supabase/types.ts` | Modified | `request_items.routing` |
| `src/lib/routing-utils.ts` | New | `suggestRouting`, `canProcess` (pure) |
| `src/lib/__tests__/routing-utils.test.ts` | New | TDD for pure logic |
| `src/lib/kanban-types.ts` | Modified | `ItemRouting` type + `routing` on `RequestItem` |
| `src/components/pedidos/SurtidoDialog.tsx` | Rewritten | Per-item routing selection; no side effect before confirm |
| `src/components/pedidos/RequestDetailModal.tsx` | Modified | Show per-item routing |
| `src/components/pedidos/ActivityTimeline.tsx` | Modified | Label for `procesado` event |
| `src/hooks/useRequestsQuery.ts` | Modified | `request_items(*)` (routing included) |
| `openspec/changes/consolidacion-requerimientos/*` | Modified | Two-axis correction note |

## Rollback Plan

- **DB**: the migration only **adds** a column (with default) and extends a CHECK — no data loss. Reverse migration is documented in the file header (drop column + restore the original evento CHECK).
- **Code**: the processing rewrite is behind the same dialog entry point; reverting the dialog file restores the previous behavior.
- **Risk**: low. Additive schema, single-surface UI change, pure logic guarded by tests.

## Strict TDD

`strict_tdd: true` (openspec/config.yaml). Pure functions in `routing-utils.ts` are written test-first (`vitest run`). UI verified via `npx tsc --noEmit` + manual checklist.
