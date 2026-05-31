# Exploration: Provider Quote Fixes

Source: `Reporte 1805.docx` — "Perfil PROVEEDOR" items 8–10 (P1–P3) + the provider-side half of the CRÍTICO draft-persistence item (B1b, re-scoped here from `#4`).

## Report items in scope

- **B1b (🔴 CRÍTICO, re-scoped from #4)** — The provider quote form loses all entered data on leaving the screen. Wants persisted draft + autosave + restore.
- **P1 (🔴 CRÍTICO, item 8)** — The quote does not compute subtotal = precio unitario × cantidad. Wants: realtime per-line subtotal (`unit_price × quantity`), grand total, computed in the frontend and validated on save; reject 0/empty prices.
- **P2 (ALTA, item 9)** — "Enviar cotización" gives no clear feedback. Wants: per-field validation messages, success feedback (button state change, confirmation toast, disable resend), error logging.
- **P3 (MEJORA, item 10)** — No observations field for the provider, per line nor general. Wants both, visible to the buyer in the comparativa.

## Current state (evidence — all in `src/pages/Cotizaciones.tsx`)

- **Quote form** = quote dialog (`~:682-770`). State is component-local (`:36-41`): `quoteRfqId, quoteDeliveryDate, quotePaymentCondition, quoteShippingCost, quoteItems[]`. `openQuoteDialog` (`:196-203`) resets it; closing loses everything (**B1b**).
- **Per-line input** is only a "Precio" field bound to `unit_price` (`:695-701`). The rfqItem has `quantity`/`unit` but they're not used in any subtotal. **No per-line subtotal displayed.**

## The P1 semantics finding (important)

The system is currently **internally consistent treating `unit_price` as the LINE TOTAL** (the amount for the whole line), not a per-unit price:
- `submitQuote` stores `quotes.total_price = Σ unit_price + shipping` (`:165-166`) — correct only if `unit_price` is the line total.
- Dialog "Total" (`:754`), cart provider-group total (`:897`), and OC `total_amount` in `generateOC` (`:264`) all do `Σ unit_price` with **no × quantity**.
- Comparativa ranks providers by `unit_price` per item (`:136/:350`) — valid either way since quantity is constant per item; orders by stored `total_price` (`:82`).

The report's model is the opposite: **`unit_price` is per-unit; subtotal = unit_price × quantity.** Adopting it requires multiplying by quantity at **5 sites**: dialog subtotal+total, `submitQuote` stored `total_price`, `generateOC` `total_amount`, cart group total, and any comparativa total display. The data is available everywhere (rfq_items.quantity / cart item quantity / purchase_order_items.quantity).

### Data-semantics implication
Existing `quote_items.unit_price` values were entered as **line totals** (model a). Switching to **per-unit** (model b) reinterprets them — they'd be multiplied by quantity, inflating historical totals. Migration 004 noted "no production data", so a clean switch is likely fine, but **this needs the user to confirm there's no meaningful existing quote/OC data** (or accept that historical quotes predate the fix).

## DB schema — no migration needed for P3

- `quotes.observations` **exists** (nullable text) — for general quote observations.
- `quote_items.observations` **exists** — for per-line observations; already selected in queries (`:111`) and displayed in Comparativa per the earlier audit.
- So **P3 is UI-only**: add a general observations input (→ `quotes.observations`) and a per-line observations input (→ `quote_items.observations`); ensure both render in the comparativa.

## Decisions taken in exploration

- **#6 needs NO migration.** P3 columns exist; P1 reinterprets existing data (no schema change); B1b/P2 are UI.
- Reuse `usePersistedDraft` (built in `#4`) for B1b — same pattern, new key `buildbuy-quote-draft`. Files/attachments N/A here.
- P1 is fixed for **end-to-end correctness** (all 5 sites), not just the dialog display — leaving downstream totals summing unit_price-as-line-total would produce wrong OC money once the form means per-unit.

## Open question for the user

P1 changes the meaning of `unit_price` from "line total" to "per-unit". Is there any **existing quote/OC data** in production whose totals would shift? If none (early-stage), we switch cleanly. If yes, we need a backfill decision.
