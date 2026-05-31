# Delta for Provider Quote Form

> Pricing model: `unit_price` is **per-unit**; line subtotal = `unit_price × quantity`; quote total = Σ subtotals + shipping. This rule lives in one tested pure module (`quote-pricing.ts`) and is applied everywhere a total is computed (quote dialog, stored `quotes.total_price`, OC `total_amount`, cart, comparativa).

## ADDED Requirements

### Requirement: Per-unit subtotal and total

The provider quote form MUST display, per line, a subtotal equal to `unit_price × quantity`, and a grand total equal to the sum of line subtotals plus shipping. These MUST update in realtime as the price or shipping changes. Empty or non-positive unit prices MUST be rejected before submit.

#### Scenario: Line subtotal multiplies by quantity

- GIVEN an rfq item with quantity 10
- WHEN the provider enters a unit price of 5
- THEN the line subtotal shows 50
- AND the grand total includes 50 plus shipping

#### Scenario: Total recomputes in realtime

- GIVEN a quote with several priced lines
- WHEN the provider changes any unit price or the shipping cost
- THEN the grand total updates immediately

#### Scenario: Zero or empty price blocked

- GIVEN any line with an empty or ≤ 0 unit price
- WHEN the provider attempts to submit
- THEN submission is blocked with a message identifying the offending line(s)

### Requirement: Totals are consistent end-to-end

The stored `quotes.total_price`, the purchase-order `total_amount` (`generateOC`), the cart provider-group total, and any comparativa total MUST all compute `unit_price × quantity` via the shared pricing module — no site may sum `unit_price` as if it were a line total.

#### Scenario: Stored quote total uses quantity

- GIVEN a submitted quote
- WHEN it is saved
- THEN `quotes.total_price` equals Σ(`unit_price × quantity`) + shipping

#### Scenario: OC total uses quantity

- GIVEN an OC generated from awarded cart items
- WHEN `generateOC` runs
- THEN `purchase_orders.total_amount` equals Σ(`unit_price × quantity`) over its items

### Requirement: Draft persistence for the provider quote form

The provider quote form MUST persist its in-progress state (prices, delivery date, payment condition, shipping, per-line observations, general observations) to localStorage and restore it on return, clearing only on successful submit or explicit discard.

#### Scenario: Quote draft survives navigation

- GIVEN a provider has partially filled a quote
- WHEN they close the dialog / navigate away and return to the same RFQ
- THEN the entered values are restored
- AND a dismissible notice indicates a recovered draft

#### Scenario: Draft cleared on submit or discard

- GIVEN a quote draft exists
- WHEN the provider submits successfully OR explicitly discards
- THEN the persisted draft is removed

### Requirement: Submit feedback and guard

The submit action MUST show per-field validation messages, give an explicit success confirmation, prevent double submission, and log the underlying error on failure.

#### Scenario: Per-field validation messages

- GIVEN required fields are missing or invalid (price ≤ 0, no delivery date, no payment condition, no shipping)
- WHEN the provider tries to submit
- THEN a message is shown for each invalid field (not only a disabled button)

#### Scenario: Success confirmation and no resend

- GIVEN a valid quote
- WHEN submission succeeds
- THEN a confirmation is shown
- AND the submit control is disabled / the dialog closes so the same quote cannot be re-sent by repeated clicks

#### Scenario: Error logged on failure

- GIVEN submission fails
- WHEN the error is caught
- THEN a user-facing error message is shown
- AND the underlying error is logged (console/server) for diagnosis

### Requirement: Observations (general and per line)

The provider quote form MUST offer a general observations field (persisted to `quotes.observations`) and a per-line observations field (persisted to `quote_items.observations`). Both MUST be visible to the buyer in the comparativa.

#### Scenario: Observations persisted and shown

- GIVEN the provider enters general observations and a per-line observation
- WHEN the quote is submitted
- THEN `quotes.observations` and the corresponding `quote_items.observations` are stored
- AND the buyer sees both in the comparativa view
