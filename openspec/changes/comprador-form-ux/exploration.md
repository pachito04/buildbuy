# Exploration: Comprador Form UX

Source: `Reporte 1805.docx` — "REPORTES DEL PERFIL COMPRADOR" items 1–6 (B1–B6).

## Report items in scope

- **B1 (🔴 CRÍTICO)** — Draft state is lost on leaving the screen. *Affects BOTH the RFQ creation form AND the provider quote form.* Wants: persisted draft (localStorage/global), autosave with debounce, restore + notice on return, clear only on successful submit or manual discard.
- **B2 (🔴 CRÍTICO)** — Solicitud number correlative/backend-generated. **Already done** (`request_number` is server-generated; frontend never sets it). Out of scope.
- **B3 (ALTA)** — New solicitud form reorganized into two collapsible sections: Section 1 *Detalle* (Tipo de solicitud · Fecha de cierre · Descripción · Categoría · Entregar en · Condición de precios · Condición de pago) then Section 2 *Productos* (cantidad, unidad, descripción, observaciones por producto). Section 1 expanded by default; Section 2 enabled once header complete.
- **B4 (ALTA)** — Cart: a single "Generar todas las órdenes de compra" batch button (OCs may stay individual per provider in the backend).
- **B5 (MEJORA UX)** — Same form as B3: accordion sections with completion-state icons + validation before advancing.
- **B6 (MEJORA)** — "Observaciones" at solicitud header level (exists) AND per product (missing on RFQ items).

## Current state (evidence)

- **RFQ creation form** = `src/components/rfqs/RfqNuevo.tsx`. Single flat `<form>` in a `<Card>`. State is local `useState` (`:35-42`) → lost on unmount (`resetForm` `:144-153`). Current fields: Materiales, Tipo, Cierre/Entrega, Lugar, Observaciones (header), Proveedores, Adjuntos. **No accordion** (`accordion.tsx` exists in `ui/` but unused here). No per-item observations input (`:207-243`).
- **Persistence pattern available**: `src/contexts/BasketContext.tsx` already persists to `localStorage` (`STORAGE_KEY`, load on init, `useEffect` sync) — the clean template to generalize into a reusable draft-persistence hook.
- **Provider quote form** = `src/pages/Cotizaciones.tsx` quote dialog (`:628-723`). State local → lost on close (B1 other side). **This same form is also the home of P1/P2/P3** (`#6 proveedor-fixes`): the "Total" sums `unit_price` WITHOUT × quantity (`:705`), no per-line subtotal, no per-line observations, basic submit validation only.
- **Cart** = `Cotizaciones.tsx` carrito tab (`:778-869`). `generateOC.mutate({ providerId, ... })` per provider group (`:859`). No batch button.

## DB gaps found

- `rfqs` columns: `closing_datetime, deadline, delivery_location, observations, payment_terms, status, ...`. **Missing for B3 Section 1**: `categoria`, condición de precios (`price_terms`), `descripcion`. `payment_terms` EXISTS but is not surfaced in `RfqNuevo`. (`rfq_type` is used via `as any` and is not even in the hand-maintained `types.ts` — types file is incomplete.)
- `rfq_items`: has `description, material_id, quantity, unit` — **no `observations`** → B6 needs a migration. (Note: `quote_items.observations` DOES exist — that's the provider side, P3/#6.)

## Decisions taken in exploration

- **Re-scope B1b (provider quote form persistence) OUT of this change and INTO `#6 proveedor-fixes`.** That form is also where P1/P2/P3 live; touching one form in two separate changes is wasteful and risky. So `#6` owns the entire provider quote form (B1b + P1 + P2 + P3); this change (`#4`) owns the COMPRAS/buyer side.
- **`#4` scope** = RfqNuevo creation form (B1a draft persistence + B3/B5 accordions + B6 per-item obs) **and** the cart batch button (B4).
- B3 requires a migration (new `rfqs` columns + `rfq_items.observations`). The exact semantics of "Categoría" and "Condición de precios" are a product call → flagged for confirmation in the proposal.

## Open question for the user

B3 lists Section-1 fields not currently modeled (`Categoría`, `Condición de precios`, `Descripción`). Add them as real fields/columns now, or only reorder the existing fields and defer the new ones?
