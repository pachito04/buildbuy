# Proposal: Comparativa Header Editing & Audit Log

## Intent

Once an RFQ is generated, its header is frozen in the comparativa (`Comparativa.tsx` is fully read-only). Report 1805 (D1, ALTA) requires the buyer to edit key header fields from the comparativa, with a full audit trail and a visible change history. This change adds editing for `closing_datetime`, `descripcion`, `price_terms` (condición de precios) and `payment_terms` (condición de pago), an `rfq_change_log` audit table, and a "Historial de modificaciones" view.

## Scope

### In Scope
- **Migration**: `rfq_change_log` table (`rfq_id, field, old_value, new_value, changed_by, created_at`) + RLS (company match via `rfqs.company_id`), insert-only/immutable — mirroring `requerimiento_evento`.
- **Edit UI**: an "Editar encabezado" action in the comparativa opening a modal with the 4 fields (closing_datetime = datetime-local, descripcion = text, price_terms / payment_terms = selects reusing `#4`'s option sets). Compras/admin only.
- **Update + audit**: a mutation that `UPDATE`s `rfqs` and inserts one `rfq_change_log` row per **changed** field, capturing old/new/user/timestamp.
- **Pure diff** (`diffRfqHeader`, TDD): returns only the fields that actually changed.
- **History view**: a "Historial de modificaciones" collapsible/popover in the comparativa listing changes (field label, old → new, user, timestamp), newest first.
- Add `descripcion, price_terms, payment_terms` to the comparativa's `rfqs` select so current values are editable/displayed.

### Out of Scope
- Editing RFQ **items** (only the header fields the report lists).
- A generic audit framework for other entities (this is RFQ-header-specific; reuse later if needed).
- Notifying providers of header changes (could be a later enhancement).

### Decided defaults (confirm if different)
- **Modal edit** (all 4 fields at once → one audit batch), not inline.
- Editing `closing_datetime` is **allowed always**, with the change logged (no post-close guard) unless you ask for one.

## Capabilities

### New Capabilities
- `comparativa-header-edit`: Buyer can edit the RFQ header from the comparativa; every change is audited and viewable as a history.

## Approach

1. **Migration** — `rfq_change_log` + RLS. Hand SQL to the user to run.
2. **types.ts** — add the new table; add `descripcion/price_terms/payment_terms` to the comparativa rfq select usage.
3. **Pure diff (TDD)** — `diffRfqHeader(before, after)` in `rfq-header-utils.ts`.
4. **Edit modal + mutation** — update `rfqs`, batch-insert change-log rows for changed fields only.
5. **History view** — query `rfq_change_log`, render collapsible list with field labels.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/014_rfq_change_log.sql` | New | audit table + RLS |
| `src/integrations/supabase/types.ts` | Modified | `rfq_change_log` table |
| `src/lib/rfq-header-utils.ts` (+ tests) | New | pure `diffRfqHeader` + field labels |
| `src/pages/Comparativa.tsx` | Modified | select new fields; "Editar encabezado" modal; update+audit mutation; "Historial de modificaciones" |
| (maybe) `src/components/comparativa/EditarEncabezadoDialog.tsx` + `HistorialModificaciones.tsx` | New | extracted components to keep Comparativa.tsx manageable |

## Rollback Plan

- **DB**: new table only; rollback = `DROP TABLE rfq_change_log`. No change to existing tables/data.
- **Code**: edit/history UI is additive behind a button; reverting the files restores the read-only comparativa. The `rfqs` UPDATE is the only new write path — guarded to compras/admin + RLS.
- **Risk**: low–medium. New write path on `rfqs` + a new table; mitigated by RLS, role guard, and the pure-diff (only changed fields logged).

## Review Workload (preliminary)

Around the 400-line line (migration + modal + history + mutation + utils). Possibly one PR, or two slices: (1) migration + types + pure diff + edit modal/mutation; (2) history view. Confirm at tasks.

## Strict TDD

`strict_tdd: true`. `rfq-header-utils.diffRfqHeader` is written test-first (`vitest run`). UI verified via `tsc --noEmit` + manual checklist.
