# Pool de Compras (Módulo 2) — Complete Specification

> Compiled from sdd/pool-compras-fixes: GAP 1–5. Closes business-rule gaps in the shared-procurement pool flow (Módulo 2: multicompany purchase aggregation). Addresses company linking validation, award modes (leader vs. per-company), supplier dispatch with provider union, pool lifecycle (withdraw/cancel), and requirement history integration.

---

## Overview

The **Pool de Compras (Module 2)** allows two or more BuildBuy companies to form a purchasing pool: they map materials, consolidate eligible requirements into a shared RFQ (SC compartida), receive a centralized comparative, and each generates its own purchase order (OC) from its portion. This spec defines five critical gaps closed by the pool-compras-fixes change:

1. **GAP 1 — Invitation Guard**: Restrict pool membership to companies with active `company_links`.
2. **GAP 2 — Award Mode**: Support both leader-decides and per-company adjudication modes.
3. **GAP 3 — Supplier Dispatch**: Notify the deduplicated union of enabled providers.
4. **GAP 4 — Withdraw / Cancel**: Allow exit from borrador; cancel for post-borrador.
5. **GAP 5 — Requirement History**: Log pool participation with human-readable pool number.

---

## Core Data Model

| Entity | Key Columns | Grain | Added/Modified |
|--------|-------------|-------|-----------------|
| `purchase_pools` | `id, company_id, pool_state, winning_quote_id (Mode A), award_mode, pool_number` | pool | award_mode, pool_number added |
| `pool_companies` | `pool_id, company_id` | participating company in a pool | guards added |
| `pool_item_contributions` | `pool_item_id, company_id` | company's qty contribution to item | existing, NOT modified |
| `pool_company_awards` (NEW) | `pool_id, company_id, rfq_item_id` → `winning_quote_item_id` | per-company per-item award (Mode B only) | NEW table (028) |
| `pool_providers` (NEW) | `pool_id, provider_id, selected_by_company_id` | provider eligibility by company per pool | NEW table (028) |
| `pool_requests` | `pool_id, request_id` | requirement in a pool | existing |
| `requerimiento_evento` | `request_id, tipo, metadata` | requirement history event | tipo CHECK constraint extended (028) |

---

## Requirement: GAP 1 — Pool Invitation Guard (Linked Companies Only)

A company MUST NOT be addable to a purchase pool unless an `active` `company_links` row exists joining it to the pool-creating company. This closes a business-rule breach: today any BuildBuy company can be invited regardless of commercial relationship.

### Scenario: Only linked companies appear in CreatePoolDialog

- GIVEN the current user belongs to company A
- AND company B has an `active` `company_links` row with company A
- AND company C has NO `company_links` row with company A
- AND company D has a `company_links` row with company A but `status != 'active'`
- WHEN the user opens `CreatePoolDialog`
- THEN only company B appears in the company selection list
- AND company C and company D are absent from the list

### Scenario: No linked companies shows empty state

- GIVEN the current user belongs to company A
- AND no `company_links` row exists with `status = 'active'` linking any company to company A
- WHEN the user opens `CreatePoolDialog`
- THEN the company selection list is empty
- AND the dialog MUST display an informative message explaining no linked companies are available

### Scenario: Invite dialog filters to linked companies (legacy PoolCard path)

- GIVEN the current user belongs to company A within an existing pool
- AND company B has an `active` `company_links` with company A
- AND company E has no `company_links` with company A
- WHEN the user triggers "Invitar Empresa" from `PoolCard`
- THEN company B appears as an invitable option
- AND company E does NOT appear

### Scenario: Insert without active company_links is rejected by database

- GIVEN company A (pool creator) and company F have NO `active` `company_links` row
- WHEN an INSERT is attempted into `pool_companies` for company F on a pool owned by company A
- THEN the database rejects the insert via trigger guard
- AND no row is written to `pool_companies`

### Scenario: Existing pool_companies rows are unaffected by the guard

- GIVEN pool_companies rows that existed before migration 028 runs
- WHEN migration 028 runs
- THEN those existing rows are not removed or invalidated
- AND existing pool queries continue to return those rows without error

### Non-Functional Requirements

