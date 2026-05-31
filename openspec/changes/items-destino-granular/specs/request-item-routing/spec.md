# Delta for Request Item Routing

> `routing` = PROCUREMENT routing (how an item is obtained: `inventario | cotizacion | orden_directa | pendiente`). It is orthogonal to delivery location (`deposito | obra`), which is a separate `delivery_target` field owned by the future consolidación change.

## ADDED Requirements

### Requirement: Per-item routing column

Each `request_items` row MUST carry a `routing` value constrained to `inventario | cotizacion | orden_directa | pendiente`. New and existing rows MUST default to `pendiente`.

#### Scenario: Existing items backfilled to pendiente

- GIVEN request_items rows exist before this migration
- WHEN migration `012_request_item_routing.sql` is applied
- THEN every existing row has `routing = 'pendiente'`
- AND the column has a CHECK constraint rejecting any value outside the four allowed values

#### Scenario: New item defaults to pendiente

- GIVEN a request item is inserted without specifying `routing`
- WHEN the row is created
- THEN its `routing` is `pendiente`

#### Scenario: Invalid routing rejected

- GIVEN an attempt to set `routing = 'foo'`
- WHEN the write reaches the database
- THEN the CHECK constraint rejects it

### Requirement: requerimiento_evento.tipo CHECK reconciled with code

The `requerimiento_evento.tipo` CHECK MUST allow every `tipo` the codebase inserts, so no timeline event is silently rejected. This includes `'procesado'` (this change) and the previously-drifted values `'en_curso'`, `'recibido'`, `'solicitud_cotizacion'`. Historical values (`'procesado_parcial'`, `'procesado_total'`, `'item_actualizado'`, `'nota'`, `'recepcion_obra'`, `'creado'`, `'pendiente'`, `'rechazado'`) MUST be preserved so the constraint rebuild does not fail validation on existing rows.

#### Scenario: Procesado event persists

- GIVEN a request is processed and its routings are confirmed
- WHEN a `requerimiento_evento` with `tipo = 'procesado'` is inserted
- THEN the insert succeeds (the CHECK no longer rejects it)
- AND the event appears in the request activity timeline

#### Scenario: Status-transition events persist

- GIVEN a request transitions to `en_curso` or `recibido`
- WHEN `recalcRequestStatus`/`useStatusTransition` inserts a `requerimiento_evento` with that `tipo`
- THEN the insert succeeds (it was silently rejected before this migration)

### Requirement: User assigns routing per item before processing

The processing dialog MUST let the user choose a routing for **each** item independently. The system MAY pre-suggest a routing from stock availability, but the suggestion MUST NOT be committed automatically.

#### Scenario: Suggestion offered, not committed

- GIVEN a request with one in-stock item and one out-of-stock item
- WHEN the processing dialog opens
- THEN the in-stock item shows a suggested routing `inventario`
- AND the out-of-stock item shows a suggested routing `cotizacion`
- AND no inventory reservation or RFQ exists yet
- AND the user can change either suggestion before confirming

#### Scenario: Each item independently assignable

- GIVEN a request with three items
- WHEN the user assigns `inventario` to one, `cotizacion` to another, and leaves the third `pendiente`
- THEN each item's chosen routing is held in the dialog state independently

### Requirement: No side effect without explicit per-item confirmation

No inventory reservation, remito, or RFQ MUST be created until the user explicitly confirms. The confirm action MUST be blocked while any item remains `pendiente`.

#### Scenario: Confirm blocked while an item is pendiente

- GIVEN a request being processed where at least one item is still `pendiente`
- WHEN the user attempts to confirm
- THEN the confirm action is disabled
- AND a message indicates that every item needs a routing

#### Scenario: Confirm acts only on committed routings

- GIVEN a request where the user assigned `inventario` to item A and `cotizacion` to item B
- WHEN the user confirms
- THEN inventory is reserved only for item A
- AND an RFQ is created only for item B
- AND each processed item's `request_items.routing` is persisted to its committed value
- AND a `requerimiento_evento` (`tipo = 'procesado'`) records the per-item routings chosen

#### Scenario: Cancel produces no side effect

- GIVEN the processing dialog is open with routings assigned but not confirmed
- WHEN the user closes or cancels the dialog
- THEN no inventory reservation, remito, or RFQ is created
- AND no `request_items.routing` value is changed

### Requirement: Routing visible in request detail

The request detail view MUST display each item's current `routing`.

#### Scenario: Detail shows per-item routing

- GIVEN a request whose items have routings `inventario`, `cotizacion`, `pendiente`
- WHEN the user opens the request detail modal
- THEN each item row shows its routing label
- AND the labels match the persisted `request_items.routing` values

## MODIFIED Requirements

### Requirement: Request processing no longer auto-decides by stock

The previous flow (single action that reserved in-stock items and auto-created a draft RFQ for shortfalls) MUST be replaced by the user-driven per-item routing flow above. Stock availability MAY inform the suggestion but MUST NOT drive an automatic commit.

#### Scenario: Parent status derivation unchanged

- GIVEN items are processed via their committed routings
- WHEN item statuses subsequently change (`sin_pedir → en_oc → parcial → recibido`)
- THEN the parent `requests.status` is still derived by `recalcRequestStatus` exactly as before
- AND no regression is introduced in parent-status transitions
