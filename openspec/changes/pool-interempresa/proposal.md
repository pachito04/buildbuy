# Proposal: Pool Interempresa — Foundation (#9a)

## Intent

Pool de Compras (interempresa) requires, before any pool can exist, two mandatory prerequisites from Report 1805: a **persistent bidirectional company link** ("Empresas habilitadas") confirmed by both companies, and **material mapping** ("Materiales compartidos") between the two catalogs — *"si un material no tiene correlación entre las dos empresas, no puede sumarse al pool"*. This change delivers that foundation (linking + mapping + the Configuración UI), the gate on which `#9b` (pool flow) and `#9c` (adjudication) build. The pool execution flow itself is out of scope here.

## Scope

### In Scope
- **Migration**: `company_links` (persistent A↔B link with acceptance state) and `material_mappings` (material_a ↔ material_b, confirmed by both), with multi-tenant RLS. Plus a **scoped cross-company materials read**: a company may read another company's materials ONLY when an `active` link exists between them (so it can map catalogs).
- **Linking** (Configuración → Pool de Compras → Empresas habilitadas): search a company, request a link; the target company sees and **accepts** (link becomes `active`); either party can **disable**. Admin-only.
- **Material mapping** (Configuración → Pool de Compras → Materiales compartidos): for an `active` link, show own catalog beside the linked company's; map each own material to its equivalent; a mapping is usable only when **confirmed by both** companies.
- **Hooks** `useCompanyLinks` / `useMaterialMappings` + a small pure util for mapping/link status.

### Out of Scope (deferred)
- **#9b** — pool creation, cross-company eligible-requirement selection, cross via mapping, shared RFQ, pool states.
- **#9c** — shared comparativa, adjudication (leader/per-company), per-company OCs, confidentiality of request detail.
- The existing rudimentary `Pools.tsx` flow is left as-is (its pre-existing `status:'in_pool'` enum bug is noted, fixed only if it blocks #9b).

## Capabilities

### New Capabilities
- `pool-foundation`: Two companies can establish a confirmed bidirectional link and map their material catalogs, gated by acceptance from both sides; only doubly-confirmed mappings are usable.

## Approach

1. **Migration** — `company_links` + `material_mappings` + RLS (incl. the scoped cross-company materials SELECT). Hand SQL to the user.
2. **types.ts** — the two tables.
3. **Pure util (TDD)** — link/mapping status helpers (e.g. `isLinkActive`, `isMappingUsable`, normalize a company pair).
4. **Hooks** — `useCompanyLinks` (list/request/accept/disable), `useMaterialMappings` (list/propose/confirm, reads both catalogs).
5. **Configuración UI** — a "Pool de Compras" section with the two sub-panels (Empresas habilitadas, Materiales compartidos), admin-only.

## Affected Areas

| Area | Impact |
|------|--------|
| `supabase/migrations/017_pool_foundation.sql` | New — `company_links` + `material_mappings` + RLS + scoped materials read |
| `src/integrations/supabase/types.ts` | Modified — 2 tables |
| `src/lib/pool-foundation-utils.ts` (+ tests) | New — pure status/normalize helpers |
| `src/hooks/useCompanyLinks.ts` / `useMaterialMappings.ts` | New |
| `src/components/configuracion/PoolEmpresasPanel.tsx` / `PoolMateriasPanel.tsx` (or similar) | New — the two sub-panels |
| `src/pages/Configuracion.tsx` | Modified — mount the Pool de Compras section (admin-only) |

## Multi-tenant safety (the critical part)

- `company_links`: a company SELECTs links where it is either party; INSERT only with itself as requester; UPDATE (accept/disable) only as a party.
- `material_mappings`: visible/editable only to the two companies of its link; a mapping is "usable" only when both `confirmed_by_a` AND `confirmed_by_b`.
- **Cross-company materials read** is the riskiest policy: `materials` SELECT is widened to allow reading another company's materials ONLY when an `active` `company_links` row joins the viewer's company to the material's company. It exposes the linked partner's catalog (name/unit) — which the report intends for mapping — and NOTHING else. This policy is the #1 thing `sdd-verify` must scrutinize (no over-exposure, active-link-gated, no write).

## Rollback Plan

- **DB**: drop `material_mappings`, `company_links`, and revert the widened `materials` SELECT policy to company-only. Additive otherwise.
- **Code**: the Configuración section + hooks are additive; reverting removes them. No existing flow changes.
- **Risk**: medium-high — the cross-company materials RLS is the sensitive surface; mitigated by gating strictly on `active` links and read-only, and by an adversarial verify of that exact policy.

## Review Workload (preliminary)

**> 400 lines** (migration + RLS + 2 hooks + 2 panels + util). Slices: (1) migration + types + util + hooks; (2) Empresas habilitadas panel; (3) Materiales compartidos panel. Confirm at tasks.

## Strict TDD

`strict_tdd: true`. Pure helpers in `pool-foundation-utils.ts` written test-first. RLS verified via the migration checklist + adversarial verify; UI via `tsc --noEmit` + manual checklist.
