-- Migration: 019_pool_award
-- Description: Pool Interempresa — adjudicación (#9c) Slice 1.
--   ADD four permissive SELECT policies so pool members can read the shared
--   comparativa (rfqs + rfq_items + quotes + quote_items) for pool RFQs.
--
--   Design ref: AD-1 (additive pool-member SELECT policies).
--   These policies are PERMISSIVE (OR'd with existing policies).
--   Existing policies are NOT modified:
--     - rfqs_tenant          (rfqs)
--     - rfq_items_tenant     (rfq_items)
--     - quotes_company_view  (quotes)
--     - quote_items_view     (quote_items)
--   Non-pool RFQs (pool_id IS NULL) are never widened.
--   Reuses is_pool_member(uuid) SECURITY DEFINER function from 018_pool_flow.
--
-- To roll back (MANUAL — copy this comment and execute as a transaction):
--   BEGIN;
--
--   DROP POLICY IF EXISTS "rfqs_pool_member_select"       ON rfqs;
--   DROP POLICY IF EXISTS "rfq_items_pool_member_select"  ON rfq_items;
--   DROP POLICY IF EXISTS "quotes_pool_member_select"     ON quotes;
--   DROP POLICY IF EXISTS "quote_items_pool_member_select" ON quote_items;
--   ALTER TABLE purchase_pools DROP COLUMN IF EXISTS winning_quote_id;
--
--   COMMIT;

BEGIN;

-- ============================================================
-- 1. rfqs: pool members can SELECT pool RFQs
-- ============================================================
-- Permissive — OR'd with the existing rfqs_tenant policy.
-- Non-pool RFQs (pool_id IS NULL) are never matched by this policy.

CREATE POLICY "rfqs_pool_member_select"
  ON rfqs
  FOR SELECT
  TO authenticated
  USING (
    pool_id IS NOT NULL
    AND is_pool_member(pool_id)
  );

-- ============================================================
-- 2. rfq_items: pool members can SELECT items for pool RFQs
-- ============================================================
-- Permissive — OR'd with the existing rfq_items_tenant policy.

CREATE POLICY "rfq_items_pool_member_select"
  ON rfq_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM rfqs r
      WHERE r.id = rfq_items.rfq_id
        AND r.pool_id IS NOT NULL
        AND is_pool_member(r.pool_id)
    )
  );

-- ============================================================
-- 3. quotes: pool members can SELECT quotes for pool RFQs
-- ============================================================
-- Permissive — OR'd with the existing quotes_company_view policy.

CREATE POLICY "quotes_pool_member_select"
  ON quotes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM rfqs r
      WHERE r.id = quotes.rfq_id
        AND r.pool_id IS NOT NULL
        AND is_pool_member(r.pool_id)
    )
  );

-- ============================================================
-- 4. quote_items: pool members can SELECT quote items for pool RFQs
-- ============================================================
-- Permissive — OR'd with the existing quote_items_view policy.
-- quote_items has RLS enabled (001_initial_schema) and already has
-- quote_items_view + quote_items_write policies.

CREATE POLICY "quote_items_pool_member_select"
  ON quote_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM quotes q
      JOIN rfqs r ON r.id = q.rfq_id
      WHERE q.id = quote_items.quote_id
        AND r.pool_id IS NOT NULL
        AND is_pool_member(r.pool_id)
    )
  );

-- ============================================================
-- 5. purchase_pools.winning_quote_id — records the adjudicated winner
-- ============================================================
-- The member who adjudicates persists the winner here (they have
-- purchase_pools_member_update from #9b). quotes.status cannot be used:
-- only the owning provider can UPDATE quotes (quotes_provider_update).
ALTER TABLE purchase_pools
  ADD COLUMN IF NOT EXISTS winning_quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL;

COMMIT;

-- ============================================================
-- Manual-verify checklist (run after applying migration)
-- ============================================================
--
-- [ ] SELECT policyname FROM pg_policies WHERE tablename = 'rfqs'
--         ORDER BY policyname;
--     -> rfqs_pool_member_select present
--     -> rfqs_tenant still present (was NOT dropped)
--
-- [ ] SELECT policyname FROM pg_policies WHERE tablename = 'rfq_items'
--         ORDER BY policyname;
--     -> rfq_items_pool_member_select present
--     -> rfq_items_tenant still present (was NOT dropped)
--
-- [ ] SELECT policyname FROM pg_policies WHERE tablename = 'quotes'
--         ORDER BY policyname;
--     -> quotes_pool_member_select present
--     -> quotes_company_view still present (was NOT dropped)
--
-- [ ] SELECT policyname FROM pg_policies WHERE tablename = 'quote_items'
--         ORDER BY policyname;
--     -> quote_items_pool_member_select present
--     -> quote_items_view still present (was NOT dropped)
--     -> quote_items_write still present (was NOT dropped)
--
-- RLS behavior checks (run as authenticated users with 2 companies, A and B,
-- and a non-member company C):
--
-- Setup:
--   - Pool P created by company A
--   - pool_companies: A=member, B=member, C=NOT a member
--   - RFQ1: pool_id = P (pool RFQ, created from the pool)
--   - RFQ2: pool_id IS NULL (ordinary non-pool RFQ owned by A)
--   - quotes and quote_items exist for both RFQ1 and RFQ2
--
-- [ ] As company B (pool member) — SELECT FROM rfqs WHERE id = RFQ1 -> 1 row
-- [ ] As company B (pool member) — SELECT FROM rfq_items WHERE rfq_id = RFQ1 -> rows visible
-- [ ] As company B (pool member) — SELECT FROM quotes WHERE rfq_id = RFQ1 -> rows visible
-- [ ] As company B (pool member) — SELECT FROM quote_items for any RFQ1 quote -> rows visible
--
-- [ ] As company C (NON-member) — SELECT FROM rfqs WHERE id = RFQ1 -> 0 rows
-- [ ] As company C (NON-member) — SELECT FROM rfq_items WHERE rfq_id = RFQ1 -> 0 rows
-- [ ] As company C (NON-member) — SELECT FROM quotes WHERE rfq_id = RFQ1 -> 0 rows
-- [ ] As company C (NON-member) — SELECT FROM quote_items for any RFQ1 quote -> 0 rows
--
-- [ ] As company B (pool member) — SELECT FROM rfqs WHERE id = RFQ2 -> 0 rows
--     (B is NOT the owner; non-pool RFQ must remain owner-only)
-- [ ] As company A (owner) — SELECT FROM rfqs WHERE id = RFQ2 -> 1 row
--     (own-company policy rfqs_tenant still works)
-- [ ] As company A (owner) — SELECT FROM rfqs WHERE id = RFQ1 -> 1 row
--     (member policy OR own-company policy both fire — still 1 row)
