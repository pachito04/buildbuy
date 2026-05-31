# Tasks: trazabilidad-obs004

## Overview

Per-product movement audit log (OBS-004, scope A): `movimiento_producto` table + `logMovimiento` helper + instrumentation at 3 movement points (routing assigned, OC emitted, reception) + a per-product timeline in Trazabilidad.

**Strict TDD is active** (`vitest run`). Pure mappers test-first.

## Review Workload Forecast

- Estimated changed lines: ~**350–450** (migration + helper + 3 instrumented sites + view).
- **Chained slices: optional.** If split:
  - **Slice 1** — migration + types + `movimiento-utils` (+tests) + instrument the 3 movement points.
  - **Slice 2** — `MovimientosProducto` timeline + Trazabilidad wiring.
- **Decision needed before apply: confirm single apply vs 2 slices.**

---

## Phase 1: Migration & Types

### [x] 1.1 Migration — movement log table
- **Files**: `supabase/migrations/015_movimiento_producto.sql` (CREATE)
- **Spec refs**: Product movement log table
- **Details**: `movimiento_producto` (cols per design AD-1) + `(request_item_id, created_at)` index + `chk_mov_tipo CHECK (tipo IN ('destino_asignado','oc_emitida','recepcion'))` + RLS SELECT/INSERT company match via `request_items → requests`, no UPDATE/DELETE. BEGIN/COMMIT + rollback comment + manual-verify checklist. **Hand SQL to the user to run manually.**

### [x] 1.2 Types
- **Files**: `src/integrations/supabase/types.ts` (MODIFY)
- **Details**: add `movimiento_produto` Row/Insert/Update. `tsc --noEmit` is the test.

---

## Phase 2: Helper + pure mappers (TDD)

### [x] 2.1 `movimiento-utils` — tests first
- **Files**: `src/lib/__tests__/movimiento-utils.test.ts` (CREATE)
- **TDD red**: `MOVIMIENTO_TIPO_LABELS` for each tipo; `movimientoOrigenRequerimiento` (number → 'Requerimiento #N', null/undefined → ''); `routingToDestino` for inventario/cotizacion/orden_directa/pendiente + unknown passthrough.

### [x] 2.2 `movimiento-utils` — implement
- **Files**: `src/lib/movimiento-utils.ts` (CREATE) — pure mappers + the best-effort `logMovimiento(client, row)` (try/catch, never throws).

---

## Phase 3: Instrument the 3 movement points

### [x] 3.1 Routing assigned (SurtidoDialog)
- **Files**: `src/components/pedidos/SurtidoDialog.tsx` (MODIFY)
- **Spec refs**: Movement logged when a routing is assigned; Logging is best-effort
- **Details**: after the existing confirm writes succeed, `logMovimiento` one row per committed item: tipo `destino_asignado`, origen = `Requerimiento #N`, destino = item routing, cantidad, request_item_id, material_id, created_by. Best-effort.

### [x] 3.2 OC emitted (generateOC)
- **Files**: `src/pages/Cotizaciones.tsx` (MODIFY), `supabase/migrations/015_movimiento_produto.sql` (EXTENDED), `src/integrations/supabase/types.ts` (MODIFIED — rfq_items), `src/components/pedidos/SurtidoDialog.tsx` (MODIFIED — rfq_items insert)
- **Spec refs**: Movement logged when a purchase order is emitted
- **Details**: Option B implemented. `rfq_items.request_item_id` column added (nullable, FK to request_items, ON DELETE SET NULL). SurtidoDialog populates it for cotizacion-routed items. `generateOC` resolves request_item_id by querying `rfq_items(id, request_item_id)` for the cart's rfq_item_ids, builds a map, sets `purchase_order_items.request_item_id` per row, then logs `oc_emitida` per item where request_item_id is non-null. Free-mode RFQ items (null request_item_id) are skipped gracefully.
- **COMPROMISE (RESOLVED)**: The prior compromise where request_item_id was always null is closed. oc_emitida now logs real rows for all items that originated from a cotizacion routing.

### [x] 3.3 Reception
- **Files**: `src/hooks/useItemRecepcion.ts` (MODIFY)
- **Spec refs**: Movement logged on reception
- **Details**: after a reception write, log tipo `recepcion`, destino = inventario/obra, cantidad received, request_item_id, created_by. Best-effort.

---

## Phase 4: Per-product timeline

### [x] 4.1 `MovimientosProducto`
- **Files**: `src/components/trazabilidad/MovimientosProducto.tsx` (CREATE)
- **Spec refs**: Per-product movement timeline; Empty timeline
- **Details**: query `movimiento_produto` for a `request_item_id` chronologically; render origen → destino, cantidad, user, datetime; empty-state when none.

### [x] 4.2 Wire into Trazabilidad
- **Files**: `src/pages/Trazabilidad.tsx` (MODIFY)
- **Details**: drill-down per request item (or a product/item selector) that mounts `MovimientosProducto`.

---

## Phase 5: Verification

### [x] 5.1 Suite + typecheck + manual
- `vitest run` green (152/152) + `npx tsc --noEmit` clean.
- Manual: process a request → per-item `destino_asignado` rows; emit an OC → `oc_emitida` rows naming the provider; receive → `recepcion` row; timeline shows origen→destino/user/datetime chronologically; a forced log failure does NOT block the action.
