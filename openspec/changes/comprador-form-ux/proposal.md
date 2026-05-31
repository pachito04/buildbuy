# Proposal: Comprador Form UX

## Intent

The buyer-side RFQ creation experience has three pains from Report 1805: the form **loses all data when you leave it** (B1, 🔴 CRÍTICO), its layout is a flat unstructured form that doesn't guide the user (B3/B5, ALTA), it lacks per-product observations (B6), and the purchase cart forces one action per provider with no batch (B4, ALTA). This change reworks the COMPRAS/buyer surfaces to fix all four.

## Scope

### In Scope
- **B1a — Draft persistence (RFQ creation form)**: a reusable persistence hook (generalizing the `BasketContext` localStorage pattern) that autosaves the `RfqNuevo` form with debounce, restores it on return with a dismissible "borrador recuperado" notice, and clears only on successful submit or explicit discard.
- **B3 + B5 — Accordion layout**: reorganize `RfqNuevo` into two collapsible sections using the existing `accordion.tsx`:
  - **Section 1 — Detalle** (expanded by default): Tipo de solicitud · Fecha de cierre · Descripción · Categoría · Entregar en · Condición de precios · Condición de pago.
  - **Section 2 — Productos** (enabled once Section 1 is valid): per-item material, cantidad, unidad, descripción, **observaciones**.
  - Each section header shows a completion-state icon; Section 2 is gated on Section-1 validity.
- **B6 — Per-item observations** on RFQ items (`rfq_items.observations`), visible later in comparativa/export.
- **B4 — Batch "Generar todas las órdenes de compra"** button in the cart that processes every pending provider group in one user action (backend OCs stay per-provider).
- **Migration** for the new fields: `rfqs.descripcion`, `rfqs.categoria`, `rfqs.price_terms` (condición de precios); surface existing `rfqs.payment_terms`; add `rfq_items.observations`.

### Out of Scope (re-scoped)
- **B1b — provider quote form draft persistence** → moved to `#6 proveedor-fixes`. That form (`Cotizaciones.tsx` quote dialog) is also where P1 (subtotal × cantidad), P2 (submit feedback) and P3 (observations) live; it must be touched **once**, in `#6`. This change does not modify the provider quote form.
- B2 (correlative number) — already done.

### Decided
- **Add the new fields as real columns** (confirmed by user). `rfqs.descripcion` (short text), `rfqs.categoria` (text), `rfqs.price_terms` (condición de precios, select-backed text), and surface existing `rfqs.payment_terms` (condición de pago). `rfq_items.observations` (text). The migration SQL will also be handed to the user to run manually.

## Capabilities

### New Capabilities
- `rfq-creation-form`: A structured, draft-persistent RFQ creation form with sectioned layout, completion gating, per-item observations, and the new header fields.

### Modified Capabilities
- Purchase cart: adds a batch OC generation action.

## Approach

1. **Migration first** — add `rfqs.descripcion`, `rfqs.categoria`, `rfqs.price_terms`, `rfq_items.observations`; update `types.ts` by hand.
2. **Persistence hook (TDD where pure)** — `usePersistedDraft<T>(key, initial)` extracted from the BasketContext pattern; pure serialize/merge logic unit-tested.
3. **RfqNuevo rewrite** — accordion sections, completion-state derivation (pure, tested), Section-2 gating, per-item observations input, wired to the draft hook.
4. **Cart batch button** — iterate pending provider groups calling the existing `generateOC` per group, with one combined progress/result toast.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/013_*.sql` | New | `rfqs.descripcion/categoria/price_terms`, `rfq_items.observations` |
| `src/integrations/supabase/types.ts` | Modified | new columns |
| `src/hooks/usePersistedDraft.ts` (+ pure utils + tests) | New | reusable localStorage draft persistence |
| `src/components/rfqs/RfqNuevo.tsx` | Rewritten | accordion sections, gating, per-item obs, draft persistence |
| `src/lib/rfq-form-utils.ts` (+ tests) | New | pure: section-completion + draft (de)serialization |
| `src/pages/Cotizaciones.tsx` | Modified | cart "Generar todas las OC" button (cart tab only; provider quote dialog untouched) |

## Rollback Plan

- **DB**: additive nullable columns only; rollback = drop them. No data loss.
- **Code**: `RfqNuevo` rewrite is self-contained behind the same tab; the cart button is additive (existing per-provider buttons stay). Revertible per-file.
- **Risk**: medium — `RfqNuevo` rewrite is the main surface; the cart change is additive/low-risk.

## Review Workload (preliminary)

Likely **> 400 lines** (form rewrite + migration + hook + cart). Candidate for **chained PRs**: (1) migration + persistence hook + per-item obs, (2) accordion rewrite + gating, (3) cart batch button. To confirm at the tasks phase.

## Strict TDD

`strict_tdd: true`. Pure logic (`rfq-form-utils`, draft (de)serialization, section completion) is written test-first (`vitest run`). UI verified via `tsc --noEmit` + manual checklist.