- **Defense in Depth**: Both UI filter (client-side) and DB guard (server-side) MUST be active simultaneously. Bypassing the UI (e.g. via direct API call) MUST still be blocked by the database guard.
- **RLS Compatibility**: The new DB guard MUST NOT conflict with existing RLS policies from migrations 017–019. It MUST compose correctly with `is_pool_member` and other pool-related predicates.
- **Confidentiality**: The filtering of companies by `company_links` MUST NOT expose inter-company material details. The query that fetches linked companies MUST return only company identity fields (id, name) and MUST NOT join or return requirement or pricing data.

---

## Requirement: GAP 2 — Award Mode (Leader vs. Per-Company)

A purchase pool MUST support two mutually exclusive adjudication modes, selected at pool creation:

- **Mode A — `'leader'`** (default): one pool member (the leader) selects a single winning quote for the entire pool. Each company then generates its own OC from its `pool_item_contributions`. **Already implemented; this spec formalizes invariants.**
- **Mode B — `'per_company'`**: each participating company independently selects the winning quote for its own portion of items. The transition to `'adjudicado'` requires ALL companies to have confirmed a winner.

### Scenario: Pool created without specifying award_mode defaults to leader

- GIVEN a user creates a new pool without selecting an adjudication mode
- WHEN the pool row is inserted into `purchase_pools`
- THEN `award_mode = 'leader'`

### Scenario: Pool created with per_company mode stores the flag correctly

- GIVEN a user explicitly selects "adjudicación por empresa" during pool creation
- WHEN the pool row is inserted into `purchase_pools`
- THEN `award_mode = 'per_company'`

### Scenario: award_mode is immutable after pool reaches confirmado

- GIVEN a pool has `pool_state` in `{'confirmado', 'en_comparativa', ...}`
- WHEN a mutation attempts to change `award_mode`
- THEN the change is rejected
- AND `award_mode` retains its original value

### Scenario: Leader sets winning quote → pool transitions to adjudicado (Mode A)

- GIVEN a pool with `award_mode = 'leader'` and `pool_state = 'en_comparativa'`
- AND the current user is the pool leader
- WHEN the leader selects a winning quote in `PoolAwardPanel`
- THEN `purchase_pools.winning_quote_id` is set to the selected quote id
- AND `pool_state` transitions to `'adjudicado'`

### Scenario: Non-leader cannot set winning quote in Mode A

- GIVEN a pool with `award_mode = 'leader'` and `pool_state = 'en_comparativa'`
- AND the current user is NOT the pool leader
- WHEN the user attempts to set a winning quote
- THEN the action is rejected
- AND `winning_quote_id` is not modified

### Scenario: generateMyOc in Mode A uses pool-level winning_quote_id

- GIVEN a pool with `award_mode = 'leader'` and `pool_state = 'adjudicado'`
- AND `winning_quote_id` is set on `purchase_pools`
- WHEN a company member calls `generateMyOc`
- THEN the OC is generated using items from that company's `pool_item_contributions` for the winning quote
- AND the OC MUST NOT include items belonging to other companies

### Scenario: Pool transitions to cerrado after all companies generate OC in Mode A

- GIVEN a pool with `award_mode = 'leader'` and `pool_state = 'adjudicado'`
- WHEN all participating companies have successfully generated their OC
- THEN `pool_state` transitions to `'cerrado'`

### Scenario: Each company selects its own winning quote independently (Mode B)

- GIVEN a pool with `award_mode = 'per_company'` and `pool_state = 'en_comparativa'`
- AND companies A and B are participants
- WHEN company A selects quote Q1 as its winner
- THEN company A's winner is stored as Q1 in `pool_company_awards`
- AND company B can independently select a different quote Q2 for its own portion
- AND company B's selection does NOT overwrite company A's selection

### Scenario: pool_state becomes adjudicado only when all companies have a winner in Mode B

- GIVEN a pool with `award_mode = 'per_company'` and `pool_state = 'en_comparativa'`
- AND company A has confirmed a winner but company B has not
- WHEN the system evaluates whether to transition pool_state
- THEN `pool_state` remains `'en_comparativa'`
- AND the transition to `'adjudicado'` MUST NOT occur

### Scenario: All companies confirm winner → pool transitions to adjudicado in Mode B

