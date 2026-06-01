# Proposal: Pool de Compras — Flow (#9b)

## Intent

`#9a` delivered the prerequisite (company links + material mappings). This change makes the interempresa pool actually work: fix the **multi-tenant RLS** so a shared pool is visible to all participant companies while each company's requirement detail stays private (confidentiality), let each company contribute its own eligible requirements, **cross materials via the usable mappings** into one consolidated view with per-company contributions, drive the **pool states**, and **generate the single shared RFQ**. Adjudication / shared comparativa / per-company OCs are `#9c`.

## Scope

### In Scope
- **Migration (018)**:
  - **RLS rework** — `purchase_pools`, `pool_companies`, `pool_items` (and the new contributions table) become visible to any company that is a `pool_companies` member of the pool. `pool_requests` becomes visible ONLY to the company that OWNS the request (`requests.company_id`) — the confidentiality boundary. Replace the legacy `*_tenant` pool policies.
  - `purchase_pools.pool_state` text + CHECK (`borrador|confirmado|en_comparativa|adjudicado|cerrado|cancelado`, default `borrador`) — the report's 6 states (legacy `pool_status` enum left untouched).
  - `pool_item_contributions` (pool_item_id, company_id, quantity) — per-company units per consolidated line.
- **Pure crossing logic** `pool-cross-utils.ts` (TDD): given each company's eligible items + the usable mappings, produce consolidated lines (canonical material, total) + per-company contributions.
- **Hook** `usePoolFlow`: a company adds its OWN eligible requirements (RLS own-only); build/refresh consolidated `pool_items` + `pool_item_contributions` via crossing; confirm participation; transition states; generate the shared RFQ from the consolidated items.
- **UI** (extend `Pools.tsx` / pool detail): consolidated items with per-company contributions + state badges; "agregar mis requerimientos"; "confirmar"; "generar cotización compartida".
- Fix the latent `requests.update({status:'in_pool'})` bug (remove the invalid enum write).

### Out of Scope (deferred to #9c)
- Shared comparativa, adjudication (leader/per-company), per-company OCs, and any visibility config beyond the consolidated-total confidentiality.
- Provider selection nuance (union of providers per pool) — minimal for now; sent like a normal RFQ.

## Capabilities

### New Capabilities
- `pool-flow`: Participant companies share a pool, each contributing its own requirements privately; materials cross via confirmed mappings into a consolidated view with per-company contributions; the pool produces one shared RFQ and moves through its states.

## Approach

1. **Migration** — RLS rework + `pool_state` + `pool_item_contributions`. Hand SQL to the user.
2. **types.ts** — new column + table; pool RLS is server-side.
3. **Pure crossing (TDD)** — `pool-cross-utils.ts`: map-canonicalize + group + per-company contributions; enforce only **usable** mappings (both-confirmed) and only **active** links.
4. **Hook** `usePoolFlow` — own-requirement contribution, consolidate, confirm, state transitions, shared RFQ generation.
5. **UI** — pool detail consolidated view + actions.

## Affected Areas

| Area | Impact |
|------|--------|
| `supabase/migrations/018_pool_flow.sql` | New — RLS rework + pool_state + pool_item_contributions |
| `src/integrations/supabase/types.ts` | Modified |
| `src/lib/pool-cross-utils.ts` (+ tests) | New — pure crossing/contribution logic |
| `src/hooks/usePoolFlow.ts` | New |
| `src/pages/Pools.tsx` + `src/components/pools/*` | Modified — consolidated view, contributions, state, shared-RFQ action; fix in_pool bug |

## Multi-tenant safety (critical)

- The RLS rework is the #1 verify target: a participant must see the pool + consolidated items + contributions, but NEVER another company's `pool_requests` (requirement detail). A non-member company must see nothing. Confirm `pool_requests` visibility keys on `requests.company_id = my company`, and pool/items/contributions key on `pool_companies` membership.
- Crossing must consume only **usable** mappings (both confirmed) on **active** links (close the `#9a` gap at consume time).

## Rollback Plan

- **DB**: drop `pool_item_contributions`, `pool_state`, and restore the prior pool RLS policies. (Provide the exact prior policy text in the rollback comment.) Additive table/column otherwise.
- **Code**: pool UI/flow changes are revertible per file.
- **Risk**: high — replacing live pool RLS + cross-tenant visibility. Mitigated by adversarial verify of the new policies and keeping `pool_requests` strictly request-owner-scoped.

## Review Workload (preliminary)

**> 400 lines** → slices: (1) migration (RLS + state + contributions) + types + `pool-cross-utils` (+tests); (2) `usePoolFlow` + crossing/consolidation + shared RFQ; (3) Pools UI (consolidated view + contributions + state + actions). Confirm at tasks.

## Strict TDD

`strict_tdd: true`. `pool-cross-utils` (crossing, contributions, usable-mapping gate) written test-first. RLS via adversarial verify + migration checklist; UI via `tsc --noEmit` + manual checklist.
