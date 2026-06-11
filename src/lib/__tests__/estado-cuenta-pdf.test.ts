import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock jsPDF + autotable BEFORE importing the module under test.
// Use vi.hoisted so variables are available when vi.mock factory runs.
// ---------------------------------------------------------------------------

const { mockDoc, MockJsPDF, mockAutoTable } = vi.hoisted(() => {
  const mockDoc = {
    setFontSize: vi.fn(),
    text: vi.fn(),
    save: vi.fn(),
  };
  const MockJsPDF = vi.fn(() => mockDoc);
  const mockAutoTable = vi.fn();
  return { mockDoc, MockJsPDF, mockAutoTable };
});

vi.mock('jspdf', () => ({
  default: MockJsPDF,
}));

vi.mock('jspdf-autotable', () => ({
  default: mockAutoTable,
}));

// Import AFTER mocks are set up
import { generateEstadoCuentaPDF } from '../estado-cuenta-pdf';
import type { MovimientoRow } from '../cuenta-corriente';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMovimiento(
  overrides: Partial<MovimientoRow> & { tipo: 'debito' | 'credito'; monto: number }
): MovimientoRow {
  return {
    id: overrides.id ?? 'mov-1',
    company_id: 'comp-1',
    provider_id: 'prov-1',
    tipo: overrides.tipo,
    retiro_id: null,
    monto: overrides.monto,
    fecha: overrides.fecha ?? '2024-06-01',
    concepto: overrides.concepto ?? null,
    medio_pago: overrides.medio_pago ?? null,
    referencia: overrides.referencia ?? null,
    created_by: null,
    created_at: '2024-06-01T00:00:00Z',
    project_id: null,
  };
}

const testMovimientos = [
  makeMovimiento({ id: 'm1', tipo: 'debito', monto: 1000, fecha: '2024-06-01', concepto: 'Retiro 1' }),
  makeMovimiento({ id: 'm2', tipo: 'credito', monto: 500, fecha: '2024-06-15', concepto: 'Pago parcial' }),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateEstadoCuentaPDF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls doc.save with filename based on providerName slug', () => {
    generateEstadoCuentaPDF({
      providerName: 'Mi Proveedor SA',
      movimientos: testMovimientos,
      saldo: 500,
    });

    expect(mockDoc.save).toHaveBeenCalledOnce();
    const filename = mockDoc.save.mock.calls[0][0] as string;
    expect(filename).toBe('cuenta-corriente-mi-proveedor-sa.pdf');
  });

  it('calls autoTable with movimiento rows in the body', () => {
    generateEstadoCuentaPDF({
      providerName: 'Test',
      movimientos: testMovimientos,
      saldo: 500,
    });

    expect(mockAutoTable).toHaveBeenCalledOnce();
    const autoTableArgs = mockAutoTable.mock.calls[0][1] as { body: string[][]; head: string[][] };
    expect(autoTableArgs.body).toHaveLength(testMovimientos.length);
    // First row is the debito
    expect(autoTableArgs.body[0][0]).toBe('2024-06-01');
    expect(autoTableArgs.body[0][1]).toBe('Débito');
  });

  it('writes providerName and saldo into doc.text', () => {
    generateEstadoCuentaPDF({
      providerName: 'Acme Corp',
      movimientos: testMovimientos,
      saldo: 1500,
    });

    const textCalls = mockDoc.text.mock.calls.map((c) => c[0] as string);
    expect(textCalls.some((t) => t.includes('Acme Corp'))).toBe(true);
    expect(textCalls.some((t) => t.includes('1.500'))).toBe(true); // es-AR format
  });

  it('does not throw when logoDataUrl is undefined', () => {
    expect(() =>
      generateEstadoCuentaPDF({
        providerName: 'No Logo',
        movimientos: testMovimientos,
        saldo: 0,
        logoDataUrl: undefined,
      })
    ).not.toThrow();
  });

  it('includes period text when periodo.desde is provided', () => {
    generateEstadoCuentaPDF({
      providerName: 'Test',
      movimientos: testMovimientos,
      saldo: 0,
      periodo: { desde: '2024-06-01', hasta: '2024-06-30' },
    });

    const textCalls = mockDoc.text.mock.calls.map((c) => c[0] as string);
    expect(textCalls.some((t) => t.includes('2024-06-01'))).toBe(true);
  });

  it('filename uses replace(/\\s+/g, \'-\').toLowerCase() pattern', () => {
    generateEstadoCuentaPDF({
      providerName: 'Proveedor  Con  Espacios',
      movimientos: [],
      saldo: 0,
    });

    const filename = mockDoc.save.mock.calls[0][0] as string;
    expect(filename).toBe('cuenta-corriente-proveedor-con-espacios.pdf');
  });
});
