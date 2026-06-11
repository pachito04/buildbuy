# Verify Report — pool-compras-fixes

> Phase: sdd-verify | Branch: feat/pool-compras-gap5 (top of stack, all 30 tasks accumulated)
> Artifact store: openspec | Strict TDD (vitest run / npx tsc --noEmit)

## Verdict: PASS — cleared to push / open the chained PRs

No CRITICAL findings. No WARNINGs that block. 2 SUGGESTIONS (non-blocking).

## Test + type results

| Check | Result |
|-------|--------|
| `npx vitest run` | 428 passed / 0 failed (36 test files) — matches expected ~428 |
| `npx tsc --noEmit` | clean (exit 0) |

The only stderr noise is a pre-existing best-effort `logMovimiento` warning in `useConsolidacion.test.ts` (out of scope for this change; test still passes).

## Task completeness

tasks.md: 30/30 marked `[x]`. apply-progress (engram #246) confirms all 6 slices (0, A, B, C, D, E, F) complete and matches the code state on this branch.

## Contract verification by gap

### GAP1 — Invitation guard (PASS)
- DB trigger `pool_companies_link_guard` + `trg_pool_companies_link_guard` BEFORE INSERT on `pool_companies` present in 028 (self-join allowed; otherwise requires active `company_links`). BEFORE INSERT → legacy rows untouched (spec scenario satisfied).
- UI filter: `deriveLinkedCompanies` pure fn + active-only `company_links` query in Pools.tsx feeds CreatePoolDialog and PoolCard. Empty-state wired. Defense-in-depth (UI + DB) satisfied.

### GAP2 — Award mode (PASS — including the flagged bug fix)
- `award_mode` column + CHECK + default 'leader' (028); immutability trigger `purchase_pools_award_mode_lock` after borrador.
- Mode A regression guard: `adjudicate` writes `winning_quote_id` + `pool_state='adjudicado'`, never touches `pool_company_awards`; Mode A `generateMyOc` path byte-for-byte intact behind `resolvedAwardMode !== 'per_company'`. T13 contract test GREEN.
- Mode B: `confirmMyAward` UPSERTs `pool_company_awards` (own company) then calls `pool_finalize_award_mode_b` RPC; never writes `winning_quote_id`. `generateMyOc` groups awards by provider (`groupAwardsByProvider`) → multi-OC, double-generation guard on (rfq_id, provider_id).
- CONFIRMED BUG FIX: `pool_finalize_award_mode_b` (029) resolves company↔rfq_item via material_id join (`pool_item_contributions → pool_items → rfq_items` on `material_id`). It does NOT use `rfq_item_sources`; the only references to that table in 029 are comments explicitly stating it is never populated for pool RFQs.

### GAP3 — Supplier dispatch (PASS)
- `pool_providers` table + RLS (member-read, write-own-company, provider eligibility own-or-global) in 028.
- `usePoolProviders` (candidate set via `.or(company_id.eq.mine, company_id.is.null)`, select/deselect own).
- `pool_dispatch_providers` RPC (029, SECURITY DEFINER, membership check, DISTINCT active providers, ON CONFLICT idempotent, returns count).
- `generateSharedRfq` wires the RPC then conditionally invokes `notify-providers` only when count > 0; errors propagate (failure isolation per design, deliberately NOT silenced unlike non-pool flow).

### GAP4 — Withdraw / cancel (PASS)
- DB triggers `pool_companies_withdraw_guard` (DELETE only in borrador) + `purchase_pools_state_guard` (block cancel from cerrado/cancelado) + `pool_companies_own_delete` policy in 028.
- `usePoolLifecycle` (withdraw DELETE own row; cancel writes `pool_state='cancelado'`, never legacy `status`).
- `Pools.tsx` `updatePoolStatus` migrated to `pool_state` via `buildPoolStatePayload`.
- PoolFlowPanel: state-gated visibility (withdraw borrador-only; cancel not cerrado/cancelado) + AlertDialog confirmation. 9/9 visibility tests GREEN.

### GAP5 — Requirement history + pool_number (PASS)
- `pool_number` sequence + backfill + NOT NULL + UNIQUE (028, 025 pattern) — DB-assigned, no client-side.
- `chk_evento_tipo` extended from the authoritative 024 13-value set + `pool_joined` (14 values) — additive, no regression.
- `pool_add_requirements` RPC (029, SECURITY INVOKER, atomic INSERT pool_requests + per-request `pool_joined` event with metadata {pool_id, pool_number, companies}).
- ActivityTimeline renders `pool_joined` from metadata via `formatPoolJoinedLabel`; `consolidado` label also added (regression-safe).

### Confidentiality invariant (PASS)
- `pool_requests` remain owner-only (untouched by this change).
- `pool_company_awards` and `pool_providers` are member-read / write-own-company; `rfq_providers` persists no company attribution. Documented and consistent with 018/019.

### types.ts sync (PASS)
- 18 occurrences of new symbols (pool_company_awards, pool_providers, award_mode, pool_number, the 3 RPCs). tsc clean confirms alignment with 028/029.

## Findings

### CRITICAL
- None.

### WARNING
- None blocking.

### SUGGESTION
1. Dead code in `usePoolAward.ts` generateMyOc Mode B branch (~lines 558–573): an unused `winningLines` array and an empty `for (const qi of quoteItemsWithProvider)` loop with only comments. Harmless (tsc/tests pass) but worth removing in a follow-up cleanup for readability.
2. The DB-layer manual verification checklists embedded in 028/029 (RLS, trigger, RPC behavior) cannot run under vitest. Before/at staging apply, record those SQL checklist results in the Slice 0 PR as the design intended — vitest covers the client contract, not the in-database guards.

## What must be fixed before pushing
Nothing. The change is verification-clean. Recommended next phase: sdd-archive. Chained-PR push can proceed (Slice 0 migrations first, per the stacked-to-main strategy in the forecast).
