-- Migration: 013_rfq_form_fields
-- Adds nullable text columns for the RFQ creation form UX improvements.
--
-- Rollback:
--   ALTER TABLE rfqs      DROP COLUMN IF EXISTS descripcion;
--   ALTER TABLE rfqs      DROP COLUMN IF EXISTS categoria;
--   ALTER TABLE rfqs      DROP COLUMN IF EXISTS price_terms;
--   ALTER TABLE rfq_items DROP COLUMN IF EXISTS observations;

BEGIN;

ALTER TABLE rfqs      ADD COLUMN IF NOT EXISTS descripcion  text;
ALTER TABLE rfqs      ADD COLUMN IF NOT EXISTS categoria    text;
ALTER TABLE rfqs      ADD COLUMN IF NOT EXISTS price_terms  text;

ALTER TABLE rfq_items ADD COLUMN IF NOT EXISTS observations text;

COMMIT;
