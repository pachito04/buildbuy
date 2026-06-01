# Design: Pool de Compras — Adjudicación (#9c)

> Completes the pool module. Reuses `#9b`'s `is_pool_member` + `pool_item_contributions`. The high-risk part is the additive cross-tenant comparativa RLS.

## Architecture Decisions

### AD-1: Additive pool-member SELECT policies (comparativa sharing)

Do NOT modify the existing own-company policies (`rfqs_tenant`, `rfq_items_tenant`, `quotes_company_view`, the quote_items policy). ADD permissive SELECT policies (OR'd) that grant read to pool members when the RFQ belongs to a pool. Reuse `is_pool_member` (from `#9b`, SECURITY DEFINER — no recursion).

```sql
CREATE POLICY "rfqs_pool_member_select" ON rfqs FOR SELECT TO authenticated
  USING (pool_id IS NOT NULL AND is_pool_member(pool_id));

CREATE POLICY "rfq_items_pool_member_select" ON rfq_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM rfqs r WHERE r.id = rfq_items.rfq_id
                 AND r.pool_id IS NOT NULL AND is_pool_member(r.pool_id)));

CREATE POLICY "quotes_pool_member_select" ON quotes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM rfqs r WHERE r.id = quotes.rfq_id
                 AND r.pool_id IS NOT NULL AND is_pool_member(r.pool_id)));

CREATE POLICY "quote_items_pool_member_select" ON quote_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM quotes q JOIN rfqs r ON r.id = q.rfq_id
                 WHERE q.id = quote_items.quote_id
                   AND r.pool_id IS NOT NULL AND is_pool_member(r.pool_id)));
```

Strictly gated on `pool_id IS NOT NULL` → non-pool RFQs are never widened. READ-only. The #1 verify target (non-member sees no pool comparativa; non-pool RFQs unchanged).

### AD-2: Pure per-company OC split (`pool-award-utils.ts`, TDD)

```ts
interface WinningLine { material_id: string; description: string; unit: string; unit_price: number; }
interface MyContribution { material_id: string; quantity: number; }   // this company's pool_item_contributions, joined to pool_items.material_id
interface OcLine { material_id: string; description: string; unit: string; quantity: number; unit_price: number; }

function companyOcLines(winning: WinningLine[], myContribs: MyContribution[]): OcLine[];
```
For each winning line, find this company's contribution to that material; emit an OC line with `quantity = my contribution`, `unit_price = winning unit_price`. Materials with no contribution from this company are skipped. Pure, unit-tested: orders only my qty; excludes non-contributed materials; price from the winning line; sums correctly; empty → [].

The link rfq_item ↔ pool_item is by `material_id` within the pool (the shared RFQ's rfq_items were created from pool_items per material in `#9b`).

### AD-3: `usePoolAward`

- **Read shared comparativa**: query the pool RFQ + quotes (now visible via AD-1) + the pool's `pool_items`/`pool_item_contributions`.
- **Adjudicate**: a member marks a winning quote → set `purchase_pools.pool_state='adjudicado'` (and record the winning quote, e.g. on the pool or via the existing award path). Visible to all members.
- **Generate my OC**: build my OC lines via `companyOcLines(winningLines, myContributions)`; INSERT one `purchase_orders` (company_id = mine, provider = winning quote's provider, rfq_id = pool RFQ, total = sum) + `purchase_order_items`. RLS enforces own-company.
- **Close**: when every member company of the pool has a `purchase_orders` for this pool RFQ → set `pool_state='cerrado'`.

### AD-4: Shared comparativa UI

For a pool RFQ, surface (in Comparativa or the Pools detail) the consolidated comparativa with the per-company contribution breakdown and a "generar mi orden de compra" action (enabled when adjudicado, for a member who hasn't generated its OC yet). Non-pool comparativa unchanged.

## Files

| File | Action |
|------|--------|
| `supabase/migrations/019_pool_award.sql` | new — additive pool-member SELECT policies |
| `src/lib/pool-award-utils.ts` (+ tests) | new — pure OC split (TDD) |
| `src/hooks/usePoolAward.ts` | new |
| `src/pages/Comparativa.tsx` and/or `src/components/pools/*` | shared comparativa + per-company OC action |

## Risks

- **Cross-tenant comparativa RLS** is the top risk. Mitigated: additive policies, strictly `pool_id IS NOT NULL` + `is_pool_member`, READ-only; non-pool RFQs untouched; adversarial verify.
- **Per-company OC correctness**: each company orders only its contribution (pure tested split); RLS prevents creating another company's OC.
- **`cerrado` transition** relies on counting member OCs (client-side, like `#9b`'s confirmado) — acceptable for the first-cut; a DB trigger could harden later.
