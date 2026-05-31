# Tasks: comparativa-edicion-auditoria

## Overview

Editable RFQ header from the comparativa (closing_datetime, descripcion, price_terms, payment_terms) with a per-field audit log (`rfq_change_log`) and a "Historial de modificaciones" view (D1).

**Strict TDD is active** (`vitest run`). Pure diff test-first.

## Review Workload Forecast

- Estimated changed lines: ~**350–450** (migration + utils + edit modal + history + Comparativa wiring).
- **Chained slices: optional.** Proposed if it grows past 400:
  - **Slice 1** — migration + types + `rfq-header-utils` (+tests) + `EditarEncabezadoDialog` (edit + audit mutation) + Comparativa wiring of the edit button.
  - **Slice 2** — `HistorialModificaciones` view + Comparativa wiring of the history.
- **Decision needed before apply: confirm single PR vs 2 slices.**

---

## Phase 1: Migration & Types

### [x] 1.1 Migration — audit table
- **Files**: `supabase/migrations/014_rfq_change_log.sql` (CREATE)
- **Spec refs**: RFQ change-log table
- **Details**: `rfq_change_log` (id, rfq_id FK CASCADE, field, old_value, new_value, changed_by FK auth.users, created_at) + `(rfq_id, created_at DESC)` index + RLS SELECT/INSERT by company match (mirror `requerimiento_evento`), no UPDATE/DELETE. **Hand SQL to the user to run manually.**

### [x] 1.2 Types
- **Files**: `src/integrations/supabase/types.ts` (MODIFY)
- **Details**: add `rfq_change_log` Row/Insert/Update. `tsc --noEmit` is the test.

---

## Phase 2: Pure diff (TDD)

### [x] 2.1 `rfq-header-utils` — tests first
- **Files**: `src/lib/__tests__/rfq-header-utils.test.ts` (CREATE)
- **TDD red**: `diffRfqHeader` — each single field changed → 1 entry; all four changed → 4; none changed → `[]`; whitespace-only / null↔'' normalization → no-op; correct old/new per entry.

### [x] 2.2 `rfq-header-utils` — implement
- **Files**: `src/lib/rfq-header-utils.ts` (CREATE) — `diffRfqHeader`, `RFQ_FIELD_LABELS`, types. Pure.

---

## Phase 3: Edit modal + audit mutation

### [x] 3.1 `EditarEncabezadoDialog`
- **Files**: `src/components/comparativa/EditarEncabezadoDialog.tsx` (CREATE)
- **Spec refs**: Edit RFQ header; Every change is audited
- **Details**: modal with 4 fields pre-filled (closing_datetime datetime-local, descripcion text, price_terms/payment_terms selects reusing `#4` options). On save: `diffRfqHeader`; if empty → close, no write; else `UPDATE rfqs` + batch-insert `rfq_change_log` rows for changed fields with `changed_by`. Invalidate comparativa + history queries.

### [x] 3.2 Wire edit button in Comparativa (compras/admin only)
- **Files**: `src/pages/Comparativa.tsx` (MODIFY)
- **Spec refs**: Edit action hidden for non-buyers
- **Details**: add `descripcion, price_terms, payment_terms` to the rfq select; render "Editar encabezado" in the header area, gated by `useViewRole` compras/admin.

---

## Phase 4: History view

### [x] 4.1 `HistorialModificaciones`
- **Files**: `src/components/comparativa/HistorialModificaciones.tsx` (CREATE)
- **Spec refs**: Modification history visible
- **Details**: query `rfq_change_log` for the rfq, newest-first; render field label (via `RFQ_FIELD_LABELS`), `old → new`, user, timestamp; empty-state when none.

### [x] 4.2 Wire history in Comparativa
- **Files**: `src/pages/Comparativa.tsx` (MODIFY)
- **Details**: collapsible / popover entry point ("Historial de modificaciones") in the comparativa header.

---

## Phase 5: Verification

### [x] 5.1 Suite + typecheck + manual
- `vitest run` green (132 tests, 17 new) + `npx tsc --noEmit` clean.
- Manual: edit one field → rfqs updated + exactly one history row (old→new/user/time); no-op save → nothing logged; non-buyer doesn't see edit; history lists newest-first; empty-state shows when no changes.
