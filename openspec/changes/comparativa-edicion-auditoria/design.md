# Design: Comparativa Header Editing & Audit Log

## Architecture Decisions

### AD-1: `rfq_change_log` mirrors `requerimiento_evento`

Reuse the proven audit pattern (migration 004): a child table with an FK to the parent, `changed_by` → `auth.users`, `created_at`, RLS by company match, and NO update/delete policies (immutable). Generic enough that the same shape (`field/old_value/new_value`) can serve other entities later, but scoped to RFQ for now.

```sql
CREATE TABLE rfq_change_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id      uuid        NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  field       text        NOT NULL,
  old_value   text,
  new_value   text,
  changed_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rfq_change_log ON rfq_change_log (rfq_id, created_at DESC);

ALTER TABLE rfq_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rfq_change_log_select_company" ON rfq_change_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM rfqs r JOIN profiles p ON p.company_id = r.company_id
                 WHERE r.id = rfq_change_log.rfq_id AND p.id = auth.uid()));
CREATE POLICY "rfq_change_log_insert_company" ON rfq_change_log FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM rfqs r JOIN profiles p ON p.company_id = r.company_id
                      WHERE r.id = rfq_change_log.rfq_id AND p.id = auth.uid()));
-- no UPDATE/DELETE policies → immutable
```

Values are stored as TEXT (uniform `old → new` rendering); `closing_datetime` is stored as its ISO string.

### AD-2: Changed-fields diff is pure and tested

`src/lib/rfq-header-utils.ts`:

```ts
type RfqHeaderField = 'closing_datetime' | 'descripcion' | 'price_terms' | 'payment_terms';
interface RfqHeader { closing_datetime: string; descripcion: string; price_terms: string; payment_terms: string; }

function diffRfqHeader(before: RfqHeader, after: RfqHeader): { field: RfqHeaderField; old: string; new: string }[];
const RFQ_FIELD_LABELS: Record<RfqHeaderField, string>;  // "Fecha de cierre", "Descripción", "Condición de precios", "Condición de pago"
```

`diffRfqHeader` normalizes (trim; treat `null`/`undefined` as `''`) and returns only fields where `before !== after`. The mutation logs exactly these; a no-op save returns `[]` and writes nothing. Unit-tested: each field changed/unchanged, all changed, none changed, whitespace-only no-op.

### AD-3: One modal, batched write

A single "Editar encabezado" modal edits all four fields. On save: compute `diffRfqHeader(current, edited)`; if empty → close, no write. Otherwise `UPDATE rfqs SET ...` then batch-`insert` the change-log rows (one per changed field) with `changed_by = auth user`. The `rfqs` update and the log insert are sequential client-side calls (no cross-table transaction needed — a failed log insert surfaces an error and the history is best-effort, but ordering puts the rfqs update first so the visible state is correct).

### AD-4: Permission — Compras/admin only

The edit action and history-write are gated in the UI by `useViewRole` (`compras`/`admin`), and at the DB by the RLS company-match policy. Non-buyers don't see "Editar encabezado". History is readable by anyone in the company (same RLS as the RFQ).

### AD-5: Reuse `#4` option sets for the selects

`price_terms` and `payment_terms` selects reuse the option lists introduced in `#4`'s RfqNuevo (price: precios firmes / sujetos a variación / a confirmar; payment: cheque_30/60/90, transferencia_inmediata, contrato_acopio). `closing_datetime` = `datetime-local`; `descripcion` = text input.

**closing_datetime conversion (required):** the stored value is TIMESTAMPTZ (full ISO with seconds + offset), which a `datetime-local` input rejects → renders blank → a no-op save would falsely diff and NULL the date. Pure helpers `isoToDatetimeLocal` / `datetimeLocalToIso` (in `rfq-header-utils.ts`, tested) bridge this: `current.closing_datetime` and the input use the `YYYY-MM-DDTHH:mm` local form (so the baseline and the form match → no spurious diff), and the save converts back to ISO before writing `rfqs`.

## Flow — save with audit

```
user opens "Editar encabezado" (compras/admin)
  modal pre-filled from rfq {closing_datetime, descripcion, price_terms, payment_terms}
user edits → Save
  changes = diffRfqHeader(current, edited)
  if changes.length === 0 → close (no write)
  else:
    UPDATE rfqs SET <changed fields> WHERE id = rfqId
    INSERT rfq_change_log [{rfq_id, field, old_value, new_value, changed_by}, ...]   (one per change)
    invalidate comparativa + history queries → header + history refresh
```

## Files

| File | Action |
|------|--------|
| `supabase/migrations/014_rfq_change_log.sql` | new (table + RLS) |
| `src/integrations/supabase/types.ts` | add `rfq_change_log` |
| `src/lib/rfq-header-utils.ts` (+ `__tests__`) | new (pure diff + labels, TDD) |
| `src/pages/Comparativa.tsx` | select new fields; mount edit + history |
| `src/components/comparativa/EditarEncabezadoDialog.tsx` | new (edit modal + save/audit mutation) |
| `src/components/comparativa/HistorialModificaciones.tsx` | new (collapsible history list) |

## Risks

- **New write path on `rfqs`**: first place RFQs are updated post-creation. Mitigated by role guard + RLS + only touching the 4 header fields.
- **Audit/rfqs consistency**: two sequential writes (no DB transaction). Acceptable — `rfqs` update first; a log-insert failure shows an error but doesn't corrupt the RFQ. (If stronger atomicity is wanted later, move to an RPC.)
- **Comparativa.tsx size**: extract the modal + history into `src/components/comparativa/` to avoid bloating the page.
