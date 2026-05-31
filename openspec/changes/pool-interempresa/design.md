# Design: Pool Interempresa — Foundation (#9a)

> The mandatory prerequisite for the pool module: persistent bidirectional company links + material mapping. The pool flow (#9b) and adjudication (#9c) build on this. The riskiest piece is the cross-company materials read RLS.

## Architecture Decisions

### AD-1: `company_links` — persistent bidirectional link

```sql
CREATE TABLE company_links (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status               text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','disabled')),
  requested_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_link_distinct CHECK (requester_company_id <> target_company_id)
);
-- one link per unordered pair (prevents A→B and B→A duplicates)
CREATE UNIQUE INDEX uq_company_link_pair
  ON company_links (LEAST(requester_company_id, target_company_id),
                    GREATEST(requester_company_id, target_company_id));
```

States: `pending` (requested, awaiting target accept) → `active` (accepted) → `disabled` (either party). Disabling does not delete (history); a new link can be re-requested only if no row exists — so disable keeps the row; re-enable is an UPDATE back to active by a party (allowed). RLS:
- SELECT: viewer's company ∈ {requester, target}.
- INSERT: `requested_by` in viewer's company AND `requester_company_id` = viewer's company.
- UPDATE: viewer's company ∈ {requester, target} (accept/disable/re-enable).

### AD-2: `material_mappings` — dual-confirmed

```sql
CREATE TABLE material_mappings (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_link_id         uuid NOT NULL REFERENCES company_links(id) ON DELETE CASCADE,
  material_a_id           uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,  -- requester company's
  material_b_id           uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,  -- target company's
  confirmed_by_requester  boolean NOT NULL DEFAULT false,
  confirmed_by_target     boolean NOT NULL DEFAULT false,
  created_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_link_id, material_a_id, material_b_id)
);
```

`isMappingUsable` = `confirmed_by_requester AND confirmed_by_target` (pure). The proposing side's confirmation flag is set true on insert; the other side confirms via UPDATE. RLS: viewer's company is a party of `company_link_id`'s link (SELECT/INSERT/UPDATE), enforced by a join to `company_links`.

### AD-3: Cross-company materials read — an ADDITIVE permissive SELECT policy (the careful one)

Do NOT modify the existing `materials` SELECT policy. ADD a second permissive SELECT policy (permissive policies are OR'd), so a company can read a partner's materials ONLY through an `active` link:

```sql
CREATE POLICY "materials_select_linked_company" ON materials FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM company_links cl
    JOIN profiles p ON p.id = auth.uid()
    WHERE cl.status = 'active'
      AND (
        (cl.requester_company_id = p.company_id AND cl.target_company_id = materials.company_id) OR
        (cl.target_company_id    = p.company_id AND cl.requester_company_id = materials.company_id)
      )
  ));
```

This grants READ only, only for `active` links, only on the partner's `materials` rows — nothing else. It is the #1 surface for `sdd-verify` to attack (no over-exposure; disabled/pending links grant nothing; no write).

### AD-4: Pure helpers (`pool-foundation-utils.ts`, TDD)

```ts
function isLinkActive(link: { status: string }): boolean;
function isMappingUsable(m: { confirmed_by_requester: boolean; confirmed_by_target: boolean }): boolean;
function normalizeCompanyPair(a: string, b: string): [string, string];   // ordered, for dedupe/compare
function linkRoleForCompany(link, companyId): 'requester' | 'target' | null;  // which side am I
```

Tested: status mapping; usable only when both true; normalize is order-independent; role detection.

### AD-5: Configuración UI (admin-only)

A "Pool de Compras" section in `Configuracion.tsx`, gated to admin, with two sub-panels:
- **Empresas habilitadas** (`PoolEmpresasPanel`): search companies (by name); request a link; list links with status + the role (you requested / they requested); accept incoming `pending`; disable `active`.
- **Materiales compartidos** (`PoolMateriasPanel`): pick an `active` link; show own catalog beside the partner's (now readable via AD-3); create a mapping (own material ↔ partner material); show confirmation state; confirm the other side's proposed mappings. "Usable" badge when both confirmed.

Hooks `useCompanyLinks` (list/request/accept/disable) and `useMaterialMappings` (list/propose/confirm + read both catalogs) back the panels.

## Files

| File | Action |
|------|--------|
| `supabase/migrations/017_pool_foundation.sql` | new — 2 tables + RLS + materials policy |
| `src/integrations/supabase/types.ts` | add 2 tables |
| `src/lib/pool-foundation-utils.ts` (+ tests) | new (pure, TDD) |
| `src/hooks/useCompanyLinks.ts` / `useMaterialMappings.ts` | new |
| `src/components/configuracion/PoolEmpresasPanel.tsx` / `PoolMateriasPanel.tsx` | new |
| `src/pages/Configuracion.tsx` | mount the admin-only Pool de Compras section |

## Risks

- **Cross-company materials RLS (AD-3)** is the highest risk — an over-broad policy would leak catalogs. Mitigated by: additive policy (existing untouched), `active`-link-gated, read-only, and adversarial verify. Manual-verify checklist must include "a non-linked / disabled-link company sees nothing".
- **Acceptance/role correctness**: who can accept vs disable — encoded in RLS UPDATE + the pure `linkRoleForCompany`.
- **No pool execution here**: linking/mapping is inert until #9b consumes it — acceptable (it's the prerequisite gate).
