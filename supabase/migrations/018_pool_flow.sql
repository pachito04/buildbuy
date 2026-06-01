-- Migration: 018_pool_flow
-- Description: Pool Interempresa flow (#9b) — Slice 1.
--   1. DROP the 4 legacy *_tenant pool RLS policies.
--   2. CREATE new membership-based pool RLS policies (AD-1):
--      - purchase_pools, pool_companies, pool_items: visible to pool members.
--      - pool_requests: visible ONLY to the owning company (confidentiality boundary).
--   3. ALTER TABLE purchase_pools ADD COLUMN pool_state (6-state text CHECK, default borrador).
--   4. CREATE TABLE pool_item_contributions + RLS by pool membership (AD-3).
--
-- To roll back (MANUAL — copy this comment and execute as a transaction):
--   BEGIN;
--
--   -- Drop helper function
--   DROP FUNCTION IF EXISTS is_pool_member(uuid);
--
--   -- Drop new policies
--   DROP POLICY IF EXISTS "purchase_pools_member_select"  ON purchase_pools;
--   DROP POLICY IF EXISTS "purchase_pools_member_update"  ON purchase_pools;
--   DROP POLICY IF EXISTS "purchase_pools_owner_insert"   ON purchase_pools;
--   DROP POLICY IF EXISTS "pool_companies_member_select"  ON pool_companies;
--   DROP POLICY IF EXISTS "pool_companies_owner_insert"   ON pool_companies;
--   DROP POLICY IF EXISTS "pool_companies_own_update"     ON pool_companies;
--   DROP POLICY IF EXISTS "pool_items_member_select"      ON pool_items;
--   DROP POLICY IF EXISTS "pool_items_member_insert"      ON pool_items;
--   DROP POLICY IF EXISTS "pool_items_member_update"      ON pool_items;
--   DROP POLICY IF EXISTS "pool_requests_own_select"      ON pool_requests;
--   DROP POLICY IF EXISTS "pool_requests_own_insert"      ON pool_requests;
--   DROP POLICY IF EXISTS "pool_requests_own_delete"      ON pool_requests;
--   DROP POLICY IF EXISTS "pool_item_contributions_member_select" ON pool_item_contributions;
--   DROP POLICY IF EXISTS "pool_item_contributions_member_insert" ON pool_item_contributions;
--   DROP POLICY IF EXISTS "pool_item_contributions_member_update" ON pool_item_contributions;
--
--   -- Drop new table and column
--   DROP TABLE IF EXISTS pool_item_contributions CASCADE;
--   ALTER TABLE purchase_pools DROP COLUMN IF EXISTS pool_state;
--
--   -- Restore the 4 verbatim legacy policies (from 001_initial_schema.sql):
--   CREATE POLICY purchase_pools_tenant ON purchase_pools
--       FOR ALL USING (company_id = auth_company_id())
--       WITH CHECK (company_id = auth_company_id());
--
--   CREATE POLICY pool_companies_tenant ON pool_companies
--       FOR ALL USING (company_id = auth_company_id());
--
--   CREATE POLICY pool_requests_tenant ON pool_requests
--       FOR ALL USING (
--           pool_id IN (SELECT id FROM purchase_pools WHERE company_id = auth_company_id())
--       );
--
--   CREATE POLICY pool_items_tenant ON pool_items
--       FOR ALL USING (
--           pool_id IN (SELECT id FROM purchase_pools WHERE company_id = auth_company_id())
--       );
--
--   COMMIT;

BEGIN;

-- ============================================================
-- Helper function: is_pool_member(p_pool_id)
-- ============================================================
-- SECURITY DEFINER + STABLE so it bypasses RLS on pool_companies,
-- preventing the "infinite recursion detected in policy for relation
-- pool_companies" error that occurs when a policy ON pool_companies
-- queries pool_companies in its own USING clause.
-- All membership predicates in this migration must call this function
-- instead of querying pool_companies inline.

CREATE OR REPLACE FUNCTION is_pool_member(p_pool_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM pool_companies pc
    JOIN profiles pr ON pr.id = auth.uid()
    WHERE pc.pool_id = p_pool_id
      AND pc.company_id = pr.company_id
  );
$$;

-- ============================================================
-- 1. DROP legacy *_tenant pool policies
-- ============================================================

DROP POLICY IF EXISTS purchase_pools_tenant  ON purchase_pools;
DROP POLICY IF EXISTS pool_companies_tenant  ON pool_companies;
DROP POLICY IF EXISTS pool_requests_tenant   ON pool_requests;
DROP POLICY IF EXISTS pool_items_tenant      ON pool_items;

-- ============================================================
-- 2. New RLS policies — purchase_pools (AD-1)
-- ============================================================
-- SELECT / UPDATE: viewer must be a member of the pool (pool_companies row).
-- INSERT: viewer's company must match the pool's owning company_id (creator).

CREATE POLICY "purchase_pools_member_select"
  ON purchase_pools
  FOR SELECT
  TO authenticated
  USING (
    is_pool_member(purchase_pools.id)
  );

CREATE POLICY "purchase_pools_member_update"
  ON purchase_pools
  FOR UPDATE
  TO authenticated
  USING (
    is_pool_member(purchase_pools.id)
  )
  WITH CHECK (
    is_pool_member(purchase_pools.id)
  );

CREATE POLICY "purchase_pools_owner_insert"
  ON purchase_pools
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (
      SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
    )
  );

