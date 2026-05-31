# Tasks: consolidacion-requerimientos (núcleo)

## Overview

First-cut of Consolidación de Requerimientos: per-item `delivery_target`, eligible-item discovery grouped by material across obras, consolidated RFQ creation with `rfq_item_sources`/`rfq_requests` traceability, urgency propagation. Reception distribution / proactive detection / OC distribution deferred to `#8b`.

**Strict TDD is active** (`vitest run`). Pure logic test-first.

## Review Workload Forecast

- Estimated changed lines: **> 400** (migration + utils + hook + panel + selector).
- **Chained slices recommended: Yes.**
  - **Slice 1** — migration + types + `consolidacion-utils` (+tests). Foundation + pure logic.
  - **Slice 2** — `useConsolidacion` + `ConsolidacionPanel` + the "Consolidar" tab (the consolidation flow).
  - **Slice 3** — per-item `delivery_target` selector in `CreateRequestDialog`.
- **Decision needed before apply: confirm slices vs single.**

---

## Phase 1: Migration & Types

### [x] 1.1 Migration
- **Files**: `supabase/migrations/016_consolidacion.sql` (CREATE)
- **Spec refs**: Per-item delivery target; Consolidated RFQ creation
- **Details**: `request_items.delivery_target text NOT NULL DEFAULT 'obra' CHECK (deposito|obra)`; `rfq_item_sources` (rfq_item_id, request_item_id, request_id, quantity) + index; `rfq_requests` (rfq_id, request_id, UNIQUE) ; RLS by company via rfqs on both tables. BEGIN/COMMIT, rollback comment, manual-verify checklist. **Hand SQL to the user.**

### [x] 1.2 Types
- **Files**: `src/integrations/supabase/types.ts` (MODIFY)
- **Details**: add `delivery_target` to `request_items`; add `rfq_item_sources` + `rfq_requests` tables. `tsc --noEmit` is the test.

---

## Phase 2: Pure logic (TDD)

### [x] 2.1 `consolidacion-utils` — tests first
- **Files**: `src/lib/__tests__/consolidacion-utils.test.ts` (CREATE)
- **TDD red**: `groupEligibleByMaterial` (two obras same material → one line summed + 2 sources; distinct materials → separate lines; empty → []); `consolidatedUrgency` (any urgent → true, none → false, empty/null dates); `isConsolidationEligible` (each disqualifier: obra delivery, inventario routing, null material, non-pendiente request, non-sin_pedir item).

### [x] 2.2 `consolidacion-utils` — implement
- **Files**: `src/lib/consolidacion-utils.ts` (CREATE) — `groupEligibleByMaterial`, `consolidatedUrgency` (reuse `isUrgente`), `isConsolidationEligible`. Pure.

---

## Phase 3: Hook + Panel

### [x] 3.1 `useConsolidacion`
- **Files**: `src/hooks/useConsolidacion.ts` (CREATE)
- **Spec refs**: Eligible items discovered; Consolidated RFQ creation; Urgency propagated
- **Details**: eligible query (per the predicate), group via `groupEligibleByMaterial`; consolidated-RFQ mutation: insert rfqs(`rfq_type='consolidated'`) → rfq_items (totals) → rfq_item_sources (per source) → rfq_requests (distinct). Invalidate rfqs + eligible.

### [x] 3.2 `ConsolidacionPanel` + tab
- **Files**: `src/components/cotizaciones/ConsolidacionPanel.tsx` (CREATE), `src/pages/RFQs.tsx` (MODIFY)
- **Spec refs**: Eligible items grouped by material; Existing flows unaffected
- **Details**: "Consolidar" tab; grouped-by-material view with per-source breakdown; select lines; "Generar cotización consolidada" → `useConsolidacion` mutation. Free-text/ineligible items shown excluded.

---

## Phase 4: Delivery selector

### [x] 4.1 Per-item `delivery_target` in CreateRequestDialog
- **Files**: `src/components/pedidos/CreateRequestDialog.tsx` (MODIFY)
- **Spec refs**: Per-item delivery target (selectable at creation)
- **Details**: add a deposito/obra selector to each product row; include `delivery_target` in the `request_items` insert (default `obra`).

---

## Phase 5: Verification

### [x] 5.1 Suite + typecheck + manual
- `vitest run` green + `npx tsc --noEmit` clean.
- Manual: create requests with deposito items across 2 obras → Consolidar tab groups them by material with totals + sources; generate consolidated RFQ → rfqs(consolidated) + rfq_items + rfq_item_sources (sum = total) + rfq_requests; urgent source → RFQ urgent; existing manual/basket/direct RFQ flows still work.
