# Proposal: Per-Product Movement Traceability (OBS-004)

## Intent

Report 1805 (OBS-004, PENDIENTE) requires a **per-product audit trail**: for every product, its origin (requirement), destination (inventory / quotation / provider), the user who performed the action, and the timestamp. Today traceability is request-level and *inferred* (`Trazabilidad.tsx` chains), with no per-`request_item` movement record. This change adds a dedicated movement log, a reusable logging helper, instrumentation at the key movement points, and a per-product timeline in Trazabilidad.

## Scope

### In Scope
- **Migration**: `movimiento_producto` table — `request_item_id` (FK), `material_id` (FK, nullable), `tipo`, `origen`, `destino`, `cantidad` (nullable), `ref_type`, `ref_id` (nullable), `created_by`, `created_at` + index `(request_item_id, created_at)` + RLS by company (via `request_items → requests.company_id`), insert-only/immutable. Mirrors `requerimiento_evento`.
- **Helper**: `logMovimiento(...)` (a thin Supabase insert wrapper) + a pure mapper for `origen`/`destino` labels.
- **Instrumentation (Option A — confirmed scope)**: write a movement row at —
  - **Routing assigned** (`SurtidoDialog`): one row per item → origen = `requerimiento #N`, destino = its routing (inventario / cotización / orden_directa), `cantidad`, user, timestamp.
  - **OC emitted** (`generateOC`): row(s) → destino = `proveedor (<name>)`, ref = purchase_order.
  - **Reception** (depósito/obra reception): row → destino = `inventario`/`obra`, físico, ref = remito/recepción.
- **Trazabilidad view**: a per-product timeline (origen → destino, user, datetime) reachable from the existing Trazabilidad page (drill-down per request item or a product search).

### Out of Scope (deferred, helper makes them trivial later)
- Instrumenting item creation, inventory reserve, dispatch, and RFQ-shortfall as separate movement rows (Option B). Can be added incrementally.
- Backfilling historical movements (early-stage data; log goes forward).
- A "fecha de compromiso estimada" per movement (the report mentions a delivery-commitment date — treat as a separate concern unless asked).

## Capabilities

### New Capabilities
- `product-movement-log`: Every instrumented product movement is recorded with origin, destination, quantity, user and timestamp, and is viewable as a per-product timeline.

### Modified Capabilities
- `Trazabilidad`: gains a per-product movement timeline alongside the existing request-chain view.

## Approach

1. **Migration** — `movimiento_producto` + RLS. Hand SQL to the user.
2. **types.ts** — add the table.
3. **Helper + pure labels (TDD where pure)** — `logMovimiento(client, row)` + `movimientoLabels` (origen/destino/tipo → display) unit-tested for the pure mapping.
4. **Instrument** the 3 movement points (routing / OC / reception), reusing the helper.
5. **Trazabilidad** — per-product timeline view querying `movimiento_producto`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/015_movimiento_producto.sql` | New | audit table + RLS |
| `src/integrations/supabase/types.ts` | Modified | `movimiento_producto` |
| `src/lib/movimiento-utils.ts` (+ tests) | New | `logMovimiento` + pure label mappers |
| `src/components/pedidos/SurtidoDialog.tsx` | Modified | log per-item routing movement |
| `src/pages/Cotizaciones.tsx` | Modified | log OC-emitted movement in `generateOC` |
| `src/components/deposito/RecepcionDialog.tsx` (and/or `useItemRecepcion`) | Modified | log reception movement |
| `src/pages/Trazabilidad.tsx` (+ maybe `MovimientosProducto.tsx`) | Modified/New | per-product timeline |

## Rollback Plan

- **DB**: new table only → `DROP TABLE movimiento_producto`. No change to existing tables/data.
- **Code**: logging calls are additive and best-effort (wrapped so a log failure never blocks the underlying flow — same pattern as `requerimiento_evento` inserts). The Trazabilidad view is additive. Per-file revert is clean.
- **Risk**: low–medium. New table + additive log calls at 3 sites; no behavior change to the flows themselves.

## Review Workload (preliminary)

~**350–450 lines** (migration + helper + 3 instrumented sites + view). Possibly one apply, or two slices: (1) migration + types + helper + the 3 instrumentation sites; (2) the Trazabilidad per-product view. Confirm at tasks.

## Strict TDD

`strict_tdd: true`. The pure label mappers in `movimiento-utils.ts` are written test-first (`vitest run`); the `logMovimiento` IO wrapper and UI are verified via `tsc --noEmit` + manual checklist.
