import type { Database } from '@/integrations/supabase/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PrecioProveedorRow =
  Database['public']['Tables']['precio_proveedor']['Row'];

// ---------------------------------------------------------------------------
// isVigente — half-open window: [vigencia_desde, vigencia_hasta)
// ---------------------------------------------------------------------------

/**
 * Returns true when `precio` is active at `fecha` (ISO date string YYYY-MM-DD).
 * Window is half-open: desde is inclusive, hasta is exclusive (null = +infinity).
 */
export function isVigente(precio: PrecioProveedorRow, fecha: string): boolean {
  if (fecha < precio.vigencia_desde) return false;
  if (precio.vigencia_hasta !== null && fecha >= precio.vigencia_hasta) return false;
  return true;
}

// ---------------------------------------------------------------------------
// resolvePrecioVigente — mirrors the DB resolution logic for the UI
// ---------------------------------------------------------------------------

/**
 * Returns the best `PrecioProveedorRow` active at `fecha`, or null if none.
 *
 * Selection priority (highest wins):
 *   1. Company override (company_id != null) over global (company_id === null).
 *   2. Latest vigencia_desde.
 *   3. Latest created_at.
 *
 * @param precios   — all rows for a single (provider_id, material_id) combination.
 * @param fecha     — ISO date string (YYYY-MM-DD).
 * @param companyId — optional buyer company scope (mirrors DB RPC filter).
 *   When provided (non-null string), only rows where
 *   `company_id === companyId` (override) or `company_id === null` (global)
 *   are considered. Rows for OTHER companies are excluded.
 *   When omitted or null, all vigent rows are considered (back-compat).
 */
export function resolvePrecioVigente(
  precios: PrecioProveedorRow[],
  fecha: string,
  companyId?: string | null
): PrecioProveedorRow | null {
  const vigentes = precios.filter((p) => isVigente(p, fecha));
  if (vigentes.length === 0) return null;

  // When companyId is a non-null string, narrow to rows for this company or global.
  const scoped =
    companyId != null
      ? vigentes.filter((p) => p.company_id === companyId || p.company_id === null)
      : vigentes;

  if (scoped.length === 0) return null;

  // Prefer company overrides (company_id != null) over global (company_id === null).
  const overrides = scoped.filter((p) => p.company_id !== null);
  const candidates = overrides.length > 0 ? overrides : scoped;

  // Tiebreak: latest vigencia_desde, then latest created_at.
  return candidates.reduce((best, current) => {
    if (current.vigencia_desde > best.vigencia_desde) return current;
    if (current.vigencia_desde === best.vigencia_desde) {
      return current.created_at > best.created_at ? current : best;
    }
    return best;
  });
}

// ---------------------------------------------------------------------------
// hasVigenciaOverlap — client-side guard before insert (mirrors DB constraint)
// ---------------------------------------------------------------------------

/**
 * Returns true when `nuevo` would overlap with any row in `existing` that shares
 * the same (provider_id, material_id, company_id) scope.
 *
 * Overlap detection uses a half-open interval model: [desde, hasta).
 * null vigencia_hasta is treated as +infinity.
 *
 * Two intervals [a, b) and [c, d) overlap iff a < d && c < b
 * (where null means +infinity).
 */
export function hasVigenciaOverlap(
  existing: PrecioProveedorRow[],
  nuevo: Pick<
    PrecioProveedorRow,
    'provider_id' | 'material_id' | 'company_id' | 'vigencia_desde' | 'vigencia_hasta'
  >
): boolean {
  // +infinity sentinel: a date far in the future for comparison purposes.
  const INF = '9999-12-31';

  const nuevoDesde = nuevo.vigencia_desde;
  const nuevoHasta = nuevo.vigencia_hasta ?? INF;

  return existing.some((row) => {
    // Same scope: provider, material, and company_id must match.
    if (row.provider_id !== nuevo.provider_id) return false;
    if (row.material_id !== nuevo.material_id) return false;
    // null !== 'comp-1' → different scopes; both null → same global scope.
    if (row.company_id !== nuevo.company_id) return false;

    const rowDesde = row.vigencia_desde;
    const rowHasta = row.vigencia_hasta ?? INF;

    // Intervals [nuevoDesde, nuevoHasta) and [rowDesde, rowHasta) overlap iff:
    // nuevoDesde < rowHasta  AND  rowDesde < nuevoHasta
    return nuevoDesde < rowHasta && rowDesde < nuevoHasta;
  });
}
