# Exploration: Consolidación de Requerimientos en Cotización

## Current State

### RFQ Creation Points

There are **four** entry points that create RFQs:

1. **RfqNuevo.tsx** (`src/components/rfqs/RfqNuevo.tsx`) — Manual RFQ from material catalog. User picks materials from `materials` table, sets rfq_type (`open` | `closed_bid`), dates, delivery location, optional provider list for closed bids. Inserts `rfqs` then `rfq_items` with material_id.

2. **RfqCesta.tsx** (`src/components/rfqs/RfqCesta.tsx`) — Basket-based RFQ. Items come from `BasketContext`, which is populated from Inventory/Materials modules. Same insert pattern as RfqNuevo.

3. **SolicitudDirectaDialog.tsx** (`src/components/pedidos/SolicitudDirectaDialog.tsx`) — Direct RFQ from a single request. Queries `request_items` for all items in the request, creates RFQ with `request_id` FK, inserts `rfq_items` from request_items. Sets request status to `recibido`.

4. **SurtidoDialog.tsx** (`src/components/pedidos/SurtidoDialog.tsx`) — Inventory fulfillment dialog. Items with stock go to remito, remaining items (`needsRfq`) create a draft RFQ with `request_id`. No rfq_type set (defaults to `open`).

### rfq_items Schema (current)

```
rfq_items: {
  id, rfq_id, description, quantity, unit, material_id (nullable), specifications
}
```

No source traceability, no request_item_id reference.

### rfqs Schema (current)

```
rfqs: {
  id, company_id, rfq_type (open|closed_bid — cast to any), request_id (FK, nullable),
  pool_id (FK, nullable), status (draft|sent|responded|closed),
  deadline, closing_datetime, delivery_location, observations, payment_terms,
  created_by, created_at, updated_at
}
```

NOTE: `rfq_type` is used in code as `open | closed_bid | consolidated` but the TypeScript types.ts does NOT have an `rfq_type` column in `rfqs` — it's inserted/queried with `as any` cast. This means `rfq_type` exists in the DB but was NOT included in the generated types. This is a critical discovery for migration planning.

### request_items Schema (current)

```
request_items: {
  id, request_id, material_id (nullable), description, quantity, unit,
  status (sin_pedir|en_oc|parcial|recibido), quantity_ordered, quantity_received,
  observations, match_confidence, created_at
}
```

No `destination` column yet. Status `sin_pedir` = items eligible for consolidation (per decisions).

### requests Schema (current)

```
requests: {
  id, company_id, project_id, request_number, status (pendiente|en_curso|recibido|rechazado),
  urgente (boolean), desired_date, architect_id, created_by, ...
}
```

`urgente` flag exists at request level. `project_id` links to obra.

### OC Generation Flow (Cotizaciones.tsx + Comparativa.tsx)

1. **Comparativa.tsx**: User selects quote items → adds to `AwardCartContext`. Cart items carry: `quote_item_id, rfq_id, rfq_item_id, provider_id, description, quantity, unit, unit_price`.

