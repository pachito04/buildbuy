# Tasks: rfq-numero-correlativo

> **Separate change** — distinct from `consolidacion-requerimientos-fixes`.

## Review Workload Forecast
- Estimated changed lines: ~40 (low)
- 400-line budget risk: Low
- Chained PRs recommended: No
- Decision needed before apply: No

## Phase 1: Database

- [x] 1.1 Create `supabase/migrations/025_rfq_numero_correlativo.sql`
  - Sequence, column, backfill, setval, default, NOT NULL, unique index
  - Wrapped in BEGIN/COMMIT, re-executable, rollback commented at end
  - Verified `create_consolidated_rfq` RPC needs no change (inserts without rfq_number, default fires)

## Phase 2: Type System

- [x] 2.1 Update `src/integrations/supabase/types.ts`
  - `Row.rfq_number: number`
  - `Insert.rfq_number?: number`
  - `Update.rfq_number?: number`

## Phase 3: UI — Fallback label replacement

- [x] 3.1 `src/components/rfqs/RfqList.tsx:55` — `rfq.rfq_number ?? rfq.id.slice(0, 8)`
- [x] 3.2 `src/pages/Comparativa.tsx:247` — `(rfq as any).rfq_number ?? rfq.id.slice(0, 8)`
- [x] 3.3 `src/pages/RFQs.tsx:341` — `(detailRfq as any).rfq_number ?? detailRfq.id.slice(0, 8)`
- [x] 3.4 `src/pages/Cotizaciones.tsx:334` — `r.rfq_number ?? r.id.slice(0, 8)`
- [x] 3.5 `src/pages/Cotizaciones.tsx:528` — `rfq.rfq_number ?? rfq.id.slice(0, 8)`
- [x] 3.6 `src/pages/Cotizaciones.tsx:560` — `rfq.rfq_number ?? rfq.id.slice(0, 8)`
- [x] 3.7 `src/pages/Cotizaciones.tsx:707` — `detailRfqData.rfq_number ?? detailRfqData.id.slice(0, 8)`
- [x] 3.8 `src/pages/Cotizaciones.tsx:763` — `quoteDetailRfq.rfq_number ?? quoteDetailRfq.id.slice(0, 8)`
- [x] 3.9 `src/pages/Trazabilidad.tsx:221` — `chain.rfq.rfq_number ?? chain.rfq.id.slice(0, 6)`

## Phase 4: Queries

- [x] 4.1 `Cotizaciones.tsx` openRfqs select — add `rfq_number`
- [x] 4.2 `Cotizaciones.tsx` closedRfqs select — add `rfq_number`
- [x] 4.3 `Cotizaciones.tsx` quoted-rfqs select — add `rfq_number`
- [x] 4.4 `Cotizaciones.tsx` comparativa-rfqs select — add `rfq_number`
- [x] 4.5 `Comparativa.tsx` comparativa-rfq select — add `rfq_number`

## Phase 5: Verification

- [x] 5.1 `npx tsc --noEmit` → 0 errors
- [x] 5.2 `npm run test` → 343 tests passed
- [x] 5.3 `npm run build` → exit 0

## Status: COMPLETE — all 15 tasks done