-- ============================================================
-- 3. New RLS policies — pool_companies (AD-1)
-- ============================================================
-- SELECT: viewer must be a member of the pool (sees the full roster).
-- INSERT: viewer's company must own the pool (purchase_pools.company_id).
-- UPDATE: viewer can update their OWN membership row (accept/decline).

CREATE POLICY "pool_companies_member_select"
  ON pool_companies
  FOR SELECT
  TO authenticated
  USING (
    is_pool_member(pool_companies.pool_id)
  );

CREATE POLICY "pool_companies_owner_insert"
  ON pool_companies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM purchase_pools pp
      JOIN profiles p ON p.id = auth.uid()
      WHERE pp.id = pool_companies.pool_id
        AND pp.company_id = p.company_id
    )
  );

CREATE POLICY "pool_companies_own_update"
  ON pool_companies
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = pool_companies.company_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = pool_companies.company_id
    )
  );

-- ============================================================
-- 4. New RLS policies — pool_items (AD-1)
-- ============================================================
-- SELECT / INSERT / UPDATE: viewer must be a member of the pool.

CREATE POLICY "pool_items_member_select"
  ON pool_items
  FOR SELECT
  TO authenticated
  USING (
    is_pool_member(pool_items.pool_id)
  );

CREATE POLICY "pool_items_member_insert"
  ON pool_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_pool_member(pool_items.pool_id)
  );

CREATE POLICY "pool_items_member_update"
  ON pool_items
  FOR UPDATE
  TO authenticated
  USING (
    is_pool_member(pool_items.pool_id)
  )
  WITH CHECK (
    is_pool_member(pool_items.pool_id)
  );

-- ============================================================
-- 5. New RLS policies — pool_requests (AD-1 — CONFIDENTIALITY boundary)
-- ============================================================
-- The ONLY table where cross-company isolation is per-request-owner, not per-pool.
-- SELECT / DELETE: viewer's company must own the underlying request.
-- INSERT: viewer's company must own the request AND be a pool member.

CREATE POLICY "pool_requests_own_select"
  ON pool_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM requests r
      JOIN profiles p ON p.id = auth.uid()
      WHERE r.id = pool_requests.request_id
        AND r.company_id = p.company_id
    )
  );

