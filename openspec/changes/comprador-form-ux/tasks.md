# Tasks: comprador-form-ux

## Overview

Buyer-side RFQ form UX: draft persistence (B1a), accordion sections + gating (B3/B5), per-item observations (B6), new header fields, and cart batch OC generation (B4). Provider quote form (B1b + P1/P2/P3) is OUT — owned by `#6`.

**Strict TDD is active** (`vitest run`). Pure logic test-first.

## Review Workload Forecast

- Estimated changed lines: **> 400** (RfqNuevo rewrite + migration + hook + utils + cart).
- **Chained PRs recommended: Yes.** Proposed slices:
  - **PR 1** — migration + `types.ts` + `usePersistedDraft` + `rfq-form-utils` (+ tests) + per-item `observations` wiring. (Infra + logic, low UI risk.)
  - **PR 2** — `RfqNuevo` accordion rewrite + gating + new header fields + draft hook wiring.
  - **PR 3** — cart "Generar todas las OC" button.
- **Decision needed before apply: Yes** (confirm chained vs single + chain strategy).

---

## Phase 1: Infrastructure & Types

### [x] 1.1 Migration — new columns
- **Files**: `supabase/migrations/013_rfq_form_fields.sql` (CREATE)
- **Spec refs**: New solicitud header fields
- **Details**: Additive nullable `rfqs.descripcion/categoria/price_terms` + `rfq_items.observations`. BEGIN/COMMIT, rollback comment, `IF NOT EXISTS`. **Hand the SQL to the user to run manually.**

### [x] 1.2 Types
- **Files**: `src/integrations/supabase/types.ts` (MODIFY)
- **Details**: add the four columns to `rfqs` and `rfq_items` Row/Insert/Update. `tsc --noEmit` is the test.

---

## Phase 2: Pure logic (TDD)

### [x] 2.1 `rfq-form-utils` — tests first
- **Files**: `src/lib/__tests__/rfq-form-utils.test.ts` (CREATE)
- **TDD red**: serialize↔deserialize round-trip; deserialize(null/garbage)→fallback; deserialize tolerant of missing/old keys; `isDetalleComplete` per required field missing; `hasValidItems` empty/partial.

### [x] 2.2 `rfq-form-utils` — implement
- **Files**: `src/lib/rfq-form-utils.ts` (CREATE) — `serializeDraft`, `deserializeDraft`, `isDetalleComplete`, `hasValidItems`. Pure, no React/Supabase.

### [x] 2.3 `usePersistedDraft` hook
- **Files**: `src/hooks/usePersistedDraft.ts` (CREATE)
- **Details**: load-on-init (`hadSavedDraft`), debounced (~500ms) write, `clear()` that removes the key and suppresses the next autosave. Uses the pure (de)serializers. Thin wrapper; logic stays in utils.

---

## Phase 3: RfqNuevo rewrite

### [x] 3.1 Accordion sections + new header fields
- **Files**: `src/components/rfqs/RfqNuevo.tsx` (REWRITE)
- **Spec refs**: Two-section accordion layout with gating; New solicitud header fields
- **Details**: Section 1 *Detalle* (Tipo, Fecha cierre, Descripción, Categoría, Entregar en, Condición de precios [select], Condición de pago [select]) expanded by default; Section 2 *Productos* gated by `isDetalleComplete`; header completion indicator from the pure predicate. Use existing `accordion.tsx`.

### [x] 3.2 Per-item observations
- **Files**: `src/components/rfqs/RfqNuevo.tsx`
- **Spec refs**: Per-item observations
- **Details**: add an observations input per product row; include `observations` in the `rfq_items` insert; include new header fields in the `rfqs` insert.

### [x] 3.3 Wire draft persistence
- **Files**: `src/components/rfqs/RfqNuevo.tsx`
- **Spec refs**: Draft persistence (all scenarios)
- **Details**: back the form with `usePersistedDraft('buildbuy-rfq-draft', EMPTY)`; show dismissible "borrador recuperado" notice when `hadSavedDraft`; `clear()` on submit success and on explicit discard. (Files/attachments are not serializable — exclude from the draft; document that.)

---

## Phase 4: Cart batch OC

### [x] 4.1 "Generar todas las órdenes de compra"
- **Files**: `src/pages/Cotizaciones.tsx` (MODIFY — carrito tab ONLY; do NOT touch the quote dialog)
- **Spec refs**: Batch generate all purchase orders
- **Details**: add a batch button that iterates pending provider groups calling the existing `generateOC` sequentially, accumulating success/failure into one toast. Keep per-provider buttons.

---

## Phase 5: Verification

### [x] 5.1 Suite + typecheck + manual
- `vitest run` green + `npx tsc --noEmit` clean.
- Manual: fill form → navigate away → return (draft restored + notice); submit → draft cleared; discard → cleared; Section 2 gated until header valid; per-item obs persists; cart batch generates all OCs.
