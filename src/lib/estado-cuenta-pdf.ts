// ---------------------------------------------------------------------------
// estado-cuenta-pdf.ts — Shared PDF generator for estado de cuenta
// Extracted from MiCuentaCorriente.tsx — preserves byte-for-byte layout.
// ---------------------------------------------------------------------------

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { MovimientoRow } from '@/lib/cuenta-corriente';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return value.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EstadoCuentaPDFParams {
  providerName: string;
  /** Pre-filtered and ordered movements to include in the table */
  movimientos: MovimientoRow[];
  saldo: number;
  periodo?: { desde?: string; hasta?: string };
  /** Optional logo data URL — declared but not used in this implementation
   *  (preserves byte-for-byte regression with MiCuentaCorriente). Fase 2 may wire it. */
  logoDataUrl?: string;
}

// ---------------------------------------------------------------------------
// generateEstadoCuentaPDF
// ---------------------------------------------------------------------------

/**
 * Generates and triggers download of a jsPDF estado de cuenta document.
 *
 * Layout is identical to the inline downloadPDF() that was in MiCuentaCorriente:
 * same coordinates, headStyles fillColor [30,41,59], columnStyles, filename format.
 */
export function generateEstadoCuentaPDF(params: EstadoCuentaPDFParams): void {
  const { providerName, movimientos, saldo, periodo } = params;

  const doc = new jsPDF();

  // Header
  doc.setFontSize(16);
  doc.text('Estado de Cuenta', 14, 18);
  doc.setFontSize(11);
  doc.text(`Proveedor: ${providerName}`, 14, 27);
  doc.text(`Saldo neto: ${formatCurrency(saldo)}`, 14, 34);
  if (periodo?.desde || periodo?.hasta) {
    const period = `Período: ${periodo?.desde || '—'} al ${periodo?.hasta || '—'}`;
    doc.text(period, 14, 41);
  }

  // Table rows
  const tableRows = movimientos.map((mov) => [
    mov.fecha,
    mov.tipo === 'debito' ? 'Débito' : 'Crédito',
    mov.concepto ?? '',
    mov.medio_pago ?? '',
    mov.referencia ?? '',
    mov.tipo === 'debito'
      ? `+${formatCurrency(mov.monto)}`
      : `-${formatCurrency(mov.monto)}`,
  ]);

  autoTable(doc, {
    startY: periodo?.desde || periodo?.hasta ? 48 : 42,
    head: [['Fecha', 'Tipo', 'Concepto', 'Medio de pago', 'Referencia', 'Monto']],
    body: tableRows,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 18 },
      5: { halign: 'right', cellWidth: 30 },
    },
  });

  const filename = `cuenta-corriente-${(providerName)
    .replace(/\s+/g, '-')
    .toLowerCase()}.pdf`;
  doc.save(filename);
}
