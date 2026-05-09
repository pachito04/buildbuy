-- ============================================================
-- 006: Cómputo de Obra + Dashboard de Avance
-- ============================================================

-- 1. Enable pg_trgm for material matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Tabla computo (por obra, versionable)
CREATE TABLE computo (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id),
  version         INT NOT NULL DEFAULT 1,
  archivo_origen  TEXT,
  archivo_url     TEXT,
  total_estimado  NUMERIC(14,2) NOT NULL DEFAULT 0,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES auth.users(id),
  UNIQUE (project_id, version)
);

-- 3. Tabla computo_item (líneas del cómputo)
CREATE TABLE computo_item (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  computo_id                UUID NOT NULL REFERENCES computo(id) ON DELETE CASCADE,
  rubro                     TEXT NOT NULL,
  descripcion_origen        TEXT NOT NULL,
  material_id               UUID REFERENCES materials(id),
  unidad                    TEXT NOT NULL,
  cantidad_estimada         NUMERIC(14,3) NOT NULL DEFAULT 0,
  precio_unit_estimado      NUMERIC(14,2) NOT NULL DEFAULT 0,
  subtotal_estimado         NUMERIC(14,2) GENERATED ALWAYS AS (cantidad_estimada * precio_unit_estimado) STORED,
  agregado_retroactivamente BOOLEAN NOT NULL DEFAULT FALSE,
  orden_dentro_rubro        INT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Indexes
CREATE INDEX idx_computo_project ON computo(project_id);
CREATE INDEX idx_computo_item_computo ON computo_item(computo_id);
CREATE INDEX idx_computo_item_material ON computo_item(material_id);
CREATE INDEX idx_materials_name_trgm ON materials USING gin (name gin_trgm_ops);

-- 5. RLS
ALTER TABLE computo ENABLE ROW LEVEL SECURITY;
ALTER TABLE computo_item ENABLE ROW LEVEL SECURITY;

CREATE POLICY "computo_company_access" ON computo
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN profiles pr ON pr.company_id = p.company_id
      WHERE p.id = computo.project_id AND pr.id = auth.uid()
    )
  );

CREATE POLICY "computo_item_company_access" ON computo_item
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM computo c
      JOIN projects p ON p.id = c.project_id
      JOIN profiles pr ON pr.company_id = p.company_id
      WHERE c.id = computo_item.computo_id AND pr.id = auth.uid()
    )
  );

-- 6. Función de matching de materiales con pg_trgm
CREATE OR REPLACE FUNCTION match_materials(
  p_company_id UUID,
  p_descriptions TEXT[]
)
RETURNS TABLE (
  descripcion TEXT,
  material_id UUID,
  material_name TEXT,
  material_unit TEXT,
  similarity_score REAL
) LANGUAGE sql STABLE AS $$
  SELECT
    d.txt AS descripcion,
    m.id AS material_id,
    m.name AS material_name,
    m.unit AS material_unit,
    similarity(m.name, d.txt) AS similarity_score
  FROM unnest(p_descriptions) WITH ORDINALITY AS d(txt, ord)
  LEFT JOIN LATERAL (
    SELECT id, name, unit
    FROM materials
    WHERE company_id = p_company_id
      AND active = true
      AND similarity(name, d.txt) > 0.1
    ORDER BY similarity(name, d.txt) DESC
    LIMIT 1
  ) m ON true
  ORDER BY d.ord;
$$;

-- 7. View para cálculos del dashboard
CREATE OR REPLACE VIEW v_computo_avance AS
SELECT
  ci.id AS computo_item_id,
  ci.computo_id,
  c.project_id,
  ci.rubro,
  ci.descripcion_origen,
  ci.material_id,
  ci.unidad,
  ci.cantidad_estimada,
  ci.precio_unit_estimado,
  ci.subtotal_estimado,
  ci.agregado_retroactivamente,
  ci.orden_dentro_rubro,
  COALESCE(agg.cantidad_pedida, 0) AS cantidad_pedida,
  COALESCE(agg.cantidad_recibida, 0) AS cantidad_recibida,
  COALESCE(agg.monto_pedido, 0) AS monto_pedido,
  COALESCE(agg.monto_recibido, 0) AS monto_recibido
FROM computo_item ci
JOIN computo c ON c.id = ci.computo_id AND c.activo = true
LEFT JOIN LATERAL (
  SELECT
    SUM(poi.quantity) AS cantidad_pedida,
    SUM(poi.quantity_received) AS cantidad_recibida,
    SUM(poi.quantity * poi.unit_price) AS monto_pedido,
    SUM(poi.quantity_received * poi.unit_price) AS monto_recibido
  FROM purchase_order_items poi
  JOIN purchase_orders po ON po.id = poi.purchase_order_id
  WHERE poi.material_id = ci.material_id
    AND po.request_id IN (
      SELECT r.id FROM requests r WHERE r.project_id = c.project_id
    )
    AND po.status != 'rejected'
) agg ON true;

-- 8. Storage bucket para archivos de cómputo
INSERT INTO storage.buckets (id, name, public)
VALUES ('computos', 'computos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "computos_bucket_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'computos' AND auth.role() = 'authenticated');

CREATE POLICY "computos_bucket_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'computos' AND auth.role() = 'authenticated');
