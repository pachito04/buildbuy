# Design: Consolidación de Requerimientos (núcleo)

> Reconciled to the current codebase. Núcleo = capture consolidation + traceability; defer distribution/reception to `#8b`.

## Architecture Decisions

### AD-1: `delivery_target` as a per-item CHECK column

`request_items.delivery_target text NOT NULL DEFAULT 'obra' CHECK (delivery_target IN ('deposito','obra'))`. Per-item (matching the per-item `routing`/`status` model), because the report gates consolidation on *products* delivered to depósito ("productos con entrega directa en obra no son consolidables"). Default `obra` (the common direct case); existing rows backfill to `obra`. CHECK style matches `routing`/item-status.

### AD-2: Two traceability tables

```sql
CREATE TABLE rfq_item_sources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_item_id     uuid NOT NULL REFERENCES rfq_items(id) ON DELETE CASCADE,
  request_item_id uuid NOT NULL REFERENCES request_items(id) ON DELETE CASCADE,
  request_id      uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  quantity        numeric(12,3) NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rfq_item_sources_item ON rfq_item_sources (rfq_item_id);

CREATE TABLE rfq_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id      uuid NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  request_id  uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rfq_id, request_id)
);
```

`rfq_item_sources` answers "how many units of this consolidated line came from which request_item/obra" — the data `#8b` will consume for reception distribution. `rfq_requests` answers "which requirements participate in this RFQ" (for history). RLS by company via `rfqs.company_id` (mirror existing patterns). Insert-only is sufficient (CASCADE cleans up if an RFQ/item is deleted).

### AD-3: `rfq_type='consolidated'` marks consolidated RFQs

No enum formalization (the column is free text used as `open`/`closed_bid` today). Consolidated RFQs set `rfq_type='consolidated'`. This is enough to branch later (`#8b`); the núcleo doesn't need an enum migration.

### AD-4: Pure consolidation logic (TDD)

`src/lib/consolidacion-utils.ts`:

```ts
interface EligibleItem {
  request_item_id: string; request_id: string; request_number: number;
  obra: string | null; material_id: string; description: string; unit: string;
  quantity: number; desired_date: string | null;
}
interface ConsolidatedLine {
  material_id: string; description: string; unit: string; totalQuantity: number;
  sources: { request_item_id: string; request_id: string; request_number: number; obra: string | null; quantity: number }[];
}

function groupEligibleByMaterial(items: EligibleItem[]): ConsolidatedLine[];   // group by material_id, sum, collect sources
function consolidatedUrgency(desiredDates: (string | null)[], thresholdDays: number): boolean;  // any isUrgente(...)
function isConsolidationEligible(item): boolean;   // the predicate (delivery_target/routing/material/status) — for client-side filtering/tests
```

`consolidatedUrgency` reuses `isUrgente` from `useUrgencyThreshold.ts`. All pure, unit-tested.

### AD-5: `useConsolidacion` creates the RFQ + traceability in order

Eligible query: `request_items` joined to `requests` where `requests.status='pendiente'` AND `delivery_target='deposito'` AND `routing IN ('pendiente','cotizacion')` AND `material_id IS NOT NULL` AND `request_items.status='sin_pedir'`. Group via `groupEligibleByMaterial`.

Creation mutation (sequential inserts; best-effort traceability ordering, RFQ first):
1. `INSERT rfqs` (`rfq_type='consolidated'`, company, created_by, status). (Urgency is computed, not stored — see `#9` note: urgency lives in display via `isUrgente`; for the consolidated RFQ we record source desired_dates through `rfq_requests`/sources and compute urgency in the UI. No `rfqs.urgente` column — it was dropped in migration 009.)
2. `INSERT rfq_items` (one per selected consolidated line, total quantity) → capture ids.
3. `INSERT rfq_item_sources` (one per source contribution).
4. `INSERT rfq_requests` (distinct source requests).
Invalidate rfqs + eligible queries.

### AD-6: Scope boundary — capture now, consume later

The núcleo writes `rfq_item_sources`/`rfq_requests` but does NOT change `generateOC` or reception. A consolidated RFQ flows through the existing comparativa → OC path unchanged; `purchase_order_items.request_item_id` stays null for consolidated lines (a consolidated line maps to multiple request_items — attributing/distributing is `#8b`). This keeps the núcleo additive and testable.

## Files

| File | Action |
|------|--------|
| `supabase/migrations/016_consolidacion.sql` | new (delivery_target + rfq_item_sources + rfq_requests) |
| `src/integrations/supabase/types.ts` | add column + 2 tables |
| `src/lib/consolidacion-utils.ts` (+ tests) | new (pure, TDD) |
| `src/hooks/useConsolidacion.ts` | new |
| `src/components/cotizaciones/ConsolidacionPanel.tsx` | new |
| `src/pages/Cotizaciones.tsx` (or `RFQs.tsx`) | mount "Consolidar" tab |
| `src/components/pedidos/CreateRequestDialog.tsx` | per-item delivery_target selector |

## Risks

- **New RFQ-creation path**: mitigated by additive schema + pure tested grouping; existing flows untouched (spec scenario asserts it).
- **Eligibility correctness**: the predicate spans status + routing + delivery_target + material; encoded once in the pure `isConsolidationEligible` + mirrored in the query. Tests cover the predicate.
- **Multi-source line attribution at OC/reception** is explicitly deferred (`#8b`); the data is captured so the deferral is safe.
