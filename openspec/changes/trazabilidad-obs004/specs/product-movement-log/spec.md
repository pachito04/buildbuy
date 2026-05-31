# Delta for Product Movement Log

## ADDED Requirements

### Requirement: Product movement log table

A `movimiento_producto` table MUST record per-product movements with `request_item_id`, `material_id`, `tipo`, `origen`, `destino`, `cantidad`, `ref_type`, `ref_id`, `created_by`, `created_at`. Rows MUST be immutable (no UPDATE/DELETE) and protected by RLS so a user only sees/writes movements for request items in their own company.

#### Scenario: Table created with RLS

- GIVEN the migration `015_movimiento_producto.sql` is applied
- THEN `movimiento_producto` exists with the listed columns and a `(request_item_id, created_at)` index
- AND RLS allows SELECT/INSERT only when the row's request item belongs to the user's company (via `request_items → requests.company_id`)
- AND there are no UPDATE or DELETE policies (immutable)

### Requirement: Movement logged when a routing is assigned

When Compras confirms per-item routings (`SurtidoDialog`), the system MUST record one `movimiento_producto` row per item: `tipo = 'destino_asignado'`, `origen` referencing the requirement, `destino` = the item's routing, `cantidad`, the acting user, and timestamp.

#### Scenario: Routing assignment logs per item

- GIVEN a request with two items is processed with routings `inventario` and `cotizacion`
- WHEN the user confirms
- THEN two `movimiento_producto` rows are inserted
- AND each has `tipo='destino_asignado'`, `origen` = the requirement reference, `destino` = that item's routing, `created_by` = the acting user, and a timestamp

### Requirement: Movement logged when a purchase order is emitted

When a purchase order is generated (`generateOC`), the system MUST record a `movimiento_producto` row per ordered item with `tipo = 'oc_emitida'`, `destino` = the provider, `ref_type='purchase_order'`, `ref_id` = the PO, user and timestamp.

#### Scenario: OC emission logs provider destination

- GIVEN a cart group for a provider is turned into an OC
- WHEN `generateOC` runs
- THEN a `movimiento_producto` row is inserted per item with `tipo='oc_emitida'`, `destino` naming the provider, and `ref_id` = the purchase order

### Requirement: Movement logged on reception

When materials are received (depósito/obra reception), the system MUST record a `movimiento_producto` row with `tipo = 'recepcion'`, `destino` = the physical destination (inventario/obra), `cantidad` received, user and timestamp.

#### Scenario: Reception logs physical destination

- GIVEN an item is received
- WHEN the reception is confirmed
- THEN a `movimiento_producto` row is inserted with `tipo='recepcion'`, the received `cantidad`, the physical `destino`, and the acting user

### Requirement: Logging is best-effort (never blocks the flow)

A failure to write a `movimiento_producto` row MUST NOT abort or roll back the underlying operation (routing confirmation, OC generation, reception). The log write is best-effort.

#### Scenario: Movement-log failure does not block the action

- GIVEN the underlying action (e.g. OC generation) succeeds
- WHEN the `movimiento_producto` insert fails
- THEN the action still completes successfully
- AND the failure is swallowed (no user-facing error from the log alone)

### Requirement: Per-product movement timeline in Trazabilidad

Trazabilidad MUST present, per product (request item), a chronological timeline of its movements showing origen → destino, quantity, user, and datetime.

#### Scenario: Timeline lists movements chronologically

- GIVEN a request item with several logged movements
- WHEN the user views its trace in Trazabilidad
- THEN the movements are listed in chronological order
- AND each entry shows origen → destino, cantidad (when present), the user, and the datetime

#### Scenario: Empty timeline

- GIVEN a request item with no logged movements
- WHEN the user views its trace
- THEN an empty-state message is shown
