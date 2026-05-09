-- ================================================================
-- Link purchase_order_items and remito_items to computo_item
-- ================================================================

-- OC items: reference to computo item + unit conversion factor
ALTER TABLE purchase_order_items
  ADD COLUMN computo_item_id UUID REFERENCES computo_item(id),
  ADD COLUMN factor_conversion NUMERIC(14,6) NOT NULL DEFAULT 1.0;

CREATE INDEX ix_po_items_computo ON purchase_order_items(computo_item_id);

-- Remito items: reference to computo item
ALTER TABLE remito_items
  ADD COLUMN computo_item_id UUID REFERENCES computo_item(id);

CREATE INDEX ix_remito_items_computo ON remito_items(computo_item_id);
