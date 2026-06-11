-- Migration: 028_pool_schema
-- Description: Pool de Compras schema extensions — Slice 0 DDL.
--   1. award_mode column on purchase_pools (text CHECK 'leader'|'per_company', default 'leader').
--   2. pool_number correlative sequence + column + backfill + NOT NULL + UNIQUE. Pattern: 025.
--   3. chk_evento_tipo rewrite: DROP IF EXISTS + 14-value set (024 authoritative 13 + 'pool_joined').
--   4. Table pool_company_awards + RLS. Grain: (pool_id, company_id, rfq_item_id).
--   5. Table pool_providers (manual per-pool provider selection) + RLS write-own-company.
--   6. Policy pool_companies_own_delete (withdraw path — GAP4).
--   7. Trigger pool_companies_link_guard BEFORE INSERT on pool_companies (GAP1).
--   8. Trigger purchase_pools_award_mode_lock BEFORE UPDATE on purchase_pools (GAP2).
--   9. Trigger purchase_pools_state_guard BEFORE UPDATE on purchase_pools (GAP4).
--  10. Trigger pool_companies_withdraw_guard BEFORE DELETE on pool_companies (GAP4).
--  Note: pool_requests ALREADY has UNIQUE(pool_id, request_id) from 001_initial_schema — no change needed.
--
-- Sequential dependency: none (first migration in Slice 0).
-- Safe to re-run: IF NOT EXISTS / IF EXISTS guards throughout.
--
-- Apply in a low-traffic window: DROP+ADD CONSTRAINT takes a brief ACCESS EXCLUSIVE lock.
--
-- Rollback block commented at the bottom.

BEGIN;

-- ============================================================
-- 1. purchase_pools.award_mode — Mode A/B flag (GAP2)
-- ============================================================
-- Default 'leader' means all existing pools inherit Mode A unchanged.
-- Immutability after 'borrador' enforced by trigger below.
ALTER TABLE purchase_pools
  ADD COLUMN IF NOT EXISTS award_mode text NOT NULL DEFAULT 'leader'
  CHECK (award_mode IN ('leader', 'per_company'));

