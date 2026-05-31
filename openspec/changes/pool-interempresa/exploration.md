# Exploration: Pool de Compras Interempresa (#9)

Source: `Reporte 1805.docx` — "MÓDULO 2 — POOL DE COMPRAS" (interempresa).

## The full module (report)

A multi-tenant feature letting 2+ distinct companies (both BuildBuy users) jointly go to market with one shared RFQ:
- **Configuración previa (mandatory prerequisite)**: an admin of each company links with another company (bidirectional, both must accept) — "Empresas habilitadas". Can be disabled later.
- **Material mapping (mandatory)**: map each own material to its equivalent in the linked company ("Materiales compartidos"). Only mapped materials can be pooled — *"si un material no tiene correlación entre las dos empresas, no puede sumarse al pool"*.
- **Pool flow**: create a pool with linked companies → each selects eligible requirements → system crosses materials via the mapping → consolidated view → all confirm → single shared RFQ → providers.
- **Comparativa + adjudication**: centralized comparativa visible to all participants; a leader adjudicates or each adjudicates its portion → each company generates its OWN OCs.
- **Confidentiality**: each participant sees only the consolidated total per material, not others' internal request detail.
- **Pool states**: Borrador, Confirmado, En comparativa, Adjudicado, Cerrado, Cancelado.

## Current state (evidence)

- Tables (migration 001): `purchase_pools`, `pool_companies` (per-pool membership: invited|active|declined), `pool_requests`, `pool_items`. A rudimentary pool model.
- `src/pages/Pools.tsx` (198 lines): create a pool, add companies (`pool_companies`), add requirements (`pool_requests`, sets `requests.status='in_pool'`), update pool status, `is_shared`. `src/components/pools/{CreatePoolDialog,PoolCard}.tsx`.
- **No material mapping. No persistent inter-company link. No pool→RFQ generation** (RFQs.tsx:284 is a `TODO`/"Próximamente" stub).
- **Latent pre-existing bug**: `Pools.tsx` does `requests.update({status:'in_pool'})`, but `in_pool` is NOT in the current `request_status` enum (`pendiente|en_curso|recibido|rechazado` after migrations 004/005 — `in_pool` was a pre-004 value, backfilled away). That update is rejected by the enum. (Pre-existing; flag for whoever touches Pools.)

## The gap vs the report

The existing `pool_companies` is **per-pool** membership, not the **persistent bidirectional company link** the report makes a prerequisite. And there is no material-mapping concept at all. The report's flow (cross-company requirement aggregation via mapping → shared RFQ → distributed adjudication → per-company OCs → confidentiality) is far beyond the current rudimentary model and is heavily **multi-tenant** (cross-company data visibility + RLS is the hard, risky core).

## Why this must be phased

The full module is multi-change-sized and the multi-tenant RLS (companies seeing a shared pool while NOT seeing each other's internal request detail) is the riskiest part. The report itself orders it: **configuración previa (linking + mapping) FIRST**, then the pool flow, then adjudication. Linking + mapping is the **mandatory gate** — nothing pools without it.

Proposed phasing:
- **#9a — Foundation (recommended first-cut)**: persistent inter-company **linking** (empresas habilitadas, bidirectional accept, disable) + **material mapping** (materiales compartidos, confirmed by both). New tables + RLS + a Configuración → Pool de Compras UI. The mandatory prerequisite; a coherent, shippable deliverable.
- **#9b — Pool flow**: pool creation with cross-company eligible-requirement selection → cross materials via mapping → single shared RFQ → pool states. (Reuses consolidación grouping + `distributeByUrgency` from #8b.)
- **#9c — Adjudication & confidentiality**: shared comparativa + adjudication (leader/per-company) → per-company OCs + the confidentiality RLS rules.

## Open question for the user

Which first-cut? **#9a foundation (linking + material mapping)** — recommended, it's the mandatory gate and a clean deliverable — or a bigger bite (e.g. #9a + #9b)? Given the multi-tenant RLS risk, foundation-first is the safe, honest path.