CREATE POLICY "pool_requests_own_insert"
  ON pool_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Viewer's company owns the request being contributed
    EXISTS (
      SELECT 1
      FROM requests r
      JOIN profiles p ON p.id = auth.uid()
      WHERE r.id = pool_requests.request_id
        AND r.company_id = p.company_id
    )
    AND
    -- Viewer is a member of the pool
    is_pool_member(pool_requests.pool_id)
  );

CREATE POLICY "pool_requests_own_delete"
  ON pool_requests
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM requests r
      JOIN profiles p ON p.id = auth.uid()
      WHERE r.id = pool_requests.request_id
        AND r.company_id = p.company_id
    )
  );

-- ============================================================
-- 6. ADD pool_state column to purchase_pools (AD-2)
-- ============================================================
-- The legacy pool_status enum column is left untouched.
-- pool_state drives the report flow; existing pools default to 'borrador'.

ALTER TABLE purchase_pools
  ADD COLUMN IF NOT EXISTS pool_state text NOT NULL DEFAULT 'borrador'
  CHECK (pool_state IN ('borrador', 'confirmado', 'en_comparativa', 'adjudicado', 'cerrado', 'cancelado'));

COMMENT ON COLUMN purchase_pools.pool_state IS
  'Report-flow state for the interempresa pool (#9b). '
  'Values: borrador | confirmado | en_comparativa | adjudicado | cerrado | cancelado. '
  'Distinct from the legacy pool_status enum column (left untouched).';

-- ============================================================
-- 7. CREATE pool_item_contributions (AD-3)
-- ============================================================

CREATE TABLE pool_item_contributions (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_item_id uuid          NOT NULL REFERENCES pool_items(id) ON DELETE CASCADE,
  company_id   uuid          NOT NULL REFERENCES companies(id)  ON DELETE CASCADE,
  quantity     numeric(12,3) NOT NULL,
  created_at   timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (pool_item_id, company_id)
);

COMMENT ON TABLE pool_item_contributions IS
  'Per-company quantity contribution for each consolidated pool_items line. '
  'Sum of contributions for a pool_item equals pool_items.total_quantity. '
  'Contributions are NOT confidential — any pool member can see all contributions.';

CREATE INDEX idx_pool_item_contributions_pool_item
  ON pool_item_contributions (pool_item_id);

-- ============================================================
-- 8. Enable RLS on pool_item_contributions
-- ============================================================

ALTER TABLE pool_item_contributions ENABLE ROW LEVEL SECURITY;

-- SELECT: viewer must be a member of the pool that owns the pool_item.
CREATE POLICY "pool_item_contributions_member_select"
  ON pool_item_contributions
  FOR SELECT
  TO authenticated
  USING (
    is_pool_member(
      (SELECT pi.pool_id FROM pool_items pi
       WHERE pi.id = pool_item_contributions.pool_item_id)
    )
  );

-- INSERT: viewer must be a member of the pool AND may only write its OWN
-- company's contribution (cannot forge another company's attribution).
CREATE POLICY "pool_item_contributions_member_insert"
  ON pool_item_contributions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_pool_member(
      (SELECT pi.pool_id FROM pool_items pi
       WHERE pi.id = pool_item_contributions.pool_item_id)
    )
    AND company_id = (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid())
  );

-- UPDATE: viewer must be a member of the pool AND the row must be its OWN
-- company's contribution.
CREATE POLICY "pool_item_contributions_member_update"
  ON pool_item_contributions
  FOR UPDATE
  TO authenticated
  USING (
    is_pool_member(
      (SELECT pi.pool_id FROM pool_items pi
       WHERE pi.id = pool_item_contributions.pool_item_id)
    )
    AND company_id = (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid())
  )
  WITH CHECK (
    is_pool_member(
      (SELECT pi.pool_id FROM pool_items pi
       WHERE pi.id = pool_item_contributions.pool_item_id)
    )
    AND company_id = (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid())
  );

COMMIT;