- GIVEN a pool with `award_mode = 'per_company'` and `pool_state = 'en_comparativa'`
- AND all participating companies have confirmed their individual winner
- WHEN the last company confirms
- THEN `pool_state` transitions to `'adjudicado'`

### Scenario: generateMyOc in Mode B uses the company's own selected winner

- GIVEN a pool with `award_mode = 'per_company'` and `pool_state = 'adjudicado'`
- AND company A has confirmed winner quote QA with per-item selections in `pool_company_awards`
- WHEN company A calls `generateMyOc`
- THEN the OC is generated using items from company A's `pool_item_contributions` matched to company A's selected winners from `pool_company_awards`
- AND the OC MUST NOT reference any other company's winner or items

### Scenario: Pool transitions to cerrado after all companies generate OC in Mode B

- GIVEN a pool with `award_mode = 'per_company'` and `pool_state = 'adjudicado'`
- WHEN all participating companies have successfully generated their OC
- THEN `pool_state` transitions to `'cerrado'`

### Scenario: Mode A behavior is unaffected when award_mode = leader

- GIVEN the system has Mode B code deployed
- AND a pool has `award_mode = 'leader'`
- WHEN the pool progresses through en_comparativa → adjudicado → cerrado
- THEN all Mode A invariants hold without change
- AND no per-company winner records are written or read

### Scenario: award_mode selector is visible during pool creation

- GIVEN a user is creating a new pool
- WHEN the creation UI renders
- THEN an `award_mode` control is visible with at least two clearly labeled options: "Líder adjudica todo" and "Adjudicación por empresa"
- AND the default selection corresponds to `'leader'`

### Scenario: award_mode selector is read-only after borrador

- GIVEN a pool with `pool_state != 'borrador'`
- WHEN any company member views the pool detail
- THEN the `award_mode` selector is displayed as read-only
- AND no mutation to `award_mode` is possible from the UI

### Non-Functional Requirements

- **Confidentiality Invariant Preserved**: In Mode B, each company's winner selection MUST be accessible to that company only. One company's choice MUST NOT be visible to other participating companies except as an aggregate signal (e.g. "all companies have decided"). The underlying `pool_item_contributions` detail MUST NOT be exposed to other companies.
- **Mode A Default — No Regression**: Deploying Mode B support MUST NOT alter the behavior of pools using `award_mode = 'leader'`. All existing pool tests MUST pass without modification for Mode A pools.

---

## Requirement: GAP 3 — Supplier Dispatch (Union of Providers)

When a pool's shared RFQ (SC compartida) is dispatched, the system MUST notify the deduplicated union of all providers enabled by the participating companies. Today `generateSharedRfq` creates the RFQ but does not insert `rfq_providers` rows or invoke `notify-providers`.

### Scenario: Union includes providers from multiple companies without duplicates

- GIVEN pool P has companies A and B
- AND company A has enabled providers P1 and P2 (or selected them for this pool)
- AND company B has enabled providers P2 and P3
- WHEN `generateSharedRfq` executes
- THEN `rfq_providers` contains exactly one row each for P1, P2, and P3 linked to the new RFQ
- AND P2 is NOT duplicated

### Scenario: Union includes only providers enabled by at least one participating company

- GIVEN pool P has companies A and B
- AND provider P4 is enabled by neither company A nor company B
- WHEN `generateSharedRfq` executes
- THEN `rfq_providers` does NOT contain a row for P4

### Scenario: Single-company pool notifies only that company's providers

- GIVEN pool P has only company A
- AND company A has enabled providers P1 and P2 (or selected them for this pool)
- WHEN `generateSharedRfq` executes
- THEN `rfq_providers` contains rows for P1 and P2 only

### Scenario: rfq_providers rows are inserted after RFQ creation

- GIVEN a pool dispatch that produces RFQ id `rfq-123`
- AND the provider union is {P1, P2}
- WHEN `generateSharedRfq` completes
- THEN two rows exist in `rfq_providers`: one for P1 and one for P2, both linked to `rfq-123`

### Scenario: Idempotent re-execution does not duplicate rfq_providers

- GIVEN `rfq_providers` already contains rows for RFQ `rfq-123` from a first run
- WHEN `generateSharedRfq` is called again for the same pool and produces the same RFQ id
- THEN `rfq_providers` still contains exactly the same rows (no new duplicates)
- AND the row count for `rfq-123` in `rfq_providers` is unchanged

