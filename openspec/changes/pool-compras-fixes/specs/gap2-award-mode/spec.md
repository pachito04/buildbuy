# GAP 2 — Award Mode: Leader vs. Per-Company

## Purpose

A purchase pool MUST support two mutually exclusive adjudication modes, selected at pool creation and persisted on `purchase_pools.award_mode`:

- **Mode A — `'leader'`** (default): one pool member (the leader) selects a single winning quote for the entire pool. All companies then generate their own OC from their `pool_item_contributions`. This mode is already implemented; this spec formalizes its invariants.
- **Mode B — `'per_company'`**: each participating company independently selects the winning quote for its own portion of items. Companies are not blocked by each other's choices. The transition to `cerrado` requires all companies to have a confirmed winner.

The design phase MUST resolve the data-model specifics for Mode B (see Open Questions at the end). This spec defines required behaviors for both modes so the design can be finalized.

---

## Requirements

### Requirement: award_mode Flag

`purchase_pools` MUST have an `award_mode` column. The column MUST accept the values `'leader'` and `'per_company'`. The default value MUST be `'leader'`. The column MUST be introduced in migration **028** or higher.

#### Scenario: Pool created without specifying award_mode defaults to leader

- GIVEN a user creates a new pool without selecting an adjudication mode
- WHEN the pool row is inserted into `purchase_pools`
- THEN `award_mode = 'leader'`

#### Scenario: Pool created with per_company mode stores the flag correctly

- GIVEN a user explicitly selects "adjudicación por empresa" during pool creation
- WHEN the pool row is inserted into `purchase_pools`
- THEN `award_mode = 'per_company'`

#### Scenario: award_mode is immutable after pool reaches confirmado

- GIVEN a pool has `pool_state = 'confirmado'` or any later state
- WHEN a mutation attempts to change `award_mode`
- THEN the change is rejected
- AND `award_mode` retains its original value

---

### Requirement: Mode A — Leader Award (existing behavior, formalized)

When `award_mode = 'leader'`, exactly one company member (the designated leader) MUST be able to set `purchase_pools.winning_quote_id`. All other members MUST NOT be able to set `winning_quote_id`. After the leader selects a winner, `pool_state` transitions to `'adjudicado'`. Each company then generates its OC using its own `pool_item_contributions` for the winning quote.

#### Scenario: Leader sets winning quote → pool transitions to adjudicado

- GIVEN a pool with `award_mode = 'leader'` and `pool_state = 'en_comparativa'`
- AND the current user is the pool leader
- WHEN the leader selects a winning quote in `PoolAwardPanel`
- THEN `purchase_pools.winning_quote_id` is set to the selected quote id
- AND `pool_state` transitions to `'adjudicado'`

#### Scenario: Non-leader cannot set winning quote in Mode A

- GIVEN a pool with `award_mode = 'leader'` and `pool_state = 'en_comparativa'`
- AND the current user is NOT the pool leader
- WHEN the user attempts to set a winning quote
- THEN the action is rejected
- AND `winning_quote_id` is not modified

#### Scenario: generateMyOc in Mode A uses pool-level winning_quote_id

- GIVEN a pool with `award_mode = 'leader'` and `pool_state = 'adjudicado'`
- AND `winning_quote_id` is set on `purchase_pools`
- WHEN a company member calls `generateMyOc`
- THEN the OC is generated using the items from that company's `pool_item_contributions` for the winning quote
- AND the OC MUST NOT include items belonging to other companies

#### Scenario: Pool transitions to cerrado after all companies generate OC in Mode A

- GIVEN a pool with `award_mode = 'leader'` and `pool_state = 'adjudicado'`
- WHEN all participating companies have successfully generated their OC
- THEN `pool_state` transitions to `'cerrado'`

---

### Requirement: Mode B — Per-Company Award

When `award_mode = 'per_company'`, each participating company MUST independently select a winning quote for its own portion. Each company's winner selection MUST be persisted separately (the exact persistence model is an open question for design; see below). No company is blocked from selecting a winner while another company has not yet chosen.

After a company selects its winner, the system MUST mark that company's adjudication as confirmed for that company only; this does NOT set `pool_state = 'adjudicado'` by itself.

`pool_state` transitions to `'adjudicado'` only when every participating company has confirmed a winner. `pool_state` transitions to `'cerrado'` only after every company has generated its OC.

#### Scenario: Each company selects its own winning quote independently

