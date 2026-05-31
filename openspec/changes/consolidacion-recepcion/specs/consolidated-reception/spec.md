# Delta for Consolidated Reception Distribution (#8b)

## ADDED Requirements

### Requirement: Shared urgency-based distribution

A pure `distributeByUrgency(receivedQty, sources)` MUST allocate a received quantity across sources, serving **urgent sources first to their full requested quantity**, then the next, until the received quantity is exhausted — never allocating a source beyond its requested quantity. (Reused by `#9`.)

#### Scenario: Shortfall serves the most urgent first

- GIVEN sources A (requested 10, urgent) and B (requested 10, not urgent), and receivedQty 12
- WHEN distributed
- THEN A is allocated 10 (full) and B is allocated 2 (remainder)

#### Scenario: Full coverage allocates everyone fully

- GIVEN total requested 25 and receivedQty ≥ 25
- THEN every source is allocated its full requested quantity

#### Scenario: No over-allocation

- GIVEN a single source requested 10 and receivedQty 100
- THEN it is allocated 10 (not 100)

#### Scenario: Zero received

- GIVEN receivedQty 0
- THEN every source is allocated 0

### Requirement: Consolidated reception distributes to sources

When a received purchase-order item belongs to a consolidated rfq_item (it has `rfq_item_sources`), the reception flow MUST resolve those sources, propose a distribution of the accepted quantity via `distributeByUrgency`, allow Compras to override it manually, and persist each source `request_items.quantity_received` (and status) plus a `recepcion` movement per source.

#### Scenario: Single-provider full coverage auto-assigns

- GIVEN a consolidated line received in full from a single provider
- WHEN reception is confirmed
- THEN each source request_item's `quantity_received` increases by its full requested quantity
- AND a `recepcion` movimiento_producto row is logged per source

#### Scenario: Shortfall distributes by urgency

- GIVEN a consolidated line received partially
- THEN the proposed distribution serves the most-urgent source requirement(s) first
- AND Compras can adjust the per-source quantities before confirming

#### Scenario: Manual override

- GIVEN Compras edits the proposed per-source allocation
- WHEN confirmed
- THEN the persisted `request_items.quantity_received` updates match the edited allocation

### Requirement: Cannot close until fully assigned

The reception of a consolidated line MUST NOT be closable until the accepted quantity is fully assigned across its source requirements (sum of allocations equals the accepted quantity).

#### Scenario: Unassigned remainder blocks close

- GIVEN an accepted quantity with some units not yet assigned to any source
- WHEN the user attempts to confirm
- THEN confirmation is blocked with a message that all units must be assigned

### Requirement: Non-consolidated reception unchanged

Reception of a non-consolidated purchase-order item (no `rfq_item_sources`) MUST behave exactly as before this change.

#### Scenario: Plain OC reception unaffected

- GIVEN a normal (non-consolidated) OC
- WHEN received
- THEN the flow is identical to the pre-change behavior (PO item `quantity_received` + inventory movement), with no per-source distribution step

### Requirement: Proactive consolidation detection

When Compras views/processes a requirement, for each item routed to depósito whose material also appears in other eligible pending requirements, the system MUST surface a prompt indicating the material is requested elsewhere and offering to go to consolidation.

#### Scenario: Cross-requirement match prompts consolidation

- GIVEN a request item (deposito, eligible) whose material_id also appears in another eligible pending request
- WHEN Compras views the requirement
- THEN a hint is shown ("Este producto está solicitado en el requerimiento #XXX — ¿Consolidar?") linking to the Consolidar view

#### Scenario: No match, no prompt

- GIVEN no other eligible request contains the material
- THEN no consolidation prompt is shown