COMMENT ON COLUMN purchase_pools.award_mode IS
  'Adjudication mode. ''leader'' = single winner (Mode A, default). '
  '''per_company'' = each company picks its own winner per rfq_item (Mode B). '
  'Immutable once pool_state leaves ''borrador''.';

-- ============================================================
-- 2. purchase_pools.pool_number — correlative sequence (GAP5)
-- ============================================================
-- Exact pattern of migration 025 (rfq_number).
-- Step 2a: Create the sequence.
CREATE SEQUENCE IF NOT EXISTS purchase_pools_pool_number_seq;

-- Step 2b: Add column nullable first so backfill can run before NOT NULL.
ALTER TABLE purchase_pools ADD COLUMN IF NOT EXISTS pool_number bigint;

-- Step 2c: Backfill existing rows ordered by creation date.
--   row_number() assigns 1-based sequential numbers; only updates rows
--   that still have pool_number IS NULL so re-runs are idempotent.
UPDATE purchase_pools
SET pool_number = sub.rn
FROM (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM purchase_pools
) sub
WHERE purchase_pools.id = sub.id
  AND purchase_pools.pool_number IS NULL;

-- Step 2d: Advance the sequence past the highest existing value.
--   COALESCE handles the empty-table case gracefully.
SELECT setval('purchase_pools_pool_number_seq', COALESCE((SELECT MAX(pool_number) FROM purchase_pools), 0));

-- Step 2e: Wire up the sequence as the column default.
ALTER TABLE purchase_pools ALTER COLUMN pool_number SET DEFAULT nextval('purchase_pools_pool_number_seq');

-- Step 2f: Enforce NOT NULL now that all rows have a value.
ALTER TABLE purchase_pools ALTER COLUMN pool_number SET NOT NULL;

-- Step 2g: Unique index for integrity and fast lookups.
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_pools_pool_number ON purchase_pools(pool_number);

COMMENT ON COLUMN purchase_pools.pool_number IS
  'Correlative human-readable identifier for each pool (e.g. Pool #3). '
  'Assigned by sequence at INSERT time. Never changes.';

-- ============================================================
-- 3. requerimiento_evento.chk_evento_tipo += 'pool_joined' (GAP5)
-- ============================================================
-- Authoritative base set: 13 values from 024_consolidacion_fixes.sql.
-- DROP IF EXISTS makes this re-runnable.
-- The new 14-value set is a strict superset — no existing row violates it.
ALTER TABLE requerimiento_evento DROP CONSTRAINT IF EXISTS chk_evento_tipo;
ALTER TABLE requerimiento_evento ADD CONSTRAINT chk_evento_tipo
  CHECK (tipo IN (
    'creado', 'pendiente', 'en_curso', 'recibido',
    'procesado_parcial', 'procesado_total', 'rechazado',
    'item_actualizado', 'nota', 'recepcion_obra',
    'solicitud_cotizacion', 'procesado', 'consolidado',
    'pool_joined'
  ));

-- ============================================================
-- 4. Table pool_company_awards (GAP2 — Mode B)
-- ============================================================
-- Grain: (pool_id, company_id, rfq_item_id) → winning_quote_item_id.
-- Each company records which quote_item it selects per rfq_item in the SC.
-- Guarded by UNIQUE so UPSERT is safe.
-- RLS: member-read (non-confidential — selection already visible via 019),
--       write-own-company (a company can only write its own awards).

CREATE TABLE IF NOT EXISTS pool_company_awards (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id               uuid NOT NULL REFERENCES purchase_pools(id) ON DELETE CASCADE,
  company_id            uuid NOT NULL REFERENCES companies(id)      ON DELETE CASCADE,
  rfq_item_id           uuid NOT NULL REFERENCES rfq_items(id)      ON DELETE CASCADE,
  winning_quote_item_id uuid NOT NULL REFERENCES quote_items(id)    ON DELETE CASCADE,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pool_id, company_id, rfq_item_id)
);

COMMENT ON TABLE pool_company_awards IS
  'Per-company per-rfq_item winner selection for Mode B pools (award_mode=''per_company''). '
  'Not used in Mode A — winning_quote_id on purchase_pools is authoritative for Mode A. '
  'Member-wide read: award selections are non-confidential (quote_items already visible by 019).';

CREATE INDEX IF NOT EXISTS idx_pool_company_awards_pool
  ON pool_company_awards (pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_company_awards_pool_company
  ON pool_company_awards (pool_id, company_id);

ALTER TABLE pool_company_awards ENABLE ROW LEVEL SECURITY;

-- SELECT: any pool member can see all award rows (needed to compute "all done" progress).
-- Justification: 018 declares contributions non-confidential; 019 already exposes
-- quote_items to all members. This only reveals "company X picked quote_item Y" —
-- the underlying request/price details (pool_requests) remain isolated.
CREATE POLICY "pool_company_awards_member_select"
  ON pool_company_awards FOR SELECT TO authenticated
  USING ( is_pool_member(pool_company_awards.pool_id) );

-- INSERT: pool member, own company only.
CREATE POLICY "pool_company_awards_own_insert"
  ON pool_company_awards FOR INSERT TO authenticated
  WITH CHECK (
    is_pool_member(pool_company_awards.pool_id)
    AND company_id = (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid())
  );

-- UPDATE: pool member, own company only (UPSERT path).
CREATE POLICY "pool_company_awards_own_update"
  ON pool_company_awards FOR UPDATE TO authenticated
  USING (
    is_pool_member(pool_company_awards.pool_id)
    AND company_id = (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid())
  )
  WITH CHECK (
    is_pool_member(pool_company_awards.pool_id)
    AND company_id = (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid())
  );

-- DELETE: pool member, own company only.
CREATE POLICY "pool_company_awards_own_delete"
  ON pool_company_awards FOR DELETE TO authenticated
  USING (
    is_pool_member(pool_company_awards.pool_id)
    AND company_id = (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid())
  );

-- ============================================================
-- 5. Table pool_providers (GAP3 — manual provider selection)
-- ============================================================
-- Each company marks which of ITS own providers (+ globals) to bring to THIS pool.
-- Grain: (pool_id, provider_id, selected_by_company_id) — a company can mark a
-- provider once per pool. Two companies can mark the same global provider;
-- deduplication into rfq_providers happens at dispatch time (RPC in 029).
--
-- RLS: member-read (consolidated selection visible to all members — deliberate
--       collaboration, not a leak of private provider lists); write-own-company only,
--       and only for providers the company is eligible to select (own or global).

CREATE TABLE IF NOT EXISTS pool_providers (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id                uuid NOT NULL REFERENCES purchase_pools(id) ON DELETE CASCADE,
  provider_id            uuid NOT NULL REFERENCES providers(id)      ON DELETE CASCADE,
  selected_by_company_id uuid NOT NULL REFERENCES companies(id)      ON DELETE CASCADE,
  created_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  -- A company marks a given provider for a given pool exactly once.
  -- Two different companies CAN mark the same provider (e.g. a global one).
  UNIQUE (pool_id, provider_id, selected_by_company_id)
);

COMMENT ON TABLE pool_providers IS
  'Manual per-pool provider selection. Each company marks which of its own providers '
  '(or global providers with company_id IS NULL) it brings to this specific pool. '
  'The union is deduplicated into rfq_providers at dispatch time via pool_dispatch_providers RPC. '
  'rfq_providers MUST NOT record which company contributed each provider (confidentiality).';

CREATE INDEX IF NOT EXISTS idx_pool_providers_pool
  ON pool_providers (pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_providers_pool_company
  ON pool_providers (pool_id, selected_by_company_id);

ALTER TABLE pool_providers ENABLE ROW LEVEL SECURITY;

-- SELECT: any pool member sees the consolidated selection.
-- This reveals "company X selected provider Y for this pool" — accepted because
-- enabling a provider for a shared pool is a deliberate collaborative act, not a
-- leak of the company's full private provider list. The attribute can be hidden in
-- the UI without changing the schema if the business later decides differently.
CREATE POLICY "pool_providers_member_select"
  ON pool_providers FOR SELECT TO authenticated
  USING ( is_pool_member(pool_providers.pool_id) );

-- INSERT: pool member, own company only, AND the provider must be eligible for that company
-- (own provider with company_id = caller's company, or global with company_id IS NULL).
-- This replicates the providers_tenant RLS eligibility check.
CREATE POLICY "pool_providers_own_insert"
  ON pool_providers FOR INSERT TO authenticated
  WITH CHECK (
    is_pool_member(pool_providers.pool_id)
    AND selected_by_company_id = (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM providers pr
      WHERE pr.id = pool_providers.provider_id
        AND (
          pr.company_id = pool_providers.selected_by_company_id
          OR pr.company_id IS NULL
        )
    )
  );

-- DELETE: pool member, own company's selection only.
-- No UPDATE policy: the selection is add/remove (insert/delete), not mutation.
CREATE POLICY "pool_providers_own_delete"
  ON pool_providers FOR DELETE TO authenticated
  USING (
    is_pool_member(pool_providers.pool_id)
    AND selected_by_company_id = (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid())
  );

-- ============================================================
-- 6. pool_companies_own_delete policy (GAP4 — withdraw)
-- ============================================================
-- 018 defined: member_select / owner_insert / own_update.
-- DELETE was not defined. Adding it now so members can withdraw from a pool.
-- The withdraw_guard trigger (below) enforces the pool_state='borrador' precondition.
CREATE POLICY "pool_companies_own_delete"
  ON pool_companies FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = pool_companies.company_id
    )
  );

-- ============================================================
-- 7. Trigger: pool_companies_link_guard (GAP1 — invitation guard)
-- ============================================================
-- BEFORE INSERT on pool_companies.
-- Enforces: the invited company must have an active company_links entry with
-- the pool-owning company. The owner inviting itself (self-join) is allowed.
-- BEFORE INSERT only — existing rows are never retroactively invalidated.

CREATE OR REPLACE FUNCTION pool_companies_link_guard()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  -- Resolve the pool owner.
  SELECT company_id INTO v_owner
  FROM purchase_pools
  WHERE id = NEW.pool_id;

  -- The pool owner can always add itself (no link required for self-join).
  IF NEW.company_id = v_owner THEN
    RETURN NEW;
  END IF;

  -- Any other company requires an active company_links entry with the pool owner.
  IF NOT EXISTS (
    SELECT 1 FROM company_links cl
    WHERE cl.status = 'active'
      AND (
        (cl.requester_company_id = v_owner AND cl.target_company_id = NEW.company_id)
        OR
        (cl.target_company_id   = v_owner AND cl.requester_company_id = NEW.company_id)
      )
  ) THEN
    RAISE EXCEPTION 'No se puede agregar una empresa sin vínculo activo con la empresa creadora del pool.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pool_companies_link_guard ON pool_companies;
CREATE TRIGGER trg_pool_companies_link_guard
  BEFORE INSERT ON pool_companies
  FOR EACH ROW EXECUTE FUNCTION pool_companies_link_guard();

-- ============================================================
-- 8. Trigger: purchase_pools_award_mode_lock (GAP2)
-- ============================================================
-- BEFORE UPDATE on purchase_pools.
-- Prevents changing award_mode once the pool has left 'borrador'.
-- Combined in the same trigger function with state_guard (section 9) via
-- two separate BEFORE UPDATE triggers — PostgreSQL fires them in creation order.

CREATE OR REPLACE FUNCTION purchase_pools_award_mode_lock()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.award_mode IS DISTINCT FROM OLD.award_mode
     AND OLD.pool_state <> 'borrador'
  THEN
    RAISE EXCEPTION 'award_mode no puede cambiarse una vez que el pool dejó borrador.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_pools_award_mode_lock ON purchase_pools;
CREATE TRIGGER trg_purchase_pools_award_mode_lock
  BEFORE UPDATE ON purchase_pools
  FOR EACH ROW EXECUTE FUNCTION purchase_pools_award_mode_lock();

-- ============================================================
-- 9. Trigger: purchase_pools_state_guard (GAP4)
-- ============================================================
-- BEFORE UPDATE on purchase_pools.
-- Blocks transitioning pool_state to 'cancelado' from 'cerrado' or 'cancelado'.
-- (A closed pool cannot be cancelled; an already-cancelled pool is idempotent-safe
-- but the spec wants an explicit error rather than a silent no-op.)

CREATE OR REPLACE FUNCTION purchase_pools_state_guard()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.pool_state = 'cancelado'
     AND OLD.pool_state IN ('cerrado', 'cancelado')
  THEN
    RAISE EXCEPTION 'No se puede cancelar un pool en estado ''%''.', OLD.pool_state
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_pools_state_guard ON purchase_pools;
CREATE TRIGGER trg_purchase_pools_state_guard
  BEFORE UPDATE ON purchase_pools
  FOR EACH ROW EXECUTE FUNCTION purchase_pools_state_guard();

-- ============================================================
-- 10. Trigger: pool_companies_withdraw_guard (GAP4)
-- ============================================================
-- BEFORE DELETE on pool_companies.
-- Prevents a member from withdrawing unless the pool is still in 'borrador'.

CREATE OR REPLACE FUNCTION pool_companies_withdraw_guard()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_state text;
BEGIN
  SELECT pool_state INTO v_state
  FROM purchase_pools
  WHERE id = OLD.pool_id;

  IF v_state <> 'borrador' THEN
    RAISE EXCEPTION 'Solo se puede retirar de un pool en borrador. Estado actual: ''%''.', v_state
      USING ERRCODE = 'P0001';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_pool_companies_withdraw_guard ON pool_companies;
CREATE TRIGGER trg_pool_companies_withdraw_guard
  BEFORE DELETE ON pool_companies
  FOR EACH ROW EXECUTE FUNCTION pool_companies_withdraw_guard();

COMMIT;

-- ============================================================
-- ROLLBACK (run to revert migration 028 — execute as a transaction)
-- ============================================================
-- BEGIN;
--
-- -- 10. Drop withdraw guard
-- DROP TRIGGER IF EXISTS trg_pool_companies_withdraw_guard ON pool_companies;
-- DROP FUNCTION IF EXISTS pool_companies_withdraw_guard();
--
-- -- 9. Drop state guard
-- DROP TRIGGER IF EXISTS trg_purchase_pools_state_guard ON purchase_pools;
-- DROP FUNCTION IF EXISTS purchase_pools_state_guard();
--
-- -- 8. Drop award_mode lock
-- DROP TRIGGER IF EXISTS trg_purchase_pools_award_mode_lock ON purchase_pools;
-- DROP FUNCTION IF EXISTS purchase_pools_award_mode_lock();
--
-- -- 7. Drop link guard
-- DROP TRIGGER IF EXISTS trg_pool_companies_link_guard ON pool_companies;
-- DROP FUNCTION IF EXISTS pool_companies_link_guard();
--
-- -- 6. Drop pool_companies_own_delete policy
-- DROP POLICY IF EXISTS "pool_companies_own_delete" ON pool_companies;
--
-- -- 5. Drop pool_providers
-- DROP TABLE IF EXISTS pool_providers CASCADE;
--
-- -- 4. Drop pool_company_awards
-- DROP TABLE IF EXISTS pool_company_awards CASCADE;
--
-- -- 3. Restore chk_evento_tipo to the authoritative 024 13-value set
-- --    (only safe if no 'pool_joined' events were inserted yet)
-- ALTER TABLE requerimiento_evento DROP CONSTRAINT IF EXISTS chk_evento_tipo;
-- ALTER TABLE requerimiento_evento ADD CONSTRAINT chk_evento_tipo
--   CHECK (tipo IN (
--     'creado', 'pendiente', 'en_curso', 'recibido',
--     'procesado_parcial', 'procesado_total', 'rechazado',
--     'item_actualizado', 'nota', 'recepcion_obra',
--     'solicitud_cotizacion', 'procesado', 'consolidado'
--   ));
--
-- -- 2. Drop pool_number (only safe if clients no longer reference the column)
-- DROP INDEX IF EXISTS idx_purchase_pools_pool_number;
-- ALTER TABLE purchase_pools ALTER COLUMN pool_number DROP DEFAULT;
-- ALTER TABLE purchase_pools DROP COLUMN IF EXISTS pool_number;
-- DROP SEQUENCE IF EXISTS purchase_pools_pool_number_seq;
--
-- -- 1. Drop award_mode
-- ALTER TABLE purchase_pools DROP COLUMN IF EXISTS award_mode;
--
-- COMMIT;

-- ============================================================
-- Manual verification checklist (record in PR before merging)
-- ============================================================
--
-- === award_mode ===
-- [ ] INSERT INTO purchase_pools (company_id, created_by, name) VALUES (...) RETURNING award_mode;
--     -> 'leader' (default confirmed)
-- [ ] INSERT INTO purchase_pools (..., award_mode) VALUES (..., 'per_company') -> succeeds
-- [ ] INSERT INTO purchase_pools (..., award_mode) VALUES (..., 'invalid') -> CHECK violation
-- [ ] UPDATE purchase_pools SET award_mode = 'per_company' WHERE pool_state = 'borrador' -> succeeds
-- [ ] UPDATE purchase_pools SET award_mode = 'leader' WHERE pool_state = 'confirmado'
--     -> RAISES 'award_mode no puede cambiarse...'
--
-- === pool_number ===
-- [ ] SELECT pool_number FROM purchase_pools LIMIT 10;
--     -> all existing rows have a non-null integer value
-- [ ] INSERT INTO purchase_pools (...) RETURNING pool_number;
--     -> NOT NULL integer, higher than all previous values
-- [ ] Two concurrent inserts produce distinct pool_number values
-- [ ] SELECT indexname FROM pg_indexes WHERE tablename = 'purchase_pools' AND indexname = 'idx_purchase_pools_pool_number';
--     -> 1 row (UNIQUE index present)
-- [ ] INSERT a second purchase_pools row with the same pool_number (via manual override) -> UNIQUE violation
--
-- === chk_evento_tipo ===
-- [ ] INSERT INTO requerimiento_evento (request_id, tipo, descripcion) VALUES (..., 'pool_joined', 'test') -> succeeds
-- [ ] INSERT INTO requerimiento_evento (request_id, tipo, descripcion) VALUES (..., 'consolidado', 'test') -> succeeds (no regression)
-- [ ] INSERT INTO requerimiento_evento (request_id, tipo, descripcion) VALUES (..., 'creado', 'test') -> succeeds (no regression)
-- [ ] INSERT INTO requerimiento_evento (request_id, tipo, descripcion) VALUES (..., 'invalid_type', 'test') -> CHECK violation
--
-- === pool_companies link guard (trg_pool_companies_link_guard) ===
-- [ ] INSERT pool_companies (pool_id, company_id) where company = pool owner -> succeeds (self-join)
-- [ ] INSERT pool_companies where company has active company_links with owner -> succeeds
-- [ ] INSERT pool_companies where company has NO company_links with owner -> RAISES 'No se puede agregar...'
-- [ ] INSERT pool_companies where company has company_links with status='pending' (not 'active') -> RAISES
-- [ ] SELECT * FROM pool_companies (existing rows) -> no error, pre-028 rows untouched
--
-- === pool_companies withdraw guard (trg_pool_companies_withdraw_guard) ===
-- [ ] DELETE FROM pool_companies WHERE pool_id = <borrador pool> -> succeeds
-- [ ] DELETE FROM pool_companies WHERE pool_id = <confirmado pool> -> RAISES 'Solo se puede retirar...'
-- [ ] DELETE FROM pool_companies WHERE pool_id = <en_comparativa pool> -> RAISES
--
-- === purchase_pools state guard (trg_purchase_pools_state_guard) ===
-- [ ] UPDATE purchase_pools SET pool_state = 'cancelado' WHERE pool_state = 'cerrado' -> RAISES
-- [ ] UPDATE purchase_pools SET pool_state = 'cancelado' WHERE pool_state = 'cancelado' -> RAISES
-- [ ] UPDATE purchase_pools SET pool_state = 'cancelado' WHERE pool_state = 'en_comparativa' -> succeeds
-- [ ] UPDATE purchase_pools SET pool_state = 'cancelado' WHERE pool_state = 'adjudicado' -> succeeds
--
-- === pool_company_awards RLS ===
-- Setup: pool P with members A and B, non-member C.
-- [ ] As member A: SELECT FROM pool_company_awards WHERE pool_id = P -> sees all companies' awards
-- [ ] As non-member C: SELECT FROM pool_company_awards WHERE pool_id = P -> 0 rows
-- [ ] As member A: INSERT INTO pool_company_awards (pool_id, company_id=A, rfq_item_id, ...) -> succeeds
-- [ ] As member A: INSERT INTO pool_company_awards (pool_id, company_id=B, rfq_item_id, ...) -> RLS WITH CHECK blocks
-- [ ] SELECT policyname FROM pg_policies WHERE tablename = 'pool_company_awards';
--     -> pool_company_awards_member_select, pool_company_awards_own_insert,
--        pool_company_awards_own_update, pool_company_awards_own_delete present
--
-- === pool_providers RLS ===
-- Setup: pool P with members A and B, non-member C.
--        Provider PA owned by company A; Provider PG global (company_id IS NULL); Provider PB owned by B.
-- [ ] As member A: INSERT pool_providers (pool_id=P, provider_id=PA, selected_by_company_id=A) -> succeeds
-- [ ] As member A: INSERT pool_providers (pool_id=P, provider_id=PG, selected_by_company_id=A) -> succeeds (global)
-- [ ] As member A: INSERT pool_providers (pool_id=P, provider_id=PB, selected_by_company_id=A) -> RLS WITH CHECK blocks (PB is B's provider)
-- [ ] As member A: INSERT pool_providers (pool_id=P, provider_id=PA, selected_by_company_id=B) -> RLS WITH CHECK blocks (wrong company)
-- [ ] As member B: SELECT FROM pool_providers WHERE pool_id = P -> sees A's and B's selections (member-wide)
-- [ ] As non-member C: SELECT FROM pool_providers WHERE pool_id = P -> 0 rows
-- [ ] As member A: DELETE FROM pool_providers WHERE pool_id=P AND selected_by_company_id=A -> succeeds
-- [ ] As member B: DELETE FROM pool_providers WHERE selected_by_company_id=A -> RLS USING blocks
-- [ ] SELECT policyname FROM pg_policies WHERE tablename = 'pool_providers';
--     -> pool_providers_member_select, pool_providers_own_insert, pool_providers_own_delete present
--
-- === pool_companies_own_delete policy ===
-- [ ] SELECT policyname FROM pg_policies WHERE tablename = 'pool_companies';
--     -> pool_companies_own_delete present (alongside member_select, owner_insert, own_update from 018)