- GIVEN a pool with `award_mode = 'per_company'` and `pool_state = 'en_comparativa'`
- AND companies A and B are participants
- WHEN company A selects quote Q1 as its winner
- THEN company A's winner is stored as Q1
- AND company B can independently select a different quote Q2 for its own portion
- AND company B's selection does NOT overwrite company A's selection

#### Scenario: pool_state becomes adjudicado only when all companies have a winner in Mode B

- GIVEN a pool with `award_mode = 'per_company'` and `pool_state = 'en_comparativa'`
- AND company A has confirmed a winner but company B has not
- WHEN the system evaluates whether to transition pool_state
- THEN `pool_state` remains `'en_comparativa'`
- AND the transition to `'adjudicado'` MUST NOT occur

#### Scenario: All companies confirm winner → pool transitions to adjudicado in Mode B

- GIVEN a pool with `award_mode = 'per_company'` and `pool_state = 'en_comparativa'`
- AND all participating companies have confirmed their individual winner
- WHEN the last company confirms
- THEN `pool_state` transitions to `'adjudicado'`

#### Scenario: generateMyOc in Mode B uses the company's own selected winner

- GIVEN a pool with `award_mode = 'per_company'` and `pool_state = 'adjudicado'`
- AND company A has confirmed winner quote QA
- WHEN company A calls `generateMyOc`
- THEN the OC is generated using items from company A's `pool_item_contributions` for quote QA
- AND the OC MUST NOT reference any other company's winner or items

#### Scenario: Pool transitions to cerrado after all companies generate OC in Mode B

- GIVEN a pool with `award_mode = 'per_company'` and `pool_state = 'adjudicado'`
- WHEN all participating companies have successfully generated their OC
- THEN `pool_state` transitions to `'cerrado'`

#### Scenario: Mode A behavior is unaffected when award_mode = leader

- GIVEN the system has Mode B code deployed
- AND a pool has `award_mode = 'leader'`
- WHEN the pool progresses through en_comparativa → adjudicado → cerrado
- THEN all Mode A invariants hold without change
- AND no per-company winner records are written or read

---

### Requirement: award_mode Selector in PoolFlowPanel

`PoolFlowPanel` or `CreatePoolDialog` MUST expose the `award_mode` selector as a visible, labeled UI control at pool creation time. The control MUST be rendered regardless of the pool's current `pool_state` at creation, and MUST be read-only once the pool is past `'borrador'`.

#### Scenario: award_mode selector is visible during pool creation

- GIVEN a user is creating a new pool
- WHEN the creation UI renders
- THEN an `award_mode` control is visible with at least two clearly labeled options: "Líder adjudica todo" and "Adjudicación por empresa"
- AND the default selection corresponds to `'leader'`

#### Scenario: award_mode selector is read-only after borrador

- GIVEN a pool with `pool_state != 'borrador'`
- WHEN any company member views the pool detail
- THEN the `award_mode` selector is displayed as read-only
- AND no mutation to `award_mode` is possible from the UI

---

## Non-Functional Requirements

### Requirement: Confidentiality Invariant Preserved in Mode B

In Mode B, each company's winner selection MUST be accessible to that company only. One company's choice MUST NOT be visible to other participating companies except as an aggregate signal (e.g. "all companies have decided"). The underlying `pool_item_contributions` detail of one company MUST NOT be exposed to any other company, consistent with the existing RLS confidentiality invariant.

### Requirement: Mode A Default — No Regression

Deploying Mode B support MUST NOT alter the behavior of pools that use `award_mode = 'leader'`. All existing pool tests MUST pass without modification for Mode A pools.

---

## Open Questions for Design Phase

These MUST be resolved by `sdd-design` before `sdd-tasks` can finalize Mode B work:

1. **Where does the per-company winner live?** Options include a `winning_quote_id` column on `pool_item_contributions` (one row per company per item) or a dedicated `pool_company_awards` join table. The design MUST document the chosen model and its migration number (028+).
2. **Who triggers the pool_state → adjudicado transition in Mode B?** Options: the last-confirming company's mutation auto-triggers it server-side (trigger/function), or the client polls/calls a separate transition. The design MUST specify.
3. **Is Mode B's per-company winner scoped to quotes or to items?** The spec allows either "each company picks one winning quote for all its items" (simpler) or "each company picks per-item" (more flexible). The design MUST commit to one.
4. **How does PoolAwardPanel differentiate the two modes in the UI?** The spec requires the two modes behave differently — the design MUST define the conditional rendering contract between `PoolAwardPanel` and `usePoolAward`.
