-- Migration: 024_consolidacion_fixes
-- Description: Enables the anti-double-consolidation lock and the consolidation event.
--   1) request_items.status: adds 'en_consolidacion' to CHECK chk_item_status.
--   2) requerimiento_evento.tipo: adds 'consolidado' to CHECK chk_evento_tipo.
--   3) Function create_consolidated_rfq: atomic RPC that wraps all 6 steps in one
--      transaction (INSERT rfqs → rfq_items → rfq_item_sources → rfq_requests →
--      UPDATE request_items to 'en_consolidacion' → INSERT requerimiento_evento).
-- Safe: additive only — no existing value is removed; no historical row violates the
--       new (superset) constraint sets.
--
-- Rollback block commented at the bottom.
-- Apply in a low-traffic window: DROP+ADD CONSTRAINT takes a brief ACCESS EXCLUSIVE lock.

BEGIN;

-- ============================================================
-- 1. request_items.status += 'en_consolidacion'  (lock — GAP 1)
-- ============================================================
-- DROP IF EXISTS makes the migration re-runnable without error.
ALTER TABLE request_items DROP CONSTRAINT IF EXISTS chk_item_status;
ALTER TABLE request_items ADD CONSTRAINT chk_item_status
  CHECK (status IN ('sin_pedir', 'en_oc', 'parcial', 'recibido', 'en_consolidacion'));

-- ============================================================
-- 2. requerimiento_evento.tipo += 'consolidado'  (event — GAP 2)
-- ============================================================
-- 012_request_item_routing.sql is the last migration that rewrote this constraint.
-- The new set is a strict superset of the 012 set.
ALTER TABLE requerimiento_evento DROP CONSTRAINT IF EXISTS chk_evento_tipo;
ALTER TABLE requerimiento_evento ADD CONSTRAINT chk_evento_tipo
  CHECK (tipo IN ('creado', 'pendiente', 'en_curso', 'recibido',
                  'procesado_parcial', 'procesado_total', 'rechazado',
                  'item_actualizado', 'nota', 'recepcion_obra',
                  'solicitud_cotizacion', 'procesado', 'consolidado'));