### Scenario: notify-providers is called once after successful dispatch

- GIVEN a pool dispatch with a non-empty provider union
- WHEN `generateSharedRfq` completes successfully
- THEN `notify-providers` is invoked exactly once with the correct `rfq_id`

### Scenario: notify-providers is NOT called when provider union is empty

- GIVEN a pool whose participating companies have no enabled providers for the materials
- WHEN `generateSharedRfq` executes
- THEN `rfq_providers` remains empty
- AND `notify-providers` is NOT invoked

### Scenario: notify-providers is not called twice on partial retry

- GIVEN `rfq_providers` is already populated (retry scenario)
- WHEN `generateSharedRfq` is called again for the same RFQ
- THEN `notify-providers` is invoked at most once in the retry run
- AND the total invocation count across both runs does not exceed two

### Non-Functional Requirements

- **Confidentiality**: Provider union construction MUST NOT expose one company's enabled-provider list to another company. The union result (a list of provider ids) is shared, but no company-specific attribution is leaked.
- **Edge Function Availability**: The `notify-providers` edge function MUST exist and be deployable before `generateSharedRfq` invokes it.
- **Failure Isolation**: If the `notify-providers` invocation fails, `generateSharedRfq` MUST surface the error to the caller. The RFQ and `rfq_providers` rows written before the invocation MUST remain in the database (no rollback), allowing a future retry to re-invoke notification without re-creating the RFQ.

---

## Requirement: GAP 4 — Withdraw and Cancel Pool

A participating company MUST be able to withdraw from a pool while it is in `'borrador'` state. Once the pool reaches `'confirmado'`, individual withdrawal is not permitted; the only exit is cancellation of the entire pool. All mutations MUST operate on `pool_state`, not on the legacy `status` column.

### Scenario: Member withdraws from borrador pool

- GIVEN a pool with `pool_state = 'borrador'` and at least two company members (including the actor)
- AND the actor is NOT the pool creator, OR is the creator but at least one other member remains
- WHEN the company member triggers "Retirarse del pool"
- THEN the company's row is removed from `pool_companies`
- AND the pool remains with its remaining members
- AND `pool_state` is unchanged (still `'borrador'`)

### Scenario: Last member (creator) withdraws from borrador pool → pool is cancelled

- GIVEN a pool with `pool_state = 'borrador'` and only one remaining member (the creator)
- WHEN the creator triggers "Retirarse del pool"
- THEN the company's row is removed from `pool_companies`
- AND `pool_state` transitions to `'cancelado'`

### Scenario: Withdraw is NOT permitted when pool_state is confirmado

- GIVEN a pool with `pool_state = 'confirmado'`
- WHEN any company member triggers "Retirarse del pool"
- THEN the action is rejected
- AND `pool_companies` is unchanged
- AND the UI MUST display an explanation that withdrawal is not available after confirmation

### Scenario: Withdraw is NOT permitted for any pool_state beyond borrador

- GIVEN a pool with `pool_state` in `{'confirmado', 'en_comparativa', 'adjudicado', 'cerrado', 'cancelado'}`
- WHEN any mutation attempts to remove a company member via the withdraw flow
- THEN the mutation is rejected
- AND `pool_companies` is unchanged

### Scenario: Any member can cancel a borrador pool

- GIVEN a pool with `pool_state = 'borrador'`
- WHEN a company member confirms the cancel action
- THEN `pool_state` is set to `'cancelado'`
- AND all members of the pool lose access to pool actions

### Scenario: Any member can cancel a confirmado pool

- GIVEN a pool with `pool_state = 'confirmado'`
- WHEN a company member confirms the cancel action
- THEN `pool_state` is set to `'cancelado'`
- AND all members of the pool lose access to pool actions

### Scenario: Any member can cancel an en_comparativa pool

- GIVEN a pool with `pool_state = 'en_comparativa'`
- WHEN a company member confirms the cancel action
- THEN `pool_state` is set to `'cancelado'`

### Scenario: Cancellation requires explicit user confirmation

