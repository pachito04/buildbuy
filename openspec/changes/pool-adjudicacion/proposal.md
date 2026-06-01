# Proposal: Pool de Compras — Adjudicación (#9c)

## Intent

`#9b` produced the shared pool RFQ, but its comparativa is invisible to participants and its award would create a single wrong OC. This final change makes the pool comparativa **shared** (RLS widening for pool RFQs), lets the pool be **adjudicated**, and generates **per-company purchase orders** — each company orders only its contributed quantity (from `pool_item_contributions`), at the winning quote's price. This completes the Pool de Compras module.

## Scope

### In Scope
- **Migration (019)**: additive SELECT policies so pool members can read a **pool** RFQ's comparativa — `rfqs`, `rfq_items`, `quotes` (and `quote_items`) widened to "member of the pool that owns this `pool_id` RFQ". Non-pool RFQs unchanged (the existing own-company policies stay; these are additive permissive policies, OR'd).
- **Per-company OC generation** (`usePoolAward` or extending the award flow): for a pool RFQ + a winning quote, the viewer's company generates ONE `purchase_orders` for ITS contributed quantities (from `pool_item_contributions`, per line) at the winning `quote_items.unit_price`. Each company runs this for itself (RLS own-company enforced). Pure split logic (`pool-award-utils.ts`, TDD): given the winning quote items + this company's contributions → the company's OC lines.
- **Pool states**: set `pool_state='adjudicado'` when a winner is chosen; `pool_state='cerrado'` when all participants have generated their OCs.
- **Shared comparativa UI**: for a pool RFQ, show the consolidated comparativa with the per-company contribution breakdown; a "generar mi orden de compra" action per company.

### Out of Scope
- A formal **pool-leader** role / centralized single-adjudicator workflow (simplified: any member picks the winner; each company generates its own OC).
- Provider-side changes (the provider quotes the consolidated RFQ as a normal RFQ).
- Anything beyond the pool: non-pool comparativa/award stays byte-for-byte the same.

## Capabilities

### New Capabilities
- `pool-award`: A pool's comparativa is shared with all participants; the pool is adjudicated; each company generates its own purchase order for its contributed portion at the winning price.

## Approach

1. **Migration** — additive pool-member SELECT policies on rfqs/rfq_items/quotes/quote_items (gated on `rfqs.pool_id` + `is_pool_member`). Hand SQL to the user.
2. **types.ts** — (no new tables; RLS is server-side).
3. **Pure split (TDD)** — `pool-award-utils.ts`: `companyOcLines(winningQuoteItems, myContributionsByPoolItem)` → my OC lines (qty = my contribution, price = winning unit_price).
4. **Hook** — `usePoolAward`: read the shared comparativa (now visible), set `adjudicado`, generate the viewer-company OC from its contributions; when all member companies have an OC → `cerrado`.
5. **UI** — shared comparativa view + per-company "generar mi OC".

## Affected Areas

| Area | Impact |
|------|--------|
| `supabase/migrations/019_pool_award.sql` | New — additive pool-member SELECT policies (rfqs/rfq_items/quotes/quote_items) |
| `src/integrations/supabase/types.ts` | (likely unchanged; RLS server-side) |
| `src/lib/pool-award-utils.ts` (+ tests) | New — pure OC-split logic |
| `src/hooks/usePoolAward.ts` | New |
| `src/pages/Comparativa.tsx` and/or `src/components/pools/*` | Modified — shared comparativa + per-company OC action |

## Rollback Plan

- **DB**: drop the additive pool-member SELECT policies (rollback comment lists them). The existing own-company policies are untouched → non-pool access unaffected.
- **Code**: the pool-award hook/UI are additive; reverting removes them. Non-pool comparativa/award untouched.
- **Risk**: medium-high — widening comparativa visibility across tenants. Mitigated by: additive policies gated strictly on `rfqs.pool_id IS NOT NULL` + `is_pool_member`, per-company OC writes RLS-enforced to own company, and adversarial verify (a non-member sees no pool comparativa; a member sees the shared comparativa but each generates only its own OC).

## Review Workload (preliminary)

~**350–450 lines** → slices: (1) migration (RLS widening) + `pool-award-utils` (+tests); (2) `usePoolAward` + per-company OC + states; (3) shared comparativa UI. Confirm at tasks.

## Strict TDD

`strict_tdd: true`. `pool-award-utils` written test-first. RLS via adversarial verify + checklist; UI via `tsc --noEmit` + manual checklist.
