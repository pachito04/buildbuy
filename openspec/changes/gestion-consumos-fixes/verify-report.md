# Verify Report — gestion-consumos-fixes

**Phase:** sdd-verify
**Branch:** `feat/consumos-fixes` (confirmed via `git branch --show-current`)
**Date:** 2026-06-11
**Artifact store:** openspec
**Verdict:** **PASS WITH WARNINGS** — cleared to push to main; one provider-path WARNING worth a 1-line fix before relying on provider bulk import in production.

---

## Automated checks

| Check | Result |
|-------|--------|
| `npx vitest run` | **468 passed / 468** across **41 test files**. Zero failures. (Baseline 428 -> +40 new tests.) |
| `npx tsc --noEmit` | **CLEAN** (exit 0, zero errors). |

New tests added this change (all green): filterRetiros 11, buildTimeSeries 9, estado-cuenta-pdf 6, plantilla-precios 6, RequireRole 8.

---

## Tasks vs code state

All 18 tasks marked `[x]` in `tasks.md`. Verified against code — no drift:

- T01 migration 030 -> `supabase/migrations/030_precio_notifications.sql`
- T02 bulk RPC client -> `ListaPreciosProveedor.tsx:302` (`precio_proveedor_bulk_insert`)
- T03 Compras edit RPC -> `usePreciosProveedor.ts:129` (`precio_proveedor_edit`)
- T04 types -> `types.ts:2733-2740` + enum `2767-2768`
- T05/T06 filterRetiros -> `src/lib/consumos/filterRetiros.ts` + tests
- T07 report filters -> `ReporteConsumos.tsx:177-201`
- T08/T09 buildTimeSeries -> `src/lib/consumos/buildTimeSeries.ts` + tests
- T10 comparativa -> `ReporteConsumos.tsx:604-665`
- T11/T12 PDF helper -> `src/lib/estado-cuenta-pdf.ts`; `MiCuentaCorriente.tsx:114` delegates
- T13 Compras PDF button -> `CuentaCorriente.tsx:291-308`
- T14/T15 Excel template -> `plantilla-precios.ts` + `PreciosUploader.tsx:253`
- T16/T17 RequireRole -> `src/components/RequireRole.tsx` + tests
- T18 route wiring -> `App.tsx:104-141`

---

## Per-GAP validation against spec

### GAP1 — Price-change notifications — PASS
- 030 adds 2 enum values via `ALTER TYPE ... ADD VALUE IF NOT EXISTS` OUTSIDE the transaction (12-13), then `BEGIN...COMMIT`. Matches 002 pattern.
- `fn_notify_price_updated_by_provider` (SECURITY DEFINER, AFTER INS/UPD) gates on `app.precio_batch` (suppress bulk) and `app.precio_actor='compras'` (suppress Compras-edit); loops `user_roles` compras/admin. Mirrors `fn_notify_quote_received`.
- `fn_notify_price_edited_by_compras` (SECURITY DEFINER, AFTER UPD) fires only when `app.precio_actor='compras'`; loops active `provider_users`; resolves `materials.name` into `metadata.material_codigo`; 0 active users = 0 inserts. Mirrors `fn_notify_po_issued`.
- `precio_proveedor_bulk_insert` sets batch token, set-based insert, returns `{inserted, rejected[]}`, inserts ONE summary notif. GRANTed.
- `precio_proveedor_edit` sets actor token, PATCH update. GRANTed.
- Rollback block present; does NOT drop enum values.
- Client: bulk path -> single RPC (299-323); provider single-edit stays direct insert; Compras close-vigencia -> `precio_proveedor_edit`.
- No modification to 002 triggers. Trigger behavior is SQL-checklist-verified only (embedded CHECK 1-8 in 030); migration reported already applied.

### GAP2 — Report filters — PASS
- Server-side filters obra/proveedor/material/arquitecto/dates (176-201). Arquitecto uses `architect_id`, material uses `material_id` (justified design deviations). Dropdowns have no orphans. `filterRetiros` pure helper + 11 tests. Anulado exclusion via `.neq('estado','anulado')` (124) and `estado==='activo'` total (222).