- GIVEN a pool in any non-cerrado, non-cancelado state
- WHEN the company member clicks "Cancelar Pool"
- THEN the UI MUST present a confirmation dialog before executing the mutation
- AND if the user dismisses the confirmation, `pool_state` MUST NOT change

### Scenario: Cancelled pool cannot be cancelled again

- GIVEN a pool with `pool_state = 'cancelado'`
- WHEN any mutation attempts to cancel the pool again
- THEN the mutation is rejected or is a no-op
- AND `pool_state` remains `'cancelado'`

### Scenario: Closed pool cannot be cancelled

- GIVEN a pool with `pool_state = 'cerrado'`
- WHEN any mutation attempts to cancel the pool
- THEN the action is rejected
- AND `pool_state` remains `'cerrado'`

### Scenario: updatePoolStatus writes pool_state not status

- GIVEN `updatePoolStatus` is called with a new state value
- WHEN the mutation executes
- THEN the `pool_state` column on `purchase_pools` is updated
- AND the legacy `status` column is NOT written by this call

### Scenario: Cancel mutation writes pool_state = cancelado

- GIVEN a cancel action is confirmed by the user
- WHEN the cancel mutation executes
- THEN `pool_state` on `purchase_pools` is set to `'cancelado'`
- AND the legacy `status` column is NOT written

### Scenario: UI actions visibility by pool state

| pool_state      | Withdraw (member) | Cancel (any member) | Other pool actions      |
|-----------------|-------------------|---------------------|-------------------------|
| `borrador`      | MUST be available | MUST be available   | Normal pool creation    |
| `confirmado`    | MUST NOT be available | MUST be available | Transition to dispatch  |
| `en_comparativa`| MUST NOT be available | MUST be available | Award flow              |
| `adjudicado`    | MUST NOT be available | MUST be available | generateMyOc            |
| `cerrado`       | MUST NOT be available | MUST NOT be available | Read-only              |
| `cancelado`     | MUST NOT be available | MUST NOT be available | Read-only              |

### Scenario: UI hides withdraw button for confirmado pool

- GIVEN a pool with `pool_state = 'confirmado'`
- WHEN a company member views the pool
- THEN the "Retirarse del pool" button is NOT visible or is visibly disabled with an explanatory tooltip

### Scenario: UI hides both actions for cerrado and cancelado pools

- GIVEN a pool with `pool_state` in `{'cerrado', 'cancelado'}`
- WHEN any company member views the pool
- THEN neither "Retirarse del pool" nor "Cancelar Pool" is visible or operable

### Non-Functional Requirements

- **Confirmation Before Destructive Actions**: Both withdraw and cancel MUST be preceded by a confirmation step in the UI. The confirmation MUST communicate the irreversibility of cancellation and (for confirmado+) the fact that cancellation affects all pool participants.
- **Auditability**: Every cancel action MUST be reflected in the `pool_state` column change, which is auditable via Supabase's standard row history or any audit trigger in place.

---

## Requirement: GAP 5 — Requirement History Records Pool Participation

When a requirement is added to a pool via `addMyRequirements`, the system MUST insert a history event on each affected requirement recording: which pool it joined, the pool's human-readable correlative number (`pool_number`), and the names of all companies participating in the pool at the time of joining.

### Scenario: pool_number is assigned at pool creation

- GIVEN no pool exists in the system
- WHEN the first pool is created
- THEN `purchase_pools.pool_number` is set to a positive integer (e.g. 1)

### Scenario: pool_number increments for each new pool

- GIVEN pool P1 was assigned `pool_number = 5`
- WHEN a second pool P2 is created afterwards
- THEN `pool_number` for P2 is greater than 5

### Scenario: pool_number is unique across all pools

- GIVEN any two distinct pools in the database
- THEN their `pool_number` values are different

### Scenario: Concurrent pool creation does not produce duplicate pool_number

- GIVEN two pool inserts happen nearly simultaneously
- WHEN both inserts succeed
- THEN each pool receives a distinct `pool_number` (database-level serialization guarantees this)

### Scenario: pool_number cannot be NULL on any pool row

- GIVEN any INSERT into `purchase_pools`
- WHEN the row is committed
- THEN `pool_number` is NOT NULL

### Scenario: One event per requirement is inserted on pool join

