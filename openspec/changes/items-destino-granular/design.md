# Design: Item-level Routing & Granular Processing Control

> **Naming**: `routing` = procurement routing (`inventario | cotizacion | orden_directa | pendiente`). Orthogonal to delivery location (`deposito | obra` = a separate `delivery_target` field owned by consolidación). No field is named bare `destination` to avoid the Spanish "destino" ambiguity between the two axes.

## Architecture Decisions

### AD-1: `routing` as a CHECK-constrained text column, not a Postgres enum

**Decision:** Add `request_items.routing text NOT NULL DEFAULT 'pendiente'` with `CHECK (routing IN ('inventario','cotizacion','orden_directa','pendiente'))`.

**Rationale:** The existing `request_items.status` already uses a CHECK constraint (migration 004), not an enum. Matching that pattern keeps the table consistent and avoids the costly enum-recreation dance (drop type → recast column) that migration 004 had to perform for `requests.status`. CHECK is also cheaper to extend later — a single `ALTER ... DROP/ADD CONSTRAINT` vs `ALTER TYPE`.

**Trade-off:** No DB-level enum introspection for the frontend. Acceptable — the frontend already hardcodes value unions in `types.ts`.

### AD-2: Routing is orthogonal to status (and to delivery)

`status` = procurement progress (`sin_pedir|en_oc|parcial|recibido`). `routing` = *how the item is obtained* (`inventario|cotizacion|orden_directa|pendiente`). `delivery_target` (future, consolidación) = *where it physically goes* (`deposito|obra`). Three independent axes. An item can be `routing=cotizacion, status=en_oc, delivery_target=deposito`. The parent-status derivation (`recalcRequestStatus`) keys off `status` only and is untouched.

### AD-3: Suggestion vs commit separation (the INC-001 fix)

The auto-decision bug existed because `SurtidoDialog` computed `hasStock`/`needsRfq` and *acted* on it in the same mutation. The fix splits this into pure steps held in React state:

1. `suggestRouting(item, stock)` → advisory default rendered in the selector.
2. User edits selectors freely (state only — zero side effects).
3. `canProcess(items)` guards the confirm button.
4. Only the confirm mutation performs side effects, and only per the **committed** routings.

The pure functions live in `src/lib/routing-utils.ts` and are the TDD surface. The mutation orchestrates but contains no decision logic.

### AD-4: Reconcile the silently-rejected `requerimiento_evento.tipo` CHECK

