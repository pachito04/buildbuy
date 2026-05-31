import { describe, it, expect } from 'vitest';
import {
  MOVIMIENTO_TIPO_LABELS,
  movimientoOrigenRequerimiento,
  routingToDestino,
} from '../movimiento-utils';

// ---------------------------------------------------------------------------
// MOVIMIENTO_TIPO_LABELS
// ---------------------------------------------------------------------------

describe('MOVIMIENTO_TIPO_LABELS', () => {
  it('has a label for destino_asignado', () => {
    expect(MOVIMIENTO_TIPO_LABELS['destino_asignado']).toBeDefined();
    expect(typeof MOVIMIENTO_TIPO_LABELS['destino_asignado']).toBe('string');
    expect(MOVIMIENTO_TIPO_LABELS['destino_asignado'].length).toBeGreaterThan(0);
  });

  it('has a label for oc_emitida', () => {
    expect(MOVIMIENTO_TIPO_LABELS['oc_emitida']).toBeDefined();
    expect(typeof MOVIMIENTO_TIPO_LABELS['oc_emitida']).toBe('string');
    expect(MOVIMIENTO_TIPO_LABELS['oc_emitida'].length).toBeGreaterThan(0);
  });

  it('has a label for recepcion', () => {
    expect(MOVIMIENTO_TIPO_LABELS['recepcion']).toBeDefined();
    expect(typeof MOVIMIENTO_TIPO_LABELS['recepcion']).toBe('string');
    expect(MOVIMIENTO_TIPO_LABELS['recepcion'].length).toBeGreaterThan(0);
  });

  it('covers exactly the 3 Option-A tipos', () => {
    const keys = Object.keys(MOVIMIENTO_TIPO_LABELS);
    expect(keys).toContain('destino_asignado');
    expect(keys).toContain('oc_emitida');
    expect(keys).toContain('recepcion');
    expect(keys).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// movimientoOrigenRequerimiento
// ---------------------------------------------------------------------------

describe('movimientoOrigenRequerimiento', () => {
  it('returns Requerimiento #N for a positive integer', () => {
    expect(movimientoOrigenRequerimiento(1)).toBe('Requerimiento #1');
    expect(movimientoOrigenRequerimiento(42)).toBe('Requerimiento #42');
    expect(movimientoOrigenRequerimiento(1000)).toBe('Requerimiento #1000');
  });

  it('returns empty string for null', () => {
    expect(movimientoOrigenRequerimiento(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(movimientoOrigenRequerimiento(undefined)).toBe('');
  });

  it('returns Requerimiento #0 for zero (edge case)', () => {
    expect(movimientoOrigenRequerimiento(0)).toBe('Requerimiento #0');
  });
});

// ---------------------------------------------------------------------------
// routingToDestino
// ---------------------------------------------------------------------------

describe('routingToDestino', () => {
  it('maps inventario to Inventario', () => {
    expect(routingToDestino('inventario')).toBe('Inventario');
  });

  it('maps cotizacion to Cotización', () => {
    expect(routingToDestino('cotizacion')).toBe('Cotización');
  });

  it('maps orden_directa to Orden directa', () => {
    expect(routingToDestino('orden_directa')).toBe('Orden directa');
  });

  it('maps pendiente to Sin asignar', () => {
    expect(routingToDestino('pendiente')).toBe('Sin asignar');
  });

  it('passes through unknown routing values unchanged', () => {
    expect(routingToDestino('obra')).toBe('obra');
    expect(routingToDestino('unknown_value')).toBe('unknown_value');
    expect(routingToDestino('')).toBe('');
  });
});
