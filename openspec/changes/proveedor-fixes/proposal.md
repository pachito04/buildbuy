# Proposal: Provider Quote Fixes

## Intent

The provider quote experience (`Cotizaciones.tsx` quote dialog) has four problems from Report 1805: it **loses all data on leaving** (B1b, 🔴 CRÍTICO), it **never multiplies price × quantity** so subtotals/totals are wrong end-to-end (P1, 🔴 CRÍTICO), it gives **poor submit feedback** (P2), and it has **no observations fields** (P3). This change fixes the whole provider quote form once (it's the surface deliberately reserved out of `#4`).

## Scope

### In Scope
- **B1b — Draft persistence**: reuse `usePersistedDraft` (from `#4`) keyed `buildbuy-quote-draft` so the quote form survives navigation; restore with a dismissible notice; clear on successful submit or explicit discard.
- **P1 — Per-unit pricing model (end-to-end)**: treat `unit_price` as price-per-unit. Show a per-line **subtotal = unit_price × quantity** and a correct grand total (Σ subtotals + shipping), realtime. Fix the **stored** `quotes.total_price`, the OC `total_amount` (`generateOC`), the cart provider-group total, and any comparativa total so they all use × quantity. Keep rejecting 0/empty prices.
- **P2 — Submit feedback**: per-field validation messages (not just a disabled button), explicit success state (confirmation toast + button state), prevent double-submit/resend, and log the actual error to the console/server on failure.
- **P3 — Observations**: a general quote observations input (→ existing `quotes.observations`) and a per-line observations input (→ existing `quote_items.observations`); ensure both render for the buyer in the comparativa.

### Out of Scope
- No DB migration (P3 columns already exist; P1 is a semantics/compute change; B1b/P2 are UI).
- The RFQ creation form (`#4`, done).
- Comparativa header editing / audit log (that's `#5`).

### Decided
- **Clean switch, no backfill** (user confirmed early-stage, no meaningful existing quote/OC data). `unit_price` becomes per-unit going forward; historical test rows are not migrated.

## Capabilities

### New Capabilities
- `provider-quote-form`: A draft-persistent provider quote form with per-unit subtotals, correct totals end-to-end, clear submit feedback, and observations (general + per line).

### Modified Capabilities
- OC generation & cart totals: corrected to compute `unit_price × quantity`.

## Approach

1. **Pure pricing utils (TDD)** — `quote-pricing.ts`: `lineSubtotal(unitPrice, quantity)`, `quoteTotal(lines, shipping)`, used by the dialog, submit, cart, and OC paths so the ×quantity rule lives in ONE tested place.
2. **Quote dialog** — show quantity + per-line subtotal; grand total from `quoteTotal`; per-field validation messages; observations inputs (general + per line); wire `usePersistedDraft`.
3. **Submit + downstream totals** — `submitQuote` stores `total_price` via `quoteTotal`, persists `quote_items.observations` and `quotes.observations`; `generateOC` and cart group total use `lineSubtotal`. Add error logging + double-submit guard.
4. **Comparativa** — verify totals use ×quantity and observations (general + per-line) are shown.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/lib/quote-pricing.ts` (+ tests) | New | pure `lineSubtotal` / `quoteTotal` (TDD) |
| `src/pages/Cotizaciones.tsx` | Modified | quote dialog (subtotal, validation, observations, draft), `submitQuote` total + obs, `generateOC` total, cart group total |
| `src/pages/Comparativa.tsx` | Modified | totals × quantity; show general + per-line observations |
| `src/hooks/usePersistedDraft.ts` | Reused | quote draft (no change) |

## Rollback Plan

- **No DB change** → nothing to roll back schema-wise.
- **Code**: per-file revert restores prior behavior. The pricing change is centralized in `quote-pricing.ts`, so the ×quantity rule is one place to audit/revert.
- **Risk**: medium — P1 touches money math across the quote→OC chain; mitigated by a single tested pure module and by confirming no historical data is misread.

## Review Workload (preliminary)

Likely **> 400 lines** (dialog rework + 5-site total fix + utils + comparativa). Candidate for **chained slices**: (1) pure pricing utils + apply ×quantity at all total sites (P1 correctness), (2) quote dialog UX: subtotal display + validation + observations + draft (B1b/P2/P3), (3) comparativa visibility. Confirm at tasks.

## Strict TDD

`strict_tdd: true`. `quote-pricing.ts` is written test-first (`vitest run`). UI verified via `tsc --noEmit` + manual checklist.
