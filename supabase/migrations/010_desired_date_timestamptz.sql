-- ================================================================
-- desired_date: DATE → TIMESTAMPTZ
-- Allows architects to specify delivery time (not just date)
-- Existing rows get 00:00:00 UTC — no data loss
-- ================================================================

ALTER TABLE requests
  ALTER COLUMN desired_date TYPE TIMESTAMPTZ
  USING desired_date::timestamptz;
