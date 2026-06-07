-- Migration 025: rfq_number correlative sequence for RFQs
-- Change: rfq-numero-correlativo
-- Adds a readable sequential identifier to rfqs (e.g. SC #41)
-- Replicates the request_number pattern used in requests table.
-- Safe to re-run (IF EXISTS / IF NOT EXISTS guards throughout).

BEGIN;

-- 1. Create the sequence
CREATE SEQUENCE IF NOT EXISTS rfqs_rfq_number_seq;

-- 2. Add column (nullable first, so backfill can run before NOT NULL)
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS rfq_number bigint;

-- 3. Backfill existing rows ordered by creation date
--    row_number() assigns 1-based sequential numbers; only updates rows
--    that still have rfq_number IS NULL so re-runs are idempotent.
UPDATE rfqs
SET rfq_number = sub.rn
FROM (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM rfqs
) sub
WHERE rfqs.id = sub.id
  AND rfqs.rfq_number IS NULL;

-- 4. Advance the sequence past the highest existing value
--    COALESCE handles the empty-table case gracefully.
SELECT setval('rfqs_rfq_number_seq', COALESCE((SELECT MAX(rfq_number) FROM rfqs), 0));

-- 5. Wire up the sequence as the column default
ALTER TABLE rfqs ALTER COLUMN rfq_number SET DEFAULT nextval('rfqs_rfq_number_seq');

-- 6. Enforce NOT NULL now that all rows have a value
ALTER TABLE rfqs ALTER COLUMN rfq_number SET NOT NULL;

-- 7. Unique index for integrity and fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_rfqs_rfq_number ON rfqs(rfq_number);

COMMIT;

-- ROLLBACK (manual — run these statements individually if you need to revert):
-- DROP INDEX IF EXISTS idx_rfqs_rfq_number;
-- ALTER TABLE rfqs ALTER COLUMN rfq_number DROP DEFAULT;
-- ALTER TABLE rfqs DROP COLUMN IF EXISTS rfq_number;
-- DROP SEQUENCE IF EXISTS rfqs_rfq_number_seq;
