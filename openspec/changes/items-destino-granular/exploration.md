# Exploration: Item-level Routing & Granular Processing Control

> Note (post-exploration decision): the field investigated below as "destination" was implemented as **`request_items.routing`** (procurement axis), to disambiguate from delivery location (`deposito|obra` = a separate `delivery_target` field owned by consolidación). Read "destination" below as "routing".

Source: `Reporte 1805.docx` — PERFIL COMPRAS items **INC-001** and **[ALTA — ESTRUCTURAL] Detalle de requerimiento por producto con destino mixto**.

## Goal of the report items

1. **INC-001 (🔴 CRÍTICO)** — Processing a mixed request (some items in stock, some not) auto-reserves the in-stock items and auto-creates a draft RFQ for the rest, with **no per-item user confirmation**. The report asks: is this a bug or designed-but-mis-specified? In either case the mandate is: *"ninguna acción sobre inventario o cotización debe ejecutarse sin control explícito del usuario a nivel de producto. El usuario debe poder decidir por cada ítem qué destino toma: inventario, cesta de cotización o pendiente."*
2. **[ALTA — ESTRUCTURAL]** — Each product inside a request must carry its **own destination** (stock / cotización / orden directa), independent of the parent. Parent status derived from items. Model items decoupled from the parent in the DB. *"no se implementa todo de una vez, pero la arquitectura debe contemplarlo desde ahora."*

## What ALREADY exists (do not rebuild)

Discovered in the current schema + code:

- `request_items` table already exists (`supabase/migrations/001_initial_schema.sql:253`).
- Migration `004_kanban_requerimientos.sql` already added a **per-item procurement lifecycle**:
  - `request_items.status` CHECK `('sin_pedir','en_oc','parcial','recibido')`, default `sin_pedir`.
  - `request_items.quantity_received`, `request_items.quantity_ordered`.
- Parent `requests.status` (`pendiente|procesado_parcial|procesado_total|rechazado`; `005` renamed the last two display values to `en_curso`/`recibido`) is **already derived** from item states in app-layer logic: `src/lib/recalcRequestStatus.ts`.
- Per-request activity timeline already exists: `requerimiento_evento` table + RequestDetailModal.

**Conclusion:** the per-item *state* dimension is done. The missing dimension is **per-item destination**.

## The real gap

- ❌ No `request_items.destination` column anywhere (`rg "destination" supabase/migrations/` returns only an obra-address field on another table).
- ❌ No per-item destination UI. Processing is driven by `src/components/pedidos/SurtidoDialog.tsx`, which **decides destination automatically from stock availability** (`hasStock` → reserve + remito borrador; `needsRfq` → auto-create draft RFQ) behind a single "Reservar y solicitar despacho" button. This is the exact behavior INC-001 flags.

### INC-001 verdict

**Designed-but-mis-specified, not a low-level bug.** `SurtidoDialog.tsx:92-170` intentionally splits items by stock and acts on both inventory and RFQ in one mutation. The fix is to insert an explicit per-item destination decision before any side effect — not to patch a calculation.

## Overlap with in-flight work

`openspec/changes/consolidacion-requerimientos/proposal.md` plans to add `request_items.destination` itself. That column must be **owned by this change** and consolidación rebased onto it, to avoid two migrations introducing the same column with possibly different value sets.

## Affected code (current)

- `src/components/pedidos/SurtidoDialog.tsx` — auto-decision flow to be replaced by user-driven per-item destination.
- `src/components/pedidos/RequestDetailModal.tsx` (+ header) — per-item rows; surface destination.
- `src/lib/recalcRequestStatus.ts` — parent-status derivation (keep; verify still correct once destination splits processing).
- `src/integrations/supabase/types.ts` — regenerate/extend for new column.
- `src/hooks/useRequestsQuery.ts` — item fetching.

## Decisions taken in exploration

- **Merge roadmap #1 (modelo) + #2 (INC-001 control granular)** into one foundational change. They share the `destination` field and the same UI surface.
- This change is the **owner** of `request_items.destination`; `consolidacion-requerimientos` becomes a dependent.
- Keep the existing per-item status lifecycle and parent derivation as-is.
