// ---------------------------------------------------------------------------
// buildTimeSeries.ts — Pure helper for time-series aggregation of consumos
// ---------------------------------------------------------------------------

/** Input row: retiro_item joined with its retiro's fecha and estado */
export interface RetiroItemWithFecha {
  id: string;
  retiro_id: string;
  material_id: string;
  descripcion: string;
  cantidad: number;
  subtotal: number;
  fecha_retiro: string; // ISO YYYY-MM-DD from parent retiro
  estado: string;       // 'activo' | 'anulado' from parent retiro
}

/** Output point — long form; pivot to wide in the component for Recharts */
export interface TimeSeriesPoint {
  period: string;        // 'YYYY-MM'
  material_codigo: string; // material_id used as series key
  descripcion: string;
  total: number;
}

export interface TimeSeriesOptions {
  metric: 'cantidad' | 'monto';
  period: 'month';
  range?: { desde?: string; hasta?: string };
}

/**
 * Aggregates retiro items into a time series grouped by (YYYY-MM, material_id).
 *
 * Rules:
 * - Items with estado === 'anulado' are ALWAYS excluded.
 * - metric 'cantidad' sums item.cantidad; 'monto' sums item.subtotal.
 * - period 'month' groups by the YYYY-MM of fecha_retiro.
 * - range filter (desde/hasta) is applied to fecha_retiro before aggregation.
 * - Returns [] when no items remain after filtering.
 */
export function buildTimeSeries(
  items: RetiroItemWithFecha[],
  opts: TimeSeriesOptions
): TimeSeriesPoint[] {
  const { metric, range } = opts;

  // Filter: exclude anulados and apply date range
  const filtered = items.filter((item) => {
    if (item.estado === 'anulado') return false;
    if (range?.desde && item.fecha_retiro < range.desde) return false;
    if (range?.hasta && item.fecha_retiro > range.hasta) return false;
    return true;
  });

  if (filtered.length === 0) return [];

  // Aggregate: key = 'YYYY-MM|material_id'
  const totals = new Map<string, { period: string; material_codigo: string; descripcion: string; total: number }>();

  for (const item of filtered) {
    const period = item.fecha_retiro.slice(0, 7); // 'YYYY-MM'
    const key = `${period}|${item.material_id}`;
    const value = metric === 'cantidad' ? item.cantidad : item.subtotal;

    const existing = totals.get(key);
    if (existing) {
      existing.total += value;
    } else {
      totals.set(key, {
        period,
        material_codigo: item.material_id,
        descripcion: item.descripcion,
        total: value,
      });
    }
  }

  return Array.from(totals.values());
}