2. **Cotizaciones.tsx** (`generateOC` mutation): Groups cart items by `provider_id`. For each provider group, creates one `purchase_orders` record with a single `rfq_id` (the first item's rfq_id), then creates `purchase_order_items` with `quote_item_id` reference. Destination is set per-provider via a UI select (`obra` | `deposito`).

**Key gap**: `generateOC` takes only ONE `rfq_id` per OC (first item). For a consolidated RFQ spanning multiple source requests, this is fine since it was one RFQ. But the OC currently has no way to know WHICH source request_items to mark as fulfilled.

### purchase_order_items Schema (current)

```
purchase_order_items: {
  id, purchase_order_id, description, quantity, unit, unit_price,
  quote_item_id (nullable), request_item_id (nullable), material_id (nullable),
  computo_item_id (nullable), quantity_received, factor_conversion
}
```

`request_item_id` FK to `request_items` ALREADY EXISTS. This is important — OC items can already trace back to request items.

### purchase_orders Schema (current)

```
purchase_orders: {
  id, company_id, provider_id, rfq_id (nullable), request_id (nullable),
  destination (string, default 'obra'), status, total_amount, ...
}
```

`destination` is at the PO level, not item level. This is sufficient for the simple case where all items in a consolidated RFQ share the same destination — but per the decisions, `destination` will be at the `request_item` level (deposito|obra), and only `deposito` items are consolidable.

---

## Affected Areas

- `src/integrations/supabase/types.ts` — Must add `rfq_type` column properly to `rfqs`, add `destination` to `request_items`, add two new tables: `rfq_item_sources` and `rfq_requests`
- `src/pages/Cotizaciones.tsx` — Add "Consolidar" tab (3rd tab for compras/admin role); modify `generateOC` to handle traceability back to source request_items
- `src/pages/Comparativa.tsx` — Works as-is; no structural change needed for consolidated RFQ comparativa
- `src/components/rfqs/RfqNuevo.tsx` — No change needed (manual RFQs don't consolidate)
- `src/components/rfqs/RfqCesta.tsx` — No change needed
- `src/components/pedidos/SolicitudDirectaDialog.tsx` — Needs to check `destination` on request_items; only `deposito` items shown as consolidable
- `src/lib/kanban-types.ts` — No change needed (item status `sin_pedir` is already the eligibility signal)
- New file: `src/components/cotizaciones/ConsolidacionPanel.tsx` — The core UI for consolidation
- New file: `src/hooks/useConsolidacion.ts` — Business logic for fetching eligible requests/items, building the consolidated RFQ
- Supabase migrations: `rfqs.rfq_type` column formal type, `request_items.destination` column, `rfq_item_sources` table, `rfq_requests` table

---

## Approaches

### 1. Consolidation as New Tab in Cotizaciones (Recommended)

Add a third tab "Consolidar" to the compras/admin view in `Cotizaciones.tsx`. The panel loads `pendiente` requests with `sin_pedir` AND `deposito` destination request_items, groups by `material_id`, lets the user select which items to include, configures the RFQ, and creates the consolidated RFQ.

- **Pros**: Keeps the workflow in Cotizaciones where Compras already manages RFQs. Natural fit since the goal is to CREATE an RFQ. Minimal navigation change.
- **Cons**: Cotizaciones.tsx is already large (869 lines). Adding a third major tab will push it further.
- **Effort**: Medium

### 2. Dedicated Page /consolidar

Create a new page `src/pages/Consolidar.tsx` with its own route.

- **Pros**: Clean separation of concerns, no file size growth in Cotizaciones.tsx.
- **Cons**: Requires new route + sidebar entry. More navigation hops for users.
- **Effort**: Medium (same implementation, different container)

### 3. Panel in Pedidos/Requerimientos

Add a "Consolidar" action button in the Pedidos Kanban for `pendiente` column items.

- **Pros**: Closer to the source data.
- **Cons**: Mixes request management with purchase creation. Compras role doesn't own Pedidos in the same way.
- **Effort**: Medium

---

## Key Technical Findings

### Finding 1: rfq_type is NOT in TypeScript types

`rfq_type` exists in the DB (confirmed by code using it with `.or("rfq_type.eq.open,rfq_type.is.null")`) but is cast with `as any` everywhere in TypeScript. The new `consolidated` value can be added without breaking existing code, but types.ts must be updated to avoid future `as any` casts.

### Finding 2: purchase_order_items already has request_item_id FK

This is the traceability link for OC → request_item. When generating OC from a consolidated RFQ, the mutation in `generateOC` needs to populate `request_item_id` in `purchase_order_items` using the `rfq_item_sources` lookup. The field already exists.

### Finding 3: Destination at request-level vs item-level

`purchase_orders.destination` is PO-level. When OC is generated from a consolidated RFQ (items from multiple obras), you CANNOT set a single destination for the whole PO. Two options:
  - **a)** Add `destination` to `purchase_order_items` (item-level)
  - **b)** Split consolidated RFQ into one OC per destination at award time

Since the decision says `destination` goes on `request_items`, and only `deposito` items are consolidable, all items in a consolidated RFQ will have destination `deposito`. This means the OC from a consolidated RFQ will ALWAYS have destination `deposito`. This simplifies the problem — no split needed for the consolidation flow.