`requerimiento_evento.tipo` has a CHECK (migration 004, last touched by 011) that had **drifted from the code**. A full audit of every insert found these tipos rejected silently (the inserts don't check errors):
- `'procesado'` — this change's processing event (`SurtidoDialog`).
- `'en_curso'`, `'recibido'` — emitted by `recalcRequestStatus`/`useStatusTransition` (dynamic `tipo: newStatus`). Migration 005 renamed the `request_status` enum (`procesado_parcial→en_curso`, `procesado_total→recibido`) but never updated this CHECK.
- `'solicitud_cotizacion'` — `SolicitudDirectaDialog`.

Since this migration rebuilds the CHECK anyway, it reconciles the **full** set. `procesado_parcial`/`procesado_total` are kept so the `ADD CONSTRAINT` does not fail on historical rows still holding the pre-005 literals. This is a bonus fix of a latent bug; it is in scope because the migration already owns this constraint.

### AD-5: This change owns `routing`; consolidación owns `delivery_target`

`consolidacion-requerimientos` does NOT add a procurement column. It depends on `routing` existing (orthogonal) and introduces its own `delivery_target` (`deposito|obra`) for depot-eligibility. Consolidation candidates are quote-bound (`routing='cotizacion'` or quotable `pendiente`) AND `delivery_target='deposito'` AND `material_id IS NOT NULL` — never `routing='inventario'` (stock-fulfilled items never reach an RFQ).

## Sequence — processing flow (new)

```
User            ProcesarDialog        routing-utils        Supabase
 |  open()           |                     |                  |
 |------------------>| fetch items+stock --|----------------->|
 |                   |<-------------------- items, inventory --|
 |                   | suggestRouting(item,stock) ------------>|
 |                   |<-- suggested routings (state only)      |
 |  edit selectors   |                     |                  |
 |------------------>| (React state)       |                  |
 |  click Confirm    | canProcess(items)?  |                  |
 |------------------>|--------------------->|                  |
 |                   |<-- true/false ------ |                  |
 |        (if false) | disable + message   |                  |
 |        (if true)  | mutation: per item by committed routing:|
 |                   |   inventario -> reserve + remito borrador|
 |                   |   cotizacion -> rfq draft                |
 |                   |   orden_directa -> record routing (later)|
 |                   |   persist request_items.routing -------->|
 |                   |   insert requerimiento_evento (procesado)|
 |<-- toast + close--|                     |                  |
```

## Pure logic contract (`src/lib/routing-utils.ts`)

```ts
type Routing = 'inventario' | 'cotizacion' | 'orden_directa' | 'pendiente';

// Advisory only — never committed automatically.
// material_id null -> 'cotizacion'; quantity 0 -> 'inventario';
// available >= quantity -> 'inventario'; else 'cotizacion'.
function suggestRouting(
  item: { quantity: number; material_id?: string | null },
  stock: { available: number },
): 'inventario' | 'cotizacion';

// Guard: non-empty AND every item has a committed (non-pendiente) routing.
function canProcess(items: { routing: Routing }[]): boolean;
```

Edge cases covered by tests: empty list (`canProcess([]) === false`), `material_id === null` → `cotizacion`, zero quantity → `inventario`, partial/negative stock → `cotizacion`.

## Migration shape (`012_request_item_routing.sql`)

```sql
BEGIN;
-- Rollback: drop column + restore original evento CHECK (see file header).
ALTER TABLE request_items
  ADD COLUMN routing text NOT NULL DEFAULT 'pendiente';
ALTER TABLE request_items
  ADD CONSTRAINT chk_item_routing
  CHECK (routing IN ('inventario','cotizacion','orden_directa','pendiente'));

-- Reconcile with EVERY tipo the code inserts (see AD-4). Keep all historical
-- values to avoid failing validation on existing rows.
ALTER TABLE requerimiento_evento DROP CONSTRAINT chk_evento_tipo;
ALTER TABLE requerimiento_evento ADD CONSTRAINT chk_evento_tipo
  CHECK (tipo IN ('creado','pendiente','en_curso','recibido',
                  'procesado_parcial','procesado_total','rechazado',
                  'item_actualizado','nota','recepcion_obra',
                  'solicitud_cotizacion','procesado'));
COMMIT;
```

## Files

| File | Action |
|------|--------|
| `supabase/migrations/012_request_item_routing.sql` | new |
| `src/integrations/supabase/types.ts` | add `routing` to request_items Row/Insert/Update |
| `src/lib/routing-utils.ts` | new (pure) |
| `src/lib/__tests__/routing-utils.test.ts` | new (TDD) |
| `src/lib/kanban-types.ts` | `ItemRouting` + `routing` field |
| `src/components/pedidos/SurtidoDialog.tsx` | rewrite to per-item selector + guarded confirm |
| `src/components/pedidos/RequestDetailModal.tsx` | show per-item routing |
| `src/components/pedidos/ActivityTimeline.tsx` | label for `procesado` |
| `src/hooks/useRequestsQuery.ts` | `request_items(*)` |
| `openspec/changes/consolidacion-requerimientos/*` | two-axis correction note |

## Risks

- **Regression in processing**: the dialog rewrite is the highest-risk surface. Mitigated by keeping the same entry point and reservation/RFQ mechanics — only the *decision* step changes from auto to user-driven.
- **remitos.destination collision**: `remitos` has its own pre-existing `destination` column (delivery address). It is deliberately left untouched in `SurtidoDialog` — only `request_items.routing` is renamed/added.
