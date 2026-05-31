-- Migration: 017_pool_foundation
-- Description: Pool Interempresa foundation (#9a).
--   1. company_links  — persistent bidirectional link between two companies.
--   2. material_mappings — dual-confirmed material equivalence per link.
--   3. materials_select_linked_company — additive permissive SELECT policy
--      so a company can read a partner's materials ONLY through an active link.
--      The existing materials_tenant policy is NOT modified.
-- Safe: additive only — no existing tables, columns, or policies are modified.
--
-- To roll back:
--   DROP POLICY IF EXISTS "materials_select_linked_company" ON materials;
--   DROP TABLE IF EXISTS material_mappings CASCADE;
--   DROP TABLE IF EXISTS company_links CASCADE;

BEGIN;

-- ============================================================
-- 1. company_links
-- ============================================================
-- Persists a bidirectional link request between two distinct companies.
-- Status flow: pending (default) → active (target accepts) → disabled (either party).
-- Disabling keeps the history row; a re-enable is an UPDATE back to active.

CREATE TABLE company_links (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_company_id uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_company_id    uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status               text        NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending', 'active', 'disabled')),
  requested_by         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_link_distinct CHECK (requester_company_id <> target_company_id)
);

COMMENT ON TABLE company_links IS
  'Bidirectional link between two companies for the pool interempresa flow. '
  'Status: pending (awaiting acceptance) | active | disabled (history kept).';

-- One link per unordered pair — prevents both A→B and B→A rows.
-- Mirrors LEAST()/GREATEST() from the design (AD-1).
CREATE UNIQUE INDEX uq_company_link_pair
  ON company_links (
    LEAST(requester_company_id::text, target_company_id::text),
    GREATEST(requester_company_id::text, target_company_id::text)
  );

-- Index for the party-membership queries in RLS policies.
CREATE INDEX idx_company_links_requester ON company_links (requester_company_id);
CREATE INDEX idx_company_links_target    ON company_links (target_company_id);

-- ============================================================
-- 2. material_mappings
-- ============================================================
-- Maps one company's material to another's for a given link.
-- Usable only when BOTH companies confirm (dual-confirmed pattern, AD-2).

CREATE TABLE material_mappings (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_link_id        uuid        NOT NULL REFERENCES company_links(id) ON DELETE CASCADE,
  material_a_id          uuid        NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  material_b_id          uuid        NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  confirmed_by_requester boolean     NOT NULL DEFAULT false,
  confirmed_by_target    boolean     NOT NULL DEFAULT false,
  created_by             uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_link_id, material_a_id, material_b_id)
);

COMMENT ON TABLE material_mappings IS
  'Maps a requester-company material to a target-company material for a link. '
  'Usable (pool-eligible) only when confirmed_by_requester AND confirmed_by_target are both true.';

CREATE INDEX idx_material_mappings_link
  ON material_mappings (company_link_id);

-- ============================================================
-- 3. Enable RLS on both new tables
-- ============================================================

ALTER TABLE company_links    ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_mappings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. RLS policies — company_links
-- ============================================================
-- Viewer's company is determined via profiles join on auth.uid().
-- All three operations (SELECT / INSERT / UPDATE) restrict to parties of the link.

CREATE POLICY "company_links_select_party"
  ON company_links
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (p.company_id = company_links.requester_company_id
          OR p.company_id = company_links.target_company_id)
    )
  );

CREATE POLICY "company_links_insert_requester"
  ON company_links
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = company_links.requester_company_id
    )
  );

CREATE POLICY "company_links_update_party"
  ON company_links
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (p.company_id = company_links.requester_company_id
          OR p.company_id = company_links.target_company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (p.company_id = company_links.requester_company_id
          OR p.company_id = company_links.target_company_id)
    )
  );

-- ============================================================
-- 5. RLS policies — material_mappings
-- ============================================================
-- Party check is a two-hop join: material_mappings → company_links → profiles.

CREATE POLICY "material_mappings_select_party"
  ON material_mappings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM company_links cl
      JOIN profiles p ON p.id = auth.uid()
      WHERE cl.id = material_mappings.company_link_id
        AND (p.company_id = cl.requester_company_id
          OR p.company_id = cl.target_company_id)
    )
  );