### Finding 4: Free-text items (no material_id)

`request_items.material_id` is nullable. The consolidation decision matches by `material_id`. Items without a `material_id` cannot be matched across requests and thus cannot be consolidated. The UI must clearly mark these as non-consolidable (or allow consolidation only for `material_id`-linked items).

### Finding 5: Urgency propagation in the RFQ header

`requests.urgente` is a boolean at request level. When consolidating, if ANY source request is urgent, the consolidated RFQ must also be marked urgent. The `rfqs` table has no `urgente` column — this needs to be added, or the urgency flag lives only on the source requests. The UI must surface urgency warnings in the comparativa of a consolidated RFQ.

### Finding 6: rfq_requests junction table needed

The existing `rfqs` table has a single `request_id` FK — it only links to one request. A consolidated RFQ has MANY source requests. The `rfq_requests` (rfq_id, request_id) table must be created. The existing `rfqs.request_id` should stay for backward compatibility with non-consolidated RFQs.

### Finding 7: OC generation for consolidated RFQ — multi-request traceability

When `generateOC` runs for a consolidated RFQ, it needs to:
1. Query `rfq_item_sources` to find (rfq_item_id → [request_item_id, quantity]) mappings
2. Populate `purchase_order_items.request_item_id` correctly (one PO item per source request_item if partial, or directly if the quantities align)
3. Update `request_items.status` to `en_oc` for all sourced request_items

This is the most complex part of the implementation.

---

## Schema Changes Summary

### New Columns
- `rfqs.rfq_type` — formalize existing TEXT column as enum: `open | closed_bid | consolidated`
- `rfqs.urgente` — boolean, default false (propagated from source requests)
- `request_items.destination` — enum: `deposito | obra`, default `obra` (non-breaking)

### New Tables
```sql
rfq_item_sources (
  id uuid PK,
  rfq_item_id uuid FK rfq_items(id),
  request_item_id uuid FK request_items(id),
  quantity numeric NOT NULL,
  created_at timestamptz DEFAULT now()
)

rfq_requests (
  id uuid PK,
  rfq_id uuid FK rfqs(id),
  request_id uuid FK requests(id),
  created_at timestamptz DEFAULT now()
)
```

---

## Recommendation

**Approach 1 (New tab in Cotizaciones)** is recommended because:
- Compras users are already in Cotizaciones to manage RFQs
- Consistent with existing flow: Comparativas tab (review), Carrito tab (award), **Consolidar tab** (create from multiple requests)
- Minimal navigation change

The implementation should be extracted into a `ConsolidacionPanel.tsx` component and a `useConsolidacion.ts` hook to avoid bloating Cotizaciones.tsx further.

---

## Risks

- **rfq_type enum migration**: Existing records have `rfq_type` as `open` or `null` — adding `consolidated` is safe, but formalizing the column type requires a migration. Must handle existing `null` values.
- **Backward compatibility in Cotizaciones.tsx queries**: The proveedor view filters `rfq_type.eq.open,rfq_type.is.null`. Consolidated RFQs should NOT appear for providers directly (they behave the same as `open` for bidding purposes). Add `rfq_type.eq.consolidated` to the OR filter.
- **generateOC complexity**: Populating `purchase_order_items.request_item_id` from `rfq_item_sources` adds a query round-trip. Must be transactional or at least catch partial failures.
- **Free-text items**: Items without `material_id` are silently excluded from consolidation pool. UX must make this clear.
- **Urgency inheritance**: Adding `rfqs.urgente` requires a migration and a UI indicator in the comparativa. Low risk but a required schema change.
- **Partial quantities**: A request_item with 100 cement could contribute 60 to a consolidated RFQ (if only 60 is needed). The `rfq_item_sources.quantity` field handles this, but the UI for setting partial quantities adds complexity.

---

## Ready for Proposal

Yes — the scope is clear, decisions are made, and the technical gaps are fully mapped. The proposal should detail the consolidation UI flow, the migration plan for schema changes, and the OC generation traceability logic.
