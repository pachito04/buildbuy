-- Migration: 014_rfq_change_log
-- Description: Audit log table for RFQ header field changes.
--              Mirrors the requerimiento_evento pattern from migration 004.
--              Immutable: no UPDATE/DELETE policies.
--
-- Rollback:
--   DROP TABLE IF EXISTS rfq_change_log;

BEGIN;

-- ============================================================
-- 1. Create rfq_change_log table
-- ============================================================

CREATE TABLE rfq_change_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id      uuid        NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  field       text        NOT NULL,
  old_value   text,
  new_value   text,
  changed_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. Index for newest-first history queries
-- ============================================================

CREATE INDEX idx_rfq_change_log ON rfq_change_log (rfq_id, created_at DESC);

-- ============================================================
-- 3. Row Level Security
-- ============================================================

ALTER TABLE rfq_change_log ENABLE ROW LEVEL SECURITY;

-- SELECT: authenticated users whose company matches the rfq's company
CREATE POLICY "rfq_change_log_select_company"
  ON rfq_change_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rfqs r
      JOIN profiles p ON p.company_id = r.company_id
      WHERE r.id = rfq_change_log.rfq_id
        AND p.id = auth.uid()
    )
  );

-- INSERT: authenticated users whose company matches the rfq's company
CREATE POLICY "rfq_change_log_insert_company"
  ON rfq_change_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rfqs r
      JOIN profiles p ON p.company_id = r.company_id
      WHERE r.id = rfq_change_log.rfq_id
        AND p.id = auth.uid()
    )
  );

-- No UPDATE/DELETE policies: rows are immutable

COMMIT;
