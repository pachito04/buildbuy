# Apply Progress: rfq-numero-correlativo

> **Separate change** — distinct from `consolidacion-requerimientos-fixes`.
> Pre-existing transversal bug, implemented in same deploy local as Módulo 1 but documented independently.

## Status: COMPLETE

**Mode**: Standard (no TDD — UI label changes and a migration file don't have unit tests)
**Branch**: `feat/consolidacion-slice1-lock-rpc` (same branch as Módulo 1, commits distinguishable by prefix)

## Completed Tasks

- [x] 1.1 Migration `supabase/migrations/025_rfq_numero_correlativo.sql`
- [x] 2.1 `src/integrations/supabase/types.ts` — added `rfq_number` to Row/Insert/Update
- [x] 3.1 `src/components/rfqs/RfqList.tsx` — fallback replaced
- [x] 3.2 `src/pages/Comparativa.tsx` — fallback replaced
- [x] 3.3 `src/pages/RFQs.tsx` — fallback replaced
- [x] 3.4–3.8 `src/pages/Cotizaciones.tsx` — 5 fallbacks replaced
- [x] 3.9 `src/pages/Trazabilidad.tsx` — fallback replaced
- [x] 4.1–4.5 Queries updated with explicit rfq_number column selection

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/025_rfq_numero_correlativo.sql` | Created | Sequence + column + backfill + default + NOT NULL + unique index |
| `src/integrations/supabase/types.ts` | Modified | rfq_number added to rfqs Row/Insert/Update |
| `src/components/rfqs/RfqList.tsx` | Modified | Fallback `SC #hex` → `SC #rfq_number` |
| `src/pages/Comparativa.tsx` | Modified | Label builder + select updated |
| `src/pages/RFQs.tsx` | Modified | Detail panel fallback updated |
| `src/pages/Cotizaciones.tsx` | Modified | 5 fallback labels + 4 select strings updated |
| `src/pages/Trazabilidad.tsx` | Modified | Traceability chain label updated |

## Verification Results

- `npx tsc --noEmit`: 0 errors
- `npm run test`: 343/343 passed
- `npm run build`: exit 0

## Deviations from Design

None — implementation matches design exactly.
The `create_consolidated_rfq` RPC confirmed: inserts into `rfqs` without `rfq_number`, will get sequence default.

## Pattern Used

```typescript
// Before
`SC #${rfq.id.slice(0, 8)}`

// After
`SC #${rfq.rfq_number ?? rfq.id.slice(0, 8)}`
```

The UUID fallback is intentionally kept for graceful degradation on rows that somehow lack rfq_number.