-- ============================================================
-- 3. Function create_consolidated_rfq
-- ============================================================
-- Wraps all consolidation write steps in a single plpgsql transaction.
-- SECURITY INVOKER: RLS policies from migration 016 already govern INSERT on
-- rfqs, rfq_items, rfq_item_sources, rfq_requests; the calling user's policies
-- apply transparently (same pattern as the client-side inserts it replaces).
--
-- p_lines shape:
--   [
--     {
--       "material_id":     "<uuid>",
--       "description":     "<string>",
--       "unit":            "<string>",
--       "total_quantity":  <number>,
--       "sources": [
--         { "request_item_id": "<uuid>", "request_id": "<uuid>", "quantity": <number> }
--       ]
--     }
--   ]
CREATE OR REPLACE FUNCTION create_consolidated_rfq(
  p_company_id  uuid,
  p_created_by  uuid,
  p_lines       jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_rfq_id      uuid;
  v_line        jsonb;
  v_source      jsonb;
  v_rfq_item_id uuid;
BEGIN
  -- Validate inputs
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'p_company_id is required';
  END IF;
  IF p_created_by IS NULL THEN
    RAISE EXCEPTION 'p_created_by is required';
  END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'p_lines must contain at least one line';
  END IF;

  -- Step 1: INSERT rfqs
  INSERT INTO rfqs (company_id, created_by, status, rfq_type)
    VALUES (p_company_id, p_created_by, 'sent', 'consolidated')
    RETURNING id INTO v_rfq_id;

  -- Steps 2 + 3: INSERT rfq_items and rfq_item_sources, one line at a time
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    INSERT INTO rfq_items (rfq_id, description, quantity, unit, material_id)
      VALUES (
        v_rfq_id,
        v_line->>'description',
        (v_line->>'total_quantity')::numeric,
        v_line->>'unit',
        (v_line->>'material_id')::uuid
      )
      RETURNING id INTO v_rfq_item_id;

    FOR v_source IN SELECT * FROM jsonb_array_elements(v_line->'sources')
    LOOP
      INSERT INTO rfq_item_sources (rfq_item_id, request_item_id, request_id, quantity)
        VALUES (
          v_rfq_item_id,
          (v_source->>'request_item_id')::uuid,
          (v_source->>'request_id')::uuid,
          (v_source->>'quantity')::numeric
        );
    END LOOP;
  END LOOP;

  -- Step 4: INSERT rfq_requests (one per distinct request_id)
  INSERT INTO rfq_requests (rfq_id, request_id)
  SELECT DISTINCT v_rfq_id,
         (s->>'request_id')::uuid
  FROM jsonb_array_elements(p_lines) l,
       jsonb_array_elements(l->'sources') s;

  -- Step 5: Lock source items (guarded — only items still 'sin_pedir' are updated;
  -- items already locked by a race condition are silently skipped rather than erroring)
  UPDATE request_items
    SET status = 'en_consolidacion'
   WHERE id IN (
     SELECT (s->>'request_item_id')::uuid
     FROM jsonb_array_elements(p_lines) l,
          jsonb_array_elements(l->'sources') s
   )
   AND status = 'sin_pedir';

  -- Step 6: INSERT requerimiento_evento — one per distinct request_id
  INSERT INTO requerimiento_evento (request_id, tipo, descripcion, metadata, created_by)
  SELECT DISTINCT
         (s->>'request_id')::uuid,
         'consolidado',
         'Ítem incluido en solicitud de cotización consolidada',
         jsonb_build_object('rfq_id', v_rfq_id),
         p_created_by
  FROM jsonb_array_elements(p_lines) l,
       jsonb_array_elements(l->'sources') s;

  RETURN v_rfq_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_consolidated_rfq(uuid, uuid, jsonb) TO authenticated;

COMMIT;

-- ============================================================
-- ROLLBACK (run to revert migration 024)
-- ============================================================
-- Steps must normalize data first so the stricter constraint can be re-added.
--
-- BEGIN;
--
-- -- Remove events inserted with the new tipo before restoring strict constraint
-- DELETE FROM requerimiento_evento WHERE tipo = 'consolidado';
--
-- -- Return locked items to sin_pedir before restoring strict constraint
-- UPDATE request_items SET status = 'sin_pedir' WHERE status = 'en_consolidacion';
--
-- -- Drop the RPC
-- DROP FUNCTION IF EXISTS create_consolidated_rfq(uuid, uuid, jsonb);
--
-- -- Restore original chk_item_status (4-value set from 004_kanban_requerimientos.sql)
-- ALTER TABLE request_items DROP CONSTRAINT IF EXISTS chk_item_status;
-- ALTER TABLE request_items ADD CONSTRAINT chk_item_status
--   CHECK (status IN ('sin_pedir', 'en_oc', 'parcial', 'recibido'));
--
-- -- Restore original chk_evento_tipo (12-value set from 012_request_item_routing.sql)
-- ALTER TABLE requerimiento_evento DROP CONSTRAINT IF EXISTS chk_evento_tipo;
-- ALTER TABLE requerimiento_evento ADD CONSTRAINT chk_evento_tipo
--   CHECK (tipo IN ('creado', 'pendiente', 'en_curso', 'recibido',
--                   'procesado_parcial', 'procesado_total', 'rechazado',
--                   'item_actualizado', 'nota', 'recepcion_obra',
--                   'solicitud_cotizacion', 'procesado'));
--
-- COMMIT;

-- ============================================================
-- Manual verification checklist (record in PR)
-- ============================================================
-- [ ] INSERT INTO request_items (..., status) VALUES (..., 'en_consolidacion')
--     -> succeeds without constraint violation
-- [ ] INSERT INTO requerimiento_evento (..., tipo) VALUES (..., 'consolidado')
--     -> succeeds without constraint violation
-- [ ] SELECT create_consolidated_rfq('<company_id>', '<user_id>', '[{"material_id":"...","description":"...","unit":"u","total_quantity":1,"sources":[{"request_item_id":"...","request_id":"...","quantity":1}]}]')
--     -> returns a UUID; SELECT status FROM request_items WHERE id = '<request_item_id>' -> 'en_consolidacion'
-- [ ] Rollback script: UPDATE request_items SET status = 'sin_pedir' WHERE status = 'en_consolidacion'
--     -> succeeds; DROP CONSTRAINT + ADD CONSTRAINT with original 4-value set -> no validation failure
