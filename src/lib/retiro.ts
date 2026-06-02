import type { PrecioProveedorRow } from './precio-vigencia';
import { resolvePrecioVigente } from './precio-vigencia';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single line in the retiro form */
export interface RetiroFormRow {
  material_id: string;
  cantidad: number;
}

/** Shape of each element in the p_items JSONB array for registrar_retiro RPC */
export interface RetiroItemPayload {
  material_id: string;
  cantidad: number;
}

/** Per-item preview result */
export interface RetiroItemPreview {
  material_id: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  /** false when no vigente price was found for this item + fecha */
  hasPrice: boolean;
}

/** Full preview result for a retiro */
export interface RetiroPreview {
  items: RetiroItemPreview[];
  total: number;
  /** List of material_ids that lack a vigente price */
  missingPrices: string[];
}

/** Validation input */
export interface ValidateRetiroInput {
  projectId: string;
  architectId: string;
  fechaRetiro: string;
  items: RetiroFormRow[];
  missingPrices: string[];
}

// ---------------------------------------------------------------------------
// buildRetiroItems
// ---------------------------------------------------------------------------

/**
 * Converts form rows into the JSONB payload expected by the
 * `registrar_retiro` RPC's `p_items` parameter.
 */
export function buildRetiroItems(rows: RetiroFormRow[]): RetiroItemPayload[] {
  return rows.map((row) => ({
    material_id: row.material_id,
    cantidad: row.cantidad,
  }));
}

// ---------------------------------------------------------------------------
// previewRetiroTotal
// ---------------------------------------------------------------------------

/**
 * Computes live subtotals for the retiro form using the same price resolution
 * logic as the `registrar_retiro` RPC (`resolvePrecioVigente`).
 *
 * Items without a vigente price are flagged with `hasPrice: false` and
 * contribute 0 to the total. The list of their `material_id`s is in
 * `missingPrices`.
 *
 * @param rows            Form rows (material + cantidad).
 * @param precios         All precio_proveedor rows for this provider (any material).
 * @param fecha           ISO date string (fecha_retiro).
 * @param companyId       Optional buyer company scope — mirrors the RPC filter.
 */
export function previewRetiroTotal(
  rows: RetiroFormRow[],
  precios: PrecioProveedorRow[],
  fecha: string,
  companyId?: string | null
): RetiroPreview {
  const items: RetiroItemPreview[] = [];
  const missingPrices: string[] = [];
  let total = 0;

  for (const row of rows) {
    // Filter to only rows for this material.
    const preciosForMaterial = precios.filter((p) => p.material_id === row.material_id);
    const resolved = resolvePrecioVigente(preciosForMaterial, fecha, companyId);

    if (resolved === null) {
      missingPrices.push(row.material_id);
      items.push({
        material_id: row.material_id,
        cantidad: row.cantidad,
        precioUnitario: 0,
        subtotal: 0,
        hasPrice: false,
      });
    } else {
      const subtotal = row.cantidad * resolved.precio_unitario;
      total += subtotal;
      items.push({
        material_id: row.material_id,
        cantidad: row.cantidad,
        precioUnitario: resolved.precio_unitario,
        subtotal,
        hasPrice: true,
      });
    }
  }

  return { items, total, missingPrices };
}

// ---------------------------------------------------------------------------
// validateRetiro
// ---------------------------------------------------------------------------

/**
 * Returns an array of human-readable Spanish error messages.
 * An empty array means the retiro is valid.
 */
export function validateRetiro(input: ValidateRetiroInput): string[] {
  const errors: string[] = [];
  const today = new Date().toISOString().split('T')[0];

  if (!input.projectId) {
    errors.push('Seleccioná una obra.');
  }
  if (!input.architectId) {
    errors.push('Seleccioná un arquitecto.');
  }
  if (!input.fechaRetiro || input.fechaRetiro > today) {
    errors.push('La fecha de retiro no puede ser futura.');
  }
  if (input.items.length === 0) {
    errors.push('Agregá al menos un ítem al retiro.');
  }
  if (input.missingPrices.length > 0) {
    errors.push('Hay ítems sin precio vigente. Actualizá la lista de precios antes de confirmar.');
  }

  return errors;
}
