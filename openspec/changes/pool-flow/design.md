# Design: Pool de Compras — Flow (#9b)

> Builds on `#9a` (company_links, material_mappings). The high-risk core is the pool RLS rework (multi-tenant visibility + per-company confidentiality).

## Architecture Decisions

### AD-1: RLS rework — pool shared by membership, requirement detail private

Replace the legacy `auth_company_id()`-only pool policies. Helper predicate "viewer is a member of pool X":
```
EXISTS (SELECT 1 FROM pool_companies pc JOIN profiles p ON p.id = auth.uid()
        WHERE pc.pool_id = X AND pc.company_id = p.company_id)
```

- **`purchase_pools`**: SELECT/UPDATE if viewer is a member (membership predicate on `purchase_pools.id`); INSERT if `company_id` = viewer's company (the creator/owner).
- **`pool_companies`**: SELECT if viewer is a member of `pool_companies.pool_id` (members see the roster); INSERT if viewer's company owns the pool (`purchase_pools.company_id`); UPDATE own membership row (`company_id` = viewer's company — accept/decline).
- **`pool_items`** and **`pool_item_contributions`**: SELECT if viewer is a member of the pool; INSERT/UPDATE by members (consolidation is performed by a member; the data is shared totals).
- **`pool_requests`** (the CONFIDENTIALITY boundary): SELECT/INSERT/DELETE only when the underlying request is owned by the viewer's company:
  ```
  EXISTS (SELECT 1 FROM requests r JOIN profiles p ON p.id = auth.uid()
          WHERE r.id = pool_requests.request_id AND r.company_id = p.company_id)
  ```
  AND, for INSERT, the viewer is a member of the pool. ⇒ each company sees/manages only its own contributed requirements; nobody sees another company's requirement list.

The migration DROPs the four legacy `*_tenant` pool policies and CREATEs the above. The rollback comment restores the exact legacy policies verbatim.

### AD-2: `pool_state` text + CHECK (the report's 6 states)

`ALTER TABLE purchase_pools ADD COLUMN pool_state text NOT NULL DEFAULT 'borrador' CHECK (pool_state IN ('borrador','confirmado','en_comparativa','adjudicado','cerrado','cancelado'))`. The legacy `pool_status` enum is left untouched (used elsewhere); `pool_state` drives the report flow. Transitions (this change): borrador → confirmado (all participation confirmed) → en_comparativa (shared RFQ generated); cancelado from borrador. (adjudicado/cerrado are #9c.)

### AD-3: `pool_item_contributions`

```sql
CREATE TABLE pool_item_contributions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_item_id uuid NOT NULL REFERENCES pool_items(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quantity     numeric(12,3) NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pool_item_id, company_id)
);
```
Shared totals (members can read all contributions of the pool) — the per-company quantity is part of the consolidated line, NOT confidential (only the requirement detail is). RLS: member of the pool (via pool_items → purchase_pools membership).

### AD-4: Pure crossing logic (`pool-cross-utils.ts`, TDD)

```ts
interface PoolEligibleItem { company_id: string; material_id: string; description: string; unit: string; quantity: number; }
interface Mapping { material_a_id: string; material_b_id: string; usable: boolean; }   // usable = both confirmed (active link)
interface PoolConsolidatedLine { canonicalMaterialId: string; description: string; unit: string; totalQuantity: number;
  contributions: { company_id: string; quantity: number }[]; }

function crossPoolItems(items: PoolEligibleItem[], usableMappings: Mapping[]): PoolConsolidatedLine[];
```
Builds a union-find / canonical-material map from the USABLE mappings only, assigns each item to its canonical material, groups, sums `totalQuantity`, and accumulates `contributions` per company. Items whose material has no usable mapping form their own (single-company) line. Pure, unit-tested: two companies' mapped materials merge; unmapped stay separate; contributions sum to total; ignores non-usable mappings.

### AD-5: `usePoolFlow` + shared RFQ

- Add own requirements: insert `pool_requests` for the viewer's own eligible requests (RLS enforces own-only). Do NOT write `requests.status='in_pool'` (AD-6).
- Consolidate: gather each member's eligible items the viewer is allowed to see *as aggregates* — NOTE: a member cannot read others' `pool_requests`/request_items directly (confidentiality), so the **consolidation is computed and written by the pool owner/initiator** (who, at consolidation time, runs a privileged aggregate) OR each company writes its own `pool_item_contributions` and the totals are summed. **Chosen**: each member contributes its own items → writes/updates `pool_item_contributions` for the canonical material (via its own mappings); `pool_items.total_quantity` is the sum of contributions. This keeps every write within the writer's own visibility and respects confidentiality. `crossPoolItems` is used per-company to canonicalize.
- Confirm participation → `pool_companies.status='active'`; when all active → `pool_state='confirmado'`.
- Generate shared RFQ → create one `rfqs` (`rfq_type='pool'` or `'consolidated'`) from `pool_items`; link via a pool↔rfq reference (reuse `rfqs.pool_id` which already exists); set `pool_state='en_comparativa'`.

### AD-6: Remove the `in_pool` latent bug

`Pools.tsx` `requests.update({status:'in_pool'})` writes a value absent from the `request_status` enum → drop that update entirely (membership is tracked by `pool_requests`, not a request status).

## Files

| File | Action |
|------|--------|
| `supabase/migrations/018_pool_flow.sql` | new — RLS rework + pool_state + pool_item_contributions |
| `src/integrations/supabase/types.ts` | add column + table |
| `src/lib/pool-cross-utils.ts` (+ tests) | new (pure, TDD) |
| `src/hooks/usePoolFlow.ts` | new |
| `src/pages/Pools.tsx` + `src/components/pools/*` | consolidated view + contributions + state + shared-RFQ action; remove in_pool write |

## Risks

- **RLS rework on live tables** is the top risk. Mitigated by: membership-predicate visibility, `pool_requests` strictly request-owner-scoped (confidentiality), rollback restoring the verbatim legacy policies, and an adversarial verify (a non-member sees nothing; a member never sees another's `pool_requests`).
- **Confidentiality of consolidation**: because no member can read others' request detail, each member writes its own contributions; the consolidated total is the sum. This avoids any cross-company privileged read.
- **Usable-mapping gate**: crossing consumes only both-confirmed mappings on active links (closes the #9a consume-time gap).
