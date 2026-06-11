# GAP 4 — Withdraw and Cancel Pool

## Purpose

A participating company MUST be able to withdraw from a pool while it is in `'borrador'` state. Once the pool reaches `'confirmado'`, individual withdrawal is not permitted; the only exit is cancellation of the entire pool. Cancellation sets `pool_state = 'cancelado'` on `purchase_pools`. Today `'cancelado'` exists in the `pool_state` enum but no flow sets it.

All mutations in this spec MUST operate on `pool_state`, not on the legacy `status` column. `updatePoolStatus` in `Pools.tsx` MUST be migrated to write `pool_state`.

---

## Requirements

### Requirement: Withdraw from Pool in Borrador

A company member MAY withdraw from a pool when `pool_state = 'borrador'`. Withdrawal removes the company's row from `pool_companies` for that pool. If the withdrawing company is the pool creator and no other members remain, the pool MUST transition to `'cancelado'`.

#### Scenario: Member withdraws from borrador pool

- GIVEN a pool with `pool_state = 'borrador'` and at least two company members (including the actor)
- AND the actor is NOT the pool creator, OR is the creator but at least one other member remains
- WHEN the company member triggers "Retirarse del pool"
- THEN the company's row is removed from `pool_companies`
- AND the pool remains with its remaining members
- AND `pool_state` is unchanged (still `'borrador'`)

#### Scenario: Last member (creator) withdraws from borrador pool → pool is cancelled

- GIVEN a pool with `pool_state = 'borrador'` and only one remaining member (the creator)
- WHEN the creator triggers "Retirarse del pool"
- THEN the company's row is removed from `pool_companies`
- AND `pool_state` transitions to `'cancelado'`

#### Scenario: Withdraw is NOT permitted when pool_state is confirmado

- GIVEN a pool with `pool_state = 'confirmado'`
- WHEN any company member triggers "Retirarse del pool"
- THEN the action is rejected
- AND `pool_companies` is unchanged
- AND the UI MUST display an explanation that withdrawal is not available after confirmation

#### Scenario: Withdraw is NOT permitted for any pool_state beyond borrador

- GIVEN a pool with `pool_state` in `{'confirmado', 'en_comparativa', 'adjudicado', 'cerrado', 'cancelado'}`
- WHEN any mutation attempts to remove a company member via the withdraw flow
- THEN the mutation is rejected
- AND `pool_companies` is unchanged

---

### Requirement: Cancel Pool

Any participating company MUST be able to cancel a pool that has NOT yet reached `'cerrado'`. Cancellation sets `pool_state = 'cancelado'`. This action requires an explicit confirmation step in the UI. Cancellation is irreversible.

For pools in `'confirmado'` or later states, cancellation by a single participant MUST be the only available exit (individual withdrawal is blocked). The pool is cancelled for all participants simultaneously.

#### Scenario: Any member can cancel a borrador pool

- GIVEN a pool with `pool_state = 'borrador'`
- WHEN a company member confirms the cancel action
- THEN `pool_state` is set to `'cancelado'`
- AND all members of the pool lose access to pool actions

#### Scenario: Any member can cancel a confirmado pool

- GIVEN a pool with `pool_state = 'confirmado'`
- WHEN a company member confirms the cancel action
- THEN `pool_state` is set to `'cancelado'`
- AND all members of the pool lose access to pool actions

#### Scenario: Any member can cancel an en_comparativa pool

- GIVEN a pool with `pool_state = 'en_comparativa'`
- WHEN a company member confirms the cancel action
- THEN `pool_state` is set to `'cancelado'`

#### Scenario: Cancellation requires explicit user confirmation

- GIVEN a pool in any non-cerrado, non-cancelado state
- WHEN the company member clicks "Cancelar Pool"
- THEN the UI MUST present a confirmation dialog before executing the mutation
- AND if the user dismisses the confirmation, `pool_state` MUST NOT change

#### Scenario: Cancelled pool cannot be cancelled again

- GIVEN a pool with `pool_state = 'cancelado'`
- WHEN any mutation attempts to cancel the pool again
- THEN the mutation is rejected or is a no-op
- AND `pool_state` remains `'cancelado'`

#### Scenario: Closed pool cannot be cancelled

- GIVEN a pool with `pool_state = 'cerrado'`
- WHEN any mutation attempts to cancel the pool
- THEN the action is rejected
- AND `pool_state` remains `'cerrado'`

---

### Requirement: pool_state Writeback (Migrate from status legacy)

`updatePoolStatus` in `Pools.tsx` MUST be updated to write `pool_state` on `purchase_pools`, not the legacy `status` column. All withdraw and cancel mutations introduced by this change MUST also write only `pool_state`. No new code introduced by this change MAY write to or read `status` for pool lifecycle decisions.

#### Scenario: updatePoolStatus writes pool_state not status

- GIVEN `updatePoolStatus` is called with a new state value
- WHEN the mutation executes
- THEN the `pool_state` column on `purchase_pools` is updated
- AND the legacy `status` column is NOT written by this call

#### Scenario: Cancel mutation writes pool_state = cancelado

- GIVEN a cancel action is confirmed by the user
- WHEN the cancel mutation executes
- THEN `pool_state` on `purchase_pools` is set to `'cancelado'`
- AND the legacy `status` column is NOT written

---

### Requirement: UI Actions by Pool State

The following table defines which UI actions MUST be available (visible and enabled) per `pool_state`. Actions not listed for a given state MUST be hidden or disabled.

| pool_state      | Withdraw (member) | Cancel (any member) | Other pool actions      |
|-----------------|-------------------|---------------------|-------------------------|
| `borrador`      | MUST be available | MUST be available   | Normal pool creation    |
| `confirmado`    | MUST NOT be available | MUST be available | Transition to dispatch  |
| `en_comparativa`| MUST NOT be available | MUST be available | Award flow              |
| `adjudicado`    | MUST NOT be available | MUST be available | generateMyOc            |
| `cerrado`       | MUST NOT be available | MUST NOT be available | Read-only              |
| `cancelado`     | MUST NOT be available | MUST NOT be available | Read-only              |

#### Scenario: UI hides withdraw button for confirmado pool

- GIVEN a pool with `pool_state = 'confirmado'`
- WHEN a company member views the pool
- THEN the "Retirarse del pool" button is NOT visible or is visibly disabled with an explanatory tooltip

#### Scenario: UI hides both actions for cerrado and cancelado pools

- GIVEN a pool with `pool_state` in `{'cerrado', 'cancelado'}`
- WHEN any company member views the pool
- THEN neither "Retirarse del pool" nor "Cancelar Pool" is visible or operable

---

## Non-Functional Requirements

### Requirement: Confirmation Before Destructive Actions

Both withdraw and cancel MUST be preceded by a confirmation step in the UI. The confirmation MUST communicate the irreversibility of cancellation and (for confirmado+) the fact that the cancellation affects all pool participants.

### Requirement: Auditability

Every cancel action MUST be reflected in the `pool_state` column change, which is auditable via Supabase's standard row history or any audit trigger in place. No separate event record is required by this spec, but the design phase MAY add one if audit requirements demand it.
