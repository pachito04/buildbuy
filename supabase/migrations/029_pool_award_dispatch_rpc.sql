-- Migration: 029_pool_award_dispatch_rpc
-- Description: Pool de Compras RPC layer — Slice 0 functions.
--   Depends on objects created by 028_pool_schema:
--     pool_company_awards, pool_providers, purchase_pools.award_mode,
--     purchase_pools.pool_number, chk_evento_tipo 'pool_joined'.
--
--   1. pool_dispatch_providers(p_rfq_id uuid) RETURNS int
--      SECURITY DEFINER — reads pool_providers (cross-tenant), dedup inserts into rfq_providers.
--      Returns total provider count in rfq_providers for this rfq (0 = no providers, skip notify).
--
--   2. pool_finalize_award_mode_b(p_pool_id uuid) RETURNS void
--      SECURITY DEFINER — reads pool_company_awards for ALL companies, evaluates completeness,
--      transitions pool_state to 'adjudicado' if all companies have awarded all their items.
--      Idempotent: safe to call multiple times.
--
--   3. pool_add_requirements(p_pool_id uuid, p_request_ids uuid[]) RETURNS void
--      SECURITY INVOKER — atomic: INSERT pool_requests + INSERT requerimiento_evento 'pool_joined'
--      in one transaction. Caller's RLS applies. Idempotent (ON CONFLICT DO NOTHING for pool_requests).
--
-- Safe to re-run: CREATE OR REPLACE FUNCTION throughout.
-- Apply AFTER 028_pool_schema has been applied.
--
-- Rollback block commented at the bottom.

BEGIN;

-- ============================================================
-- 1. pool_dispatch_providers(p_rfq_id uuid) RETURNS int
-- ============================================================
-- SECURITY DEFINER because inserting into rfq_providers crosses tenant boundaries:
--   rfq_providers_write (001) restricts INSERT to rfqs WHERE company_id = caller's company.
--   Pool members from other companies have providers that must be inserted into the
--   pool-creator's rfq — this is impossible client-side under RLS.
--
-- Pattern: same precedent as create_consolidated_rfq (024) and consumos RPC (021).
--
-- Flow:
--   1. Resolve pool_id from the rfq. Fail if the rfq has no pool_id.
--   2. Authorisation check (explicit — DEFINER bypasses RLS): caller must be a pool member.
--   3. Read DISTINCT active provider_ids from pool_providers for this pool.
--   4. INSERT into rfq_providers ON CONFLICT DO NOTHING (idempotent).
--   5. Return COUNT(*) from rfq_providers WHERE rfq_id = p_rfq_id.
--      Count = 0 means no providers selected → caller should NOT invoke notify-providers.
CREATE OR REPLACE FUNCTION pool_dispatch_providers(p_rfq_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool_id uuid;
  v_count   int;
BEGIN
  -- 1. Resolve pool_id.
  SELECT pool_id INTO v_pool_id
  FROM rfqs
  WHERE id = p_rfq_id;

  IF v_pool_id IS NULL THEN
    RAISE EXCEPTION 'rfq % is not a pool rfq (pool_id is null)', p_rfq_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Membership check (DEFINER bypasses RLS — must self-authorise).
  IF NOT is_pool_member(v_pool_id) THEN
    RAISE EXCEPTION 'not authorised: caller is not a member of pool %', v_pool_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 3 + 4. Read the manually-selected provider set and dedup-insert into rfq_providers.
  --   DISTINCT collapses cases where two companies selected the same global provider.
  --   ON CONFLICT (rfq_id, provider_id) DO NOTHING makes this idempotent — re-running
  --   generateSharedRfq for the same rfq will not duplicate rows.
  --   Filter: pr.active = true excludes deactivated providers.
  WITH selected AS (
    SELECT DISTINCT pp.provider_id
    FROM pool_providers pp
    JOIN providers pr ON pr.id = pp.provider_id
    WHERE pp.pool_id = v_pool_id
      AND pr.active = true
  )
  INSERT INTO rfq_providers (rfq_id, provider_id)
  SELECT p_rfq_id, provider_id
  FROM selected
  ON CONFLICT (rfq_id, provider_id) DO NOTHING;

  -- 5. Return total active provider count for the rfq.
  SELECT COUNT(*) INTO v_count
  FROM rfq_providers
  WHERE rfq_id = p_rfq_id;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION pool_dispatch_providers(uuid) TO authenticated;

-- ============================================================
-- 2. pool_finalize_award_mode_b(p_pool_id uuid) RETURNS void
-- ============================================================
-- SECURITY DEFINER because evaluating "all companies complete" requires reading
-- pool_company_awards rows for EVERY participating company. A pool member can
-- SELECT all award rows (RLS member_select), but the UPDATE to pool_state='adjudicado'
-- must not race — having it server-side ensures atomicity.
--
-- Logic:
--   1. Membership check (DEFINER — must self-authorise).
--   2. Early exit if pool is not in 'en_comparativa' (idempotent guard).
--   3. Determine which (company_id, rfq_item_id) pairs are required:
--      The pool SC's rfq_items carry material_id (copied from pool_items by
--      generateSharedRfq). A company is responsible for an rfq_item when it
--      contributed to the pool_item of the same material. rfq_item_sources is NOT
--      used here — pools never populate it (only the consolidation RPC does).
--      Join path: pool_item_contributions → pool_items (material_id)
--                 → rfq_items (same rfq_id + material_id).
--   4. Compare required pairs against existing pool_company_awards rows.
--      If all required pairs have an award → pool is complete → UPDATE pool_state.
--      If any required pair is missing → no-op (partial completion).
--
-- Idempotency: calling again after pool_state = 'adjudicado' hits the early exit.
-- Concurrency: two companies calling simultaneously — both hit the CTE; at most one
-- UPDATE fires (the second lands when state is already 'adjudicado', WHERE clause
-- filters it out). No lock needed for this level of concurrency.

