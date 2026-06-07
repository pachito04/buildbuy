# Apply Progress — consolidacion-requerimientos-fixes / Slice 1

**Change**: consolidacion-requerimientos-fixes
**Slice**: 1 — Schema + Lock Integrity
**Mode**: Strict TDD
**Branch**: feat/consolidacion-slice1-lock-rpc
**Date**: 2026-06-06

---

## TDD Cycle Evidence

| Task | RED | GREEN | REFACTOR | Notes |
|------|-----|-------|----------|-------|
| T01 (migration) | — | — | — | No logic unit — SQL file only; manual checklist in file |
| T02 (test kanban-types) | ✅ 3 tests failing | — | — | Written before T03 |
| T03 (impl kanban-types) | — | ✅ 16/16 pass | — | |
| T04 (test consolidacion-utils) | ✅ Written | ✅ Immediate GREEN (regression guard) | — | Logic already excludes non-sin_pedir |
| T05 (test recalcRequestStatus) | ✅ Written | ✅ Immediate GREEN (regression guard) | — | en_consolidacion → en_curso already correct |
| T06 (test useConsolidacion) | ✅ 2 tests failing (rpc not called) | — | — | Written before T07 |
| T07 (impl useConsolidacion) | — | ✅ 3/3 pass | — | Sequential inserts replaced by rpc call |
| T14 (JSDoc update) | — | — | — | Documentation only — no test required |

---

## Completed Tasks

- [x] T01 — `supabase/migrations/024_consolidacion_fixes.sql` (NEW): DROP+ADD chk_item_status (+en_consolidacion), DROP+ADD chk_evento_tipo (+consolidado), function create_consolidated_rfq (6-step transaction: rfqs→rfq_items→rfq_item_sources→rfq_requests→UPDATE status→INSERT evento DISTINCT by request_id). GRANT to authenticated. Rollback commented. SECURITY INVOKER.
- [x] T02 — `src/lib/__tests__/kanban-types.test.ts` (MOD): updated ITEM_SUB_STATES assert (4→5), added ITEM_SUB_STATE_COLORS['en_consolidacion'] and ARCHITECT_ITEM_LABELS['en_consolidacion'] assertions.
- [x] T03 — `src/lib/kanban-types.ts` (MOD): added 'en_consolidacion' to ItemSubState union, ITEM_SUB_STATES array, ITEM_SUB_STATE_COLORS (bg-purple-400, 'En consolidación'), ARCHITECT_ITEM_LABELS ('En cotización'). getArchitectLabel and isItemReceivable unchanged.
- [x] T04 — `src/lib/__tests__/consolidacion-utils.test.ts` (MOD): regression guard — isConsolidationEligible with item_status='en_consolidacion' returns false. GREEN immediately (logic unchanged).
- [x] T05 — `src/lib/__tests__/recalcRequestStatus.test.ts` (MOD): regression guard — items [en_consolidacion, sin_pedir] with currentStatus='pendiente' → en_curso. GREEN immediately (recalcRequestStatus already correct).
- [x] T06 — `src/hooks/__tests__/useConsolidacion.test.ts` (NEW): mock supabase.rpc; test 1 asserts rpc called with correct payload (p_company_id, p_created_by, p_lines with material_id/sources); test 2 asserts invalidateQueries for ["rfqs"] and consolidacion-eligible; test 3 asserts error propagation via onError log.
- [x] T07 — `src/hooks/useConsolidacion.ts` (MOD): replaced 4 sequential inserts (rfqs/rfq_items/rfq_item_sources/rfq_requests) with single supabase.rpc("create_consolidated_rfq", {p_company_id, p_created_by, p_lines}). Error throws on truthy error. onSuccess unchanged.
- [x] T14 — `src/lib/consolidacion-utils.ts` (MOD): updated JSDoc on item_status field to include 'en_consolidacion'. Logic unchanged.

---

## Files Changed

| File | Action | What |
|------|--------|------|
| `supabase/migrations/024_consolidacion_fixes.sql` | NEW | Constraints + RPC function |
| `src/lib/__tests__/kanban-types.test.ts` | MOD | Updated 4→5 assert + new assertions |
| `src/lib/kanban-types.ts` | MOD | en_consolidacion to type + Records |
| `src/lib/__tests__/consolidacion-utils.test.ts` | MOD | Regression guard test |
| `src/lib/__tests__/recalcRequestStatus.test.ts` | MOD | Regression guard test |
| `src/hooks/__tests__/useConsolidacion.test.ts` | NEW | RPC + invalidation tests |
| `src/hooks/useConsolidacion.ts` | MOD | RPC replaces sequential inserts |
| `src/lib/consolidacion-utils.ts` | MOD | JSDoc update |

---

## Verification Results

- `npm run test`: **329 tests passing, 0 failing** (20 test files)
- `npx tsc --noEmit`: **0 errors** (ItemSubState compile-gate passed)

---

## Discoveries / Deviations

1. **`@testing-library/dom` was missing**: `@testing-library/react` v16 requires `@testing-library/dom` as a peer dep. Installed as devDependency. This was not in the original install.
2. **SECURITY INVOKER vs DEFINER**: The existing RPCs in 021 use `SECURITY DEFINER`, but the design explicitly specifies `SECURITY INVOKER` for this RPC (RLS from 016 already covers the tables). Followed the design.
3. **T04 and T05 GREEN immediately**: Both regression guards passed without code changes, confirming that the existing filter logic (`!== 'sin_pedir'`) and `recalcRequestStatus` already handle `en_consolidacion` correctly. This is the intended outcome.
4. **Mock hoisting issue**: `vi.mock` factories cannot reference outer `vi.fn()` variables (hoisting). Used inline `vi.fn()` in the factory and `vi.mocked()` for access in tests.

---

## Pending Tasks (Slice 2)

- [ ] T08 — [TEST RED] RecepcionDialog: recalcRequestStatus called once per distinct requestId
- [ ] T09 — [IMPL] RecepcionDialog: add status to sourcesData select + call recalcRequestStatus per requestId
- [ ] T10 — [TEST RED] RFQs: resolveInitialTab reads location.state.openTab
- [ ] T11 — [IMPL] RequestDetailModal + RFQs: navigate with state + read openTab
- [ ] T12 — [IMPL] CreateRequestDialog: replace Select with ToggleGroup for delivery_target
- [ ] T13 — [IMPL] ConsolidacionPanel: add non-consolidable copy to empty state and toolbar

---

## Status

**7/7 Slice 1 tasks complete** (+ T14 done as parallel task). Ready for sdd-verify or Slice 2 apply.
