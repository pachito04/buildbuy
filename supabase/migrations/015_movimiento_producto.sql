-- Migration: 015_movimiento_producto
-- Description: Per-product movement audit log (OBS-004, Scope A).
--              Records three movement points: destino_asignado, oc_emitida, recepcion.
--              Also adds rfq_items.request_item_id (Option B) so oc_emitida logging works.
-- Safe: additive only -- no existing tables or enums are modified.
-- To roll back:
--   DROP TABLE movimiento_producto CASCADE;
--   ALTER TABLE rfq_items DROP COLUMN IF EXISTS request_item_id;

BEGIN;

-- ============================================================
-- 1. Create movimiento_producto table
-- ============================================================

CREATE TABLE movimiento_producto (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  request_item_id uuid          NOT NULL REFERENCES request_items(id) ON DELETE CASCADE,
  material_id     uuid          REFERENCES materials(id) ON DELETE SET NULL,
  tipo            text          NOT NULL,
  origen          text,
  destino         text,
  cantidad        numeric(12,3),
  ref_type        text,
  ref_id          uuid,
  created_by      uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT chk_mov_tipo CHECK (tipo IN ('destino_asignado', 'oc_emitida', 'recepcion'))
);

COMMENT ON TABLE movimiento_producto IS
  'Immutable per-product movement log. Rows are INSERT-only (no UPDATE/DELETE policies).';

COMMENT ON COLUMN movimiento_producto.tipo IS
  'Movement type: destino_asignado | oc_emitida | recepcion';
COMMENT ON COLUMN movimiento_producto.origen IS
  'Human-readable source, e.g. "Requerimiento #42"';
COMMENT ON COLUMN movimiento_producto.destino IS
  'Human-readable destination, e.g. "Inventario", "Proveedor X", "obra"';
COMMENT ON COLUMN movimiento_producto.ref_type IS
  'Reference document type: requerimiento | purchase_order | remito';
COMMENT ON COLUMN movimiento_producto.ref_id IS
  'UUID of the referenced document';

-- ============================================================
-- 2. Index for timeline queries
-- ============================================================

CREATE INDEX idx_movimiento_producto_item
  ON movimiento_producto (request_item_id, created_at);

-- ============================================================
-- 3. Enable RLS
-- ============================================================

ALTER TABLE movimiento_producto ENABLE ROW LEVEL SECURITY;

-- SELECT: authenticated users whose company matches the request_item's company
-- (via request_items -> requests -> profiles)
CREATE POLICY "movimiento_producto_select_company"
  ON movimiento_producto
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM request_items ri
      JOIN requests r       ON r.id = ri.request_id
      JOIN profiles p       ON p.company_id = r.company_id
      WHERE ri.id = movimiento_producto.request_item_id
        AND p.id = auth.uid()
    )
  );

-- INSERT: same company check
CREATE POLICY "movimiento_producto_insert_company"
  ON movimiento_producto
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM request_items ri
      JOIN requests r       ON r.id = ri.request_id
      JOIN profiles p       ON p.company_id = r.company_id
      WHERE ri.id = movimiento_producto.request_item_id
        AND p.id = auth.uid()
    )
  );

-- No UPDATE or DELETE policies -- rows are immutable.

-- ============================================================
-- 4. Link rfq_items -> request_items (Option B -- OBS-004)
-- ============================================================
-- Nullable so free-mode RFQ items (no request origin) are valid.
-- Populated in SurtidoDialog when items are routed to cotizacion.
-- This allows generateOC to resolve request_item_id via:
--   quote_items.rfq_item_id -> rfq_items.request_item_id

ALTER TABLE rfq_items
  ADD COLUMN IF NOT EXISTS request_item_id uuid
    REFERENCES request_items(id) ON DELETE SET NULL;

COMMENT ON COLUMN rfq_items.request_item_id IS
  'The originating request_item when this rfq_item was created from a surtido routing. '
  'NULL for free-mode RFQs (no request origin).';

COMMIT;

-- ============================================================
-- Manual-verify checklist (run after applying migration)
-- ============================================================
-- [ ] SELECT * FROM movimiento_producto LIMIT 1;  -> returns 0 rows, no error
-- [ ] \d movimiento_producto                       -> all columns present
-- [ ] SELECT indexname FROM pg_indexes WHERE tablename = 'movimiento_producto';
--     -> idx_movimiento_producto_item present
-- [ ] SELECT policyname FROM pg_policies WHERE tablename = 'movimiento_producto';
--     -> movimiento_producto_select_company and movimiento_producto_insert_company
-- [ ] Attempt INSERT with a valid request_item_id as an authenticated user in the same company -> succeeds
-- [ ] Attempt INSERT with a request_item_id from another company -> blocked by RLS (0 rows or permission denied)
-- [ ] Attempt INSERT with tipo = 'invalid_tipo' -> fails with CHECK constraint violation
-- [ ] Attempt UPDATE on an existing row -> fails (no UPDATE policy)
-- [ ] Attempt DELETE on an existing row -> fails (no DELETE policy)
-- [ ] \d rfq_items                                 -> request_item_id column present, nullable uuid
-- [ ] SELECT request_item_id FROM rfq_items LIMIT 5; -> no error (column exists, all null for pre-existing rows)
