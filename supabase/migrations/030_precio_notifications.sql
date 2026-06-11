-- ================================================================
-- 030 — PRICE NOTIFICATION TRIGGERS + RPCs
-- SDD: gestion-consumos-fixes (Slice A / GAP1)
-- ================================================================
-- IMPORTANT: The two ALTER TYPE statements below MUST run OUTSIDE
-- a transaction block. PostgreSQL does not allow adding an enum
-- value and using it in the same transaction.
-- Pattern mirrors 002_notification_triggers.sql (line 7).
-- Run these first, alone, before the rest of this file.
-- ================================================================

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'precio_actualizado_por_proveedor';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'precio_editado_por_compras';

-- ================================================================
-- Everything below runs in a single transaction block.
-- ================================================================

BEGIN;

-- ----------------------------------------------------------------
-- HELPER NOTES (schema reality):
--   precio_proveedor: (id, company_id NULL=global, provider_id,
--     material_id, precio_unitario, unidad_medida, vigencia_desde,
--     vigencia_hasta, created_by, created_at)
--   notificaciones:   (id, company_id, user_id, type, message,
--     read, metadata jsonb, created_at)
--   user_roles:       (id, user_id, company_id, role)
--   provider_users:   (id, provider_id, user_id, active, created_at)
--   profiles:         (id, company_id, ...)
--   materials:        (id, name, ...)
--
-- Gating matrix (see design.md Decisión 2):
--   Provider single edit  | actor=NULL, batch=NULL → fn_updated notifies Compras
--   Provider bulk (RPC)   | actor=NULL, batch=SET  → fn_updated suppressed; RPC inserts 1 summary
--   Compras edit (RPC)    | actor='compras', batch=NULL → fn_edited notifies provider_users;
--                                                          fn_updated suppressed (actor='compras')
-- ----------------------------------------------------------------

-- ================================================================
-- 1. fn_notify_price_updated_by_provider
--    AFTER INSERT OR UPDATE FOR EACH ROW on precio_proveedor
--    Notifies Compras/admin of the company when a provider updates
--    their price list (single edit). Suppressed in bulk or Compras-edit.
-- ================================================================

CREATE OR REPLACE FUNCTION fn_notify_price_updated_by_provider()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_company_id  UUID;
  v_provider_name TEXT;
  v_message     TEXT;
  v_detail      TEXT;
  v_usr         RECORD;
