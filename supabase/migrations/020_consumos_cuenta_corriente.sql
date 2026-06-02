-- ================================================================
-- 020 — CONSUMOS POR OBRA + CUENTA CORRIENTE CON PROVEEDORES
-- SDD: gestion-consumos-cuenta-corriente-mejorado (Fase 1 / PR1)
-- Tablas aditivas. No afectan el flujo de OC/remitos.
-- Convención: snake_case, FK {entidad}_id, company_id por empresa.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Lista de precios por proveedor
--    company_id NULL = precio global del proveedor (aplica a cualquier comprador)
--    company_id <empresa> = override específico para esa empresa
-- ----------------------------------------------------------------
CREATE TABLE precio_proveedor (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,  -- NULL = global
    provider_id     UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    material_id     UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    precio_unitario NUMERIC(14,2) NOT NULL CHECK (precio_unitario >= 0),
    unidad_medida   VARCHAR(32),                 -- NULL => se usa materials.unit
    vigencia_desde  DATE NOT NULL DEFAULT CURRENT_DATE,
    vigencia_hasta  DATE,                         -- NULL = vigente
    created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (vigencia_hasta IS NULL OR vigencia_hasta > vigencia_desde)
);

CREATE INDEX ix_precio_proveedor_lookup
    ON precio_proveedor (provider_id, material_id, vigencia_desde DESC);

-- Un único precio "abierto" (vigencia_hasta IS NULL) por proveedor+material+scope.
-- COALESCE trata el company_id NULL (global) como un valor concreto para que
-- dos precios globales abiertos del mismo material colisionen.
CREATE UNIQUE INDEX ux_precio_proveedor_vigente
    ON precio_proveedor (
        provider_id,
        material_id,
        COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid)
    )
    WHERE vigencia_hasta IS NULL;

-- ----------------------------------------------------------------
-- 2. Retiro (cabecera) + ítems
-- ----------------------------------------------------------------
CREATE TABLE retiro (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    provider_id      UUID NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
    project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    architect_id     UUID NOT NULL REFERENCES architects(id) ON DELETE RESTRICT,
    fecha_retiro     DATE NOT NULL CHECK (fecha_retiro <= CURRENT_DATE),
    fecha_registro   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    observaciones    TEXT,
    estado           VARCHAR(16) NOT NULL DEFAULT 'activo'
                     CHECK (estado IN ('activo', 'anulado')),
    anulado_por      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    fecha_anulacion  TIMESTAMPTZ,
    motivo_anulacion TEXT,
    created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_retiro_company   ON retiro (company_id);
CREATE INDEX ix_retiro_provider  ON retiro (provider_id);
CREATE INDEX ix_retiro_project   ON retiro (project_id);
CREATE INDEX ix_retiro_fecha     ON retiro (company_id, fecha_retiro DESC);

CREATE TABLE retiro_item (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    retiro_id                UUID NOT NULL REFERENCES retiro(id) ON DELETE CASCADE,
    material_id              UUID NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
    precio_proveedor_id      UUID REFERENCES precio_proveedor(id) ON DELETE SET NULL,
    cantidad                 NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
    precio_unitario_aplicado NUMERIC(14,2) NOT NULL,  -- congelado al confirmar
    subtotal                 NUMERIC(14,2) NOT NULL   -- cantidad * precio_unitario_aplicado
);

CREATE INDEX ix_retiro_item_retiro   ON retiro_item (retiro_id);
CREATE INDEX ix_retiro_item_material ON retiro_item (material_id);

-- ----------------------------------------------------------------
-- 3. Cuenta corriente del proveedor (log INSERT-only, inmutable)
--    Mismo contrato que movimiento_producto (migración 015):
--    sin policies UPDATE/DELETE. Las correcciones se hacen con contra-asientos.
-- ----------------------------------------------------------------
CREATE TABLE movimiento_cuenta_corriente (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    provider_id   UUID NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
    tipo          VARCHAR(16) NOT NULL CHECK (tipo IN ('debito', 'credito')),
    retiro_id     UUID REFERENCES retiro(id) ON DELETE SET NULL,  -- NULL en pagos / NC manuales
    monto         NUMERIC(14,2) NOT NULL CHECK (monto >= 0),       -- el signo lo da `tipo`
    fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
    concepto      TEXT,
    medio_pago    VARCHAR(64),
    referencia    VARCHAR(128),
    created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- registrado_por
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_mov_cc_provider ON movimiento_cuenta_corriente (company_id, provider_id, fecha DESC);
CREATE INDEX ix_mov_cc_retiro   ON movimiento_cuenta_corriente (retiro_id);

COMMENT ON TABLE movimiento_cuenta_corriente IS
  'Cuenta corriente proveedor. Log INSERT-only (sin UPDATE/DELETE). Saldo = SUM(debito) - SUM(credito).';
