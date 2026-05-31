# Exploration: Comparativa Header Editing & Audit Log

Source: `Reporte 1805.docx` — "MÓDULO: COMPARATIVA" item 7 (D1).

## Report item (D1, ALTA)

From the comparativa, the buyer must be able to edit the RFQ header after it's generated:
- Inline or modal editing for: **fecha de cierre, descripción, condición de precios, condición de pago**.
- Every modification logged: **campo editado, valor anterior, valor nuevo, usuario, timestamp**.
- A **"Historial de modificaciones"** accessible from the comparativa (icon or collapsible section).

## Current state (evidence)

- `src/pages/Comparativa.tsx` loads the RFQ (`:37-39`) selecting `id, status, created_at, closing_datetime, observations, created_by, request_id, pool_id` — it does NOT select `descripcion`, `price_terms`, `payment_terms` (the fields added in `#4`'s migration 013).
- The header renders **read-only** (`:255-285`): creation date, `closing_datetime`, creator, product/quote counts. No edit control.
- **No `rfqs` UPDATE mutation exists anywhere** in `src/` — all `.from("rfqs")` calls are selects/inserts. Editing the RFQ header is net-new.
- The only audit/history table in the schema is `requerimiento_evento` (migration 004) — the pattern to mirror (table + `request_id` FK + RLS by company match + immutable rows).

## DB state

- The four editable fields already have columns on `rfqs`: `closing_datetime` (existing), `descripcion` + `price_terms` (added in `#4`/migration 013, already run by the user), `payment_terms` (existing). So **no column additions needed** for the edit itself.
- **A new audit table is needed** for the change history (campo/old/new/user/timestamp). No generic audit table exists.

## Approach shape

- New table `rfq_change_log` (mirror `requerimiento_evento`): `id, rfq_id FK, field, old_value, new_value, changed_by, created_at` + RLS (company match through `rfqs.company_id`), insert-only/immutable.
- Comparativa: add the editable fields to the select; an **"Editar encabezado"** modal with the 4 fields (closing_datetime = datetime-local, descripcion = text, price_terms / payment_terms = selects reusing `#4`'s option sets). On save: compute the changed fields, `UPDATE rfqs`, and insert one `rfq_change_log` row per changed field.
- A **pure diff** (`diffRfqHeader(before, after) → {field, old, new}[]`) so only actually-changed fields are logged — unit-tested.
- **"Historial de modificaciones"**: a collapsible section / popover in the comparativa querying `rfq_change_log` for the RFQ, newest first, showing a human label per field + `old → new` + user + timestamp.
- **Permission**: editing is compras/admin only (the comparativa is the buyer surface) — guard in UI + RLS.

## Open questions for the user

1. **Edit UX**: a single **"Editar encabezado" modal** (all 4 fields at once) vs inline per-field editing. The report allows either. Recommendation: modal (simpler, one audit batch). Confirm.
2. **Closing-date restriction**: should editing `fecha de cierre` be allowed even after the RFQ has closed / received quotes, or restricted? Report doesn't say. Default: allow always (with the change logged). Confirm if you want a guard.
