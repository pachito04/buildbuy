# Design: Consolidacion de Requerimientos

> ⚠️ **CORRECTION (supersedes inline `destination`/`inventario` language below).**
> Two **orthogonal** axes were wrongly merged. Keep them separate:
> - **`request_items.routing`** (`inventario | cotizacion | orden_directa | pendiente`) — PROCUREMENT routing. **Owned by `items-destino-granular`** (migration `012_request_item_routing.sql`). Orthogonal to consolidación.
> - **`request_items.delivery_target`** (`deposito | obra`) — DELIVERY location. The axis consolidación gates on ("destino depósito"). **Consolidación owns this column** — it does NOT exist yet.
>
> Wherever this design says eligibility is `destination = 'inventario'`, it must read `routing = 'cotizacion'` (quote-bound) **AND** `delivery_target = 'deposito'` **AND** `material_id IS NOT NULL`. `routing = 'inventario'` items never reach an RFQ and are never consolidation candidates. The per-item selector that was `obra/deposito` is the `delivery_target` selector (consolidación's), not `routing`. Rework these lines to the two-axis model when consolidación is resumed.

## Technical Approach

Add a "Consolidar" tab in RFQs.tsx (NOT Cotizaciones.tsx -- the tab system for RFQ creation lives in RFQs.tsx). Pure business logic in `consolidacion-utils.ts` (TDD), data layer in `useConsolidacion.ts` hook, UI in `ConsolidacionPanel.tsx`. Modify `generateOC` in Cotizaciones.tsx to populate `request_item_id` traceability via `rfq_item_sources`. Add `destination` selector per item in CreateRequestDialog.tsx.

## Architecture Decisions

### Decision: ConsolidacionPanel tab placement

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Tab in RFQs.tsx | RFQs.tsx already has 5 tabs (nuevo, cesta, pool, vigentes, historico); adding one more but this is where RFQ creation lives | **CHOSEN** |
| Tab in Cotizaciones.tsx | Cotizaciones is for quote review + OC generation, not RFQ creation | Rejected |
| Dedicated /consolidar page | Extra route + sidebar entry, unnecessary navigation hop | Rejected |

**Rationale**: RFQs.tsx owns the RFQ creation workflow. The existing "Consolidar Pool" tab is already there as precedent. ConsolidacionPanel creates a new consolidated RFQ, which is an RFQ creation action.

### Decision: Pure function extraction pattern

| Option | Tradeoff | Decision |
|--------|----------|----------|
| All logic in hook | Untestable without mocking Supabase | Rejected |
| Pure functions in consolidacion-utils.ts + hook for IO | Matches deposito-utils.ts pattern, fully testable | **CHOSEN** |

**Rationale**: Project convention established by `deposito-utils.ts`. Extract grouping, urgency propagation, and delivery distribution as pure functions. Hook handles only Supabase queries and mutations.

### Decision: Consolidated RFQ item structure

| Option | Tradeoff | Decision |
|--------|----------|----------|
| One rfq_item per source request_item | Preserves 1:1 mapping but defeats consolidation purpose | Rejected |
| One rfq_item per material_id (summed quantities) + rfq_item_sources for traceability | True consolidation; requires rfq_item_sources junction | **CHOSEN** |

**Rationale**: The whole point is volume consolidation. Summing quantities per material gives providers a single line item. `rfq_item_sources` tracks which request_items contributed and how much.

### Decision: generateOC traceability approach

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Modify generateOC to always query rfq_item_sources | Adds a query for non-consolidated RFQs too | Rejected |
| Conditional path: check rfq_type, query rfq_item_sources only for `consolidated` | No perf impact on existing flows | **CHOSEN** |

**Rationale**: Existing OC flow must remain unchanged. Only consolidated RFQs need the rfq_item_sources lookup. Check `rfq_type === 'consolidated'` before running the extra query.

### Decision: Destination selector UX in CreateRequestDialog

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Global destination per request | Simpler UI, but mixed-destination requests are common | Rejected |
| Per-item destination dropdown | More UI elements but matches the data model (request_items.destination) | **CHOSEN** |

**Rationale**: Decision #3 puts destination at item level. A small Select next to each item row (defaulting to `obra`) keeps it simple while enabling mixed destinations.

## Data Flow

### Consolidation flow

```
SurtidoDialog (assigns destination per item — owned by items-destino-granular)
         |
         v
request_items [destination: inventario|cotizacion|orden_directa|pendiente, status: sin_pedir]
         |
         v
useConsolidacion.ts ─── query eligible items ───> Supabase
  (pendiente requests, sin_pedir + destination=inventario + material_id NOT NULL)
         |
         v
consolidacion-utils.ts
  groupByMaterial() ──> MaterialGroup[]
  calculateUrgency() ──> { urgente, urgentSources }
  distributeDelivery() ──> sorted by urgent-first, desired_date ASC
         |
         v
ConsolidacionPanel.tsx (in RFQs.tsx tab)
  User selects materials/quantities → preview → create
         |
         v
useConsolidacion.createConsolidatedRfq()
  INSERT rfqs (rfq_type: consolidated, urgente)
  INSERT rfq_items (one per material_id, summed qty)
  INSERT rfq_item_sources (rfq_item_id → request_item_id, quantity)
  INSERT rfq_requests (rfq_id → request_id for each source)
  UPDATE request_items.status → en_oc (for included items)
```

### OC generation flow (modified)

```
Comparativa.tsx → award items → AwardCartContext
         |
         v
Cotizaciones.tsx generateOC mutation
  IF rfq_type === 'consolidated':
    QUERY rfq_item_sources WHERE rfq_item_id IN (awarded rfq_item_ids)
    MAP quote_item → rfq_item → rfq_item_sources → request_item_ids
  INSERT purchase_order (destination: 'deposito')
  INSERT purchase_order_items (+ request_item_id from rfq_item_sources)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| ~~`supabase/migrations/001_request_items_destination.sql`~~ | REMOVED | Owned by `items-destino-granular` (`012_request_item_destination.sql`). Values: `inventario\|cotizacion\|orden_directa\|pendiente` (NOT `obra/deposito`). |
| `supabase/migrations/013_rfqs_urgente.sql` | Create | Add `urgente BOOLEAN NOT NULL DEFAULT false` to rfqs |
| `supabase/migrations/014_rfq_item_sources.sql` | Create | Create rfq_item_sources table with RLS |
| `supabase/migrations/015_rfq_requests.sql` | Create | Create rfq_requests junction table with RLS |
| `src/lib/consolidacion-utils.ts` | Create | Pure functions: groupByMaterial, calculateUrgency, distributeDelivery, buildRfqPayload |
| `src/lib/__tests__/consolidacion-utils.test.ts` | Create | TDD tests for all pure consolidation functions |
| `src/hooks/useConsolidacion.ts` | Create | Query eligible items + createConsolidatedRfq mutation |
| `src/components/rfqs/ConsolidacionPanel.tsx` | Create | Consolidation UI: material groups, selection, preview, create button |
| `src/pages/RFQs.tsx` | Modify | Add "Consolidar" tab rendering ConsolidacionPanel |
| `src/pages/Cotizaciones.tsx` | Modify | generateOC: add rfq_item_sources lookup for consolidated RFQs, populate request_item_id |
| `src/components/pedidos/CreateRequestDialog.tsx` | Modify | Add per-item destination Select (obra/deposito) |
| `src/integrations/supabase/types.ts` | Modify | Regenerate: add rfq_item_sources, rfq_requests, destination on request_items, urgente on rfqs |

## Interfaces / Contracts

```typescript
// consolidacion-utils.ts

interface EligibleItem {
  id: string;                    // request_item_id
  request_id: string;
  material_id: string;
  description: string;
  quantity: number;
  unit: string;
  destination: 'inventario';     // only inventario-routed items reach here (owned by items-destino-granular)
  request_urgente: boolean;      // from parent request
  request_desired_date: string | null;
  project_name: string;          // obra name for display
}

interface MaterialGroup {
  material_id: string;
  description: string;
  unit: string;
  total_quantity: number;
  sources: Array<{
    request_item_id: string;
    request_id: string;
    quantity: number;
    project_name: string;
    urgente: boolean;
    desired_date: string | null;
  }>;
  is_urgent: boolean;            // true if ANY source is urgent
  earliest_date: string | null;  // earliest desired_date among sources
}

interface ConsolidatedRfqPayload {
  rfq: {
    rfq_type: 'consolidated';
    urgente: boolean;
    delivery_location: string;
    deadline: string | null;
    closing_datetime: string | null;
    observations: string | null;
  };
  rfq_items: Array<{
    description: string;
    quantity: number;
    unit: string;
    material_id: string;
  }>;
  rfq_item_sources: Array<{
    /** index into rfq_items array (resolved to rfq_item_id after insert) */
    rfq_item_index: number;
    request_item_id: string;
    quantity: number;
  }>;
  rfq_requests: string[];  // unique request_ids
}

// Pure functions
function groupByMaterial(items: EligibleItem[]): MaterialGroup[];
function calculateUrgency(groups: MaterialGroup[]): boolean;
function distributeDelivery(sources: MaterialGroup['sources']): MaterialGroup['sources'];
function buildRfqPayload(
  selectedGroups: MaterialGroup[],
  config: { delivery_location: string; deadline: string | null; closing_datetime: string | null; observations: string | null }
): ConsolidatedRfqPayload;
```

```typescript
// useConsolidacion.ts

interface UseConsolidacionReturn {
  eligibleItems: EligibleItem[] | undefined;
  isLoading: boolean;
  groups: MaterialGroup[];
  createConsolidatedRfq: UseMutationResult<void, Error, ConsolidatedRfqPayload>;
}

function useConsolidacion(companyId: string | null): UseConsolidacionReturn;
```

```sql
-- rfq_item_sources
CREATE TABLE rfq_item_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_item_id UUID NOT NULL REFERENCES rfq_items(id) ON DELETE CASCADE,
  request_item_id UUID NOT NULL REFERENCES request_items(id),
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rfq_item_sources_rfq_item ON rfq_item_sources(rfq_item_id);
CREATE INDEX idx_rfq_item_sources_request_item ON rfq_item_sources(request_item_id);

-- rfq_requests
CREATE TABLE rfq_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES requests(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(rfq_id, request_id)
);
CREATE INDEX idx_rfq_requests_rfq ON rfq_requests(rfq_id);
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | groupByMaterial: correct grouping, quantity summing, dedup | Vitest, pure function, TDD red-green-refactor |
| Unit | calculateUrgency: urgent propagation from any source | Vitest, pure function |
| Unit | distributeDelivery: urgent-first sort, then desired_date ASC | Vitest, pure function |
| Unit | buildRfqPayload: correct payload structure, unique request_ids, source mapping | Vitest, pure function |
| Unit | Edge cases: empty items, single item, all urgent, no dates, mixed units | Vitest, pure function |

Integration and E2E tests are out of scope for the pure-function TDD layer. The hook (`useConsolidacion`) and UI (`ConsolidacionPanel`) follow existing untested patterns (no component tests exist in the codebase).

## Migration / Rollout

**Prerequisite**: `items-destino-granular` must be applied first. It owns `request_items.destination` (migration `012_request_item_destination.sql`, values: `inventario | cotizacion | orden_directa | pendiente`). Do NOT re-add this column here.

**Migration order** (sequential, each depends on previous):

1. `rfqs.urgente` -- Add column with default `false`. Non-breaking.
2. `rfq_item_sources` -- New table, no data dependencies. Add RLS policy matching rfq_items company_id via join.
3. `rfq_requests` -- New table, no data dependencies. Add RLS policy matching rfqs company_id.

**No data migration needed** -- all new columns have safe defaults, new tables start empty.

**rfq_type note**: The column already exists in DB as TEXT (used with `as any` casts). No ALTER needed for the column itself, but the `consolidated` value must work with existing `.or("rfq_type.eq.open,rfq_type.is.null")` filters. Consolidated RFQs must NOT appear in provider open-RFQ queries -- the existing filter already excludes them since `consolidated` is neither `open` nor `null`.

## Open Questions

- [ ] Should the ConsolidacionPanel show a confirmation dialog before creating the consolidated RFQ, or is a simple "Create" button sufficient? (Recommend: confirmation dialog given the cross-obra nature)
- [ ] Partial quantity selection per source item in the first iteration, or full-quantity only? (Proposal says start with full-quantity; partial as follow-up)
