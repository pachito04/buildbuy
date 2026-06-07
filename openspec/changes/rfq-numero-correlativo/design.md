# Design: rfq-numero-correlativo

> **Separate change** — distinct from `consolidacion-requerimientos-fixes`.

## Database Layer

### Sequence
```sql
CREATE SEQUENCE IF NOT EXISTS rfqs_rfq_number_seq;
```
Global Postgres sequence, re-run safe.

### Column
```sql
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS rfq_number bigint;
```
Added nullable first to allow backfill, then `SET NOT NULL` after.

### Backfill strategy
`row_number() OVER (ORDER BY created_at, id)` — deterministic, idempotent (only updates NULL rows).

### Sequence advance
`setval` after backfill so next `nextval` is always > max existing.

### Default wire-up
`ALTER COLUMN rfq_number SET DEFAULT nextval(...)` — inserts without rfq_number auto-get the next value.

### Index
`UNIQUE INDEX idx_rfqs_rfq_number` — prevents duplicates; enables fast lookup by number.

### RPC compatibility
`create_consolidated_rfq` (migration 024) inserts into `rfqs` without specifying `rfq_number`.
After the column default is set, the sequence fires automatically. No RPC change needed.

## Type Layer

`src/integrations/supabase/types.ts`:
- `Row`: `rfq_number: number` (required, matches NOT NULL column)
- `Insert`: `rfq_number?: number` (optional, default takes over)
- `Update`: `rfq_number?: number` (optional)

## UI Layer

### Label priority (unchanged)
```
1. requests.request_number  → "Pedido #N"
2. purchase_pools.name      → "Pool: <name>"
3. rfq_number               → "SC #N"  ← was: rfq.id.slice(0,8)
```

### Affected files
| File | Location | Variable |
|------|----------|----------|
| `src/components/rfqs/RfqList.tsx` | line 55 | `rfq.rfq_number` |
| `src/pages/Comparativa.tsx` | line 247 | `(rfq as any).rfq_number` |
| `src/pages/RFQs.tsx` | line 341 | `(detailRfq as any).rfq_number` |
| `src/pages/Cotizaciones.tsx` | line 334 | `r.rfq_number` |
| `src/pages/Cotizaciones.tsx` | line 528 | `rfq.rfq_number` |
| `src/pages/Cotizaciones.tsx` | line 560 | `rfq.rfq_number` |
| `src/pages/Cotizaciones.tsx` | line 707 | `detailRfqData.rfq_number` |
| `src/pages/Cotizaciones.tsx` | line 763 | `quoteDetailRfq.rfq_number` |
| `src/pages/Trazabilidad.tsx` | line 221 | `chain.rfq.rfq_number` |

Pattern: `rfq_number ?? rfq.id.slice(0, N)` — the UUID fallback stays for rows without rfq_number (pre-migration).

## Query Layer

Queries with explicit column selects (not `*`) that feed the above UI locations need `rfq_number` added:

| File | Query key | Change |
|------|-----------|--------|
| `Cotizaciones.tsx` | `rfqs-proveedor` (openRfqs) | `id, rfq_number, ...` |
| `Cotizaciones.tsx` | `rfqs-proveedor` (closedRfqs) | `id, rfq_number, ...` |
| `Cotizaciones.tsx` | `quoted-rfqs` | `id, rfq_number, ...` |
| `Cotizaciones.tsx` | `comparativa-rfqs` | `id, rfq_number, ...` |
| `Comparativa.tsx` | `comparativa-rfq` | `id, rfq_number, ...` |

Queries using `select("*")` (RFQs.tsx, Trazabilidad.tsx) already include rfq_number after migration.
