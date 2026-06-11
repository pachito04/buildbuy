// ---------------------------------------------------------------------------
// filterRetiros.ts — Pure helper for filtering retiro rows
// ---------------------------------------------------------------------------

/** Minimal retiro shape needed for filtering */
export interface RetiroRow {
  id: string;
  project_id: string;
  provider_id: string;
  /** FK to architects.id — use this for architect filter (NOT created_by) */
  architect_id: string;
  /** FK to materials.id — use this for material filter (NOT material_codigo) */
  material_id: string;
  fecha_retiro: string;
  estado: string; // 'activo' | 'anulado'
}

export interface RetiroFilters {
  obra?: string;
  proveedor?: string;
  material?: string;
  desde?: string;
  hasta?: string;
  arquitecto?: string;
}

/**
 * Pure filter function for retiro rows.
 *
 * Rules:
 * - Rows with estado === 'anulado' are ALWAYS excluded regardless of other filters.
 * - All active filters are combined as AND.
 * - Empty filter object returns all non-anulados.
 * - architect filter uses architect_id (NOT created_by).
 * - material filter uses material_id (NOT material_codigo).
 */
export function filterRetiros(rows: RetiroRow[], filters: RetiroFilters): RetiroRow[] {
  const { obra, proveedor, material, desde, hasta, arquitecto } = filters;

  return rows.filter((row) => {
    // Always exclude anulados
    if (row.estado === 'anulado') return false;

    // obra / project_id
    if (obra && row.project_id !== obra) return false;

    // proveedor / provider_id
    if (proveedor && row.provider_id !== proveedor) return false;

    // material / material_id
    if (material && row.material_id !== material) return false;

    // architect_id (design deviation from spec text which says created_by)
    if (arquitecto && row.architect_id !== arquitecto) return false;

    // date range — inclusive on both ends
    if (desde && row.fecha_retiro < desde) return false;
    if (hasta && row.fecha_retiro > hasta) return false;

    return true;
  });
}
