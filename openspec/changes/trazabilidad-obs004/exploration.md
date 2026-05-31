# Exploration: Per-Product Movement Traceability (OBS-004)

Source: `Reporte 1805.docx` — PERFIL COMPRAS, **OBS-004** (⚠️ PENDIENTE).

## Report item (OBS-004)

> Se requiere **registro de auditoría total por producto**: origen (requerimiento), destino (inventario / cotización / proveedor), usuario que ejecutó la acción, fecha y hora.

So: a per-**product** movement log capturing, for each movement, its origin, destination, the acting user, and timestamp.

## Current state (evidence)

- **`Trazabilidad.tsx`** builds request-level "chains" (`Pedido → Pool → Solicitud → Cotización → OC`) by joining `requests/pool_requests/rfqs/quotes/purchase_orders` (`:113-127`). The "stage" of a chain is **inferred** from which entities exist (`chainStage`, `:143-149`) — there is no per-movement record of *who did what when*, and it's at the request level, not per product.
- **`inventory_movements`** (migration 001) logs stock in/out per **material** (`material_id, movement_type, quantity, reason, request_id, created_by, created_at`) — written in `Inventario.tsx`, `RecepcionDialog.tsx`, `DespachoDialog.tsx`. It covers the inventory leg only, not the full product lifecycle.
- **`requerimiento_evento`** logs events per **request** (creado/procesado/recepcion_obra/…), with `created_by`+timestamp, but it is request-level, not per `request_item`. The `procesado` event summarizes routings as text — not queryable per product.

## The gap

There is no **per-product (`request_item`)** record of its movements with origin/destination/user/timestamp. The closest existing signal is the routing decision from `#1` (`request_items.routing` + the `procesado` event) — which is exactly the report's example (origen=requerimiento, destino=inventario/cotización/proveedor) — but it isn't captured as an auditable per-item movement row, and downstream movements (sent to RFQ, ordered from provider, received) aren't traced per product either.

## Movement points where a product moves (candidate write sites)

1. **Item created** in a requirement (origen = requerimiento) — request creation.
2. **Routing assigned** (destino = inventario / cotización / orden_directa) — `SurtidoDialog` (`#1`). ← the report's named transition.
3. **Reserved / dispatched** from inventory — depósito flows.
4. **Sent to RFQ** (destino = cotización/proveedor) — RFQ creation / surtido shortfall.
5. **Ordered from provider** (destino = proveedor, OC) — `generateOC`.
6. **Received** (físico, into inventory/obra) — reception flows.

## Design direction

A dedicated **`movimiento_producto`** log table keyed by `request_item_id` (+ `material_id`) capturing `tipo`, `origen`, `destino`, `cantidad`, `ref_type`/`ref_id`, `created_by`, `created_at`, with RLS by company (mirror `requerimiento_evento`/`inventory_movements`). A small reusable `logMovimiento(...)` helper writes a row at each instrumented movement point. `Trazabilidad.tsx` gains a **per-product timeline** view reading this log.

## Open question for the user — scope of instrumentation

Logging at **all** movement points (1–6) means touching every flow (request creation, surtido, depósito dispatch/reception, RFQ creation, OC generation). That's broad. Two options:

- **A (lean, recommended)** — instrument the movements the report explicitly names + the highest-value ones: **routing assigned** (origen=requerimiento → destino=inventario/cotización/orden_directa), **OC emitted** (destino=proveedor), **reception** (destino=inventario, físico). Plus the per-product timeline view. Covers origen→destino→usuario→fecha for the key transitions; the helper makes adding more sites later trivial.
- **B (full)** — instrument all six points now (more complete, more surface touched, larger review).

Recommendation: **A** — the table + helper are the foundation; we wire the named transitions now and can extend to the rest incrementally (the report itself filed OBS-004 as a phased "próximo ciclo" item).
