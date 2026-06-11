# Archive Report — gestion-consumos-fixes

> Phase: sdd-archive | Change: gestion-consumos-fixes | Status: COMPLETE (18/18 tasks)
> Final verification: PASS WITH WARNINGS FIXED — 468 tests, 0 failures; tsc clean | Commit: dcc5510

---

## Executive Summary

The **gestion-consumos-fixes** change is fully implemented, tested, and verified. All 18 tasks across 6 slices (Slice A–F) are marked complete. The change closes 6 critical business-rule gaps in Module: Gestión de Consumos por Obra + Cuenta Corriente con Proveedores:

1. **GAP 1 — Notificaciones internas proveedor↔Compras en cambios de precio**: Uses existing `notificaciones` table with DB triggers on `precio_proveedor` (migration 030).
2. **GAP 2 — Filtros completos del reporte**: Added proveedor, material, arquitecto filters to `ReporteConsumos` (server-side query + helper).
3. **GAP 3 — Vista comparativa**: Time-series by material (LineChart Recharts) with metric toggle (cantidad|monto) and default last 12 months.
4. **GAP 4 — PDF de estado de cuenta para Compras**: Extracted shared PDF helper from `MiCuentaCorriente` and exposed in `CuentaCorriente` (Compras view).
5. **GAP 5 — Plantilla Excel descargable**: Added "Descargar plantilla" button to `PreciosUploader` with deterministic file generation (xlsx, 5 headers).
6. **GAP 6 — Guard de rol a nivel de ruta**: Added `RequireRole` component wrapping 5 consumos routes with role matrix enforcement.

**Integrated to main on commit dcc5510.** All deltas merged into main spec `openspec/specs/consumos-cuenta-corriente/spec.md`. Change folder archived to `openspec/changes/archive/2026-06-11-gestion-consumos-fixes/`.

---

## Scope Closed

| Gap | Title | Requirements | Scope | Status |
|-----|-------|--------------|-------|--------|
| **GAP 1** | Notificaciones internas proveedor↔Compras | Migration 030 (triggers + RPCs) + enum values (`precio_actualizado_por_proveedor`, `precio_editado_por_compras`) + rewrite bulk/edit paths | Proveedor updates → 1 agg notif to Compras; Compras edit → notif to provider_users. Batch token + actor token. | ✅ PASS |
| **GAP 2** | Filtros completos del reporte | Server-side filters (proveedor, material, arquitecto) + helper `filterRetiros` (puro, testeable) + dropdowns (no orphans) | AND composition of 5 filters; anulado always excluded; matches REQ-04 | ✅ PASS |
| **GAP 3** | Vista comparativa (time-series) | Helper `buildTimeSeries` (qty/monto, month period) + Recharts LineChart + toggle Lista|Comparativa + empty state + default 12 months | Série temporal por material; filters propagate; anulados excluded | ✅ PASS |
| **GAP 4** | PDF de estado de cuenta (Compras) | Helper `generateEstadoCuentaPDF` extracted from `MiCuentaCorriente` + reuse in `CuentaCorriente` (Compras) + button gated by provider+movs | PDF byte-for-byte identical for proveedor; new button for Compras; RLS confirmed compatible | ✅ PASS |
| **GAP 5** | Plantilla Excel descargable | Helper `buildPlantillaPreciosWorkbook` + button in `PreciosUploader` (always visible, no upload state reset) + 5 exact headers + deterministic filename | Template gen client-side (xlsx), 1 sheet, 5 headers in order, 0 data rows, filename `plantilla-precios.xlsx` | ✅ PASS |
| **GAP 6** | Route role-guards | Component `RequireRole` + wrapping 5 consumos routes in `App.tsx` + role matrix (Arquitecto denied all) | Defense in depth: sidebar (layer 1) + route guard (layer 2) + RLS/RPC (layer 3) | ✅ PASS |

---

## Deltas Merged into Main Specs

### Merged Spec: `openspec/specs/consumos-cuenta-corriente/spec.md` (UPDATED)

**Updated by merging 6 delta specs:**

- `openspec/changes/gestion-consumos-fixes/specs/gap1-notifications/spec.md` → merged into "GAP Closures"
- `openspec/changes/gestion-consumos-fixes/specs/gap2-report-filters/spec.md` → merged
- `openspec/changes/gestion-consumos-fixes/specs/gap3-comparativa-view/spec.md` → merged
- `openspec/changes/gestion-consumos-fixes/specs/gap4-compras-pdf/spec.md` → merged
- `openspec/changes/gestion-consumos-fixes/specs/gap5-excel-template/spec.md` → merged
- `openspec/changes/gestion-consumos-fixes/specs/gap6-route-guards/spec.md` → merged

**Content:** Original spec maintained; new section "## Gap Closures (SDD: gestion-consumos-fixes)" added with 6 subsections (one per GAP). All Given/When/Then scenarios and RFC 2119 keywords preserved. Combined length: original + ~350 lines (gap closures).

