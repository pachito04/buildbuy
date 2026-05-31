# Delta for Comparativa Header Edit

## ADDED Requirements

### Requirement: RFQ change-log table

A `rfq_change_log` table MUST record every RFQ-header field change with `rfq_id`, `field`, `old_value`, `new_value`, `changed_by`, `created_at`. Rows MUST be immutable (no UPDATE/DELETE) and protected by RLS so a user only sees/writes logs for RFQs in their own company.

#### Scenario: Table created with RLS

- GIVEN the migration `014_rfq_change_log.sql` is applied
- THEN `rfq_change_log` exists with the listed columns and a `(rfq_id, created_at DESC)` index
- AND RLS allows SELECT/INSERT only when the row's RFQ belongs to the user's company
- AND there are no UPDATE or DELETE policies (rows are immutable)

### Requirement: Edit RFQ header from the comparativa

From the comparativa, a Compras/admin user MUST be able to edit the RFQ header fields `closing_datetime`, `descripcion`, `price_terms` (condición de precios) and `payment_terms` (condición de pago) via a modal. Other roles MUST NOT see the edit action.

#### Scenario: Edit modal pre-filled with current values

- GIVEN a Compras/admin user on the comparativa of an RFQ
- WHEN they open "Editar encabezado"
- THEN the modal shows the four fields pre-filled with the RFQ's current values

#### Scenario: Edit action hidden for non-buyers

- GIVEN a user who is not Compras/admin
- THEN the "Editar encabezado" action is not shown

#### Scenario: Saving updates the RFQ

- GIVEN the user changes one or more fields and saves
- THEN `rfqs` is updated with the new values
- AND the comparativa header reflects the new values

### Requirement: Every change is audited (changed fields only)

Saving the header MUST insert exactly one `rfq_change_log` row per field whose value actually changed, each capturing the old value, new value, the acting user, and a timestamp. Unchanged fields MUST NOT produce log rows.

#### Scenario: Only changed fields logged

- GIVEN the user changes `closing_datetime` and `payment_terms` but leaves `descripcion` and `price_terms` unchanged
- WHEN they save
- THEN exactly two `rfq_change_log` rows are inserted (for closing_datetime and payment_terms)
- AND each row has the correct `old_value`, `new_value`, `changed_by`, `created_at`

#### Scenario: No-op save logs nothing

- GIVEN the user opens the modal and saves without changing anything
- THEN no `rfq_change_log` rows are inserted
- AND no `rfqs` write is required

### Requirement: Modification history visible in the comparativa

The comparativa MUST offer a "Historial de modificaciones" (collapsible section or popover) listing the RFQ's change log newest-first, showing a human-readable field label, the old → new values, the user, and the timestamp.

#### Scenario: History lists changes newest-first

- GIVEN an RFQ with several logged header changes
- WHEN the user opens "Historial de modificaciones"
- THEN the changes are listed newest-first
- AND each entry shows the field label, `old → new`, the user, and the timestamp

#### Scenario: Empty history

- GIVEN an RFQ with no header changes yet
- WHEN the user opens the history
- THEN it shows an empty-state message (no entries)
