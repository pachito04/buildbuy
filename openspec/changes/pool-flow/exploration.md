# Exploration: Pool de Compras — Flow (#9b)

Source: `Reporte 1805.docx` — Módulo 2 Pool de Compras, "Flujo de creación de un Pool". Builds on `#9a` (links + material mappings).

## Report (the pool flow)

- Compras creates a pool with linked companies; each participant selects its own eligible requirements; the system crosses materials via the mapping; once all confirm, a single shared RFQ with total quantities is generated. Pool states: **Borrador, Confirmado, En comparativa, Adjudicado, Cerrado, Cancelado**.
- **Confidentiality**: each participant sees only the consolidated total per material, NOT the internal requirement detail of the other companies.
- Traceability: each pool line shows how many units each company contributed.

## Current state (evidence)

- Tables (001): `purchase_pools` (status `pool_status` enum: open/closed/quoting/awarded/cancelled), `pool_companies` (membership invited|active|declined), `pool_requests` (pool↔request), `pool_items` (pool↔material consolidated total). `src/pages/Pools.tsx` creates pools, invites companies, adds requests.
- **The RLS is the blocker** (001:767-785, all `auth_company_id()`-scoped):
  - `purchase_pools_tenant`: only the OWNING company sees the pool → **an invited company cannot see the pool at all**.
  - `pool_items_tenant` / `pool_requests_tenant`: scoped to pools owned by my company → participants see nothing.
  - `pool_companies_tenant`: a company sees its own membership row only.
  - ⇒ the current interempresa pool is **non-functional for participants**.
- Latent bug: `Pools.tsx` `requests.update({status:'in_pool'})` — `in_pool` not in the `request_status` enum → rejected.

## What #9b must add (the multi-tenant core)

1. **RLS rework** so the pool is shared by membership while keeping requirement detail private:
   - `purchase_pools` / `pool_companies` / `pool_items` (+ contributions) → visible to ANY company that is a `pool_companies` member of the pool.
   - `pool_requests` → visible ONLY to the company that OWNS the request (`requests.company_id = my company`) — this is the confidentiality boundary (others see the consolidated total, not which requirements you contributed).
2. **Pool state** for the 6 report states — add a `pool_state` text column + CHECK (default `borrador`), NOT reworking the legacy `pool_status` enum (left as-is).
3. **Per-company contribution** — a `pool_item_contributions` table (pool_item_id, company_id, quantity) so each consolidated line shows per-company units (shared totals; the requirement detail stays private via #1).
4. **Material crossing via mappings** — when building/refreshing the pool's consolidated `pool_items`, group each company's eligible items by the **mapping-canonical material** (using `#9a`'s usable `material_mappings` — both-confirmed only), summing into one line with per-company contributions.
5. **Each company adds its OWN eligible requirements** (RLS-enforced own-only), and **generate a shared RFQ** from the consolidated `pool_items` once confirmed.

## Scope notes

- Reuse `#8`'s consolidación grouping concept + `#9a` mappings. The "usable mapping" gate (both confirmed + active link) must be enforced when crossing (the `#9a` verify flagged that `material_mappings` RLS doesn't check `active` — enforce it here at consume time).
- **Adjudication + per-company OCs + the full confidentiality of comparativa = `#9c`** (next change). #9b stops at the shared RFQ + states.
- Fix the `status:'in_pool'` latent bug while here (drop the enum update or use a valid value).

## Open question for the user

#9b is itself large (multi-tenant RLS rework + crossing + contributions + shared RFQ + states). Confirm the first-cut = **RLS rework + per-company requirement contribution + material crossing → consolidated pool_items + shared RFQ + pool states**, deferring adjudication/comparativa to #9c. (Recommended — it's the coherent "build a shared pool RFQ" deliverable.)
