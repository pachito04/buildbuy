# Delta for Pool Award (#9c)

## ADDED Requirements

### Requirement: Shared comparativa for pool RFQs

For an RFQ that belongs to a pool (`rfqs.pool_id` not null), any company that is a member of that pool MUST be able to read the RFQ, its `rfq_items`, its `quotes`, and `quote_items` (the shared comparativa). Non-member companies MUST NOT. Non-pool RFQs are unaffected.

#### Scenario: Pool member sees the shared comparativa

- GIVEN a pool RFQ created within pool P, and company B is a member of P
- WHEN B opens the comparativa
- THEN B sees the RFQ, its items, and all provider quotes/quote_items
- AND a non-member company C sees none of it

#### Scenario: Non-pool RFQ unchanged

- GIVEN an ordinary (non-pool) RFQ owned by company A
- THEN only A sees its comparativa, exactly as before this change

### Requirement: Per-company purchase orders from the pool award

When a winning quote is adjudicated for a pool RFQ, each participating company MUST generate its OWN `purchase_orders` covering only ITS contributed quantity per material (from `pool_item_contributions`), priced at the winning `quote_items.unit_price`. A company MUST only be able to create its own OC.

#### Scenario: Company orders only its contribution

- GIVEN a pool line for material M with contributions A=10, B=15, and a winning quote at unit_price U for M
- WHEN company B generates its OC
- THEN B's purchase order has a line for M with quantity 15 at unit_price U
- AND it does NOT include A's 10 units

#### Scenario: Each company creates only its own OC

- GIVEN the shared comparativa is adjudicated
- WHEN a company generates its OC
- THEN the OC's `company_id` is that company (RLS prevents creating another company's OC)

#### Scenario: Materials not contributed are excluded

- GIVEN company B did not contribute to material N in the pool
- WHEN B generates its OC
- THEN B's OC has no line for N

### Requirement: Pool award states

A pool MUST move to `pool_state='adjudicado'` when a winning quote is chosen, and to `pool_state='cerrado'` when all member companies have generated their purchase orders for the pool RFQ.

#### Scenario: Adjudicado on winner chosen

- GIVEN a member adjudicates a winning quote on the shared comparativa
- THEN `pool_state` becomes `adjudicado`

#### Scenario: Cerrado when all OCs generated

- GIVEN every member company of the pool has generated its OC for the pool RFQ
- THEN `pool_state` becomes `cerrado`

### Requirement: Confidentiality preserved

The shared comparativa MUST expose only the consolidated RFQ/quotes and per-company contribution quantities — never another company's internal requirement detail (`pool_requests` remain owner-only, per `#9b`).

#### Scenario: No requirement-detail leak in award

- GIVEN B views the shared comparativa and the per-company contribution breakdown
- THEN B sees A's contributed quantity per material (a shared total) but NOT which of A's requirements it came from
