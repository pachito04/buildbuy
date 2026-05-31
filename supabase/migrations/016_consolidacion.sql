-- Migration: 016_consolidacion
-- Description: Per-item delivery_target + traceability tables for Consolidación de Requerimientos (núcleo).
--              Adds request_items.delivery_target (deposito|obra) with default 'obra'.
--              Creates rfq_item_sources and rfq_requests for consolidated RFQ traceability.
-- Safe: additive only — no existing columns, tables, or enums are modified.
-- To roll back:
--   DROP TABLE rfq_item_sources CASCADE;
--   DROP TABLE rfq_requests CASCADE;
--   ALTER TABLE request_items DROP COLUMN IF EXISTS delivery_target;

BEGIN;

-- ============================================================
-- 1. Add delivery_target to request_items
-- ============================================================
-- Existing rows backfill to 'obra' via the DEFAULT value.
-- No UPDATE needed — the DEFAULT is applied at ALTER TABLE time for existing NULLs
-- because we declare NOT NULL DEFAULT 'obra'.

ALTER TABLE request_items
  ADD COLUMN IF NOT EXISTS delivery_target text NOT NULL DEFAULT 'obra';

ALTER TABLE request_items
  ADD CONSTRAINT chk_item_delivery_target
  CHECK (delivery_target IN ('deposito', 'obra'));

COMMENT ON COLUMN request_items.delivery_target IS
  'Delivery destination for this item: deposito (eligible for consolidation) or obra (direct delivery). Default obra.';

-- ============================================================
-- 2. Create rfq_item_sources
-- ============================================================
-- Records which request_item (and its request) contributed what quantity
-- to a consolidated rfq_item. Used for reception distribution in #8b.

CREATE TABLE rfq_item_sources (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_item_id     uuid          NOT NULL REFERENCES rfq_items(id)     ON DELETE CASCADE,
  request_item_id uuid          NOT NULL REFERENCES request_items(id) ON DELETE CASCADE,
  request_id      uuid          NOT NULL REFERENCES requests(id)      ON DELETE CASCADE,
  quantity        numeric(12,3) NOT NULL,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE rfq_item_sources IS
  'Traceability: maps each consolidated rfq_item to the source request_items that contributed to it, with their individual quantities. INSERT-only.';

-- Index for the primary join direction: given an rfq_item, find all sources
CREATE INDEX idx_rfq_item_sources_rfq_item
  ON rfq_item_sources (rfq_item_id);

-- ============================================================
-- 3. Create rfq_requests
-- ============================================================
-- Records which source requests participate in a consolidated RFQ.
-- Unique constraint prevents duplicate request links per RFQ.

CREATE TABLE rfq_requests (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id      uuid        NOT NULL REFERENCES rfqs(id)      ON DELETE CASCADE,
  request_id  uuid        NOT NULL REFERENCES requests(id)  ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rfq_id, request_id)
);

COMMENT ON TABLE rfq_requests IS
  'Which source requests participate in a consolidated RFQ. One row per (rfq, request) pair. INSERT-only.';

-- ============================================================
-- 4. Enable RLS on both new tables
-- ============================================================

ALTER TABLE rfq_item_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_requests     ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. RLS policies — rfq_item_sources
-- ============================================================
-- Company isolation: user must belong to the same company as the parent rfq,
-- reached via rfq_item_sources -> rfq_items -> rfqs -> profiles.

CREATE POLICY "rfq_item_sources_select_company"
  ON rfq_item_sources
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM rfq_items  ri
      JOIN rfqs       r  ON r.id  = ri.rfq_id
      JOIN profiles   p  ON p.company_id = r.company_id
      WHERE ri.id = rfq_item_sources.rfq_item_id
        AND p.id  = auth.uid()
    )
  );

CREATE POLICY "rfq_item_sources_insert_company"
  ON rfq_item_sources
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM rfq_items  ri
      JOIN rfqs       r  ON r.id  = ri.rfq_id
      JOIN profiles   p  ON p.company_id = r.company_id
      WHERE ri.id = rfq_item_sources.rfq_item_id
        AND p.id  = auth.uid()
    )
  );

-- No UPDATE or DELETE policies — rows are insert-only (CASCADE handles cleanup).

-- ============================================================
-- 6. RLS policies — rfq_requests
-- ============================================================
-- Company isolation via rfq_requests -> rfqs -> profiles.

CREATE POLICY "rfq_requests_select_company"
  ON rfq_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM rfqs     r
      JOIN profiles p ON p.company_id = r.company_id
      WHERE r.id = rfq_requests.rfq_id
        AND p.id = auth.uid()
    )
  );

CREATE POLICY "rfq_requests_insert_company"
  ON rfq_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM rfqs     r
      JOIN profiles p ON p.company_id = r.company_id
      WHERE r.id = rfq_requests.rfq_id
        AND p.id = auth.uid()
    )
  );

-- No UPDATE or DELETE policies — rows are insert-only (CASCADE handles cleanup).

COMMIT;

-- ============================================================
-- Manual-verify checklist (run after applying migration)
-- ============================================================
-- [ ] \d request_items
--     -> delivery_target column present, type text, NOT NULL, default 'obra'
-- [ ] SELECT delivery_target FROM request_items LIMIT 5;
--     -> all existing rows show 'obra' (backfilled by default)
-- [ ] INSERT INTO request_items (..., delivery_target) VALUES (..., 'invalid') -> CHECK violation
-- [ ] INSERT INTO request_items (...) VALUES (...) -> delivery_target defaults to 'obra'
--
-- [ ] SELECT * FROM rfq_item_sources LIMIT 1;          -> 0 rows, no error
-- [ ] \d rfq_item_sources                              -> all columns present
-- [ ] SELECT indexname FROM pg_indexes WHERE tablename = 'rfq_item_sources';
--     -> idx_rfq_item_sources_rfq_item present
-- [ ] SELECT policyname FROM pg_policies WHERE tablename = 'rfq_item_sources';
--     -> rfq_item_sources_select_company, rfq_item_sources_insert_company
--
-- [ ] SELECT * FROM rfq_requests LIMIT 1;              -> 0 rows, no error
-- [ ] \d rfq_requests                                  -> all columns present, UNIQUE(rfq_id, request_id)
-- [ ] SELECT policyname FROM pg_policies WHERE tablename = 'rfq_requests';
--     -> rfq_requests_select_company, rfq_requests_insert_company
--
-- [ ] Attempt INSERT into rfq_item_sources as authenticated user in same company -> succeeds
-- [ ] Attempt INSERT into rfq_item_sources as authenticated user in different company -> blocked by RLS
-- [ ] Attempt INSERT into rfq_requests as authenticated user in same company -> succeeds
-- [ ] Attempt INSERT into rfq_requests with duplicate (rfq_id, request_id) -> UNIQUE violation
-- [ ] Attempt UPDATE on rfq_item_sources row -> fails (no UPDATE policy)
-- [ ] Attempt DELETE on rfq_requests row -> fails (no DELETE policy)
-- [ ] DELETE a parent rfqs row -> CASCADE removes rfq_requests and (via rfq_items) rfq_item_sources rows