CREATE OR REPLACE FUNCTION pool_finalize_award_mode_b(p_pool_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool_state    text;
  v_rfq_id        uuid;
  v_required_cnt  int;
  v_awarded_cnt   int;
BEGIN
  -- 1. Membership check.
  IF NOT is_pool_member(p_pool_id) THEN
    RAISE EXCEPTION 'not authorised: caller is not a member of pool %', p_pool_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Early exit if not in en_comparativa (idempotent, not an error).
  SELECT pool_state INTO v_pool_state
  FROM purchase_pools
  WHERE id = p_pool_id;

  IF v_pool_state IS DISTINCT FROM 'en_comparativa' THEN
    RETURN;
  END IF;

  -- Resolve the pool's rfq (there should be exactly one pool rfq).
  SELECT id INTO v_rfq_id
  FROM rfqs
  WHERE pool_id = p_pool_id
  LIMIT 1;

  IF v_rfq_id IS NULL THEN
    -- No rfq yet — pool cannot be finalised. Silent no-op.
    RETURN;
  END IF;

  -- 3. Count required (company_id, rfq_item_id) pairs.
  --    The pool's shared SC (generateSharedRfq) builds rfq_items from pool_items,
  --    copying material_id — it does NOT populate rfq_item_sources (that table is
  --    only filled by the consolidation RPC create_consolidated_rfq, never by pools).
  --    So company↔rfq_item responsibility is resolved via material_id:
  --      pool_item_contributions pic (which company contributed which pool_item)
  --        → pool_items pi (pi.material_id)
  --        → rfq_items ritem (ritem.rfq_id = pool rfq AND ritem.material_id = pi.material_id)
  --      → gives (pic.company_id, ritem.id) pairs
  SELECT COUNT(*) INTO v_required_cnt
  FROM (
    SELECT DISTINCT pic.company_id, ritem.id AS rfq_item_id
    FROM pool_item_contributions pic
    JOIN pool_items pi    ON pi.id = pic.pool_item_id
    JOIN rfq_items  ritem ON ritem.rfq_id = v_rfq_id
                          AND ritem.material_id = pi.material_id
    WHERE pi.pool_id = p_pool_id
  ) required_pairs;

  -- If no company has any items mapped yet (data not ready), do nothing.
  IF v_required_cnt = 0 THEN
    RETURN;
  END IF;

  -- 4. Count how many of those pairs already have an award.
  --    Same material_id-based responsibility join as step 3, restricted to pairs
  --    that already have a pool_company_awards row.
  SELECT COUNT(*) INTO v_awarded_cnt
  FROM (
    SELECT DISTINCT pic.company_id, ritem.id AS rfq_item_id
    FROM pool_item_contributions pic
    JOIN pool_items pi    ON pi.id = pic.pool_item_id
    JOIN rfq_items  ritem ON ritem.rfq_id = v_rfq_id
                          AND ritem.material_id = pi.material_id
    WHERE pi.pool_id = p_pool_id
      AND EXISTS (
        SELECT 1 FROM pool_company_awards pca
        WHERE pca.pool_id    = p_pool_id
          AND pca.company_id = pic.company_id
          AND pca.rfq_item_id = ritem.id
      )
  ) awarded_pairs;

  -- All required pairs awarded → transition to adjudicado.
  IF v_awarded_cnt = v_required_cnt THEN
    UPDATE purchase_pools
    SET pool_state = 'adjudicado'
    WHERE id = p_pool_id
      AND pool_state = 'en_comparativa';  -- guard against concurrent update
  END IF;

  -- If v_awarded_cnt < v_required_cnt: partial completion — no-op.
END;
$$;

GRANT EXECUTE ON FUNCTION pool_finalize_award_mode_b(uuid) TO authenticated;

-- ============================================================
-- 3. pool_add_requirements(p_pool_id uuid, p_request_ids uuid[]) RETURNS void
-- ============================================================
-- SECURITY INVOKER: no cross-tenant operation. The caller's RLS policies apply:
--   - pool_requests_own_insert (018): requires caller owns the request AND is a pool member.
--   - requerimiento_evento RLS: caller's company must own the request.
-- This wraps both INSERTs in a single transaction so that if the evento INSERT
-- fails (e.g. CHECK constraint on tipo), the pool_requests INSERT also rolls back.
-- Idempotency: ON CONFLICT DO NOTHING on pool_requests (UNIQUE pool_id+request_id
-- already exists from 001_initial_schema). Events are inserted for each request_id
-- in the call's array — the caller should pass only new request_ids (not already in pool).
CREATE OR REPLACE FUNCTION pool_add_requirements(p_pool_id uuid, p_request_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_pool_number bigint;
  v_companies   jsonb;
  v_user        uuid := auth.uid();
BEGIN
  -- Guard: nothing to do if the array is empty or null.
  IF p_request_ids IS NULL OR array_length(p_request_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- 1. INSERT pool_requests.
  --    RLS pool_requests_own_insert (018) validates: caller owns each request AND is a pool member.
  --    ON CONFLICT DO NOTHING: idempotent on retry with the same request_ids.
  INSERT INTO pool_requests (pool_id, request_id)
  SELECT p_pool_id, unnest(p_request_ids)
  ON CONFLICT (pool_id, request_id) DO NOTHING;

  -- 2. Snapshot the pool context at the moment of joining.
  SELECT pool_number INTO v_pool_number
  FROM purchase_pools
  WHERE id = p_pool_id;

  SELECT jsonb_agg(c.name ORDER BY c.name) INTO v_companies
  FROM pool_companies pc
  JOIN companies c ON c.id = pc.company_id
  WHERE pc.pool_id = p_pool_id;

  -- 3. INSERT one requerimiento_evento per request_id in this call's array.
  --    tipo = 'pool_joined' (added to chk_evento_tipo by 028).
  --    If this INSERT fails (e.g. CHECK), the entire function rolls back including
  --    the pool_requests INSERTs above — atomic guarantee.
  INSERT INTO requerimiento_evento (request_id, created_by, tipo, descripcion, metadata)
  SELECT
    rid,
    v_user,
    'pool_joined',
    'Requerimiento incorporado a un pool de compras',
    jsonb_build_object(
      'pool_id',      p_pool_id,
      'pool_number',  v_pool_number,
      'companies',    v_companies
    )
  FROM unnest(p_request_ids) AS rid;
END;
$$;

GRANT EXECUTE ON FUNCTION pool_add_requirements(uuid, uuid[]) TO authenticated;

COMMIT;

-- ============================================================
-- ROLLBACK (run to revert migration 029 — execute as a transaction)
-- ============================================================
-- BEGIN;
--
-- DROP FUNCTION IF EXISTS pool_dispatch_providers(uuid);
-- DROP FUNCTION IF EXISTS pool_finalize_award_mode_b(uuid);
-- DROP FUNCTION IF EXISTS pool_add_requirements(uuid, uuid[]);
--
-- COMMIT;

-- ============================================================
-- Manual verification checklist (record in PR before merging)
-- ============================================================
--
-- Prerequisites: migration 028 applied; pool P with members A and B;
--   pool has pool_number > 0; rfq R linked to pool P (rfqs.pool_id = P).
--
-- === pool_dispatch_providers ===
-- [ ] Setup: company A selects provider PA (own) and PG (global) into pool_providers;
--            company B selects PG (global) and PB (own).
--            pool_providers now has 3 distinct provider_ids (PA, PG, PB).
-- [ ] SELECT pool_dispatch_providers('<rfq_R_id>') AS count;
--     -> count = 3 (PA, PG, PB deduped; PG contributed by two companies collapsed)
-- [ ] SELECT provider_id FROM rfq_providers WHERE rfq_id = '<rfq_R_id>';
--     -> PA, PG, PB present — no duplicates
-- [ ] SELECT pool_dispatch_providers('<rfq_R_id>') again (re-execute);
--     -> count = 3 (idempotent — ON CONFLICT DO NOTHING, no new rows)
-- [ ] Setup: pool Q with NO pool_providers rows.
--     SELECT pool_dispatch_providers('<rfq_Q_id>') AS count; -> count = 0 (no inserts)
-- [ ] Run as a user NOT in the pool;
--     -> RAISES 'not authorised: caller is not a member of pool ...'
-- [ ] SELECT pool_dispatch_providers('<non_pool_rfq_id>');
--     -> RAISES 'rfq ... is not a pool rfq (pool_id is null)'
--
-- === pool_finalize_award_mode_b ===
-- Setup: pool P in 'en_comparativa'; companies A and B each have 2 rfq_items to award.
--        Company A has awarded 1 of 2; company B has awarded 2 of 2.
-- [ ] SELECT pool_finalize_award_mode_b('<pool_P_id>');
--     -> no error; SELECT pool_state FROM purchase_pools WHERE id = P; -> 'en_comparativa' (partial)
-- [ ] Company A awards its remaining item (UPSERT pool_company_awards).
-- [ ] SELECT pool_finalize_award_mode_b('<pool_P_id>');
--     -> no error; SELECT pool_state FROM purchase_pools WHERE id = P; -> 'adjudicado'
-- [ ] SELECT pool_finalize_award_mode_b('<pool_P_id>') again (pool already adjudicado);
--     -> no error; pool_state still 'adjudicado' (idempotent — early exit)
-- [ ] Run as a user NOT in pool P;
--     -> RAISES 'not authorised: caller is not a member of pool ...'
--
-- === pool_add_requirements ===
-- Setup: pool P with member A; request R1 and R2 owned by company A; pool_number set.
-- [ ] SELECT pool_add_requirements('<pool_P_id>', ARRAY['<R1_id>', '<R2_id>']::uuid[]);
--     -> no error
-- [ ] SELECT * FROM pool_requests WHERE pool_id = '<pool_P_id>' AND request_id IN ('<R1_id>', '<R2_id>');
--     -> 2 rows present
-- [ ] SELECT tipo, metadata FROM requerimiento_evento
--         WHERE request_id IN ('<R1_id>', '<R2_id>') AND tipo = 'pool_joined';
--     -> 2 rows; metadata contains pool_id, pool_number, companies (company names array)
-- [ ] Retry with same request_ids: SELECT pool_add_requirements('<pool_P_id>', ARRAY['<R1_id>']::uuid[]);
--     -> no error; pool_requests count unchanged (ON CONFLICT DO NOTHING idempotent);
--        a second pool_joined event IS inserted (caller should pass only new ids)
-- [ ] SELECT pool_add_requirements('<pool_P_id>', NULL::uuid[]);
--     -> no error, no rows inserted (null guard)
-- [ ] SELECT pool_add_requirements('<pool_P_id>', ARRAY[]::uuid[]);
--     -> no error, no rows inserted (empty array guard)
-- [ ] Simulate CHECK failure: temporarily remove 'pool_joined' from chk_evento_tipo constraint,
--     then call pool_add_requirements — entire transaction rolls back, pool_requests unchanged.
--     (Restore constraint after test.)
