-- ================================================================
-- Drop urgente boolean: urgency is now computed dynamically
-- from desired_date vs company_settings.urgente_threshold_days
-- ================================================================

ALTER TABLE requests DROP COLUMN IF EXISTS urgente;
