# Design: Comprador Form UX

## Architecture Decisions

### AD-1: Generalize the BasketContext localStorage pattern into `usePersistedDraft`

`BasketContext` already proves the pattern (load-on-init, `useEffect` sync, JSON in localStorage). Extract a generic hook:

```ts
function usePersistedDraft<T>(key: string, initial: T): {
  value: T;
  setValue: (updater: T | ((prev: T) => T)) => void;
  clear: () => void;
  hadSavedDraft: boolean;   // true if a draft existed at mount
};
```

- Debounced write (≈500ms) so rapid typing yields one persisted write.
- `clear()` removes the key AND suppresses the next autosave until the user edits again (so "discard" doesn't immediately re-save the empty form as a draft).
- Pure serialize/merge helpers live in `rfq-form-utils.ts` and are unit-tested; the hook is the thin React wrapper.

**Why a hook, not a context**: the draft is local to one form instance; no cross-tree sharing needed (unlike the basket).

### AD-2: Section-completion is pure and tested

Section-2 gating and the header completion indicator derive from a pure predicate `isDetalleComplete(form): boolean` in `rfq-form-utils.ts`. The component renders from it; no validation logic lives in JSX. This keeps the gating logic unit-testable under strict TDD.

### AD-3: New fields as nullable text columns (additive migration)

`rfqs.descripcion`, `rfqs.categoria`, `rfqs.price_terms`, `rfq_items.observations` — all `text NULL`. No CHECK constraints (values are open / UI-driven), matching the lightweight style of existing optional `rfqs` columns. `payment_terms` already exists; only surfaced in UI. Additive → zero risk to existing rows.

- `price_terms` UI = a `Select` (e.g. `Precios firmes`, `Sujetos a variación`, `A confirmar`) storing the chosen string; column stays free text so options can evolve without a migration.
- `payment_terms` UI = a `Select` reusing the payment-condition options already used elsewhere (cheque_30/60/90, transferencia_inmediata, contrato_acopio).
- `categoria` UI = text input (or select if a category catalog is later introduced).

### AD-4: Cart batch button reuses the existing per-provider `generateOC`

No new mutation. The batch button iterates the pending provider groups and invokes the existing `generateOC` per group (sequentially to avoid hammering), accumulating success/failure counts into one toast. The per-provider buttons stay. This keeps backend OC creation identical and the change additive.

### AD-5: Provider quote form is explicitly NOT touched here

B1b (provider-side draft persistence) is deferred to `#6 proveedor-fixes`, which also owns P1/P2/P3 on that same form. This change must not edit the `Cotizaciones.tsx` quote dialog — only the cart tab. (Both live in `Cotizaciones.tsx`; edits here are confined to the carrito region to avoid collision with `#6`.)

## Pure logic contract (`src/lib/rfq-form-utils.ts`)

```ts
interface RfqDraft {
  rfqType: 'open' | 'closed_bid';
  closingDatetime: string; deadline: string;
  descripcion: string; categoria: string;
  deliveryLocation: string; priceTerms: string; paymentTerms: string;
  notes: string;
  items: { material_id: string; description: string; quantity: string; unit: string; observations: string }[];
  selectedProviders: string[];
}

function serializeDraft(d: RfqDraft): string;             // JSON, stable
function deserializeDraft(raw: string | null, fallback: RfqDraft): RfqDraft;  // tolerant of missing keys / bad JSON
function isDetalleComplete(d: RfqDraft): boolean;         // required Section-1 fields present & valid
function hasValidItems(d: RfqDraft): boolean;             // ≥1 item with material_id
```

Tests cover: round-trip serialize→deserialize; deserialize of `null`/garbage → fallback; deserialize tolerant of older/missing keys (forward-compat); `isDetalleComplete` for each required field missing; `hasValidItems` empty/partial.

## Migration shape (`013_rfq_form_fields.sql`)

```sql
BEGIN;
-- Rollback: drop the four columns.
ALTER TABLE rfqs       ADD COLUMN IF NOT EXISTS descripcion text;
ALTER TABLE rfqs       ADD COLUMN IF NOT EXISTS categoria   text;
ALTER TABLE rfqs       ADD COLUMN IF NOT EXISTS price_terms text;
ALTER TABLE rfq_items  ADD COLUMN IF NOT EXISTS observations text;
COMMIT;
```

(Note: `payment_terms` already exists on `rfqs` — not added here.)

## Files

| File | Action |
|------|--------|
| `supabase/migrations/013_rfq_form_fields.sql` | new |
| `src/integrations/supabase/types.ts` | add columns to `rfqs` + `rfq_items` |
| `src/hooks/usePersistedDraft.ts` | new (thin React wrapper) |
| `src/lib/rfq-form-utils.ts` (+ `__tests__`) | new (pure logic, TDD) |
| `src/components/rfqs/RfqNuevo.tsx` | rewrite: accordion sections, gating, per-item obs, draft persistence, new header fields |
| `src/pages/Cotizaciones.tsx` | cart tab only: batch "Generar todas las OC" button |

## Sequence — draft persistence

```
mount RfqNuevo
  └─ usePersistedDraft('buildbuy-rfq-draft', EMPTY)
        ├─ load localStorage → deserializeDraft → value, hadSavedDraft=true?
        └─ if hadSavedDraft → show "borrador recuperado" notice (dismissible)
user types → setValue → debounce 500ms → serializeDraft → localStorage
submit success → clear() (remove key + suppress next autosave) → reset
discard → clear()
```

## Risks

- **RfqNuevo rewrite** is the main surface; mitigated by extracting all logic to tested pure functions and keeping the submit mutation behavior identical (same inserts + new fields).
- **Shared file with `#6`** (`Cotizaciones.tsx`): confine edits to the carrito region; do not touch the quote dialog. If `#4` and `#6` are developed concurrently, sequence them or expect a small merge in `Cotizaciones.tsx`.
- **Draft schema drift**: `deserializeDraft` must tolerate older persisted shapes (covered by tests) so a deployed form-shape change doesn't crash on a stale localStorage draft.
