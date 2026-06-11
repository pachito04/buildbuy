# GAP 5 — Requirement History Records Pool Participation

## Purpose

When a requirement is added to a pool via `addMyRequirements`, the system MUST insert a history event on each affected requirement recording: which pool it joined, the pool's human-readable correlative number (`pool_number`), and the names of all companies participating in the pool at the time of joining. Today `addMyRequirements` writes no event, leaving the requirement's history silent about pool participation.

This spec also defines `pool_number`: a correlative integer identifier on `purchase_pools`, assigned by the database at pool creation, that provides a human-readable reference for the pool (distinct from the UUID primary key).

---

## Requirements

### Requirement: pool_number — Human-Readable Correlative

`purchase_pools` MUST have a `pool_number` column of an integer type. The database MUST assign `pool_number` automatically at INSERT time, ensuring it is monotonically increasing and unique across all pools. The assignment MUST occur at the database level (not in client code) to avoid race conditions under concurrent inserts. The column MUST be introduced in migration **028** or higher.

#### Scenario: pool_number is assigned at pool creation

- GIVEN no pool exists in the system
- WHEN the first pool is created
- THEN `purchase_pools.pool_number` is set to a positive integer (e.g. 1)

#### Scenario: pool_number increments for each new pool

- GIVEN pool P1 was assigned `pool_number = 5`
- WHEN a second pool P2 is created afterwards
- THEN `pool_number` for P2 is greater than 5

#### Scenario: pool_number is unique across all pools

- GIVEN any two distinct pools in the database
- THEN their `pool_number` values are different

#### Scenario: Concurrent pool creation does not produce duplicate pool_number

- GIVEN two pool inserts happen nearly simultaneously
- WHEN both inserts succeed
- THEN each pool receives a distinct `pool_number` (database-level serialization guarantees this)

#### Scenario: pool_number cannot be NULL on any pool row

- GIVEN any INSERT into `purchase_pools`
- WHEN the row is committed
- THEN `pool_number` is NOT NULL

---

### Requirement: History Event on Pool Join

When `addMyRequirements` successfully adds a set of requirements to a pool, the system MUST insert one `requerimiento_evento` record per requirement added. Each event MUST have:

- `tipo = 'pool_joined'` (or a semantically equivalent value — the exact string MUST be defined by the design phase and confirmed to be a valid member of the `requerimiento_evento.tipo` CHECK constraint, updated in migration **028** or higher)
- `metadata` containing at minimum: `pool_id` (UUID), `pool_number` (integer), and `companies` (list of company names participating in the pool at the time of joining)
- A reference to the relevant `request_id`

If multiple requirements from the same requisition are added to the pool in one `addMyRequirements` call, each requirement MUST produce exactly one event.

#### Scenario: One event per requirement is inserted on pool join

- GIVEN a pool with companies A and B, `pool_number = 3`
- AND `addMyRequirements` is called adding requirements R1 and R2
- WHEN the operation succeeds
- THEN one `requerimiento_evento` with `tipo = 'pool_joined'` is inserted for R1
- AND one `requerimiento_evento` with `tipo = 'pool_joined'` is inserted for R2
- AND no additional events are inserted beyond those two

#### Scenario: Event metadata contains pool_number and participating companies

- GIVEN the scenario above
- WHEN the event for R1 is read
- THEN `metadata.pool_number` equals 3
- AND `metadata.companies` contains "Empresa A" and "Empresa B" (the names of the participating companies at the time of joining)
- AND `metadata.pool_id` contains the UUID of the pool

#### Scenario: No event is inserted for requirements not added in this call

- GIVEN requirements R3 and R4 that already belonged to the pool from a previous call
- WHEN `addMyRequirements` is called again for only R5
- THEN only one event is inserted (for R5)
- AND no new events are inserted for R3 or R4

#### Scenario: addMyRequirements fails atomically if event insert fails

- GIVEN `addMyRequirements` is in progress
- WHEN the `requerimiento_evento` INSERT fails (e.g. CHECK violation on tipo)
- THEN the entire operation is rolled back
- AND no `pool_companies` or requirement association rows are left in a partial state

---

### Requirement: tipo CHECK Constraint Update

The CHECK constraint on `requerimiento_evento.tipo` MUST include the new event type for pool joining (exact value TBD at design). This MUST be added in migration **028** or higher. The migration MUST be additive: existing valid `tipo` values MUST remain valid after the migration runs.

#### Scenario: Migration adds pool_joined to tipo CHECK

- GIVEN the database schema before migration 028
- WHEN migration 028 (or the designated migration) runs
- THEN the CHECK constraint on `requerimiento_evento.tipo` includes the pool-join event type
- AND inserting a `requerimiento_evento` with that `tipo` succeeds without constraint violation
- AND existing valid event types (e.g. `'consolidado'`, others) remain valid

---

### Requirement: pool_number Exposed in UI History

When the requirement history is displayed (e.g. in `RequestDetailModal` or equivalent), pool participation events MUST render the `pool_number` in a human-readable format (e.g. "Participó en Pool #3 junto a Empresa A y Empresa B"). The exact copy is a UX concern; the spec requires only that `pool_number` and the company list are surfaced from `metadata`.

#### Scenario: Pool participation event is human-readable in history view

- GIVEN a requirement R1 that has a `tipo = 'pool_joined'` event with `pool_number = 3` and `companies = ['Empresa A', 'Empresa B']`
- WHEN the requirement's history is viewed
- THEN the event is displayed with a reference to "Pool #3" (or equivalent)
- AND the names of the participating companies are visible in the event entry

---

## Non-Functional Requirements

### Requirement: pool_number Assigned at DB Level

`pool_number` MUST be generated by the database (e.g. via a sequence, `serial`, `generated always as identity`, or a trigger). Client code MUST NOT compute or pass `pool_number` during insert. This guarantees uniqueness and monotonicity without client-side coordination.

### Requirement: Confidentiality Invariant

The `companies` list stored in `metadata` MUST contain only the company names (not their internal requirement details). The event MUST be readable only by members of the pool (existing RLS applies). The event MUST NOT expose the quantities, prices, or item details of any other participating company.

### Requirement: Idempotency Consideration

If `addMyRequirements` is retried for the same set of requirements, the design MAY choose to insert duplicate events or to de-duplicate them. This spec requires that the behavior be defined explicitly in the design phase. The minimal guarantee from this spec is: at least one event MUST exist per requirement per pool-join action, and the event MUST contain correct metadata.
