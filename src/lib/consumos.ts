// ---------------------------------------------------------------------------
// consumos.ts — Pure aggregation logic for Reporte de Consumos (REQ-04)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal retiro shape needed for aggregation */
export interface RetiroForConsumo {
  id: string;
  project_id: string;
  provider_id: string;
  architect_id: string;
  fecha_retiro: string;
  estado: string; // 'activo' | 'anulado'
  company_id: string;
}

/** Minimal retiro_item shape needed for aggregation */
export interface RetiroItemForConsumo {
  id: string;
  retiro_id: string;
  material_id: string;
  cantidad: number;
  precio_unitario_aplicado: number;
  subtotal: number;
}

/** Options for filtering aggregation */
export interface AggregateConsumoOptions {
  projectId?: string;
  providerId?: string;
  /** ISO date string — inclusive lower bound on fecha_retiro */
  desde?: string;
  /** ISO date string — inclusive upper bound on fecha_retiro */
  hasta?: string;
}

/** A single denormalized row in the aggregated result */
export interface AggregatedConsumos {
  retiro_id: string;
  project_id: string;
  provider_id: string;
  architect_id: string;
  material_id: string;
  cantidad: number;
  precio_unitario_aplicado: number;
  subtotal: number;
  /** 'activo' or 'anulado'. Anulado rows are included for audit display
   *  but excluded from totals in rankObrasByConsumo. */
  estado: string;
  fecha_retiro: string;
}

/** Result of rankObrasByConsumo */
export interface ObraConsumoSummary {
  project_id: string;
  /** Sum of activo subtotals only */
  total: number;
}

/** Input for providersOverLimit */
export interface ProviderSaldo {
  provider_id: string;
  saldo: number;
}

// ---------------------------------------------------------------------------
// aggregateConsumos
// ---------------------------------------------------------------------------

/**
 * Joins retiro_items to their retiro, applies optional filters, and returns a
 * flat list of denormalized rows.
 *
 * - Items whose retiro is not found are silently dropped.
 * - Anulado retiro rows ARE included in the result (for audit display) but
 *   their estado is set to 'anulado' so callers can exclude them from totals.
 * - Filters (projectId, providerId, desde, hasta) are applied to the retiro,
 *   NOT to the item. This matches the real query pattern where the user filters
 *   the retiro dimension.
 */
export function aggregateConsumos(
  items: RetiroItemForConsumo[],
  retiros: RetiroForConsumo[],
  options: AggregateConsumoOptions
): AggregatedConsumos[] {
  const { projectId, providerId, desde, hasta } = options;

  // Build a fast lookup map: retiro_id → retiro
  const retiroMap = new Map<string, RetiroForConsumo>();
  for (const retiro of retiros) {
    // Apply retiro-level filters
    if (projectId && retiro.project_id !== projectId) continue;
    if (providerId && retiro.provider_id !== providerId) continue;
    if (desde && retiro.fecha_retiro < desde) continue;
    if (hasta && retiro.fecha_retiro > hasta) continue;
    retiroMap.set(retiro.id, retiro);
  }

  const result: AggregatedConsumos[] = [];

  for (const item of items) {
    const retiro = retiroMap.get(item.retiro_id);
    if (!retiro) continue; // orphan or filtered out

    result.push({
      retiro_id: retiro.id,
      project_id: retiro.project_id,
      provider_id: retiro.provider_id,
      architect_id: retiro.architect_id,
      material_id: item.material_id,
      cantidad: item.cantidad,
      precio_unitario_aplicado: item.precio_unitario_aplicado,
      subtotal: item.subtotal,
      estado: retiro.estado,
      fecha_retiro: retiro.fecha_retiro,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// rankObrasByConsumo
// ---------------------------------------------------------------------------

/**
 * Groups aggregated rows by project_id and sums only the ACTIVO subtotals.
 * Returns obras sorted descending by total (obras con mayor consumo first).
 */
export function rankObrasByConsumo(rows: AggregatedConsumos[]): ObraConsumoSummary[] {
  const totals = new Map<string, number>();

  for (const row of rows) {
    const current = totals.get(row.project_id) ?? 0;
    // Anulado rows are included in `rows` for display but excluded from totals
    if (row.estado === 'activo') {
      totals.set(row.project_id, current + row.subtotal);
    } else {
      // Ensure the obra key exists even if it only has anulado rows
      if (!totals.has(row.project_id)) {
        totals.set(row.project_id, 0);
      }
    }
  }

  return Array.from(totals.entries())
    .map(([project_id, total]) => ({ project_id, total }))
    .sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------------------
// providersOverLimit
// ---------------------------------------------------------------------------

/**
 * Returns only the providers whose saldo is STRICTLY GREATER than limite.
 *
 * @param saldosByProvider  List of { provider_id, saldo } records.
 * @param limite            Configured limit. null means no limit → always returns [].
 */
export function providersOverLimit(
  saldosByProvider: ProviderSaldo[],
  limite: number | null
): ProviderSaldo[] {
  if (limite === null) return [];
  return saldosByProvider.filter((p) => p.saldo > limite);
}
