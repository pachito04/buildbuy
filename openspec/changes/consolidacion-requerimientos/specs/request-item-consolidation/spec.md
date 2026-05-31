# Request Item Consolidation Specification

> ⚠️ **CORRECTION (supersedes inline `destination`/`inventario` language below).**
> Two **orthogonal** axes were wrongly merged:
> - **`request_items.routing`** (`inventario | cotizacion | orden_directa | pendiente`) — PROCUREMENT routing, owned by `items-destino-granular`.
> - **`request_items.delivery_target`** (`deposito | obra`) — DELIVERY location, owned by consolidación (does NOT exist yet).
>
> Every scenario below that gates on `destination = 'inventario'` is **incorrect** and must read: `routing = 'cotizacion'` (or quotable `pendiente`) **AND** `delivery_target = 'deposito'` **AND** `material_id IS NOT NULL`. `routing = 'inventario'` items are stock-fulfilled, never quoted, never consolidated. Rework these scenarios when consolidación is resumed.

## Purpose

Compras can consolidate eligible request items from multiple obras into a single RFQ grouped by material, with full traceability, urgency propagation, and partial delivery distribution.

## Requirements

### Requirement: Eligibility Rules

> **Prerequisite alignment**: `request_items.destination` is owned by `items-destino-granular`. The canonical values are `inventario | cotizacion | orden_directa | pendiente`. For consolidation purposes, items routed to depot/inventory use `destination = 'inventario'` (not `deposito`).

The system MUST include a request item in the consolidation pool if and only if ALL of the following hold:
- Parent `requests.status = 'pendiente'`
- `request_items.status = 'sin_pedir'`
- `request_items.destination = 'inventario'`
- `request_items.material_id IS NOT NULL`

Free-text items (no `material_id`) MUST be excluded and MUST display a badge "No consolidable — sin material vinculado".

#### Scenario: Eligible items appear in panel

- GIVEN requests from two different obras each have items with status=sin_pedir, destination=inventario, and a valid material_id
- WHEN Compras opens the Consolidar tab
- THEN all eligible items appear grouped by material_id, regardless of obra

#### Scenario: Free-text items excluded

- GIVEN a request item has destination=inventario and status=sin_pedir but material_id IS NULL
- WHEN Compras opens the Consolidar tab
- THEN the item appears with badge "No consolidable — sin material vinculado" and cannot be selected

#### Scenario: Non-inventario items excluded

- GIVEN a request item has destination=cotizacion or destination=pendiente
- WHEN Compras opens the Consolidar tab
- THEN the item does NOT appear in the consolidation panel

### Requirement: Consolidated RFQ Creation

The system MUST create an RFQ with `rfq_type = 'consolidated'` from selected items. For each consolidated line, the system MUST insert one `rfq_item_sources` row per source request_item. The system MUST insert one `rfq_requests` row per distinct source request.

#### Scenario: Create consolidated RFQ

- GIVEN Compras selects items from 3 obras sharing the same material_id
- WHEN Compras confirms RFQ creation
- THEN one RFQ is created with rfq_type=consolidated
- AND one rfq_items row exists per distinct material_id
- AND rfq_item_sources rows link each rfq_item to its source request_item_ids with quantities
- AND rfq_requests rows link the RFQ to each source request

#### Scenario: Existing RFQ flows unaffected

- GIVEN Compras creates a standard RFQ (manual, basket, direct)
- WHEN the RFQ is saved
- THEN rfq_type defaults to its original value and rfq_item_sources is not populated

### Requirement: Urgency Propagation

The system MUST set `rfqs.urgente = true` on the consolidated RFQ if ANY source request has `urgente = true`. The `urgente` field is internal only and MUST NOT be exposed to providers.

Non-urgent source items SHOULD display a notice: "Marcado como urgente por consolidación con Requerimiento #XX" where XX is the urgent request number.

#### Scenario: Urgency propagates from one urgent source

- GIVEN items from 5 requests are consolidated and 1 request has urgente=true
- WHEN the consolidated RFQ is created
- THEN rfqs.urgente = true
- AND non-urgent items show the urgency notice referencing the urgent request number

#### Scenario: No urgency when no source is urgent

- GIVEN all source requests have urgente=false
- WHEN the consolidated RFQ is created
- THEN rfqs.urgente = false

### Requirement: Partial Delivery Distribution

When an OC quantity is less than total requested, the system MUST distribute available units prioritizing urgent requests first, then by `desired_date ASC` within each urgency group.

#### Scenario: Urgent requests fulfilled first

- GIVEN a consolidated rfq_item covers 100 units (50 urgent, 50 non-urgent)
- WHEN provider delivers 60 units
- THEN the 50 urgent units are allocated first
- AND remaining 10 units go to the earliest desired_date among non-urgent items

#### Scenario: Full delivery — no distribution needed

- GIVEN delivered quantity equals total requested quantity
- WHEN reception is registered
- THEN each source request_item receives its full requested quantity

### Requirement: Destination Selector on Request Creation

> **Alignment with `items-destino-granular`**: destination is now set in the processing dialog (SurtidoDialog), not at request creation time. Items start as `destination=pendiente` and are assigned during processing. The `CreateRequestDialog` destination selector described below is superseded by the per-item processing flow.

The system MAY surface destination in the request creation dialog for planning purposes, but the authoritative assignment happens in the processing dialog. The default value is `pendiente` (not `obra`).

#### Scenario: Set destination during processing

- GIVEN a user is processing a request with multiple items
- WHEN the user selects destination=inventario for one item
- THEN that item is saved with destination=inventario and becomes eligible for consolidation
- AND items without explicit selection remain destination=pendiente (cannot be processed)