CREATE POLICY "material_mappings_insert_party"
  ON material_mappings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM company_links cl
      JOIN profiles p ON p.id = auth.uid()
      WHERE cl.id = material_mappings.company_link_id
        AND (p.company_id = cl.requester_company_id
          OR p.company_id = cl.target_company_id)
    )
  );

CREATE POLICY "material_mappings_update_party"
  ON material_mappings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM company_links cl
      JOIN profiles p ON p.id = auth.uid()
      WHERE cl.id = material_mappings.company_link_id
        AND (p.company_id = cl.requester_company_id
          OR p.company_id = cl.target_company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM company_links cl
      JOIN profiles p ON p.id = auth.uid()
      WHERE cl.id = material_mappings.company_link_id
        AND (p.company_id = cl.requester_company_id
          OR p.company_id = cl.target_company_id)
    )
  );

-- ============================================================
-- 6. Cross-company materials read — ADDITIVE permissive SELECT policy
-- ============================================================
-- CRITICAL: the existing materials_tenant policy is NOT modified.
-- Permissive policies are OR'd by Postgres, so own-company access is preserved.
-- This policy grants READ-ONLY access to a partner's materials ONLY when
-- an 'active' company_links row joins the viewer's company to that material's company.
-- A disabled or pending link grants nothing.

CREATE POLICY "materials_select_linked_company"
  ON materials
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM company_links cl
      JOIN profiles p ON p.id = auth.uid()
      WHERE cl.status = 'active'
        AND (
          (cl.requester_company_id = p.company_id AND cl.target_company_id = materials.company_id)
          OR
          (cl.target_company_id    = p.company_id AND cl.requester_company_id = materials.company_id)
        )
    )
  );

COMMIT;

-- ============================================================
-- Manual-verify checklist (run after applying migration)
-- ============================================================
-- [ ] \d company_links
--     -> all columns present; status NOT NULL, DEFAULT 'pending', CHECK (pending|active|disabled)
--     -> chk_link_distinct present
-- [ ] SELECT indexname FROM pg_indexes WHERE tablename = 'company_links';
--     -> uq_company_link_pair, idx_company_links_requester, idx_company_links_target present
-- [ ] SELECT policyname FROM pg_policies WHERE tablename = 'company_links';
--     -> company_links_select_party, company_links_insert_requester, company_links_update_party
--
-- [ ] \d material_mappings
--     -> all columns present; confirmed_by_requester/target NOT NULL DEFAULT false
--     -> UNIQUE(company_link_id, material_a_id, material_b_id) constraint present
-- [ ] SELECT indexname FROM pg_indexes WHERE tablename = 'material_mappings';
--     -> idx_material_mappings_link present
-- [ ] SELECT policyname FROM pg_policies WHERE tablename = 'material_mappings';
--     -> material_mappings_select_party, material_mappings_insert_party, material_mappings_update_party
--
-- [ ] SELECT policyname FROM pg_policies WHERE tablename = 'materials';
--     -> materials_tenant still present (unchanged); materials_select_linked_company also present
--
-- RLS behavior checks (run as authenticated users in different companies):
-- [ ] Company A inserts company_links (requester=A, target=B, status='pending') → succeeds for A's user
-- [ ] Company C user tries to SELECT that link → 0 rows (not a party)
-- [ ] Company A user tries to INSERT link with requester=B → blocked by insert policy
-- [ ] Insert duplicate pair (A,B) then (B,A) → UNIQUE violation on uq_company_link_pair
-- [ ] INSERT link with requester_company_id = target_company_id → chk_link_distinct violation
-- [ ] Company B user updates link status to 'active' → succeeds (B is a party)
-- [ ] Company B user updates link status to 'invalid_status' → CHECK violation
-- [ ] A company with NO active link queries materials → sees NONE of another company's materials
-- [ ] A disabled link (status='disabled') between A and B → A cannot read B's materials
-- [ ] A pending link (status='pending') between A and B → A cannot read B's materials
-- [ ] An active link between A and B → A can read B's materials (and vice versa); C's materials NOT visible
-- [ ] material_mappings INSERT by non-party user → blocked by RLS
-- [ ] material_mappings INSERT (company_link_id, material_a_id, material_b_id) duplicate → UNIQUE violation
-- [ ] material_mappings UPDATE to set confirmed_by_target=true by target-company user → succeeds
-- [ ] material_mappings UPDATE by user not in either party company → blocked by RLS
