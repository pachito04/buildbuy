# Tasks: consolidacion-recepcion (#8b)

## Overview

Distribute received consolidated merchandise back to source requirements by urgency (the data was captured by `#8`). Includes the shared `distributeByUrgency` util (reused by `#9`) and proactive consolidation detection. **No migration.**

**Strict TDD is active** (`vitest run`). Pure distribution test-first.

## Review Workload Forecast

- Estimated changed lines: ~**350–450** (util + reception distribution + detection hook/hint).
- **Chained slices recommended: Yes (2).**
  - **Slice 1** — `distribucion-utils` (+tests) + `RecepcionDialog` consolidated distribution + close-validation + per-source persistence/logging.
  - **Slice 2** — proactive detection (`useConsolidationMatches` + hint in `RequestDetailModal`).
- **Decision needed before apply: confirm slices vs single.**

---

## Phase 1: Pure distribution (TDD)

### [x] 1.1 `distribucion-utils` — tests first
- **Files**: `src/lib/__tests__/distribucion-utils.test.ts` (CREATED)
- **TDD red**: shortfall urgent-first to full then remainder; full coverage → all full; no over-allocation (received > requested); received 0 → all 0; multiple urgent (stable order); empty → [].

### [x] 1.2 `distribucion-utils` — implement
- **Files**: `src/lib/distribucion-utils.ts` (CREATED) — `distributeByUrgency(receivedQty, sources)`. Pure.

---

## Phase 2: Reception distribution

### [x] 2.1 Resolve sources for a PO item
- **Files**: `src/components/deposito/RecepcionDialog.tsx` (MODIFIED)
- **Spec refs**: Consolidated reception distributes to sources
- **Details**: for each PO item, resolve `quote_item_id → rfq_items.id → rfq_item_sources` (+ each source's request desired_date/number/obra). If none → non-consolidated line (skip distribution).

### [x] 2.2 Per-source distribution UI + validation
- **Files**: `src/components/deposito/RecepcionDialog.tsx`
- **Spec refs**: Shortfall by urgency; Manual override; Cannot close until fully assigned
- **Details**: per consolidated line, show per-source allocation rows pre-filled by `distributeByUrgency(acceptedQty, sources)`; editable; block confirm until `Σ allocations === acceptedQty` for every consolidated line. Non-consolidated lines unchanged.

### [x] 2.3 Persist per-source + log
- **Files**: `src/components/deposito/RecepcionDialog.tsx`
- **Spec refs**: Consolidated reception distributes to sources; Non-consolidated unchanged
- **Details**: keep existing PO `quantity_received` + inventory writes; then per source allocation > 0, increment `request_items.quantity_received` + recompute status (reuse the per-item rule), and `logMovimiento` a `recepcion` row per source (best-effort).

---

## Phase 3: Proactive detection

### [x] 3.1 `useConsolidationMatches`
- **Files**: `src/hooks/useConsolidationMatches.ts` (CREATED), `src/lib/consolidacion-match-utils.ts` (CREATED), `src/lib/__tests__/consolidacion-match-utils.test.ts` (CREATED, 7 tests)
- **Spec refs**: Proactive consolidation detection
- **Details**: pure `groupMatchRows` helper (TDD, 7 tests green); hook queries eligible items by material_id for the current request, then fetches OTHER eligible pending requests (same company) sharing those materials; excludes current request; returns `ConsolidationMatch[]`; only runs for compras/admin.

### [x] 3.2 Hint in RequestDetailModal
- **Files**: `src/components/pedidos/RequestDetailModal.tsx` (MODIFIED)
- **Spec refs**: Cross-requirement match prompts; No match no prompt
- **Details**: dismissible amber hint with GitMerge icon; shows matched material descriptions and request numbers; "Ver pestaña Consolidar" button closes modal and navigates to /rfqs; renders nothing when matches empty; compras/admin only; dismiss state resets on each new request open.

---

## Phase 4: Verification

### [x] 4.1 Suite + typecheck + manual
- `vitest run`: 186 passed (12 test files), 0 failed — 7 new tests from consolidacion-match-utils.
- `npx tsc --noEmit`: clean (no errors).
