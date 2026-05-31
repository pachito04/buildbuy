# Tasks: items-destino-granular

## Overview

Add an explicit `routing` dimension to request items (procurement: how each item is obtained) and replace the stock-driven auto-decision in the processing dialog with a user-driven, per-item routing flow (resolves INC-001 + lays the [ALTA-ESTRUCTURAL] foundation). `routing` is orthogonal to delivery location (`deposito|obra` = a separate `delivery_target` field owned by consolidación).

**Strict TDD is active** (`vitest run`). Pure functions are written test-first.

Result: **vitest 61/61 green, `tsc --noEmit` clean.**

---

## Phase 1: Infrastructure & Types

### [x] 1.1 Write SQL migration
- **Files**: `supabase/migrations/012_request_item_routing.sql` (CREATE)
- **Spec refs**: Per-item routing column; Processing timeline event is allowed
- **Done**: `request_items.routing text NOT NULL DEFAULT 'pendiente'` + CHECK `chk_item_routing`. Also extends `requerimiento_evento.tipo` CHECK to add `'procesado'`. Rollback + manual checklist in header.

### [x] 1.2 Update Supabase types
- **Files**: `src/integrations/supabase/types.ts` (MODIFY)
- **Done**: `routing` union added to request_items Row/Insert/Update. `tsc --noEmit` clean.

---

## Phase 2: Pure logic (TDD)

### [x] 2.1 `suggestRouting` — test first
- **Files**: `src/lib/__tests__/routing-utils.test.ts` (CREATE)
- **Done (red confirmed)**: full stock → `inventario`; partial/no/negative stock → `cotizacion`; `material_id===null` → `cotizacion`; zero quantity → `inventario`.

### [x] 2.2 `suggestRouting` — implement
- **Files**: `src/lib/routing-utils.ts` (CREATE) — pure, no Supabase import.

### [x] 2.3 `canProcess` — test first
- **Done (red)**: all non-pendiente → true; any pendiente → false; empty → false.

### [x] 2.4 `canProcess` — implement
- **Done**: 13/13 tests pass.

---

## Phase 3: Processing flow rewrite

### [x] 3.1 Per-item routing selector UI
- **Files**: `src/components/pedidos/SurtidoDialog.tsx` (REWRITE)
- **Spec refs**: User assigns routing per item; Suggestion not committed
- **Done**: per-item `<Select>` initialized from `suggestRouting`. State-only — no side effects on open/edit.

### [x] 3.2 Guarded confirm + per-routing side effects
- **Files**: `src/components/pedidos/SurtidoDialog.tsx`
- **Spec refs**: No side effect without confirmation; Confirm acts only on committed routings; Cancel produces no side effect
- **Done**: confirm disabled while `!canProcess`. Branches: inventario → reserve+remito-borrador; cotizacion → RFQ draft; orden_directa → persist only. Each item's `routing` persisted. One `requerimiento_evento` (`tipo='procesado'`) inserted. Cancel/close = zero writes. `remitos.destination` (delivery address) left untouched.

### [x] 3.3 Verify parent-status derivation intact
- **Files**: `src/lib/__tests__/recalcRequestStatus.test.ts` (RUN) — 8/8 pass, no regression.

---

## Phase 4: Detail display & rebase

### [x] 4.1 Show routing in request detail
- **Files**: `src/components/pedidos/RequestDetailModal.tsx`, `src/lib/kanban-types.ts`, `src/hooks/useRequestsQuery.ts`, `src/components/pedidos/ActivityTimeline.tsx`
- **Done**: per-item routing badge in detail; `ItemRouting` type + `routing` on `RequestItem`; `request_items(*)` select; `procesado` label in timeline.

### [x] 4.2 Rebase consolidación (two-axis correction)
- **Files**: `openspec/changes/consolidacion-requerimientos/{proposal,design,specs}.md`
- **Done**: added a correction note — consolidación owns a separate `delivery_target` (`deposito|obra`); it does NOT own a procurement column; the earlier `deposito→inventario` remap was wrong and is marked stale pending rework on resume.

---

## Phase 5: Verification

### [x] 5.1 Full suite + typecheck
- **vitest run**: 61/61 pass. **`tsc --noEmit`**: clean.
- Manual app verification: pending (working tree on branch `feat/items-destino-granular`).
