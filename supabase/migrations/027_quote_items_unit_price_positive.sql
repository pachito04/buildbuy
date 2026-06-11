-- Migration: 027_quote_items_unit_price_positive
-- Description: Backend enforcement for provider quote pricing (client report #8,
--              [CRITICO] precio × cantidad). The frontend already blocks sending a
--              quote with a price of 0 or empty (validateQuote + filtered insert),
--              but the DB only enforced NOT NULL — a unit_price of 0 was still
--              accepted via a direct API call. This adds the missing CHECK so the
--              "must be greater than 0" rule is also guaranteed server-side.
-- Safe: the app filters out lines with unit_price <= 0 before insert
--       (Cotizaciones.tsx submitQuote), so no valid row should violate this.
--       If a legacy row with unit_price <= 0 exists, the ADD CONSTRAINT will fail
--       loudly — clean those rows first (see the pre-check query below).
-- Apply in a low-traffic window: ADD CONSTRAINT takes a brief ACCESS EXCLUSIVE lock.

-- Pre-check (run before applying — must return 0 rows):
--   SELECT id, quote_id, rfq_item_id, unit_price
--   FROM quote_items
--   WHERE unit_price <= 0;

BEGIN;

ALTER TABLE quote_items DROP CONSTRAINT IF EXISTS chk_quote_items_unit_price_positive;
ALTER TABLE quote_items ADD CONSTRAINT chk_quote_items_unit_price_positive
  CHECK (unit_price > 0);

COMMENT ON COLUMN quote_items.unit_price IS
  'Provider unit price. Must be > 0 (enforced by chk_quote_items_unit_price_positive).';

COMMIT;

-- ============================================================
-- ROLLBACK (run to revert migration 027)
-- ============================================================
-- BEGIN;
-- ALTER TABLE quote_items DROP CONSTRAINT IF EXISTS chk_quote_items_unit_price_positive;
-- COMMIT;
