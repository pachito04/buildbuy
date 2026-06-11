# GAP 3 — Supplier Dispatch: Union of Providers

## Purpose

When a pool's shared RFQ (SC compartida) is dispatched, the system MUST notify the deduplicated union of all providers enabled by the participating companies (or explicitly selected for the pool). Today `generateSharedRfq` creates the RFQ with `status='sent'` but does not insert `rfq_providers` rows and does not invoke the `notify-providers` edge function, meaning suppliers never receive notification.

This spec defines the required behavior for provider set construction, persistence, and notification.

---

## Requirements

### Requirement: Provider Set Construction

`generateSharedRfq` MUST build the set of providers to notify as the deduplicated union of all providers that are enabled by each participating company for the materials in the pool. A provider that is enabled by at least one participating company MUST be included. A provider MUST appear at most once in `rfq_providers` for a given RFQ, regardless of how many companies enable it.

The exact source of "enabled providers per company" (e.g. a `company_providers` or `enabled_providers` table) MUST be determined at design time. This spec requires only that the union is taken across all participating companies and that the result is deduplicated by provider identity.

#### Scenario: Union includes providers from multiple companies without duplicates

- GIVEN pool P has companies A and B
- AND company A has enabled providers P1 and P2 for the relevant materials
- AND company B has enabled providers P2 and P3
- WHEN `generateSharedRfq` executes
- THEN `rfq_providers` contains exactly one row each for P1, P2, and P3 linked to the new RFQ
- AND P2 is NOT duplicated

#### Scenario: Union includes only providers enabled by at least one participating company

- GIVEN pool P has companies A and B
- AND provider P4 is enabled by neither company A nor company B
- WHEN `generateSharedRfq` executes
- THEN `rfq_providers` does NOT contain a row for P4

#### Scenario: Single-company pool notifies only that company's providers

- GIVEN pool P has only company A
- AND company A has enabled providers P1 and P2
- WHEN `generateSharedRfq` executes
- THEN `rfq_providers` contains rows for P1 and P2 only

---

### Requirement: rfq_providers Insertion

After the RFQ is created, `generateSharedRfq` MUST insert one row per provider in the union set into `rfq_providers`, associating each provider with the new RFQ. This insertion MUST be idempotent: if `generateSharedRfq` is called again for the same RFQ (e.g. on retry), the resulting `rfq_providers` rows MUST be identical to the first run — no duplicate rows and no rows removed.

#### Scenario: rfq_providers rows are inserted after RFQ creation

- GIVEN a pool dispatch that produces RFQ id `rfq-123`
- AND the provider union is {P1, P2}
- WHEN `generateSharedRfq` completes
- THEN two rows exist in `rfq_providers`: one for P1 and one for P2, both linked to `rfq-123`

#### Scenario: Idempotent re-execution does not duplicate rfq_providers

- GIVEN `rfq_providers` already contains rows for RFQ `rfq-123` from a first run
- WHEN `generateSharedRfq` is called again for the same pool and produces the same RFQ id
- THEN `rfq_providers` still contains exactly the same rows (no new duplicates)
- AND the row count for `rfq-123` in `rfq_providers` is unchanged

---

### Requirement: notify-providers Invocation

After `rfq_providers` is populated, `generateSharedRfq` MUST invoke the `notify-providers` edge function exactly once per dispatch. The invocation MUST pass the `rfq_id` so the function can resolve which providers to notify. If `rfq_providers` is empty (no providers enabled by any participant), the invocation MUST be skipped and no notification is sent.

`generateSharedRfq` MUST reuse the same invocation pattern used by the non-pool RFQ flow. It MUST NOT introduce a second, parallel notification mechanism.

#### Scenario: notify-providers is called once after successful dispatch

- GIVEN a pool dispatch with a non-empty provider union
- WHEN `generateSharedRfq` completes successfully
- THEN `notify-providers` is invoked exactly once with the correct `rfq_id`

#### Scenario: notify-providers is NOT called when provider union is empty

- GIVEN a pool whose participating companies have no enabled providers for the materials
- WHEN `generateSharedRfq` executes
- THEN `rfq_providers` remains empty
- AND `notify-providers` is NOT invoked

#### Scenario: notify-providers is not called twice on partial retry

- GIVEN `rfq_providers` is already populated (retry scenario)
- WHEN `generateSharedRfq` is called again for the same RFQ
- THEN `notify-providers` is invoked at most once in the retry run
- AND the total invocation count across both runs does not exceed two (idempotency at the notification layer is owned by `notify-providers`, not this flow)

---

## Non-Functional Requirements

### Requirement: Confidentiality Invariant Preserved

Provider union construction MUST NOT expose one company's enabled-provider list to another company. The union result (a list of provider ids) is shared, but no company-specific attribution is leaked. The `rfq_providers` rows MUST NOT record which company contributed each provider.

### Requirement: Edge Function Availability

The `notify-providers` edge function MUST exist and be deployable before `generateSharedRfq` invokes it (this is a deployment dependency, not a code change). The spec does not define the internals of `notify-providers`; it only defines the invocation contract: the caller passes `rfq_id`, and the function is responsible for delivering notifications to the providers in `rfq_providers`.

### Requirement: Failure Isolation

If the `notify-providers` invocation fails, `generateSharedRfq` MUST surface the error to the caller. The RFQ and `rfq_providers` rows written before the invocation MUST remain in the database (no rollback of those rows on notification failure), allowing a future retry to re-invoke notification without re-creating the RFQ.
