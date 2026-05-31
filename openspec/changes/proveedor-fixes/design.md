# Design: Provider Quote Fixes

## Architecture Decisions

### AD-1: One tested pure module for the ×quantity rule

`src/lib/quote-pricing.ts`:

```ts
function lineSubtotal(unitPrice: number, quantity: number): number;   // unitPrice * quantity, guards NaN/negative → 0
function quoteTotal(
  lines: { unitPrice: number; quantity: number }[],
  shipping: number,
): number;                                                            // Σ lineSubtotal + shipping
```

Every total site imports this — the quote dialog display, `submitQuote` (stored `quotes.total_price`), `generateOC` (`purchase_orders.total_amount`), the cart provider-group total, and the comparativa total. The bug existed because the same "sum unit_price" logic was duplicated inline at 5 sites; centralizing kills it permanently. Pure, TDD.

### AD-2: Reuse `usePersistedDraft` for the quote draft

Same hook built in `#4`, key `buildbuy-quote-draft`. The draft holds the serializable quote state (per-rfq): `{ rfqId, items: {rfq_item_id, unit_price, observations}[], deliveryDate, paymentCondition, shippingCost, generalObservations }`. Keyed per session (one in-progress quote at a time is enough; the draft records its `rfqId` and is only restored when re-opening the same RFQ — if a different RFQ is opened, start fresh).

### AD-3: Validation as a pure function returning an error map

`validateQuote(draft): Record<string, string>` in `quote-pricing.ts` (or a sibling `quote-validation.ts`) returns per-field messages: missing/≤0 price per line, missing delivery date, payment condition, shipping. The dialog renders messages from this map and disables submit when non-empty. Logic is pure and tested; JSX only renders. (P2)

### AD-4: Clean semantics switch, no migration, no backfill

`unit_price` becomes per-unit going forward (user confirmed early-stage). No schema change. No data backfill — historical test rows are left as-is and are not surfaced as "correct" totals. Documented so nobody later "fixes" old rows.

### AD-5: Observations reuse existing columns

`quotes.observations` and `quote_items.observations` already exist and are already selected in queries / shown in Comparativa for per-line. This change adds the missing **inputs** (general + per-line) and ensures the **general** one renders in Comparativa. No migration.

## Pure logic contract (`src/lib/quote-pricing.ts`)

```ts
lineSubtotal(unitPrice: number, quantity: number): number;
quoteTotal(lines: { unitPrice: number; quantity: number }[], shipping: number): number;
validateQuote(d: {
  items: { unit_price: string; }[];           // raw string inputs
  deliveryDate: string; paymentCondition: string; shippingCost: string;
}): Record<string, string>;                    // field → message; empty = valid
```

Tests: `lineSubtotal` (normal, zero qty, NaN/empty price → 0, negative → 0); `quoteTotal` (multi-line, empty list, shipping only); `validateQuote` (each required field missing/invalid produces its message; fully valid → `{}`; price "0"/""/"-1" flagged per line).

## Sites to update (P1 correctness)

| Site | Current (wrong) | Fix |
|------|-----------------|-----|
| `Cotizaciones.tsx:754` dialog Total | `Σ unit_price + shipping` | `quoteTotal(lines, shipping)` + per-line subtotal column |
| `Cotizaciones.tsx:165` `submitQuote` total | `Σ unit_price + shipping` | `quoteTotal(...)` |
| `Cotizaciones.tsx:264` `generateOC` total_amount | `Σ unit_price` | `Σ lineSubtotal(unit_price, qty)` |
| `Cotizaciones.tsx:897` cart group total | `Σ unit_price` | `Σ lineSubtotal(...)` |
| `Comparativa.tsx` totals | verify | use ×quantity where a total is shown (per-provider ranking by unit_price stays valid for same-item compare) |
| `Ordenes.tsx:313` OC-detail "Total" | `Σ unit_price` | `Σ lineSubtotal(unit_price, quantity)` — found in verify; under the new per-unit semantics this display would otherwise not match the stored `total_amount` |

## Files

| File | Action |
|------|--------|
| `src/lib/quote-pricing.ts` (+ `__tests__`) | New (pure, TDD) |
| `src/pages/Cotizaciones.tsx` | Modified: quote dialog (subtotal, validation, observations, draft), submitQuote (total + obs), generateOC (total), cart group total |
| `src/pages/Comparativa.tsx` | Modified: totals ×quantity; show general + per-line observations |
| `src/hooks/usePersistedDraft.ts` | Reused, unchanged |

## Risks

- **Money math across quote→OC chain**: the highest-value surface. Mitigated by the single tested pure module and confirming no historical data is reinterpreted as correct.
- **Quote dialog is large + shared file** (`Cotizaciones.tsx` also holds the cart from `#4`): edits here touch the quote dialog + the cart/OC total lines. `#4` is already merged, so no concurrent-branch conflict.
- **Draft restore on wrong RFQ**: guard restore to the same `rfqId` so opening a different RFQ doesn't load an unrelated draft.
