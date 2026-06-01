# Tasks: pool-flow (#9b)

## Overview

Make the interempresa pool work: RLS rework (shared by membership + per-company confidentiality), pool states, per-company contributions, material crossing via confirmed mappings, shared RFQ. Adjudication → #9c.

**Strict TDD is active** (`vitest run`). Pure crossing test-first.

## Review Workload Forecast

- Estimated changed lines: **> 400** (migration/RLS + crossing util + hook + Pools UI).
- **Chained slices: Yes (3).**
  - **Slice 1** — migration (RLS rework + pool_state + pool_item_contributions) + types + `pool-cross-utils` (+tests).
  - **Slice 2** — `usePoolFlow` (contribute own requirements, consolidate via crossing, confirm, shared RFQ) + remove in_pool bug.
  - **Slice 3** — Pools UI: consolidated view + per-company contributions + state + actions.
- **Decision: confirmed — 3 slices.**

---

## Phase 1: Migration & Types [x]

### 1.1 Migration [x]
- **Files**: `supabase/migrations/018_pool_flow.sql` (CREATE)
- **Spec refs**: Pool visible to participants; Requirement detail confidential; Pool states; Per-company contributions
- **Details**: DROP legacy `purchase_pools_tenant`/`pool_companies_tenant`/`pool_requests_tenant`/`pool_items_tenant`; CREATE per AD-1 (membership-based for pools/companies/items/contributions; request-owner-based for pool_requests). ADD `purchase_pools.pool_state` (CHECK 6 values, default borrador). CREATE `pool_item_contributions` (+ RLS by pool membership). BEGIN/COMMIT, rollback comment **restoring the verbatim legacy policies**, manual-verify checklist (non-member sees nothing; member never sees another's pool_requests). **Hand SQL to the user.**

### 1.2 Types [x]
- **Files**: `src/integrations/supabase/types.ts` (MODIFY) — `pool_state` on purchase_pools + `pool_item_contributions`.

---

## Phase 2: Pure crossing (TDD) [x]

### 2.1 `pool-cross-utils` — tests first [x]
- **Files**: `src/lib/__tests__/pool-cross-utils.test.ts` (CREATE)
- **TDD red**: two companies' mapped materials merge into one line with both contributions; unmapped materials stay separate; contributions sum to total; non-usable mappings ignored; empty → [].

### 2.2 `pool-cross-utils` — implement [x]
- **Files**: `src/lib/pool-cross-utils.ts` (CREATE) — `crossPoolItems(items, usableMappings)` per AD-4 (canonical-material via usable mappings, group, contributions). Pure.

---

## Phase 3: Hook + flow [x]

### 3.1 `usePoolFlow` [x]
- **Files**: `src/hooks/usePoolFlow.ts` (CREATE)
- **Spec refs**: Each company contributes its own requirements; Material crossing; Shared RFQ; No invalid status write
- **Details**: add own eligible requirements (`pool_requests`, RLS own-only, NO `in_pool` write); write/refresh own `pool_item_contributions` (canonicalize via own usable mappings) + maintain `pool_items.total_quantity` = sum of contributions; confirm participation (`pool_companies.status='active'`; all active → `pool_state='confirmado'`); generate shared RFQ from `pool_items` (→ `rfqs` with `pool_id`, `pool_state='en_comparativa'`).

### 3.2 Remove the in_pool latent bug [x]
- **Files**: `src/pages/Pools.tsx` (MODIFY)
- **Spec refs**: No invalid status write
- **Details**: deleted the `requests.update({status:'in_pool'})` call; replaced with explanatory comment.

---

## Phase 4: Pools UI [x]

### 4.1 Consolidated view + contributions + state + actions [x]
- **Files**: `src/pages/Pools.tsx` + `src/components/pools/*` (MODIFY)
- **Spec refs**: Pool visible; Per-company contributions; Shared RFQ
- **Details**: show the pool's consolidated `pool_items` with per-company contribution breakdown, `pool_state` badge, "agregar mis requerimientos", "confirmar participación", "generar cotización compartida". A participant sees totals/contributions but not others' requirement detail (enforced by RLS).

---

## Phase 5: Verification [x]

### 5.1 Suite + typecheck + manual [x]
- `vitest run` green (219/219) + `npx tsc --noEmit` clean.
- Manual (needs 2 companies + an active link + confirmed mapping): both add their requirements → consolidated line merges mapped materials with per-company contributions; a participant sees the total but NOT the other's pool_requests; a non-member sees nothing; confirm → confirmado; generate shared RFQ → en_comparativa; no `in_pool` write.
- **RLS checklist** from the migration (membership visibility + pool_requests confidentiality).
