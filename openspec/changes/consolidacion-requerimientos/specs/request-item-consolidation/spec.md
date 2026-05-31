# Delta for Request Item Consolidation (núcleo)

> Two-axis model: `routing` (procurement, `#1`) is orthogonal to `delivery_target` (delivery location, this change). Consolidation gates on `delivery_target='deposito'`. Reception distribution is deferred to `#8b`.

## ADDED Requirements

### Requirement: Per-item delivery target

Each `request_items` row MUST carry a `delivery_target` of `deposito` or `obra`, defaulting to `obra`. The request creation form MUST let the user choose it per item.

#### Scenario: Column added with default

- GIVEN the migration `016_consolidacion.sql` is applied
- THEN `request_items.delivery_target` exists, constrained to `deposito | obra`, default `obra`
- AND existing rows default to `obra`

#### Scenario: Selectable at creation

- GIVEN the user adds a product to a new requirement
- THEN they can set its delivery target to deposito or obra

### Requirement: Eligible items discovered grouped by material across obras

The consolidation panel MUST list consolidation-eligible request items grouped by `material_id`, summing quantities across obras, showing per-source breakdown (requirement number, obra, quantity). An item is eligible when its request `status='pendiente'`, `delivery_target='deposito'`, `routing IN ('pendiente','cotizacion')`, `material_id IS NOT NULL`, and item `status='sin_pedir'`.

#### Scenario: Same material across two obras grouped

- GIVEN two requests from different obras each have an eligible item for the same material (qty 10 and 15)
- WHEN the panel loads
- THEN a single consolidated line for that material shows total 25
- AND its breakdown shows the two sources (req #, obra, 10 and 15)

#### Scenario: Ineligible items excluded

- GIVEN items with `delivery_target='obra'`, or `routing='inventario'`, or `material_id IS NULL`, or a non-`pendiente` request
- WHEN the panel loads
- THEN those items are NOT offered for consolidation
- AND free-text items (no material) show a "no consolidable" indication

### Requirement: Consolidated RFQ creation with full traceability

Creating a consolidated RFQ MUST insert an RFQ marked `rfq_type='consolidated'`, one `rfq_items` row per consolidated material line (total quantity), one `rfq_item_sources` row per contributing source (rfq_item ↔ request_item ↔ request, with the source quantity), and one `rfq_requests` row per distinct source request.

#### Scenario: Sources and requests recorded

- GIVEN the user consolidates a material line built from 2 source request_items (from 2 requests)
- WHEN the consolidated RFQ is created
- THEN one `rfq_items` row exists with the summed quantity
- AND two `rfq_item_sources` rows link it to each source request_item with that source's quantity
- AND `rfq_requests` rows link the RFQ to both source requests
- AND the RFQ has `rfq_type='consolidated'`

#### Scenario: Traceability sums back to the total

- GIVEN a consolidated `rfq_items` row of quantity 25
- THEN the sum of its `rfq_item_sources.quantity` equals 25

### Requirement: Urgency propagated from source requirements

A consolidated RFQ MUST be flagged urgent when ANY contributing source request is urgent (computed from its `desired_date` vs the company urgency threshold, via `isUrgente`).

#### Scenario: Any urgent source makes the RFQ urgent

- GIVEN a consolidation where one of two source requests is urgent
- WHEN the consolidated RFQ is created
- THEN it is flagged urgent

#### Scenario: No urgent source

- GIVEN all source requests are within the threshold (not urgent)
- THEN the consolidated RFQ is not urgent

### Requirement: Existing RFQ flows unaffected

The manual, basket, and direct RFQ creation paths MUST continue to work unchanged; consolidation is an additional path.

#### Scenario: Non-consolidated RFQ unchanged

- GIVEN a user creates an RFQ via the existing manual/basket/direct flow
- THEN no `rfq_item_sources` / `rfq_requests` rows are required
- AND `rfq_type` is its normal value (not `consolidated`)
