# Tasks: pool-adjudicacion (#9c)

## Overview

Final pool piece: shared comparativa (additive pool-member RLS), per-company OC generation from the pool award (split by `pool_item_contributions`), pool states adjudicado/cerrado. Reuses `is_pool_member` (#9b).

**Strict TDD is active** (`vitest run`). Pure OC split test-first.

## Review Workload Forecast

- Estimated changed lines: ~**350–450** (migration RLS + util + hook + UI).
- **Chained slices: Yes (3).**
  - **Slice 1** — migration (additive pool-member SELECT policies on rfqs/rfq_items/quotes/quote_items) + `pool-award-utils` (+tests).
  - **Slice 2** — `usePoolAward` (adjudicate, generate my OC, states) .
  - **Slice 3** — shared comparativa UI + per-company OC action.
- **Decision: confirmed — 3 slices.**

---

## Phase 1: Migration & pure split [x]

### 1.1 Migration [x]
- **Files**: `supabase/migrations/019_pool_award.sql` (CREATE)
- **Spec refs**: Shared comparativa for pool RFQs; Non-pool RFQ unchanged
- **Details**: ADD permissive SELECT policies `rfqs_pool_member_select`, `rfq_items_pool_member_select`, `quotes_pool_member_select`, `quote_items_pool_member_select` per AD-1 (gated on `pool_id IS NOT NULL` + `is_pool_member`; do NOT modify existing policies). BEGIN/COMMIT, rollback comment (drop the 4 new policies), manual-verify checklist (non-member sees no pool comparativa; non-pool RFQ unchanged). **Hand SQL to the user.**

### 1.2 `pool-award-utils` — tests first [x]
- **Files**: `src/lib/__tests__/pool-award-utils.test.ts` (CREATE)
- **TDD red**: `companyOcLines` — orders only my contribution per material; excludes materials I didn't contribute; unit_price from the winning line; multi-line sum; empty → [].

### 1.3 `pool-award-utils` — implement [x]
- **Files**: `src/lib/pool-award-utils.ts` (CREATE) — `companyOcLines(winning, myContribs)`. Pure.

---

## Phase 2: Hook [x]

### 2.1 `usePoolAward` [x]
- **Files**: `src/hooks/usePoolAward.ts` (CREATE)
- **Spec refs**: Per-company purchase orders; Pool award states
- **Details**: read the pool RFQ + quotes (visible via AD-1) + pool_items/contributions; `adjudicate(winningQuoteId)` → `pool_state='adjudicado'` (+ record winner); `generateMyOc(poolId)` → `companyOcLines` from my contributions → insert `purchase_orders` (company_id mine, provider = winner) + items; when all member companies have a PO for the pool RFQ → `pool_state='cerrado'`. Invalidate pool/rfq/po queries.

---

## Phase 3: Shared comparativa UI [x]

### 3.1 Shared comparativa + per-company OC action [x]
- **Files**: `src/components/pools/PoolAwardPanel.tsx` (CREATED), `src/components/pools/PoolFlowPanel.tsx` (MODIFIED)
- **Spec refs**: Shared comparativa; Per-company OC; Confidentiality preserved
- **Details**: New `PoolAwardPanel` component created. Mounted from `PoolFlowPanel` when `pool_state` is 'en_comparativa', 'adjudicado', or 'cerrado'. Shows shared comparativa table (quote vs rfq_item per-line prices, provider total, delivery), per-company contribution breakdown (reuses PoolConsolidatedView), OC status strip showing which members have generated OC. "Adjudicar cotización seleccionada" button (radio selection) in en_comparativa; "Generar mi orden de compra" (disabled/success state if already generated) in adjudicado; cerrado read-only. Non-pool comparativa (Comparativa.tsx) unchanged.

---

## Phase 4: Verification [x]

### 4.1 Suite + typecheck + manual [x]
- `vitest run` green (232/232) + `npx tsc --noEmit` clean.
- Manual (2 companies + pool RFQ): both members see the shared comparativa; a non-member sees nothing; adjudicate → adjudicado; each company generates its OC with only its contributed quantities at the winning price; when all OCs exist → cerrado; non-pool comparativa/award unchanged.
- **RLS checklist** from the migration (member sees pool comparativa; non-pool unchanged).