**Format:** Consistent with existing main spec structure; ready for team reference and future enhancements.

---

## Test & Verification Results

| Check | Result | Details |
|-------|--------|---------|
| Unit tests (vitest run) | ✅ 468 passed / 0 failed | Across 41 test files; +40 new tests from this change (baseline 428 → 468) |
| Type checking (tsc --noEmit) | ✅ Clean (exit 0) | No TypeScript errors; new enum values + RPC signatures aligned |
| Task completion | ✅ 18/18 marked [x] | All 6 slices complete (A–F per design) |
| Verification verdict | ✅ PASS WITH W1/W2 FIXED | No CRITICAL findings; 2 WARNINGs (W1, W2) fixed in apply phase; 2 SUGGESTIONs (non-blocking) |
| Verify report status | ✅ Cleared to push | All 6 GAPs implemented per spec, GAP7 correctly deferred |

**Key test confirmations:**
- **GAP 1**: Migration 030 approved (SQL checklist embedded); proveedor bulk → 1 agg notif; Compras single edit → notif to provider_users; actor/batch tokens gate correctly; no regression on 002.
- **GAP 2**: `filterRetiros` helper covers AND combination + anulado exclusion; dropdowns no-orphan; server-side query working.
- **GAP 3**: `buildTimeSeries` groups by (month, material), both metrics (qty/monto) tested; empty state returns []; filters propagate.
- **GAP 4**: PDF extraction byte-for-byte identical for proveedor; Compras button gated and functional; RLS compatible (no change needed).
- **GAP 5**: Template 5 headers exact order, 0 data rows, filename deterministic; button always visible, upload state preserved.
- **GAP 6**: `RequireRole` matrix enforced for all 5 routes; Arquitecto denied all; loading spinner prevents false-negative redirects; 8 tests cover role matrix.

**Post-verify fixes (W1, W2 applied):**

- **W1 (FIXED)**: Provider bulk import RPC param `p_company_id` was being passed as empty string for global prices. Fixed by passing `null` directly (RPC resolves null via `profiles.company_id`). Change: 1 line in `ListaPreciosProveedor.tsx:307`.
- **W2 (FIXED)**: `closeVigencia` actor detection used `companyId !== null` instead of `actualRole !== 'proveedor'`. Fixed to use `useViewRole` role directly for signal accuracy. Change: ~2 lines in `usePreciosProveedor.ts:124-126`.

**Non-blocking findings:**
- **S1**: Dead code in `usePreciosProveedor.ts:120-123` (`role` computation no-op after W2 fix). Harmless; noted for cleanup.
- **S2**: Bulk overlap check only detects when both `vigencia_hasta` are NULL; bounded-range overlaps not detected in bulk path. Acceptable for scope; noted for Fase 2.

---

## Integration & Commits

| Commit | Hash | Branch | Scope |
|--------|------|--------|-------|
| Feat integration | dcc5510 | main | All 18 tasks, all 6 slices accumulated + W1/W2 fixes (quick follow-up commits) |
| — | — | — | Ready for archive (already integrated at dcc5510) |

**Branch:** feat/consumos-fixes (now merged to main at dcc5510).

---

## Archive Contents

```
openspec/changes/archive/2026-06-11-gestion-consumos-fixes/
├── proposal.md              — Scope, intent, 7 gaps (G1–G7), risks, rollback plan, slicing (A–F + G decision-gated)
├── design.md                — Architecture decisions, Decisiones 1–7, constraint confirmations, mapa de componentes
├── specs/
│   ├── gap1-notifications/spec.md       — REQ-01, REQ-05: internal notif triggers + RPCs
│   ├── gap2-report-filters/spec.md      — REQ-04: complete filter set (proveedor, material, arquitecto)
│   ├── gap3-comparativa-view/spec.md    — REQ-04: time-series by material, metric toggle, empty state
│   ├── gap4-compras-pdf/spec.md         — REQ-03: shared PDF helper extraction + Compras button
│   ├── gap5-excel-template/spec.md      — REQ-05: plantilla Excel download, 5 headers, deterministic filename
│   └── gap6-route-guards/spec.md        — Spec §7: route role-guards, matriz de acceso, Arquitecto denied all
├── tasks.md                 — 18 tasks across 6 slices (A–F), all marked [x]
├── verify-report.md         — PASS verdict (W1/W2 fixed), 468/0 tests, no CRITICAL findings
└── archive-report.md        — This file (audit trail, traceability)
```

**Merged spec location:**
```
openspec/specs/consumos-cuenta-corriente/spec.md  — Source of truth for consumos domain (original + ~350 lines of gap closures)
```

---

## Key Design Decisions Captured