- GIVEN a pool with companies A and B, `pool_number = 3`
- AND `addMyRequirements` is called adding requirements R1 and R2
- WHEN the operation succeeds
- THEN one `requerimiento_evento` with `tipo = 'pool_joined'` is inserted for R1
- AND one `requerimiento_evento` with `tipo = 'pool_joined'` is inserted for R2
- AND no additional events are inserted beyond those two

### Scenario: Event metadata contains pool_number and participating companies

- GIVEN the scenario above
- WHEN the event for R1 is read
- THEN `metadata.pool_number` equals 3
- AND `metadata.companies` contains "Empresa A" and "Empresa B" (the names of the participating companies at the time of joining)
- AND `metadata.pool_id` contains the UUID of the pool

### Scenario: No event is inserted for requirements not added in this call

- GIVEN requirements R3 and R4 that already belonged to the pool from a previous call
- WHEN `addMyRequirements` is called again for only R5
- THEN only one event is inserted (for R5)
- AND no new events are inserted for R3 or R4

### Scenario: addMyRequirements fails atomically if event insert fails

- GIVEN `addMyRequirements` is in progress
- WHEN the `requerimiento_evento` INSERT fails (e.g. CHECK violation on tipo)
- THEN the entire operation is rolled back
- AND no `pool_companies` or requirement association rows are left in a partial state

### Scenario: Migration adds pool_joined to tipo CHECK

- GIVEN the database schema before migration 028
- WHEN migration 028 runs
- THEN the CHECK constraint on `requerimiento_evento.tipo` includes the pool-join event type
- AND inserting a `requerimiento_evento` with that `tipo` succeeds without constraint violation
- AND existing valid event types (e.g. `'consolidado'`, others) remain valid

### Scenario: Pool participation event is human-readable in history view

- GIVEN a requirement R1 that has a `tipo = 'pool_joined'` event with `pool_number = 3` and `companies = ['Empresa A', 'Empresa B']`
- WHEN the requirement's history is viewed
- THEN the event is displayed with a reference to "Pool #3" (or equivalent)
- AND the names of the participating companies are visible in the event entry

### Non-Functional Requirements

- **pool_number Assigned at DB Level**: `pool_number` MUST be generated by the database (e.g. via a sequence). Client code MUST NOT compute or pass `pool_number` during insert.
- **Confidentiality**: The `companies` list stored in `metadata` MUST contain only company names (not internal requirement details). The event MUST be readable only by members of the pool. The event MUST NOT expose quantities, prices, or item details of any other participating company.
- **Idempotency**: If `addMyRequirements` is retried for the same set of requirements, the behavior MUST be defined explicitly. The minimal guarantee is: at least one event MUST exist per requirement per pool-join action, and the event MUST contain correct metadata.

---

## Summary of Changes

| Gap | Domain | Change | Dependencies |
|-----|--------|--------|--------------|
| 1 | Invitations | Filter UI + DB guard (trigger) | company_links active status |
| 2 | Award Modes | Add `award_mode` flag + `pool_company_awards` table + Mode B logic | existing Mode A (019) |
| 3 | Dispatch | Manual provider selection table + union dispatch RPC | notify-providers function |
| 4 | Lifecycle | Withdraw/cancel via `pool_state` (not legacy `status`) | pool_state enum existing |
| 5 | History | pool_number sequence + pool_joined event type | requerimiento_evento structure |

---

## Related Follow-ups (Out of Scope for pool-compras-fixes)

- **CUIT Search in Links**: Spec mentions searching links by CUIT; currently name-only. Deferred to next phase.
- **Assisted Material Mapping**: Spec mentions name/unit/code search; currently flat Select. UX deferred.
- **Auto-Cancel on Last Member Withdraw**: Spec allows it; design chose to make it implicit (last withdraw sets state to cancelado). Behavior confirmed.
- **Full-Mesh Links for 3+ Company Pools**: For pools with 3+ companies, whether all pairs must have active links or only links to the creator. Design clarified: creator + all-link-creator suffices (not full-mesh); see design phase for final ruling.
- **Deprecation of Legacy PoolCard status Layer**: The legacy enum `status` and buttons ("Cerrar Pool", "Invitar Empresa", etc.) remain; only "Invitar Empresa" is neutralized by the filter. Full removal deferred to follow-up.
