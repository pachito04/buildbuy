# Apply Progress — consolidacion-requerimientos-fixes / Slice 1 + Slice 2

**Change**: consolidacion-requerimientos-fixes
**Mode**: Strict TDD
**Branch**: feat/consolidacion-slice1-lock-rpc
**Last updated**: 2026-06-07

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
| T08 (test getDistinctRequestIds) | ✅ 6 tests failing (module missing) | — | — | Written before recepcion-utils.ts |
| T09 (impl RecepcionDialog recalc) | — | ✅ 6/6 pass | — | Helper created; status in query; recalcRequestStatus called per requestId |
| T10 (test resolveInitialTab) | ✅ 7 tests failing (module missing) | — | — | Written before RFQs.utils.ts |
| T11 (impl nav + RFQs tab) | — | ✅ 7/7 pass | — | navigate with state; useState initializer from location.state |
| T12 (ToggleGroup selector) | — | — | — | UI swap — no dedicated unit test; tsc + full suite green |
| T13 (ConsolidacionPanel copy) | — | — | — | Copy-only — no logic test required |

---

## Completed Tasks

### Slice 1

- [x] T01 — `supabase/migrations/024_consolidacion_fixes.sql` (NEW): DROP+ADD chk_item_status (+en_consolidacion), DROP+ADD chk_evento_tipo (+consolidado), function create_consolidated_rfq (6-step transaction: rfqs→rfq_items→rfq_item_sources→rfq_requests→UPDATE status→INSERT evento DISTINCT by request_id). GRANT to authenticated. Rollback commented. SECURITY INVOKER.
- [x] T02 — `src/lib/__tests__/kanban-types.test.ts` (MOD): updated ITEM_SUB_STATES assert (4→5), added ITEM_SUB_STATE_COLORS['en_consolidacion'] and ARCHITECT_ITEM_LABELS['en_consolidacion'] assertions.
- [x] T03 — `src/lib/kanban-types.ts` (MOD): added 'en_consolidacion' to ItemSubState union, ITEM_SUB_STATES array, ITEM_SUB_STATE_COLORS (bg-purple-400, 'En consolidación'), ARCHITECT_ITEM_LABELS ('En cotización'). getArchitectLabel and isItemReceivable unchanged.
- [x] T04 — `src/lib/__tests__/consolidacion-utils.test.ts` (MOD): regression guard — isConsolidationEligible with item_status='en_consolidacion' returns false. GREEN immediately (logic unchanged).
- [x] T05 — `src/lib/__tests__/recalcRequestStatus.test.ts` (MOD): regression guard — items [en_consolidacion, sin_pedir] with currentStatus='pendiente' → en_curso. GREEN immediately (recalcRequestStatus already correct).
- [x] T06 — `src/hooks/__tests__/useConsolidacion.test.ts` (NEW): mock supabase.rpc; test 1 asserts rpc called with correct payload (p_company_id, p_created_by, p_lines with material_id/sources); test 2 asserts invalidateQueries for ["rfqs"] and consolidacion-eligible; test 3 asserts error propagation via onError log.
- [x] T07 — `src/hooks/useConsolidacion.ts` (MOD): replaced 4 sequential inserts (rfqs/rfq_items/rfq_item_sources/rfq_requests) with single supabase.rpc("create_consolidated_rfq", {p_company_id, p_created_by, p_lines}). Error throws on truthy error. onSuccess unchanged.
- [x] T14 — `src/lib/consolidacion-utils.ts` (MOD): updated JSDoc on item_status field to include 'en_consolidacion'. Logic unchanged.

### Slice 2

