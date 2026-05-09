-- Rename request statuses to match the brief:
--   procesado_parcial → en_curso
--   procesado_total   → recibido
-- PostgreSQL 10+ supports ALTER TYPE ... RENAME VALUE.

ALTER TYPE request_status RENAME VALUE 'procesado_parcial' TO 'en_curso';
ALTER TYPE request_status RENAME VALUE 'procesado_total' TO 'recibido';
