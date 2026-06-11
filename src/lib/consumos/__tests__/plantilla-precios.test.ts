import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';

// ---------------------------------------------------------------------------
// Spy on XLSX.writeFile to capture filename without actually writing
// ---------------------------------------------------------------------------

const { mockWriteFile } = vi.hoisted(() => {
  const mockWriteFile = vi.fn();
  return { mockWriteFile };
});

vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('xlsx')>();
  return {
    ...actual,
    writeFile: mockWriteFile,
  };
});

import { buildPlantillaPreciosWorkbook, downloadPlantillaPrecios } from '../plantilla-precios';

// ---------------------------------------------------------------------------
// Expected headers (design spec — exact order, exact strings)
// ---------------------------------------------------------------------------

const EXPECTED_HEADERS = [
  'Código Material',
  'Descripción propia',
  'Unidad de Medida',
  'Precio Unitario',
  'Vigencia desde',
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildPlantillaPreciosWorkbook', () => {
  it('returns a WorkBook with exactly 1 sheet name', () => {
    const wb = buildPlantillaPreciosWorkbook();
    expect(wb.SheetNames).toHaveLength(1);
  });

  it('first sheet has exactly 5 header values in the correct order', () => {
    const wb = buildPlantillaPreciosWorkbook();
    const sheetName = wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1 });
    expect(rows).toHaveLength(1); // header row only
    expect(rows[0]).toEqual(EXPECTED_HEADERS);
  });

  it('sheet has exactly 1 row (header only — no data rows)', () => {
    const wb = buildPlantillaPreciosWorkbook();
    const sheetName = wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1 });
    expect(rows).toHaveLength(1);
  });

  it('second call returns a fresh workbook (no shared state)', () => {
    const wb1 = buildPlantillaPreciosWorkbook();
    const wb2 = buildPlantillaPreciosWorkbook();
    expect(wb1).not.toBe(wb2);
  });
});

describe('downloadPlantillaPrecios', () => {
  beforeEach(() => {
    mockWriteFile.mockClear();
  });

  it('calls XLSX.writeFile with filename "plantilla-precios.xlsx"', () => {
    downloadPlantillaPrecios();
    expect(mockWriteFile).toHaveBeenCalledOnce();
    const filename = mockWriteFile.mock.calls[0][1] as string;
    expect(filename).toBe('plantilla-precios.xlsx');
  });

  it('passes a WorkBook (not null/undefined) as first arg to writeFile', () => {
    downloadPlantillaPrecios();
    const wb = mockWriteFile.mock.calls[0][0];
    expect(wb).toBeDefined();
    expect(wb).not.toBeNull();
    expect(typeof wb).toBe('object');
    expect(Array.isArray((wb as { SheetNames: string[] }).SheetNames)).toBe(true);
  });
});
