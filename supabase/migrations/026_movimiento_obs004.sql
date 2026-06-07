-- Migration: 026_movimiento_obs004
-- Description: OBS-004 — widens movimiento_producto.tipo to cover the missing
--              audit points: 'despacho' (salida depósito→obra), 'rechazo'
--              (material rechazado en recepción) y 'consolidacion' (ítem incluido
--              en una SC consolidada).
-- Safe: additive only — the new CHECK set is a strict superset of the 015 set;
--       no existing row violates it.
-- Apply in a low-traffic window: DROP+ADD CONSTRAINT takes a brief ACCESS EXCLUSIVE lock.

BEGIN;

ALTER TABLE movimiento_producto DROP CONSTRAINT IF EXISTS chk_mov_tipo;
ALTER TABLE movimiento_producto ADD CONSTRAINT chk_mov_tipo
  CHECK (tipo IN (
    'destino_asignado', 'oc_emitida', 'recepcion',
    'despacho', 'rechazo', 'consolidacion'
  ));

COMMENT ON COLUMN movimiento_producto.tipo IS
  'Movement type: destino_asignado | oc_emitida | recepcion | despacho | rechazo | consolidacion';

COMMIT;

-- ============================================================
-- ROLLBACK (run to revert migration 026)
-- ============================================================
-- BEGIN;
-- DELETE FROM movimiento_producto WHERE tipo IN ('despacho', 'rechazo', 'consolidacion');
-- ALTER TABLE movimiento_producto DROP CONSTRAINT IF EXISTS chk_mov_tipo;
-- ALTER TABLE movimiento_producto ADD CONSTRAINT chk_mov_tipo
--   CHECK (tipo IN ('destino_asignado', 'oc_emitida', 'recepcion'));
-- COMMIT;
