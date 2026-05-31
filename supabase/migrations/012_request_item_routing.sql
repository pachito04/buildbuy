-- Migration: 012_request_item_routing
-- Description: Add `routing` column to request_items (PROCUREMENT routing: how each
--              item is obtained — from inventory, via quotation, or direct order).
--              This is orthogonal to delivery location (deposito|obra), which is a
--              separate `delivery_target` field owned by the future consolidacion change.
--              Also reconciles the requerimiento_evento.tipo CHECK with every tipo the
--              code inserts: adds 'procesado' (this change) plus 'en_curso'/'recibido'/
--              'solicitud_cotizacion' which were silently rejected since migration 005
--              renamed the request_status enum without updating this constraint.
--              Existing request_items rows inherit 'pendiente' from the column DEFAULT.
--
-- Rollback:
--   ALTER TABLE request_items DROP COLUMN routing;
--   ALTER TABLE requerimiento_evento DROP CONSTRAINT chk_evento_tipo;
--   ALTER TABLE requerimiento_evento ADD CONSTRAINT chk_evento_tipo
--     CHECK (tipo IN ('creado','pendiente','procesado_parcial','procesado_total',
--                     'rechazado','item_actualizado','nota','recepcion_obra'));
--
-- Manual verification checklist:
--   1. SELECT routing, COUNT(*) FROM request_items GROUP BY routing;
--      -> All existing rows should show 'pendiente' with total count matching pre-migration count.
--   2. INSERT INTO request_items (...) VALUES (...) — omit routing
--      -> Row should default to 'pendiente'.
--   3. INSERT INTO request_items (..., routing) VALUES (..., 'foo')
--      -> Should fail with check constraint violation.
--   4. INSERT INTO requerimiento_evento (request_id, tipo) VALUES ('<id>', 'procesado')
--      -> Should succeed (previously rejected by chk_evento_tipo).

BEGIN;

-- 1. Per-item procurement routing
ALTER TABLE request_items
  ADD COLUMN routing text NOT NULL DEFAULT 'pendiente';

ALTER TABLE request_items
  ADD CONSTRAINT chk_item_routing
  CHECK (routing IN ('inventario', 'cotizacion', 'orden_directa', 'pendiente'));

-- 2. Reconcile chk_evento_tipo with EVERY tipo the codebase actually inserts.
-- This CHECK had drifted: migration 005 renamed request_status values
-- (procesado_parcial→en_curso, procesado_total→recibido) but never updated this
-- constraint, so status-transition events with tipo 'en_curso'/'recibido' — and
-- 'solicitud_cotizacion' (SolicitudDirectaDialog) — were being SILENTLY rejected
-- (the inserts don't check errors). We add those here alongside 'procesado'.
-- 'procesado_parcial'/'procesado_total' are kept so the ADD CONSTRAINT does not
-- fail validation on historical rows that still hold the pre-005 literals.
-- Full producer map: creado(CreateRequestDialog), pendiente/en_curso/recibido/
-- rechazado(recalcRequestStatus+useStatusTransition, dynamic newStatus),
-- recepcion_obra+procesado_total(useItemRecepcion), rechazado(useRejectionMutation),
-- solicitud_cotizacion(SolicitudDirectaDialog), procesado(SurtidoDialog).
ALTER TABLE requerimiento_evento DROP CONSTRAINT chk_evento_tipo;
ALTER TABLE requerimiento_evento ADD CONSTRAINT chk_evento_tipo
  CHECK (tipo IN ('creado', 'pendiente', 'en_curso', 'recibido',
                  'procesado_parcial', 'procesado_total', 'rechazado',
                  'item_actualizado', 'nota', 'recepcion_obra',
                  'solicitud_cotizacion', 'procesado'));

COMMIT;
