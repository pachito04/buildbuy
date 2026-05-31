# Delta for Pool Foundation (#9a)

## ADDED Requirements

### Requirement: Bidirectional company link with acceptance

A `company_links` table MUST persist a link between two distinct companies with a status of `pending | active | disabled`. A link becomes `active` only when the target company accepts; either party may disable it. A duplicate link between the same pair (in either direction) MUST be prevented. RLS MUST restrict visibility/management to the two companies of the link.

#### Scenario: Request a link

- GIVEN an admin of company A searches and selects company B
- WHEN they request a link
- THEN a `company_links` row is created (`requester=A`, `target=B`, `status='pending'`)
- AND only companies A and B can see it

#### Scenario: Target accepts → active

- GIVEN a `pending` link from A to B
- WHEN an admin of company B accepts
- THEN the link `status` becomes `active`

#### Scenario: Either party disables

- GIVEN an `active` link between A and B
- WHEN an admin of either company disables it
- THEN the link `status` becomes `disabled`

#### Scenario: No duplicate pair

- GIVEN an existing link between A and B
- WHEN anyone attempts to create another link between the same two companies (either direction)
- THEN it is rejected (unique on the unordered pair)

### Requirement: Scoped cross-company materials read

A company MUST be able to read another company's materials ONLY when an `active` `company_links` row joins the two companies. No write access is granted; no materials are exposed without an active link.

#### Scenario: Linked company catalog readable

- GIVEN an active link between A and B
- WHEN an admin of A queries materials
- THEN B's materials are readable (for mapping)
- AND A's own materials remain readable as before

#### Scenario: No link, no cross-company read

- GIVEN no active link between A and C
- WHEN A queries materials
- THEN C's materials are NOT returned

### Requirement: Material mapping confirmed by both companies

A `material_mappings` table MUST map a requester-company material to a target-company material for a given link. A mapping is **usable** only when confirmed by BOTH companies. RLS MUST restrict it to the two companies of the link.

#### Scenario: Propose a mapping

- GIVEN an active link between A and B
- WHEN an admin of A maps its material M_a to B's material M_b
- THEN a `material_mappings` row is created for the link, confirmed by A, not yet by B

#### Scenario: Usable only when both confirm

- GIVEN a mapping confirmed by A only
- THEN it is NOT usable (cannot be pooled later)
- WHEN B also confirms
- THEN it becomes usable

#### Scenario: Duplicate mapping prevented

- GIVEN a mapping (M_a ↔ M_b) for a link
- WHEN the same pair is mapped again for that link
- THEN it is rejected

### Requirement: Admin-only configuration

The Pool de Compras configuration (linking and mapping) MUST be available only to admin users, surfaced in Configuración.

#### Scenario: Non-admin cannot configure

- GIVEN a non-admin user
- THEN the Pool de Compras configuration section is not shown