-- ============================================================
-- Manual-verify checklist (run after applying migration)
-- ============================================================
--
-- [ ] SELECT policyname FROM pg_policies WHERE tablename = 'purchase_pools';
--     -> purchase_pools_member_select, purchase_pools_member_update, purchase_pools_owner_insert present
--     -> purchase_pools_tenant ABSENT (was dropped)
--
-- [ ] SELECT policyname FROM pg_policies WHERE tablename = 'pool_companies';
--     -> pool_companies_member_select, pool_companies_owner_insert, pool_companies_own_update present
--     -> pool_companies_tenant ABSENT
--
-- [ ] SELECT policyname FROM pg_policies WHERE tablename = 'pool_items';
--     -> pool_items_member_select, pool_items_member_insert, pool_items_member_update present
--     -> pool_items_tenant ABSENT
--
-- [ ] SELECT policyname FROM pg_policies WHERE tablename = 'pool_requests';
--     -> pool_requests_own_select, pool_requests_own_insert, pool_requests_own_delete present
--     -> pool_requests_tenant ABSENT
--
-- [ ] \d purchase_pools
--     -> pool_state column present, type text, NOT NULL, default 'borrador'
--     -> CHECK (pool_state IN ('borrador','confirmado','en_comparativa','adjudicado','cerrado','cancelado'))
--     -> legacy status column (pool_status enum) still present
--
-- [ ] SELECT pool_state FROM purchase_pools LIMIT 5;
--     -> all existing rows show 'borrador' (backfilled by default)
--
-- [ ] INSERT INTO purchase_pools (..., pool_state) VALUES (..., 'invalido') -> CHECK violation
--
-- [ ] \d pool_item_contributions
--     -> id, pool_item_id, company_id, quantity, created_at present
--     -> UNIQUE(pool_item_id, company_id) constraint present
--
-- [ ] SELECT indexname FROM pg_indexes WHERE tablename = 'pool_item_contributions';
--     -> idx_pool_item_contributions_pool_item present
--
-- [ ] SELECT policyname FROM pg_policies WHERE tablename = 'pool_item_contributions';
--     -> pool_item_contributions_member_select, pool_item_contributions_member_insert,
--        pool_item_contributions_member_update present
--
-- RLS behavior checks (run as authenticated users with 2 companies, A and B):
--
-- Setup:
--   - Pool P created by company A (purchase_pools row with company_id=A)
--   - pool_companies rows: A=member, B=member, C=NOT a member
--   - pool_requests: A contributed R_a, B contributed R_b
--
-- [ ] Non-member (C) queries purchase_pools WHERE id=P -> 0 rows
-- [ ] Member B queries purchase_pools WHERE id=P -> 1 row
-- [ ] Non-member (C) queries pool_companies WHERE pool_id=P -> 0 rows
-- [ ] Member B queries pool_companies WHERE pool_id=P -> 2 rows (both members visible)
-- [ ] Non-member (C) queries pool_items WHERE pool_id=P -> 0 rows
-- [ ] Member B queries pool_items WHERE pool_id=P -> sees consolidated items
-- [ ] Member B queries pool_requests WHERE pool_id=P -> sees ONLY R_b (NOT R_a — confidentiality!)
-- [ ] Member A queries pool_requests WHERE pool_id=P -> sees ONLY R_a (NOT R_b)
-- [ ] Non-member (C) queries pool_requests -> 0 rows
-- [ ] pool_state default: newly inserted purchase_pools row has pool_state='borrador'
-- [ ] Member B inserts pool_item_contributions for a pool_item of P -> succeeds
-- [ ] Non-member C inserts pool_item_contributions for a pool_item of P -> blocked by RLS
--
-- Recursion guard (critical — run as a member user):
-- [ ] SELECT * FROM pool_companies WHERE pool_id = '<P>';
--     -> returns rows with NO "infinite recursion detected in policy for relation pool_companies" error
-- [ ] SELECT is_pool_member('<P>') -> true (for a member user)
