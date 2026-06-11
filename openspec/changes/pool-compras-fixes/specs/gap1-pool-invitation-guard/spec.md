# GAP 1 — Pool Invitation Guard (Linked Companies Only)

## Purpose

A company MUST NOT be addable to a purchase pool unless an `active` `company_links` row exists that joins it to the pool-creating company. This spec defines the UI filter and the backend database guard that enforce this invariant for the `pool-compras-fixes` change.

This gap directly addresses a business-rule breach: today any BuildBuy company can be invited to any pool regardless of whether a commercial relationship has been established.

---

## Requirements

### Requirement: UI Filter in Pool Creation Dialog

`CreatePoolDialog` MUST fetch and display only companies that have an `active` `company_links` record with the current user's company. Companies with no `company_links` row, or with a row whose `status` is not `active`, MUST NOT appear in the company selection list.

#### Scenario: Only linked companies appear in CreatePoolDialog

- GIVEN the current user belongs to company A
- AND company B has an `active` `company_links` row with company A
- AND company C has NO `company_links` row with company A
- AND company D has a `company_links` row with company A but `status != 'active'`
- WHEN the user opens `CreatePoolDialog`
- THEN only company B appears in the company selection list
- AND company C and company D are absent from the list

#### Scenario: No linked companies shows empty state

- GIVEN the current user belongs to company A
- AND no `company_links` row exists with `status = 'active'` linking any company to company A
- WHEN the user opens `CreatePoolDialog`
- THEN the company selection list is empty
- AND the dialog MUST display an informative message explaining no linked companies are available

---

### Requirement: UI Filter in Legacy "Invitar Empresa" Path

The "Invitar Empresa" action in `PoolCard` MUST apply the same company filter: only companies with an `active` `company_links` row linking them to the current user's company MUST be shown as invitable. This neutralizes the data leak via the legacy path without requiring full removal of the legacy UI (which is a separate follow-up).

#### Scenario: Invite dialog filters to linked companies

- GIVEN the current user belongs to company A within an existing pool
- AND company B has an `active` `company_links` with company A
- AND company E has no `company_links` with company A
- WHEN the user triggers "Invitar Empresa" from `PoolCard`
- THEN company B appears as an invitable option
- AND company E does NOT appear

---

### Requirement: Database Guard on pool_companies Insert

The database MUST enforce that any INSERT into `pool_companies` for a new company is only permitted when an `active` `company_links` record exists joining the invited company to the pool-creating company. This guard MUST be implemented as a migration numbered **028** or higher (migration 027 is the highest existing migration at the time this change is applied).

The guard MUST apply to new inserts only. It MUST NOT invalidate or break any existing `pool_companies` rows created before the guard was introduced.

#### Scenario: Insert with active company_links succeeds

- GIVEN company A (pool creator) and company B share an `active` `company_links` row
- WHEN an INSERT is attempted into `pool_companies` for company B on a pool owned by company A
- THEN the insert succeeds

#### Scenario: Insert without active company_links is rejected

- GIVEN company A (pool creator) and company F have NO `active` `company_links` row
- WHEN an INSERT is attempted into `pool_companies` for company F on a pool owned by company A
- THEN the database rejects the insert
- AND no row is written to `pool_companies`

#### Scenario: Insert with inactive company_links is rejected

- GIVEN company A and company G have a `company_links` row but `status != 'active'`
- WHEN an INSERT is attempted into `pool_companies` for company G on a pool owned by company A
- THEN the database rejects the insert

#### Scenario: Existing pool_companies rows are unaffected by the guard

- GIVEN pool_companies rows that existed before migration 028 runs
- WHEN migration 028 runs
- THEN those existing rows are not removed or invalidated
- AND existing pool queries continue to return those rows without error

---

## Non-Functional Requirements

### Requirement: Defense in Depth

Both the UI filter (client-side) and the DB guard (server-side) MUST be active simultaneously. Bypassing the UI (e.g. via direct API call) MUST still be blocked by the database guard.

### Requirement: RLS Compatibility

The new DB guard MUST NOT conflict with any existing RLS policies introduced in migrations 017–019. It MUST compose correctly with `is_pool_member` and any other existing pool-related predicates.

### Requirement: No Impact on Confidentiality Invariant

The filtering of companies by `company_links` MUST NOT expose any inter-company material detail. The query that fetches linked companies MUST return only the company identity fields (id, name, etc.) and MUST NOT join or return any requirement or pricing data of the linked company.
