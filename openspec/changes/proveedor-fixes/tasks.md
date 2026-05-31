# Tasks: proveedor-fixes

## Overview

Fix the provider quote form end-to-end: per-unit pricing (P1), draft persistence (B1b), submit feedback (P2), observations (P3). **No DB migration** (columns exist; clean semantics switch, no backfill).

**Strict TDD is active** (`vitest run`). Pure logic test-first.

## Review Workload Forecast

- Estimated changed lines: **> 400** (quote dialog rework + 5-site total fix + utils + comparativa).
- **Chained slices recommended: Yes.**
  - **Slice 1** — `quote-pricing.ts` (+tests): `lineSubtotal`, `quoteTotal`, `validateQuote`; apply ×quantity at ALL total sites (submitQuote, generateOC, cart total, comparativa total). P1 correctness, mostly mechanical + tested.
  - **Slice 2** — quote dialog UX: per-line subtotal display, per-field validation messages + success/double-submit guard + error logging (P2), observations inputs general + per-line (P3), draft persistence via `usePersistedDraft` (B1b).
  - **Slice 3** — Comparativa: show general + per-line observations; confirm totals ×quantity.
- **Decision needed before apply: Yes** (confirm slices vs single).

---

## Phase 1: Pure pricing + validation (TDD)

### [x] 1.1 `quote-pricing` — tests first
- **Files**: `src/lib/__tests__/quote-pricing.test.ts` (CREATE)
- **TDD red**: `lineSubtotal` (normal, qty 0, empty/NaN price → 0, negative → 0); `quoteTotal` (multi-line, empty, shipping-only); `validateQuote` (each required field missing/invalid → message; valid → `{}`; price `0`/``/`-1` flagged per line).

### [x] 1.2 `quote-pricing` — implement
- **Files**: `src/lib/quote-pricing.ts` (CREATE) — `lineSubtotal`, `quoteTotal`, `validateQuote`. Pure, no React/Supabase.

---

## Phase 2: Apply ×quantity at all total sites (P1 correctness)

### [x] 2.1 submitQuote stored total
- **Files**: `src/pages/Cotizaciones.tsx`
- **Spec refs**: Totals consistent end-to-end
- **Details**: `quotes.total_price` via `quoteTotal(lines, shipping)` where each line carries its rfq_item quantity.

### [x] 2.2 generateOC + cart group total
- **Files**: `src/pages/Cotizaciones.tsx`
- **Details**: `purchase_orders.total_amount` and the cart provider-group total use `lineSubtotal(unit_price, quantity)`.

### [x] 2.3 Comparativa totals
- **Files**: `src/pages/Comparativa.tsx`
- **Details**: any displayed total uses ×quantity via the shared module. (Per-item provider ranking by unit_price stays.)

---

## Phase 3: Quote dialog UX (B1b + P1 display + P2 + P3)

### [x] 3.1 Per-line subtotal + grand total display
- **Files**: `src/pages/Cotizaciones.tsx` (quote dialog)
- **Spec refs**: Per-unit subtotal and total
- **Details**: show quantity + computed subtotal per line; grand total from `quoteTotal`; realtime.

### [x] 3.2 Validation messages + submit guard + error logging (P2)
- **Files**: `src/pages/Cotizaciones.tsx`
- **Spec refs**: Submit feedback and guard
- **Details**: render per-field messages from `validateQuote`; success confirmation; prevent double-submit (disable + close); `console.error`/server log on failure.

### [x] 3.3 Observations general + per line (P3)
- **Files**: `src/pages/Cotizaciones.tsx`
- **Spec refs**: Observations (general and per line)
- **Details**: general observations input → `quotes.observations`; per-line input → `quote_items.observations`; include both in the inserts.

### [x] 3.4 Draft persistence (B1b)
- **Files**: `src/pages/Cotizaciones.tsx`
- **Spec refs**: Draft persistence
- **Details**: back the quote state with `usePersistedDraft('buildbuy-quote-draft', EMPTY)`; restore only when re-opening the same `rfqId`; dismissible notice; `clear()` on submit success + explicit discard.

---

## Phase 4: Comparativa observations

### [x] 4.1 Show general + per-line observations
- **Files**: `src/pages/Comparativa.tsx`
- **Spec refs**: Observations visible in comparativa
- **Details**: surface `quotes.observations` (general) and confirm `quote_items.observations` (per line) render for the buyer.

---

## Phase 5: Verification

### [x] 5.1 Suite + typecheck + manual
- `vitest run` green + `npx tsc --noEmit` clean.
- Manual: enter price → subtotal = price×qty; total realtime; 0/empty blocked with message; submit → success + no resend; fill quote → navigate → restored; observations (general + per line) persist and show in comparativa; OC/cart totals correct.