- [x] T08 — `src/lib/__tests__/recepcion-utils.test.ts` (NEW): 6 tests for getDistinctRequestIds — empty sources, distinct IDs from mixed, excludes allocated=0, deduplication. Written RED before T09.
- [x] T09 — `src/lib/recepcion-utils.ts` (NEW) + `src/components/deposito/RecepcionDialog.tsx` (MOD): getDistinctRequestIds helper exported; sourcesData query now selects `status`; query return changed to `{ sources, requestStatusById }`; mutationFn calls recalcRequestStatus once per distinct requestId after all item updates.
- [x] T10 — `src/pages/__tests__/RFQs.resolveInitialTab.test.ts` (NEW): 7 tests for resolveInitialTab — consolidar/vigentes/historico/nuevo/null/undefined/unknown-value. Written RED before T11.
- [x] T11 — `src/pages/RFQs.utils.ts` (NEW) + `src/pages/RFQs.tsx` (MOD) + `src/components/pedidos/RequestDetailModal.tsx` (MOD): resolveInitialTab pure function with valid-tab whitelist; RFQs initializes activeTab from location.state via useState initializer; RequestDetailModal navigate passes { state: { openTab: 'consolidar' } }.
- [x] T12 — `src/components/pedidos/CreateRequestDialog.tsx` (MOD): ToggleGroup type="single" replaces Select for delivery_target; aria-label="Destino de entrega"; guard prevents empty value on deselect; default 'obra' unchanged.
- [x] T13 — `src/components/cotizaciones/ConsolidacionPanel.tsx` (MOD): added non-consolidable copy in empty state and notice above toolbar for when lines exist.

---

## Files Changed

### Slice 1
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

### Slice 2
| File | Action | What |
|------|--------|------|
| `src/lib/recepcion-utils.ts` | NEW | getDistinctRequestIds pure helper |
| `src/lib/__tests__/recepcion-utils.test.ts` | NEW | 6 unit tests for getDistinctRequestIds |
| `src/components/deposito/RecepcionDialog.tsx` | MOD | status in query; requestStatusById map; recalcRequestStatus per requestId |
| `src/pages/RFQs.utils.ts` | NEW | resolveInitialTab pure function |
| `src/pages/__tests__/RFQs.resolveInitialTab.test.ts` | NEW | 7 unit tests for resolveInitialTab |
| `src/pages/RFQs.tsx` | MOD | useLocation + useState initializer from location.state |
| `src/components/pedidos/RequestDetailModal.tsx` | MOD | navigate with { state: { openTab: 'consolidar' } } |
| `src/components/pedidos/CreateRequestDialog.tsx` | MOD | ToggleGroup replaces Select for delivery_target |
| `src/components/cotizaciones/ConsolidacionPanel.tsx` | MOD | Non-consolidable copy in empty state + toolbar |

---

## Verification Results

- `npm run test`: **343 tests passing, 0 failing** (22 test files: 330 Slice 1 + 13 Slice 2)
- `npx tsc --noEmit`: **0 errors**

---

## Commits (Slice 2)

- `b214d43` — feat(deposito): recalc request status after consolidated reception (GAP 3)
- `8a8a543` — feat(rfqs): pre-select consolidar tab when navigating from request hint (GAP 4)
- `36a0159` — feat(pedidos): replace delivery_target Select with ToggleGroup for visibility
- `36e9aa9` — feat(consolidacion): add non-consolidable items copy to empty state and toolbar (GAP 5)

---

## Discoveries / Deviations

### Slice 1
1. **`@testing-library/dom` was missing**: installed as devDependency.
2. **SECURITY INVOKER**: design specifies INVOKER (not DEFINER). Followed the design.
3. **T04 and T05 GREEN immediately**: regression guards confirmed existing logic is correct.
4. **Mock hoisting issue**: used inline `vi.fn()` in factory, `vi.mocked()` for access.
5. **Race condition fix (WARNING sdd-verify)**: RPC rewritten — UPDATE with RETURNING is first operational step; RAISE EXCEPTION P0001 on locked_count < expected_count causes total rollback. Hook exposes createError; panel shows destructive toast via useEffect.

### Slice 2
6. **sourcesData query return type changed**: queryFn now returns `{ sources, requestStatusById }` instead of just `Record<string, ResolvedSource[]>`. The two `useEffect` blocks that consumed `sourcesData` directly were updated to use `consolidatedSourcesData` (the unpacked `sources` map).
7. **resolveInitialTab uses valid-tab whitelist**: unknown values fall back to 'vigentes' (not passed through) — safer than passing arbitrary strings as RfqTab.

---

## Status

**ALL TASKS COMPLETE (T01–T14). Both slices done.** Ready for `sdd-verify`.