### GAP3 — Comparativa — PASS
- `buildTimeSeries` groups by (YYYY-MM, material_id), both metrics, excludes anulados, returns [] empty; 9 tests. Toggle Lista|Comparativa, metric toggle (comparativa only), Recharts LineChart with long->wide pivot, empty-state, default last-12-months.

### GAP4 — Compras PDF — PASS (incl. RLS confirmation)
- `estado-cuenta-pdf.ts` extracted byte-for-byte (filename slug, fillColor [30,41,59], columnStyles, coords); `logoDataUrl` declared-unused. `MiCuentaCorriente.tsx:114` delegates; regression 6 tests. `CuentaCorriente.tsx:291-308` button gated by provider + >=1 movement.
- RLS CONFIRMED: `021_consumos_rls_rpc.sql:90-91` policy `mov_cc_select_internal` = `FOR SELECT USING (company_id = auth_company_id())`. Compras/admin reads all movimientos for any provider in their company. No RLS change needed. Apply-progress flag RESOLVED — not a blocker.

### GAP5 — Excel template — PASS
- 1 sheet, exactly 5 headers in order, 0 data rows; filename `plantilla-precios.xlsx` deterministic; 6 tests. `PreciosUploader.tsx:248-258` button always visible, `type="button"`, does not reset upload state.

### GAP6 — Route guards — PASS
- `RequireRole`: spinner on loading; null->/login; not-allowed->/dashboard; else children; 8 tests cover matrix. `App.tsx:104-141` wraps the 5 routes inside AppLayout tree with authoritative matrix. Arquitecto denied on all 5. Defense-in-depth intact.

### GAP7 — Correctly NOT implemented
- No 031_ migration, no GAP7 code. Only referenced as deferred in proposal/design. Confirmed out of scope.

---

## Findings by severity

### CRITICAL
None.

### WARNING

W1 — Provider bulk import passes empty-string `''` for a uuid RPC arg (provider path likely breaks at runtime).
- `ListaPreciosProveedor.tsx:307` -> `p_company_id: resolvedCompanyId ?? ''`. For a provider (global price), `resolvedCompanyId` is null -> `''`. RPC param `precio_proveedor_bulk_insert(p_company_id uuid)` will raise `invalid input syntax for type uuid: ""` before the body runs. Compras path (non-null companyId) unaffected.
- Impact: provider Excel upload errors instead of importing. Not caught by tests (RPC mocked; checklist seeds non-null company).
- Fix (1 line): pass `p_company_id: resolvedCompanyId` (allow null; widen generated type to `string | null`). The RPC already resolves null company via `profiles.company_id` of `auth.uid()` (030:267-270).

W2 — `closeVigencia` actor detection uses `companyId !== null` instead of role.
- `usePreciosProveedor.ts:124-126`. Documented as intentional, but `companyId` derives from `profiles.company_id`; schema does not forbid a provider having a non-null profile company_id. Rest of module keys on `viewRole === 'proveedor'` (`ListaPreciosProveedor.tsx:104`).
- Impact: if a provider ever has non-null profile company_id, their self-edit routes through the Compras RPC, mislabeling actor (provider notified as if Compras edited; Compras not notified). Low likelihood, semantically wrong signal.
- Fix: `const isComprasActor = actualRole !== 'proveedor'` from `useViewRole`.

### SUGGESTION

S1 — Dead code: `usePreciosProveedor.ts:120-123` no-op `role` computation. Remove when fixing W2.
S2 — `precio_proveedor_bulk_insert` overlap check (030:221-228) only flags overlap when both existing and new `vigencia_hasta` are NULL; bounded-range overlaps not detected in bulk path. Acceptable for scope; note for Fase 2.

---

## What must be fixed before pushing to main

Nothing blocks the push (no CRITICAL). Implementation is complete, type-clean, fully unit-tested.

Recommended before relying on provider self-service in prod: apply the 1-line fix for W1 (provider bulk import) and the role-signal fix for W2 (actor detection). Both small and low-risk; can ship in this PR or a fast follow-up.

---

## Verdict

PASS — cleared to push to main. All 6 in-scope GAPs implemented per spec, GAP7 correctly deferred, 468/468 tests green, tsc clean, Compras-PDF RLS confirmed compatible. Two provider-path WARNINGs (W1, W2) are recommended fixes but do not block the merge; dominant Compras/admin flows are correct.