1. **GAP 1 — Batch token + actor token via `current_setting`**: Encapsulate set_config + write in ONE RPC per batch/edit to guarantee shared transaction. Two RPCs: `precio_proveedor_bulk_insert` (batch), `precio_proveedor_edit` (Compras single edit).
2. **GAP 1 — Distinción actor (Compras vs proveedor)**: Actor token `app.precio_actor='compras'` set by RPC; proveedor edit has no token → provider→Compras notif fires; Compras edit has token → Compras→provider notif fires; Compras edit gates proveedor→Compras notif.
3. **GAP 2 — Arquitecto filter uses `retiro.architect_id` not `created_by`**: Spec text mentions `created_by`, but correct semantic field is `architect_id` (FK to architects). Documented as design deviation, justified by schema semantics.
4. **GAP 3 — Metric toggle (cantidad|monto) instead of two charts**: One axis temporal, one selector (qty/monetary); spec requires "axis unit consistent across all series" — achieved via toggle, not multi-chart.
5. **GAP 4 — Logo optional, not introduced in extraction**: `logoDataUrl` param declared but unused to preserve byte-for-byte regression of proveedor export. Logo wiring deferred to Fase 2.
6. **GAP 5 — `xlsx` already in stack**: No new dependency; reused existing SheetJS (0.18.5).
7. **GAP 6 — `RequireRole` component wraps routes inside AppLayout**: Context `useViewRole` available; spinner during loading; redirect to `/dashboard` on denied, `/login` on no-session.

All decisions documented in `design.md` (full rationale + constraint survey).

---

## Dependencies & Follow-ups

### In Scope (Closed)
- ✅ Migration 030 (notificación infra, triggers, RPCs).
- ✅ Bulk import RPC + single edit RPC + client rewrites (GAP1).
- ✅ Filter helpers + server-side queries + dropdowns (GAP2).
- ✅ Time-series helper + LineChart + toggle + empty state (GAP3).
- ✅ PDF helper extraction + byte-for-byte regression + Compras button (GAP4).
- ✅ Excel template generation + button (GAP5).
- ✅ `RequireRole` component + route wrapping (GAP6).

### Out of Scope (Named Follow-ups)
- **GAP 7 — Fase 2 (WhatsApp Readiness)**: Preparación de esquema (`id_mensaje_whatsapp`, ampliación de dominio `retiro.estado`). Decision-gated in proposal; deferred to user discretion and Fase 2 implementation roadmap.
- **W1/W2 Post-Fixes**: Applied in follow-up commits after verify (provider bulk import empty-string fix, actor detection fix).
- **Fase 2 Enhancements**: Notification by external channel (email, push, WhatsApp); full WhatsApp integration; bulk overlap detection for bounded ranges; logo in PDF.

---

## Risks & Mitigations

| Risk | Probability | Mitigation | Status |
|------|-------------|------------|--------|
| Provider bulk import empty-string UUID breaks on RPC call | High | W1 fix: pass `null` directly; RPC resolves via profile company_id | ✅ Fixed |
| Actor detection (W2) misclassifies provider with non-null profile.company_id | Low | W2 fix: use `actualRole !== 'proveedor'` from useViewRole; semantically correct | ✅ Fixed |
| Batch token not persisted cross-request in supabase-js autocommit | Addressed | RPC encapsulates set_config + write in one transaction (transaction-local, valid) | ✅ Mitigated |
| Material filter crosses retiro↔retiro_item, post-filtering in memory | Low | Helper `filterRetiros` contracts truth; server-side applies bulk filtering; residual post-filtering covered by tests | ✅ Verified |
| Time-series aggregation on large dataset degrades performance | Low | Data already filtered server-side before aggregation; Fase 2 can move aggregation to RPC/view if needed | ✅ Acceptable |
| RequireRole false-negative redirect during loading | Addressed | Spinner shown while `loading=true`; NEVER redirects before role resolved | ✅ Mitigated |

---

## Traceability

All original artifacts preserved in archive:
- **Proposal** defines intent, scope, 7 gaps (G1–G7), approach, slicing (A–F + G decision-gated), risks, rollback.
- **Specs (6 deltas)** document requirements, Given/When/Then scenarios, and non-functional constraints per gap.
- **Design** captures architecture decisions (7 Decisiones), data models, constraint confirmations, component mapa.
- **Tasks** break work into 18 completable items across 6 slices (A–F); all marked [x].
- **Verify Report** confirms PASS (468/0 tests, tsc clean, W1/W2 fixed).

**Merged spec** (`openspec/specs/consumos-cuenta-corriente/spec.md`) is the updated source of truth for the consumos domain, consolidating original requirements + all 6 gap closures.

---

## Sign-Off

- **Change**: gestion-consumos-fixes
- **Status**: ARCHIVED
- **Date Archived**: 2026-06-11
- **Final Commit**: dcc5510 (main)
- **Tasks**: 18/18 complete
- **Verification**: PASS (468/0 tests, tsc clean, W1/W2 post-verify fixes applied)
- **Archive Path**: `openspec/changes/archive/2026-06-11-gestion-consumos-fixes/`
- **Merged Spec**: `openspec/specs/consumos-cuenta-corriente/spec.md` (updated with gap closures)

The SDD cycle for gestion-consumos-fixes is closed. The change is production-ready and integrated to main (commit dcc5510). Ready for the next change.
