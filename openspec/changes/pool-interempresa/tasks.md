# Tasks: pool-interempresa — foundation (#9a)

## Overview

Pool prerequisite: persistent bidirectional `company_links` + dual-confirmed `material_mappings` + scoped cross-company materials read + admin Configuración UI. Pool flow (#9b) and adjudication (#9c) deferred.

**Strict TDD is active** (`vitest run`). Pure helpers test-first.

## Review Workload Forecast

- Estimated changed lines: **> 400** (migration + RLS + util + 2 hooks + 2 panels).
- **Chained slices recommended: Yes (3).**
  - **Slice 1** — migration (2 tables + RLS + materials policy) + types + `pool-foundation-utils` (+tests) + `useCompanyLinks` + `useMaterialMappings` (hooks).
  - **Slice 2** — `PoolEmpresasPanel` (linking) + mount in Configuración.
  - **Slice 3** — `PoolMateriasPanel` (mapping).
- **Decision needed before apply: confirm slices vs single.**

---

## Phase 1: Migration & Types

### [x] 1.1 Migration
- **Files**: `supabase/migrations/017_pool_foundation.sql` (CREATE)
- **Spec refs**: Bidirectional company link; Scoped cross-company materials read; Material mapping
- **Details**: `company_links` (per AD-1: states, distinct CHECK, unordered-pair UNIQUE index, RLS select/insert/update by party); `material_mappings` (per AD-2: dual-confirm booleans, UNIQUE per link+pair, RLS by link party); ADD permissive `materials_select_linked_company` SELECT policy (active-link-gated, read-only — do NOT modify the existing materials policy). BEGIN/COMMIT, rollback comment, manual-verify checklist (incl. "non-linked company sees nothing"). **Hand SQL to the user.**

### [x] 1.2 Types
- **Files**: `src/integrations/supabase/types.ts` (MODIFY) — add `company_links` + `material_mappings`. `tsc --noEmit` is the test.

---

## Phase 2: Pure helpers + hooks

### [x] 2.1 `pool-foundation-utils` — tests first
- **Files**: `src/lib/__tests__/pool-foundation-utils.test.ts` (CREATE)
- **TDD red**: `isLinkActive` (active true, pending/disabled false); `isMappingUsable` (both true → true, any false → false); `normalizeCompanyPair` (order-independent); `linkRoleForCompany` (requester/target/null).

### [x] 2.2 `pool-foundation-utils` — implement
- **Files**: `src/lib/pool-foundation-utils.ts` (CREATE). Pure.

### [x] 2.3 Hooks
- **Files**: `src/hooks/useCompanyLinks.ts`, `src/hooks/useMaterialMappings.ts` (CREATE)
- **Details**: `useCompanyLinks` — list links for my company, request (insert pending), accept (→active), disable (→disabled). `useMaterialMappings` — for a link: list mappings, read both catalogs (own + partner via the new policy), propose (insert confirmed-by-proposer), confirm (set the other flag).

---

## Phase 3: Empresas habilitadas panel

### [x] 3.1 `PoolEmpresasPanel` + mount
- **Files**: `src/components/configuracion/PoolEmpresasPanel.tsx` (CREATE), `src/pages/Configuracion.tsx` (MODIFY)
- **Spec refs**: Request a link; Target accepts; Either party disables; Admin-only
- **Details**: search/select a company → request; list links with status + role (`linkRoleForCompany`); accept incoming pending; disable active. Mount in Configuración gated to admin.

---

## Phase 4: Materiales compartidos panel

### [x] 4.1 `PoolMateriasPanel`
- **Files**: `src/components/configuracion/PoolMateriasPanel.tsx` (CREATE), `src/pages/Configuracion.tsx` (MODIFY)
- **Spec refs**: Material mapping confirmed by both; Scoped cross-company materials read
- **Details**: pick an active link; show own catalog beside partner's; map own↔partner material; show confirmation state + "usable" badge (`isMappingUsable`); confirm the other side's proposals.

---

## Phase 5: Verification

### [x] 5.1 Suite + typecheck + manual
- `vitest run` green + `npx tsc --noEmit` clean.
- Manual: A requests link to B → B accepts → active; either disables; duplicate pair rejected; with active link A sees B's catalog (and NOT a non-linked C's); map M_a↔M_b → usable only after both confirm; non-admin doesn't see the section.
- **RLS manual checks** from the migration checklist (cross-company read gated, no write, disabled link grants nothing).
