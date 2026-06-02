import type { Database } from '@/integrations/supabase/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MovimientoRow = Database['public']['Tables']['movimiento_cuenta_corriente']['Row'] & {
  /** Optional project linkage — present when joined via retiro */
  project_id?: string | null;
};

export interface FilterMovimientosOptions {
  tipo?: 'debito' | 'credito';
  /** ISO date string — inclusive lower bound */
  desde?: string;
  /** ISO date string — inclusive upper bound */
  hasta?: string;
  projectId?: string;
}

// ---------------------------------------------------------------------------
// computeSaldo
// ---------------------------------------------------------------------------

/**
 * Computes the net balance from a list of movements.
 * saldo = SUM(debito) - SUM(credito)
 * A positive saldo means the provider owes money (has outstanding charges).
 * A negative saldo means the provider is in credit (has been overpaid).
 */
export function computeSaldo(movimientos: MovimientoRow[]): number {
  return movimientos.reduce((acc, mov) => {
    if (mov.tipo === 'debito') return acc + mov.monto;
    if (mov.tipo === 'credito') return acc - mov.monto;
    return acc;
  }, 0);
}

// ---------------------------------------------------------------------------
// filterMovimientos
// ---------------------------------------------------------------------------

/**
 * Filters a list of movements by type, date range, and/or project.
 * All filters are AND-combined.
 */
export function filterMovimientos(
  movimientos: MovimientoRow[],
  options: FilterMovimientosOptions
): MovimientoRow[] {
  const { tipo, desde, hasta, projectId } = options;

  return movimientos.filter((mov) => {
    if (tipo && mov.tipo !== tipo) return false;
    if (desde && mov.fecha < desde) return false;
    if (hasta && mov.fecha > hasta) return false;
    if (projectId && mov.project_id !== projectId) return false;
    return true;
  });
}
