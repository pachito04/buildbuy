# Delta for Pool Flow (#9b)

## ADDED Requirements

### Requirement: Pool visible to all participant companies

`purchase_pools`, `pool_companies`, `pool_items`, and `pool_item_contributions` MUST be visible to any company that is a `pool_companies` member of the pool. A non-member company MUST see none of them.

#### Scenario: Member sees the shared pool

- GIVEN companies A and B are members of pool P
- WHEN B queries pools
- THEN P, its members, its consolidated items, and the per-company contributions are visible to B

#### Scenario: Non-member sees nothing

- GIVEN company C is not a member of pool P
- WHEN C queries
- THEN P and its items are NOT visible to C

### Requirement: Requirement detail is confidential per company

`pool_requests` MUST be visible ONLY to the company that owns the underlying request (`requests.company_id`). A participant MUST NOT see which requirements another company contributed.

#### Scenario: Own contributions only

- GIVEN A contributed request R_a and B contributed R_b to pool P
- WHEN B queries `pool_requests` of P
- THEN B sees R_b but NOT R_a
- AND B still sees the consolidated `pool_items`/contributions (totals), not A's requirement detail

### Requirement: Pool states

`purchase_pools` MUST carry a `pool_state` constrained to `borrador | confirmado | en_comparativa | adjudicado | cerrado | cancelado`, defaulting to `borrador`. The legacy `pool_status` enum is unchanged.

#### Scenario: Column with default

- GIVEN migration 018 is applied
- THEN `purchase_pools.pool_state` exists (CHECK the 6 values, default `borrador`)
- AND existing pools default to `borrador`

### Requirement: Per-company contributions per consolidated line

Each consolidated `pool_items` line MUST record how many units each company contributed, via `pool_item_contributions` (pool_item_id, company_id, quantity). The sum of a line's contributions MUST equal its `total_quantity`.

#### Scenario: Contributions sum to the total

- GIVEN a consolidated material line built from A (10) and B (15)
- THEN `pool_items.total_quantity = 25`
- AND two `pool_item_contributions` rows (A=10, B=15) sum to 25

### Requirement: Material crossing via confirmed mappings only

When consolidating, items from different companies MUST be combined into one line only when their materials are linked by a **usable** `material_mappings` row (both companies confirmed) on an **active** link. Items without a usable mapping MUST NOT be cross-combined.

#### Scenario: Mapped materials combine

- GIVEN A's material M_a and B's material M_b are mapped and confirmed by both on an active link
- WHEN the pool consolidates
- THEN A's M_a items and B's M_b items merge into one consolidated line

#### Scenario: Unmapped materials stay separate

- GIVEN A's material has no confirmed mapping to any B material
- THEN A's items form their own line (not merged with B's)

### Requirement: Each company contributes its own requirements; shared RFQ

A company MUST be able to add only its OWN eligible requirements to the pool. Once participation is confirmed, the pool MUST generate one shared RFQ from the consolidated items.

#### Scenario: Own requirements only

- GIVEN a member company adds requirements to the pool
- THEN it can only add requirements its own company owns

#### Scenario: Shared RFQ generated

- GIVEN the pool is confirmed with consolidated items
- WHEN the shared RFQ is generated
- THEN one RFQ is created from the consolidated `pool_items` totals
- AND the pool moves to `en_comparativa`

### Requirement: Existing non-pool flows unaffected

Reworking pool RLS MUST NOT change non-pool data access. Adding a requirement to a pool MUST NOT write an invalid `requests.status` (the legacy `in_pool` value, absent from the enum).

#### Scenario: No invalid status write

- GIVEN a requirement is added to a pool
- THEN no `requests.status='in_pool'` update is attempted (the prior latent bug is removed)
