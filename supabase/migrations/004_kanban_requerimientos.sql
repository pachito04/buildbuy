-- Migration: 004_kanban_requerimientos
-- Description: Recreate request_status enum (4 values), add rejection/urgente columns,
--              add item sub-states, create requerimiento_evento table.
-- Safe: no production data, clean-cut migration.

BEGIN;

-- ============================================================
-- 1. Recreate request_status enum with 4 values
-- ============================================================

-- Step 1a: Convert status column to text temporarily
ALTER TABLE requests ALTER COLUMN status TYPE text;

-- Step 1b: Backfill old values to new
UPDATE requests SET status = CASE
  WHEN status = 'draft'             THEN 'pendiente'
  WHEN status = 'pending_approval'  THEN 'pendiente'
  WHEN status = 'approved'          THEN 'pendiente'
  WHEN status = 'in_pool'           THEN 'pendiente'
  WHEN status = 'rfq_direct'        THEN 'pendiente'
  WHEN status = 'inventario'        THEN 'procesado_total'
  WHEN status = 'procesado_parcial' THEN 'procesado_parcial'
  WHEN status = 'rejected'          THEN 'rechazado'
  ELSE 'pendiente'
END;

-- Step 1c: Drop old enum
DROP TYPE IF EXISTS request_status;

-- Step 1d: Create new enum
CREATE TYPE request_status AS ENUM (
  'pendiente',
  'procesado_parcial',
  'procesado_total',
  'rechazado'
);

-- Step 1e: Cast column back to enum
ALTER TABLE requests
  ALTER COLUMN status TYPE request_status
  USING status::request_status;

-- Step 1f: Set default
ALTER TABLE requests
  ALTER COLUMN status SET DEFAULT 'pendiente'::request_status;

-- ============================================================
-- 2. New columns on requests
-- ============================================================

-- Drop old urgency varchar
ALTER TABLE requests DROP COLUMN IF EXISTS urgency;

-- Add new columns
ALTER TABLE requests ADD COLUMN urgente        boolean      NOT NULL DEFAULT false;
ALTER TABLE requests ADD COLUMN motivo_rechazo text;
ALTER TABLE requests ADD COLUMN nota_rechazo   text;
ALTER TABLE requests ADD COLUMN rechazado_at   timestamptz;
ALTER TABLE requests ADD COLUMN rechazado_by   uuid
  REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================
-- 3. request_items sub-states
-- ============================================================

-- Backfill existing items to 'sin_pedir'
UPDATE request_items SET status = 'sin_pedir';

-- Change default
ALTER TABLE request_items ALTER COLUMN status SET DEFAULT 'sin_pedir';

-- Add CHECK constraint for valid sub-states
ALTER TABLE request_items ADD CONSTRAINT chk_item_status
  CHECK (status IN ('sin_pedir', 'en_oc', 'parcial', 'recibido'));

-- Add tracking columns
ALTER TABLE request_items ADD COLUMN quantity_received numeric(12,3) NOT NULL DEFAULT 0
  CONSTRAINT chk_qty_received_positive CHECK (quantity_received >= 0);
ALTER TABLE request_items ADD COLUMN quantity_ordered  numeric(12,3) NOT NULL DEFAULT 0
  CONSTRAINT chk_qty_ordered_positive  CHECK (quantity_ordered >= 0);

-- ============================================================
-- 4. Create requerimiento_evento table
-- ============================================================

CREATE TABLE requerimiento_evento (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid         NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  created_by   uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  tipo         text         NOT NULL,
  descripcion  text,
  metadata     jsonb,
  CONSTRAINT chk_evento_tipo CHECK (
    tipo IN ('creado', 'pendiente', 'procesado_parcial', 'procesado_total',
             'rechazado', 'item_actualizado', 'nota')
  )
);

-- Index for timeline queries (request_id + created_at DESC)
CREATE INDEX idx_evento_request_timeline
  ON requerimiento_evento (request_id, created_at DESC);

-- ============================================================
-- 5. RLS policies for requerimiento_evento
-- ============================================================

ALTER TABLE requerimiento_evento ENABLE ROW LEVEL SECURITY;

-- SELECT: authenticated users whose company matches the request's company
CREATE POLICY "evento_select_company"
  ON requerimiento_evento
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM requests r
      JOIN profiles p ON p.company_id = r.company_id
      WHERE r.id = requerimiento_evento.request_id
        AND p.id = auth.uid()
    )
  );

-- INSERT: authenticated users whose company matches the request's company
CREATE POLICY "evento_insert_company"
  ON requerimiento_evento
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM requests r
      JOIN profiles p ON p.company_id = r.company_id
      WHERE r.id = requerimiento_evento.request_id
        AND p.id = auth.uid()
    )
  );

-- No UPDATE/DELETE policies: events are immutable

COMMIT;