BEGIN
  -- Gate 1: bulk batch — suppress (RPC inserts its own summary notification)
  IF current_setting('app.precio_batch', true) IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Gate 2: Compras actor — suppress (fn_notify_price_edited_by_compras handles it)
  IF current_setting('app.precio_actor', true) = 'compras' THEN
    RETURN NEW;
  END IF;

  -- Resolve company_id: use row value if set; otherwise resolve via created_by → profiles
  IF NEW.company_id IS NOT NULL THEN
    v_company_id := NEW.company_id;
  ELSE
    SELECT p.company_id INTO v_company_id
    FROM profiles p
    WHERE p.id = NEW.created_by;
  END IF;

  -- Nothing to notify if no company could be resolved
  IF v_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_provider_name FROM providers WHERE id = NEW.provider_id;
  v_provider_name := COALESCE(v_provider_name, 'Proveedor');

  v_message := format('Lista de precios actualizada por %s', v_provider_name);
  v_detail  := format('%s ha actualizado su lista de precios. Revisá los nuevos valores antes de tu próximo retiro.', v_provider_name);

  FOR v_usr IN
    SELECT user_id FROM user_roles
    WHERE company_id = v_company_id AND role IN ('compras', 'admin')
  LOOP
    INSERT INTO notificaciones (company_id, user_id, type, message, metadata)
    VALUES (
      v_company_id,
      v_usr.user_id,
      'precio_actualizado_por_proveedor',
      v_message,
      jsonb_build_object(
        'provider_id', NEW.provider_id,
        'detail_message', v_detail
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_price_updated_by_provider ON precio_proveedor;
CREATE TRIGGER trg_notify_price_updated_by_provider
  AFTER INSERT OR UPDATE ON precio_proveedor
  FOR EACH ROW EXECUTE FUNCTION fn_notify_price_updated_by_provider();

-- ================================================================
-- 2. fn_notify_price_edited_by_compras
--    AFTER UPDATE FOR EACH ROW on precio_proveedor
--    Notifies active provider_users when Compras edits a price.
--    Only fires when app.precio_actor = 'compras'.
--    Pattern mirrors fn_notify_po_issued (002:171).
-- ================================================================

CREATE OR REPLACE FUNCTION fn_notify_price_edited_by_compras()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_material_name TEXT;
  v_message       TEXT;
  v_detail        TEXT;
  v_usr           RECORD;
BEGIN
  -- Only fires when the Compras actor token is set
  IF current_setting('app.precio_actor', true) IS DISTINCT FROM 'compras' THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_material_name FROM materials WHERE id = NEW.material_id;
  v_material_name := COALESCE(v_material_name, 'Material');

  v_message := 'Compras actualizó un precio en tu lista';
  v_detail  := format('El área de compras modificó el precio de "%s" en tu lista de precios.', v_material_name);

  -- Zero active users = zero inserts, no error (same pattern as fn_notify_po_issued)
  FOR v_usr IN
    SELECT user_id FROM provider_users
    WHERE provider_id = NEW.provider_id AND active = TRUE
  LOOP
    INSERT INTO notificaciones (company_id, user_id, type, message, metadata)
    VALUES (
      NEW.company_id,
      v_usr.user_id,
      'precio_editado_por_compras',
      v_message,
      jsonb_build_object(
        'provider_id', NEW.provider_id,
        'material_codigo', v_material_name,
        'detail_message', v_detail
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_price_edited_by_compras ON precio_proveedor;
CREATE TRIGGER trg_notify_price_edited_by_compras
  AFTER UPDATE ON precio_proveedor
  FOR EACH ROW EXECUTE FUNCTION fn_notify_price_edited_by_compras();

-- ================================================================
-- 3. RPC: precio_proveedor_bulk_insert
--    Inserts all rows in a single transaction, sets the batch token
--    so per-row triggers are suppressed, then inserts ONE summary
--    notification to Compras/admin.
--    Returns jsonb: { inserted: int, rejected: [{reason, row}] }
-- ================================================================

CREATE OR REPLACE FUNCTION precio_proveedor_bulk_insert(
  p_rows       jsonb,
  p_provider_id uuid,
  p_company_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row           jsonb;
  v_material_id   uuid;
  v_inserted      int  := 0;
  v_rejected      jsonb := '[]'::jsonb;
  v_vigencia_desde date;
  v_vigencia_hasta date;
  v_precio        numeric(14,2);
  v_overlap       int;
  v_company_id    uuid;
  v_provider_name TEXT;
  v_message       TEXT;
  v_detail        TEXT;
  v_usr           RECORD;
BEGIN
  -- Set batch token (transaction-local): triggers read this and suppress per-row notifications
  PERFORM set_config('app.precio_batch', p_provider_id::text, true);

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    BEGIN
      -- material_id must already be resolved by the client (UUID)
      v_material_id   := (v_row->>'material_id')::uuid;
      v_precio        := (v_row->>'precio_unitario')::numeric(14,2);
      v_vigencia_desde := COALESCE((v_row->>'vigencia_desde')::date, CURRENT_DATE);
      v_vigencia_hasta := (v_row->>'vigencia_hasta')::date;  -- may be NULL

      -- Validate material exists
      IF NOT EXISTS (SELECT 1 FROM materials WHERE id = v_material_id) THEN
        v_rejected := v_rejected || jsonb_build_array(
          jsonb_build_object('reason', 'material_not_found', 'row', v_row)
        );
        CONTINUE;
      END IF;

      -- Check overlap: an open price already exists for this provider+material+scope
      -- (mirrors the unique index ux_precio_proveedor_vigente)
      SELECT COUNT(*) INTO v_overlap
      FROM precio_proveedor
      WHERE provider_id = p_provider_id
        AND material_id = v_material_id
        AND COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid)
            = COALESCE(p_company_id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND vigencia_hasta IS NULL
        AND v_vigencia_hasta IS NULL;

      IF v_overlap > 0 THEN
        v_rejected := v_rejected || jsonb_build_array(
          jsonb_build_object('reason', 'overlap', 'row', v_row)
        );
        CONTINUE;
      END IF;

      INSERT INTO precio_proveedor (
        company_id, provider_id, material_id,
        precio_unitario, unidad_medida,
        vigencia_desde, vigencia_hasta,
        created_by
      )
      VALUES (
        p_company_id,
        p_provider_id,
        v_material_id,
        v_precio,
        v_row->>'unidad_medida',
        v_vigencia_desde,
        v_vigencia_hasta,
        auth.uid()
      );

      v_inserted := v_inserted + 1;

    EXCEPTION WHEN OTHERS THEN
      v_rejected := v_rejected || jsonb_build_array(
        jsonb_build_object('reason', SQLERRM, 'row', v_row)
      );
    END;
  END LOOP;

  -- Insert ONE summary notification to Compras/admin (only if at least 1 row inserted)
  IF v_inserted > 0 THEN
    -- Resolve company for notification recipients
    v_company_id := p_company_id;
    IF v_company_id IS NULL THEN
      SELECT p.company_id INTO v_company_id
      FROM profiles p WHERE p.id = auth.uid();
    END IF;

    IF v_company_id IS NOT NULL THEN
      SELECT name INTO v_provider_name FROM providers WHERE id = p_provider_id;
      v_provider_name := COALESCE(v_provider_name, 'Proveedor');

      v_message := format('Lista de precios actualizada por %s', v_provider_name);
      v_detail  := format('%s cargó %s precio(s) nuevos en su lista de precios.', v_provider_name, v_inserted);

      FOR v_usr IN
        SELECT user_id FROM user_roles
        WHERE company_id = v_company_id AND role IN ('compras', 'admin')
      LOOP
        INSERT INTO notificaciones (company_id, user_id, type, message, metadata)
        VALUES (
          v_company_id,
          v_usr.user_id,
          'precio_actualizado_por_proveedor',
          v_message,
          jsonb_build_object(
            'provider_id', p_provider_id,
            'detail_message', v_detail
          )
        );
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'rejected', v_rejected
  );
END;
$$;

GRANT EXECUTE ON FUNCTION precio_proveedor_bulk_insert(jsonb, uuid, uuid) TO authenticated;

-- ================================================================
-- 4. RPC: precio_proveedor_edit
--    Sets the actor token (transaction-local) then applies a PATCH
--    update. The fn_notify_price_edited_by_compras trigger fires
--    automatically within the same transaction.
-- ================================================================

CREATE OR REPLACE FUNCTION precio_proveedor_edit(
  p_id    uuid,
  p_patch jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Set actor token (transaction-local): triggers read this to identify Compras edits
  PERFORM set_config('app.precio_actor', 'compras', true);

  UPDATE precio_proveedor
  SET
    precio_unitario  = COALESCE((p_patch->>'precio_unitario')::numeric(14,2), precio_unitario),
    unidad_medida    = COALESCE(p_patch->>'unidad_medida',   unidad_medida),
    vigencia_desde   = COALESCE((p_patch->>'vigencia_desde')::date, vigencia_desde),
    vigencia_hasta   = CASE
                         WHEN p_patch ? 'vigencia_hasta'
                         THEN (p_patch->>'vigencia_hasta')::date
                         ELSE vigencia_hasta
                       END
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION precio_proveedor_edit(uuid, jsonb) TO authenticated;

COMMIT;

-- ================================================================
-- ROLLBACK BLOCK (run manually to undo this migration)
-- NOTE: enum values (precio_actualizado_por_proveedor,
--       precio_editado_por_compras) CANNOT be removed from PostgreSQL
--       without a full catalog rebuild. They are harmless when unused.
-- ================================================================
/*
DROP TRIGGER IF EXISTS trg_notify_price_updated_by_provider ON precio_proveedor;
DROP FUNCTION IF EXISTS fn_notify_price_updated_by_provider();
DROP TRIGGER IF EXISTS trg_notify_price_edited_by_compras ON precio_proveedor;
DROP FUNCTION IF EXISTS fn_notify_price_edited_by_compras();
DROP FUNCTION IF EXISTS precio_proveedor_bulk_insert(jsonb, uuid, uuid);
DROP FUNCTION IF EXISTS precio_proveedor_edit(uuid, jsonb);
*/

-- ================================================================
-- MANUAL VERIFICATION CHECKLIST
-- Run each block in Supabase SQL Editor after applying this migration.
-- Record PASS/FAIL before merging PR 1.
-- ================================================================

/*
------------------------------------------------------------------------
SETUP: replace the UUIDs below with real values from your dev/staging DB.
------------------------------------------------------------------------
  :company_id     — a company that has compras/admin users
  :provider_id    — a provider linked to that company via provider_users
  :material_id    — a material that does NOT already have an open price
                    for this provider+company (to avoid overlap)
  :compras_uid    — user_id of a compras/admin user in :company_id
  :provider_uid   — user_id of an active provider_user for :provider_id
  :existing_precio_id — id of an existing precio_proveedor row

------------------------------------------------------------------------
CHECK 1 — Provider single INSERT (no batch token) → Compras notified
------------------------------------------------------------------------
-- Insert a price directly (simulates provider single-edit path)
INSERT INTO precio_proveedor
  (company_id, provider_id, material_id, precio_unitario, vigencia_desde, created_by)
VALUES
  (:company_id, :provider_id, :material_id, 100.00, CURRENT_DATE, :provider_uid);

-- Verify: exactly N rows in notificaciones for Compras/admin of :company_id
-- (N = count of compras/admin users in that company)
SELECT COUNT(*) AS notif_count
FROM notificaciones
WHERE type = 'precio_actualizado_por_proveedor'
  AND company_id = :company_id
  AND created_at >= NOW() - INTERVAL '1 minute';
-- Expected: N >= 1 (one per compras/admin user)

-- Verify type
SELECT type, message, metadata
FROM notificaciones
WHERE type = 'precio_actualizado_por_proveedor'
  AND company_id = :company_id
ORDER BY created_at DESC LIMIT 5;
-- Expected: type = 'precio_actualizado_por_proveedor'

------------------------------------------------------------------------
CHECK 2 — precio_proveedor_bulk_insert (10 rows) → exactly 1 notification
------------------------------------------------------------------------
-- Prepare 10 rows with distinct material_ids (must not overlap existing open prices)
-- Replace :mat_1 ... :mat_10 with real material UUIDs
SELECT precio_proveedor_bulk_insert(
  '[
    {"material_id":":mat_1","precio_unitario":10,"vigencia_desde":"2026-06-01"},
    {"material_id":":mat_2","precio_unitario":20,"vigencia_desde":"2026-06-01"},
    {"material_id":":mat_3","precio_unitario":30,"vigencia_desde":"2026-06-01"},
    {"material_id":":mat_4","precio_unitario":40,"vigencia_desde":"2026-06-01"},
    {"material_id":":mat_5","precio_unitario":50,"vigencia_desde":"2026-06-01"},
    {"material_id":":mat_6","precio_unitario":60,"vigencia_desde":"2026-06-01"},
    {"material_id":":mat_7","precio_unitario":70,"vigencia_desde":"2026-06-01"},
    {"material_id":":mat_8","precio_unitario":80,"vigencia_desde":"2026-06-01"},
    {"material_id":":mat_9","precio_unitario":90,"vigencia_desde":"2026-06-01"},
    {"material_id":":mat_10","precio_unitario":100,"vigencia_desde":"2026-06-01"}
  ]'::jsonb,
  ':provider_id'::uuid,
  ':company_id'::uuid
);
-- Expected return: {"inserted": 10, "rejected": []}

-- Verify exactly 1 summary notification (NOT 10)
SELECT COUNT(*) AS notif_count
FROM notificaciones
WHERE type = 'precio_actualizado_por_proveedor'
  AND company_id = :company_id
  AND created_at >= NOW() - INTERVAL '1 minute';
-- Expected: exactly 1 (per compras/admin user; if 2 compras users → 2 rows total,
--           NOT 20. The summary fires once per user, not once per inserted row.)

------------------------------------------------------------------------
CHECK 3 — precio_proveedor_bulk_insert return shape
------------------------------------------------------------------------
-- Run bulk insert with 1 valid + 1 bad material UUID
SELECT precio_proveedor_bulk_insert(
  '[
    {"material_id":":material_id","precio_unitario":55,"vigencia_desde":"2026-07-01"},
    {"material_id":"00000000-0000-0000-0000-000000000000","precio_unitario":99}
  ]'::jsonb,
  ':provider_id'::uuid,
  ':company_id'::uuid
) AS result;
-- Expected: {"inserted": 1, "rejected": [{"reason": "material_not_found", "row": {...}}]}

------------------------------------------------------------------------
CHECK 4 — precio_proveedor_edit (Compras actor) → provider notified;
          Compras NOT self-notified
------------------------------------------------------------------------
SELECT precio_proveedor_edit(
  ':existing_precio_id'::uuid,
  '{"precio_unitario": 199.99}'::jsonb
);

-- Verify provider_users notified
SELECT COUNT(*) AS provider_notif_count
FROM notificaciones
WHERE type = 'precio_editado_por_compras'
  AND created_at >= NOW() - INTERVAL '1 minute';
-- Expected: N = count of active provider_users for :provider_id

-- Verify Compras NOT notified via precio_actualizado_por_proveedor
SELECT COUNT(*) AS compras_notif_count
FROM notificaciones
WHERE type = 'precio_actualizado_por_proveedor'
  AND company_id = :company_id
  AND created_at >= NOW() - INTERVAL '1 minute';
-- Expected: 0 (actor='compras' suppresses fn_notify_price_updated_by_provider)

------------------------------------------------------------------------
CHECK 5 — precio_proveedor_edit on provider with 0 active provider_users
------------------------------------------------------------------------
-- Insert a price for a provider that has NO active provider_users
-- (or temporarily set active=FALSE for all provider_users of :provider_id)
UPDATE provider_users SET active = FALSE WHERE provider_id = :provider_id;

SELECT precio_proveedor_edit(
  ':existing_precio_id'::uuid,
  '{"precio_unitario": 150.00}'::jsonb
);
-- Expected: no error; 0 new rows in notificaciones for precio_editado_por_compras

-- Restore
UPDATE provider_users SET active = TRUE WHERE provider_id = :provider_id;

------------------------------------------------------------------------
CHECK 6 — Provider direct UPDATE (no actor token) → fn_edited_by_compras does NOT fire
------------------------------------------------------------------------
UPDATE precio_proveedor
SET precio_unitario = 77.00
WHERE id = ':existing_precio_id';

SELECT COUNT(*) AS should_be_zero
FROM notificaciones
WHERE type = 'precio_editado_por_compras'
  AND created_at >= NOW() - INTERVAL '30 seconds';
-- Expected: 0 (no actor token set → trigger exits early)

-- BUT fn_updated_by_provider DID fire (provider→Compras)
SELECT COUNT(*) AS should_be_positive
FROM notificaciones
WHERE type = 'precio_actualizado_por_proveedor'
  AND created_at >= NOW() - INTERVAL '30 seconds';
-- Expected: >= 1

------------------------------------------------------------------------
CHECK 7 — Migration 002 triggers not regressed
------------------------------------------------------------------------
-- Verify fn_notify_po_issued still exists and fires (do a real PO insert
-- in a staging env or just check the function exists):
SELECT proname, prosecdef
FROM pg_proc
WHERE proname IN (
  'fn_notify_po_issued',
  'fn_notify_quote_received',
  'fn_notify_request',
  'fn_notify_rfq_sent',
  'fn_notify_price_updated_by_provider',
  'fn_notify_price_edited_by_compras'
);
-- Expected: all 6 rows present, prosecdef = true for all

------------------------------------------------------------------------
CHECK 8 — Enum values present
------------------------------------------------------------------------
SELECT enumlabel
FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'notification_type'
ORDER BY enumsortorder;
-- Expected: includes 'precio_actualizado_por_proveedor'
--           AND 'precio_editado_por_compras'
*/
