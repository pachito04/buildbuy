// ---------------------------------------------------------------------------
// plantilla-precios.ts — Downloadable Excel template for price import
// ---------------------------------------------------------------------------

import * as XLSX from 'xlsx';
import type { WorkBook } from 'xlsx';

// Exact headers in order — must match PreciosUploader column aliases and spec
const TEMPLATE_HEADERS = [
  'Código Material',
  'Descripción propia',
  'Unidad de Medida',
  'Precio Unitario',
  'Vigencia desde',
] as const;

/**
 * Builds a SheetJS WorkBook with one worksheet containing exactly the
 * 5 required header columns and no data rows.
 */
export function buildPlantillaPreciosWorkbook(): WorkBook {
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Precios');
  return wb;
}

/**
 * Builds the template workbook and triggers a client-side download
 * with the deterministic filename 'plantilla-precios.xlsx'.
 */
export function downloadPlantillaPrecios(): void {
  const wb = buildPlantillaPreciosWorkbook();
  XLSX.writeFile(wb, 'plantilla-precios.xlsx');
}
