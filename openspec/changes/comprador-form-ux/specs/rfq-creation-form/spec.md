# Delta for RFQ Creation Form & Cart Batch

## ADDED Requirements

### Requirement: New solicitud header fields

The `rfqs` table MUST carry `descripcion`, `categoria`, and `price_terms` (condición de precios), all nullable text. The existing `payment_terms` (condición de pago) MUST be surfaced in the creation form. `rfq_items` MUST carry `observations` (nullable text).

#### Scenario: New columns added additively

- GIVEN the migration `013_*` is applied
- WHEN it runs
- THEN `rfqs.descripcion`, `rfqs.categoria`, `rfqs.price_terms`, and `rfq_items.observations` exist as nullable columns
- AND existing rows are unaffected (all NULL)

### Requirement: Draft persistence for the RFQ creation form

The RFQ creation form (`RfqNuevo`) MUST persist its in-progress state to localStorage and restore it on return. It MUST clear the draft only on successful submit or explicit user discard.

#### Scenario: Draft survives navigation

- GIVEN a user has partially filled the new-solicitud form
- WHEN they navigate away and return
- THEN the form is restored to the saved values
- AND a dismissible notice indicates a recovered draft

#### Scenario: Draft cleared on successful submit

- GIVEN a draft exists
- WHEN the user successfully submits the solicitud
- THEN the persisted draft is removed
- AND the form resets to empty

#### Scenario: Draft cleared on explicit discard

- GIVEN a draft exists
- WHEN the user chooses to discard it
- THEN the persisted draft is removed
- AND no autosave re-creates it until the user edits again

#### Scenario: Autosave is debounced

- GIVEN the user is typing in the form
- WHEN multiple changes happen within the debounce window
- THEN only one persisted write occurs after the user pauses

### Requirement: Two-section accordion layout with gating

The creation form MUST present two collapsible sections: **Detalle** (Tipo de solicitud, Fecha de cierre, Descripción, Categoría, Entregar en, Condición de precios, Condición de pago) and **Productos** (per-item material, cantidad, unidad, descripción, observaciones). Section 1 MUST be expanded by default. Section 2 MUST be gated until Section 1 is valid. Each section header MUST show a completion-state indicator.

#### Scenario: Section 1 expanded by default

- GIVEN the form opens
- THEN the Detalle section is expanded and Productos is collapsed/disabled

#### Scenario: Section 2 enabled when header valid

- GIVEN all required Section-1 fields are filled validly
- WHEN the user completes the header
- THEN Section 2 (Productos) becomes enabled
- AND the Section-1 header shows a "complete" indicator

#### Scenario: Section 2 blocked when header invalid

- GIVEN a required Section-1 field is empty or invalid
- THEN Section 2 stays gated
- AND the Section-1 indicator shows "incomplete"

### Requirement: Per-item observations on RFQ items

Each product row in the creation form MUST allow an optional `observations` value, persisted to `rfq_items.observations`.

#### Scenario: Per-item observation persisted

- GIVEN the user enters observations on a product row
- WHEN the solicitud is submitted
- THEN that value is stored in the corresponding `rfq_items.observations`

### Requirement: Batch generate all purchase orders

The cart MUST offer a single "Generar todas las órdenes de compra" action that generates every pending provider group's OC in one user action. Backend OCs MAY remain individual per provider.

#### Scenario: One action generates all OCs

- GIVEN the cart has pending OCs for multiple providers
- WHEN the user clicks "Generar todas las órdenes de compra"
- THEN an OC is generated for every pending provider group
- AND a single combined result is reported (success count / failures)

#### Scenario: Per-provider buttons still available

- GIVEN the cart has pending provider groups
- THEN the existing per-provider "Generar Orden de Compra" buttons remain functional alongside the batch action
