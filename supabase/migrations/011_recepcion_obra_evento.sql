-- Add 'recepcion_obra' event type for architect material reception confirmation
ALTER TABLE requerimiento_evento
  DROP CONSTRAINT chk_evento_tipo;

ALTER TABLE requerimiento_evento
  ADD CONSTRAINT chk_evento_tipo CHECK (
    tipo IN (
      'creado', 'pendiente', 'procesado_parcial', 'procesado_total',
      'rechazado', 'item_actualizado', 'nota', 'recepcion_obra'
    )
  );
