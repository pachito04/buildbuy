# Design: Per-Product Movement Traceability (OBS-004)

## Architecture Decisions

### AD-1: `movimiento_producto` mirrors the existing audit pattern

A per-product log keyed by `request_item_id`, modeled on `requerimiento_evento` / `inventory_movements` (FK + `created_by`→auth.users + `created_at` + RLS by company + immutable).

```sql
CREATE TABLE movimiento_producto (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_item_id uuid        NOT NULL REFERENCES request_items(id) ON DELETE CASCADE,
  material_id     uuid        REFERENCES materials(id) ON DELETE SET NULL,
  tipo            text        NOT NULL,   -- 'destino_asignado' | 'oc_emitida' | 'recepcion'
  origen          text,                   -- e.g. 'Requerimiento #123'
  destino         text,                   -- 'inventario' | 'cotizacion' | 'orden_directa' | 'Proveedor X' | 'obra'
  cantidad        numeric(12,3),
  ref_type        text,                   -- 'requerimiento' | 'purchase_order' | 'remito'
  ref_id          uuid,
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_mov_tipo CHECK (tipo IN ('destino_asignado','oc_emitida','recepcion'))
);
CREATE INDEX idx_movimiento_producto_item ON movimiento_producto (request_item_id, created_at);

ALTER TABLE movimiento_producto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "movimiento_producto_select_company" ON movimiento_producto FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM request_items ri JOIN requests r ON r.id = ri.request_id
                 JOIN profiles p ON p.company_id = r.company_id
                 WHERE ri.id = movimiento_producto.request_item_id AND p.id = auth.uid()));
CREATE POLICY "movimiento_producto_insert_company" ON movimiento_producto FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM request_items ri JOIN requests r ON r.id = ri.request_id
                      JOIN profiles p ON p.company_id = r.company_id
                      WHERE ri.id = movimiento_producto.request_item_id AND p.id = auth.uid()));
-- no UPDATE/DELETE → immutable
```

`tipo` uses a CHECK (matching the project's `request_items.routing` / item-status style). Only the 3 Option-A values now; extend the CHECK when more movement points are instrumented (remember the migration-005 lesson: a CHECK rebuild must preserve prior values — but this CHECK is created here, so future additions just extend it).

### AD-2: `logMovimiento` helper + pure label mappers

`src/lib/movimiento-utils.ts`:
- `logMovimiento(client, row)` — a thin, **best-effort** insert wrapper (try/catch, swallows errors, never throws). IO; verified by tsc + the call sites.
- Pure, tested mappers: `movimientoOrigenRequerimiento(n)` → `'Requerimiento #N'`; `MOVIMIENTO_TIPO_LABELS` and `routingToDestino(routing)` → display destino; `formatMovimiento(row)` for the timeline line. These are the unit-test surface.

The decision logic (what origen/destino strings to produce) lives in the pure mappers so the call sites stay declarative.

### AD-3: Best-effort instrumentation at 3 sites (Option A)

Mirror the existing `requerimiento_evento` insert style (wrapped in try/catch). The log write is added AFTER the primary writes succeed, so a log failure can't roll back the action.

| Site | tipo | origen | destino | cantidad | ref |
|------|------|--------|---------|----------|-----|
| `SurtidoDialog` confirm (per item) | `destino_asignado` | `Requerimiento #N` | item routing | item qty | requerimiento |
| `generateOC` (per item) | `oc_emitida` | (item's requirement) | `Proveedor <name>` | item qty | purchase_order |
| reception (`RecepcionDialog`/`useItemRecepcion`) | `recepcion` | — | `inventario`/`obra` | received qty | remito/recepción |

Each site has the `request_item_id`. SurtidoDialog uses `item.id` directly. Reception uses the request_item passed into the hook. `generateOC` resolves it via Option B (see AD-5 below). Where `request_item_id` is genuinely unavailable (free-mode RFQ items), the row is skipped rather than inserting a dangling reference.

### AD-5: Option B — `rfq_items.request_item_id` link (closes oc_emitida gap)

`rfq_items` has a new nullable column `request_item_id uuid REFERENCES request_items(id) ON DELETE SET NULL` (added in migration `015_movimiento_produto.sql`). It is populated only when an rfq_item is created from a cotizacion routing in `SurtidoDialog` — free-mode RFQ items legitimately have it null.

The resolve path in `generateOC`:
1. Collect `rfq_item_id`s from the cart items for this provider.
2. Query `rfq_items(id, request_item_id)` for those IDs in one round-trip.
3. Build a `rfqItemRequestMap: Record<string, string | null>`.
4. Set `purchase_order_items.request_item_id` from the map when inserting (null for free-mode items).
5. Log `oc_emitida` per cart item where `rfqItemRequestMap[rfq_item_id]` is non-null.

This eliminates the previous compromise where `purchase_order_items.request_item_id` was never populated and all OC movement rows were silently skipped.

### AD-4: Per-product timeline in Trazabilidad

Add a per-product view (drill-down from the existing request chains, or a product/request-item selector) that queries `movimiento_producto` for a `request_item_id`, newest-or-chronological order, rendering `formatMovimiento` lines (origen → destino, cantidad, user, datetime) with an empty-state. Extract into `src/components/trazabilidad/MovimientosProducto.tsx` to keep `Trazabilidad.tsx` manageable.

## Pure logic contract (`src/lib/movimiento-utils.ts`)

```ts
type MovimientoTipo = 'destino_asignado' | 'oc_emitida' | 'recepcion';
const MOVIMIENTO_TIPO_LABELS: Record<MovimientoTipo, string>;
function movimientoOrigenRequerimiento(requestNumber: number | null | undefined): string;  // 'Requerimiento #N' | ''
function routingToDestino(routing: string): string;   // inventario→'Inventario', cotizacion→'Cotización', ...
// best-effort IO (not unit-tested beyond types):
async function logMovimiento(client, row: MovimientoInsert): Promise<void>;  // never throws
```

Tests: label mappers for each tipo; `movimientoOrigenRequerimiento` (number, null/undefined → ''); `routingToDestino` for each routing value + unknown passthrough.

## Files

| File | Action |
|------|--------|
| `supabase/migrations/015_movimiento_producto.sql` | new (table + RLS) |
| `src/integrations/supabase/types.ts` | add `movimiento_producto` |
| `src/lib/movimiento-utils.ts` (+ `__tests__`) | new (helper + pure mappers, TDD) |
| `src/components/pedidos/SurtidoDialog.tsx` | log per-item routing movement |
| `src/pages/Cotizaciones.tsx` | log OC-emitted movement in `generateOC` |
| `src/components/deposito/RecepcionDialog.tsx` and/or `src/hooks/useItemRecepcion.ts` | log reception movement |
| `src/pages/Trazabilidad.tsx` + `src/components/trazabilidad/MovimientosProducto.tsx` | per-product timeline |

## Risks

- **Many call sites**: 3 flows instrumented. Mitigated by the single helper + best-effort writes (no behavior change to the flows).
- **request_item_id availability**: Resolved via Option B (AD-5). Items from cotizacion routing carry the link; free-mode RFQ items have null and are skipped gracefully. `oc_emitida` logging is now active for all cotizacion-origin items.
- **Silent-failure trap**: best-effort logging means a broken insert is invisible (same family as the `chk_evento_tipo` lesson). Mitigated by the `chk_mov_tipo` CHECK being created with exactly the values the code emits, and a manual-verify checklist in the migration.
