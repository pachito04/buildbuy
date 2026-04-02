-- ================================================================
-- Construction Purchasing Platform — Initial Schema
-- Run this in Supabase Dashboard > SQL Editor
-- ================================================================

-- ================================================================
-- EXTENSIONS
-- ================================================================
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ================================================================
-- ENUMS
-- ================================================================

CREATE TYPE app_role AS ENUM (
    'admin',
    'arquitecto',
    'compras',
    'deposito',
    'transportista',
    'proveedor'
);

CREATE TYPE request_status AS ENUM (
    'draft',
    'approved',
    'in_pool',
    'rfq_direct',
    'rejected',
    'inventario'
);

CREATE TYPE pool_status AS ENUM (
    'open',
    'closed',
    'quoting',
    'awarded',
    'cancelled'
);

CREATE TYPE rfq_status AS ENUM (
    'draft',
    'sent',
    'responded',
    'closed'
);

CREATE TYPE quote_status AS ENUM (
    'pending',
    'submitted',
    'awarded',
    'rejected'
);

CREATE TYPE po_status AS ENUM (
    'sent',
    'accepted',
    'rejected'
);

CREATE TYPE remito_status AS ENUM (
    'borrador',
    'confirmado',
    'en_transito',
    'entregado',
    'cancelado'
);

CREATE TYPE movement_type AS ENUM (
    'entrada',
    'salida',
    'ajuste'
);

CREATE TYPE notification_type AS ENUM (
    'request_created',
    'request_approved',
    'stock_available',
    'stock_insufficient',
    'rfq_created',
    'quote_received',
    'comparison_ready',
    'po_issued',
    'po_accepted',
    'po_rejected',
    'material_received',
    'remito_dispatched',
    'remito_delivered',
    'material_purchased'
);

-- ================================================================
-- CORE: COMPANIES (TENANTS)
-- ================================================================

CREATE TABLE companies (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    slug        VARCHAR(100) NOT NULL UNIQUE,
    logo_url    TEXT,
    rfc         VARCHAR(50),
    address     TEXT,
    phone       VARCHAR(64),
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- USERS: PROFILES + ROLES
-- ================================================================

-- Extends auth.users (Supabase Auth)
CREATE TABLE profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id  UUID REFERENCES companies(id) ON DELETE SET NULL,
    full_name   VARCHAR(255),
    phone       VARCHAR(64),
    avatar_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_profiles_company_id ON profiles(company_id);

CREATE TABLE user_roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role        app_role NOT NULL,
    company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, role, company_id)
);

CREATE INDEX ix_user_roles_user_id ON user_roles(user_id);
CREATE INDEX ix_user_roles_company_id ON user_roles(company_id);

-- ================================================================
-- ARCHITECTS & PROJECTS
-- ================================================================

CREATE TABLE architects (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    full_name   VARCHAR(255) NOT NULL,
    email       VARCHAR(255),
    phone       VARCHAR(64),
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_architects_company_id ON architects(company_id);

CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    address         TEXT,
    description     TEXT,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_projects_company_id ON projects(company_id);

CREATE TABLE project_architects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    architect_id    UUID NOT NULL REFERENCES architects(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, architect_id)
);

-- ================================================================
-- MATERIALS CATALOG & INVENTORY
-- ================================================================

CREATE TABLE materials (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    unit            VARCHAR(32) NOT NULL,   -- kg, m², unidad, bolsa, etc.
    category        VARCHAR(100),
    description     TEXT,
    sku             VARCHAR(100),
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, sku)
);

CREATE INDEX ix_materials_company_id ON materials(company_id);
CREATE INDEX ix_materials_name ON materials(company_id, name);

CREATE TABLE inventory (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    material_id     UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    quantity        NUMERIC(12,3) NOT NULL DEFAULT 0,
    reserved        NUMERIC(12,3) NOT NULL DEFAULT 0,
    min_stock       NUMERIC(12,3) NOT NULL DEFAULT 0,
    location        VARCHAR(255),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, material_id)
);

CREATE INDEX ix_inventory_company_material ON inventory(company_id, material_id);

CREATE TABLE inventory_movements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    material_id     UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    movement_type   movement_type NOT NULL,
    quantity        NUMERIC(12,3) NOT NULL,
    reason          TEXT,
    request_id      UUID,   -- FK set after requests table created
    created_by      UUID REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_inventory_movements_company ON inventory_movements(company_id);
CREATE INDEX ix_inventory_movements_material ON inventory_movements(material_id);

-- ================================================================
-- REQUESTS (REQUERIMIENTOS)
-- ================================================================

CREATE TABLE requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    project_id          UUID REFERENCES projects(id) ON DELETE SET NULL,
    architect_id        UUID REFERENCES architects(id) ON DELETE SET NULL,
    created_by          UUID REFERENCES auth.users(id),
    status              request_status NOT NULL DEFAULT 'draft',
    raw_message         TEXT,                       -- original WhatsApp message
    whatsapp_message_id UUID,                       -- FK to whatsapp_mensajes
    urgency             VARCHAR(32),                -- low | medium | high
    desired_date        DATE,
    observations        TEXT,
    requires_review     BOOLEAN NOT NULL DEFAULT FALSE,   -- AI flagged ambiguities
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_requests_company_id ON requests(company_id);
CREATE INDEX ix_requests_status ON requests(company_id, status);
CREATE INDEX ix_requests_project_id ON requests(project_id);

CREATE TABLE request_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    material_id     UUID REFERENCES materials(id),       -- NULL if no catalog match
    description     VARCHAR(500) NOT NULL,               -- original description
    quantity        NUMERIC(12,3) NOT NULL,
    unit            VARCHAR(32) NOT NULL,
    status          VARCHAR(32) NOT NULL DEFAULT 'pending',
    observations    TEXT,
    match_confidence VARCHAR(16),                        -- alta|media|baja|sin_match
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_request_items_request_id ON request_items(request_id);

-- Late FK for inventory_movements
ALTER TABLE inventory_movements
    ADD CONSTRAINT fk_inventory_movements_request
    FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL;

-- ================================================================
-- PURCHASE POOLS
-- ================================================================

CREATE TABLE purchase_pools (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    status      pool_status NOT NULL DEFAULT 'open',
    deadline    DATE,
    is_shared   BOOLEAN NOT NULL DEFAULT FALSE,   -- visible to other companies
    created_by  UUID REFERENCES auth.users(id),
    observations TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_purchase_pools_company ON purchase_pools(company_id);
CREATE INDEX ix_purchase_pools_status ON purchase_pools(company_id, status);

CREATE TABLE pool_companies (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id     UUID NOT NULL REFERENCES purchase_pools(id) ON DELETE CASCADE,
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    status      VARCHAR(32) NOT NULL DEFAULT 'invited',   -- invited | active | declined
    joined_at   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (pool_id, company_id)
);

CREATE TABLE pool_requests (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id     UUID NOT NULL REFERENCES purchase_pools(id) ON DELETE CASCADE,
    request_id  UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (pool_id, request_id)
);

CREATE TABLE pool_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id         UUID NOT NULL REFERENCES purchase_pools(id) ON DELETE CASCADE,
    material_id     UUID REFERENCES materials(id),
    description     VARCHAR(500) NOT NULL,
    total_quantity  NUMERIC(12,3) NOT NULL DEFAULT 0,
    unit            VARCHAR(32) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_pool_items_pool_id ON pool_items(pool_id);

-- ================================================================
-- RFQs (PEDIDOS DE COTIZACIÓN)
-- ================================================================

CREATE TABLE rfqs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    pool_id             UUID REFERENCES purchase_pools(id) ON DELETE SET NULL,
    request_id          UUID REFERENCES requests(id) ON DELETE SET NULL,
    status              rfq_status NOT NULL DEFAULT 'draft',
    deadline            DATE,
    closing_datetime    TIMESTAMPTZ,
    delivery_location   TEXT,
    payment_terms       VARCHAR(255),
    observations        TEXT,
    created_by          UUID REFERENCES auth.users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_rfqs_company_id ON rfqs(company_id);
CREATE INDEX ix_rfqs_status ON rfqs(company_id, status);
CREATE INDEX ix_rfqs_closing ON rfqs(closing_datetime) WHERE status = 'sent';

CREATE TABLE rfq_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rfq_id          UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
    material_id     UUID REFERENCES materials(id),
    description     VARCHAR(500) NOT NULL,
    quantity        NUMERIC(12,3) NOT NULL,
    unit            VARCHAR(32) NOT NULL,
    specifications  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_rfq_items_rfq_id ON rfq_items(rfq_id);

-- ================================================================
-- PROVIDERS (PROVEEDORES)
-- ================================================================

CREATE TABLE providers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID REFERENCES companies(id) ON DELETE CASCADE,  -- NULL = global
    name                VARCHAR(255) NOT NULL,
    rfc                 VARCHAR(50),
    email               VARCHAR(255),
    phone               VARCHAR(64),
    address             TEXT,
    categories          TEXT[],
    verification_status VARCHAR(32) NOT NULL DEFAULT 'pending',  -- pending|verified|rejected
    score               NUMERIC(3,1),
    active              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_providers_company_id ON providers(company_id);

CREATE TABLE provider_documents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    doc_type    VARCHAR(100) NOT NULL,   -- constancia_fiscal, acta_constitutiva, etc.
    file_url    TEXT NOT NULL,           -- Supabase Storage URL
    file_name   VARCHAR(255),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Links Supabase Auth user to a provider (for supplier portal login)
CREATE TABLE provider_users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider_id, user_id)
);

CREATE INDEX ix_provider_users_user_id ON provider_users(user_id);

CREATE TABLE rfq_providers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rfq_id      UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    notified_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (rfq_id, provider_id)
);

CREATE INDEX ix_rfq_providers_rfq_id ON rfq_providers(rfq_id);
CREATE INDEX ix_rfq_providers_provider_id ON rfq_providers(provider_id);

-- ================================================================
-- QUOTES (COTIZACIONES)
-- ================================================================

CREATE TABLE quotes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rfq_id          UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
    provider_id     UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    status          quote_status NOT NULL DEFAULT 'pending',
    total_price     NUMERIC(14,2),
    delivery_days   INTEGER,
    conditions      TEXT,
    observations    TEXT,
    submitted_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (rfq_id, provider_id)
);

CREATE INDEX ix_quotes_rfq_id ON quotes(rfq_id);
CREATE INDEX ix_quotes_provider_id ON quotes(provider_id);

CREATE TABLE quote_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id        UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    rfq_item_id     UUID NOT NULL REFERENCES rfq_items(id) ON DELETE CASCADE,
    unit_price      NUMERIC(14,4) NOT NULL,
    delivery_days   INTEGER,
    observations    TEXT,
    UNIQUE (quote_id, rfq_item_id)
);

CREATE INDEX ix_quote_items_quote_id ON quote_items(quote_id);
CREATE INDEX ix_quote_items_rfq_item_id ON quote_items(rfq_item_id);

-- ================================================================
-- PURCHASE ORDERS
-- ================================================================

CREATE TABLE purchase_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    provider_id     UUID NOT NULL REFERENCES providers(id),
    rfq_id          UUID REFERENCES rfqs(id) ON DELETE SET NULL,
    request_id      UUID REFERENCES requests(id) ON DELETE SET NULL,
    status          po_status NOT NULL DEFAULT 'sent',
    po_number       VARCHAR(50),                     -- e.g. OC-ACME-2026-0001
    total_amount    NUMERIC(14,2),
    payment_terms   VARCHAR(255),
    notes           TEXT,
    rejection_reason TEXT,
    created_by      UUID REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_purchase_orders_company ON purchase_orders(company_id);
CREATE INDEX ix_purchase_orders_provider ON purchase_orders(provider_id);
CREATE INDEX ix_purchase_orders_status ON purchase_orders(company_id, status);

CREATE TABLE purchase_order_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id   UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    material_id         UUID REFERENCES materials(id),
    description         VARCHAR(500) NOT NULL,
    quantity            NUMERIC(12,3) NOT NULL,
    unit                VARCHAR(32) NOT NULL,
    unit_price          NUMERIC(14,4) NOT NULL,
    quantity_received   NUMERIC(12,3) NOT NULL DEFAULT 0,
    quote_item_id       UUID REFERENCES quote_items(id),   -- traceability
    request_item_id     UUID REFERENCES request_items(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_po_items_po_id ON purchase_order_items(purchase_order_id);

-- ================================================================
-- CIRCUIT A: REMITOS (DELIVERY NOTES)
-- ================================================================

CREATE TABLE remitos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    request_id          UUID REFERENCES requests(id) ON DELETE SET NULL,
    status              remito_status NOT NULL DEFAULT 'borrador',
    transportista_id    UUID REFERENCES auth.users(id),
    destination         TEXT,                   -- obra address
    estimated_delivery  DATE,
    observations        TEXT,
    created_by          UUID REFERENCES auth.users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_remitos_company_id ON remitos(company_id);
CREATE INDEX ix_remitos_request_id ON remitos(request_id);
CREATE INDEX ix_remitos_status ON remitos(company_id, status);

CREATE TABLE remito_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    remito_id       UUID NOT NULL REFERENCES remitos(id) ON DELETE CASCADE,
    material_id     UUID NOT NULL REFERENCES materials(id),
    request_item_id UUID REFERENCES request_items(id),
    quantity        NUMERIC(12,3) NOT NULL,
    delivered       BOOLEAN NOT NULL DEFAULT FALSE,
    observations    TEXT
);

CREATE INDEX ix_remito_items_remito_id ON remito_items(remito_id);

-- ================================================================
-- WHATSAPP INTEGRATION
-- ================================================================

-- Maps a WhatsApp phone number to a company and user
CREATE TABLE whatsapp_numbers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    number      VARCHAR(32) NOT NULL UNIQUE,   -- E.164: +5491112345678
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_whatsapp_numbers_company ON whatsapp_numbers(company_id);

-- Raw incoming WhatsApp messages
CREATE TABLE whatsapp_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID REFERENCES companies(id),        -- resolved from number mapping
    from_number     VARCHAR(32) NOT NULL,
    to_number       VARCHAR(32),
    body            TEXT,
    media_url       TEXT,
    processed       BOOLEAN NOT NULL DEFAULT FALSE,
    request_id      UUID REFERENCES requests(id) ON DELETE SET NULL,
    raw_payload     JSONB,                                -- full Twilio/Meta payload
    ai_result       JSONB,                                -- Claude parse result
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_whatsapp_messages_company ON whatsapp_messages(company_id);
CREATE INDEX ix_whatsapp_messages_from ON whatsapp_messages(from_number);
CREATE INDEX ix_whatsapp_messages_unprocessed ON whatsapp_messages(processed)
    WHERE NOT processed;

-- ================================================================
-- NOTIFICATIONS
-- ================================================================

CREATE TABLE notificaciones (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type            notification_type NOT NULL,
    message         TEXT NOT NULL,
    read            BOOLEAN NOT NULL DEFAULT FALSE,
    metadata        JSONB,     -- { request_id, rfq_id, po_id, remito_id, ... }
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_notificaciones_user ON notificaciones(user_id, read);
CREATE INDEX ix_notificaciones_company ON notificaciones(company_id);

-- ================================================================
-- VIEWS
-- ================================================================

-- Price comparison matrix per RFQ: items × suppliers × prices
CREATE VIEW v_price_comparison AS
SELECT
    r.id                            AS rfq_id,
    r.company_id,
    ri.id                           AS rfq_item_id,
    ri.description                  AS item_description,
    ri.quantity,
    ri.unit,
    p.id                            AS provider_id,
    p.name                          AS provider_name,
    qi.unit_price,
    (qi.unit_price * ri.quantity)   AS total_price,
    qi.delivery_days,
    q.status                        AS quote_status,
    q.submitted_at
FROM rfqs r
JOIN rfq_items ri           ON ri.rfq_id = r.id
JOIN rfq_providers rp       ON rp.rfq_id = r.id
JOIN providers p            ON p.id = rp.provider_id
LEFT JOIN quotes q          ON q.rfq_id = r.id AND q.provider_id = p.id
LEFT JOIN quote_items qi    ON qi.quote_id = q.id AND qi.rfq_item_id = ri.id
WHERE q.status = 'submitted';

-- ================================================================
-- TRIGGERS: updated_at auto-update
-- ================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'companies','profiles','architects','projects',
        'materials','purchase_pools','rfqs','providers',
        'quotes','purchase_orders','remitos','requests'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%I_updated_at
             BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
            t, t
        );
    END LOOP;
END;
$$;

-- ================================================================
-- TRIGGER: auto-create profile on new auth user
-- ================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO profiles (id, full_name)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ================================================================
-- RLS HELPER FUNCTIONS
-- ================================================================

CREATE OR REPLACE FUNCTION auth_company_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT company_id FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS app_role LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT role FROM user_roles
    WHERE user_id = auth.uid()
    AND company_id = auth_company_id()
    LIMIT 1
$$;

CREATE OR REPLACE FUNCTION auth_is_provider()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT EXISTS (
        SELECT 1 FROM provider_users WHERE user_id = auth.uid() AND active = TRUE
    )
$$;

-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================

ALTER TABLE companies           ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE architects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects            ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_architects  ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials           ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory           ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests            ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_pools      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_companies      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfqs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE providers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_providers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE remitos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE remito_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_numbers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones      ENABLE ROW LEVEL SECURITY;

-- Companies: user sees their own company
CREATE POLICY companies_tenant ON companies
    FOR SELECT USING (id = auth_company_id());

-- Profiles: own profile + same company
CREATE POLICY profiles_own ON profiles
    FOR ALL USING (id = auth.uid() OR company_id = auth_company_id());

-- User roles: own roles
CREATE POLICY user_roles_own ON user_roles
    FOR ALL USING (user_id = auth.uid() OR company_id = auth_company_id());

-- Standard tenant isolation macro (applied to tables with company_id)
-- architects
CREATE POLICY architects_tenant ON architects
    FOR ALL USING (company_id = auth_company_id())
    WITH CHECK (company_id = auth_company_id());

CREATE POLICY projects_tenant ON projects
    FOR ALL USING (company_id = auth_company_id())
    WITH CHECK (company_id = auth_company_id());

CREATE POLICY project_architects_tenant ON project_architects
    FOR ALL USING (
        project_id IN (SELECT id FROM projects WHERE company_id = auth_company_id())
    );

CREATE POLICY materials_tenant ON materials
    FOR ALL USING (company_id = auth_company_id())
    WITH CHECK (company_id = auth_company_id());

CREATE POLICY inventory_tenant ON inventory
    FOR ALL USING (company_id = auth_company_id())
    WITH CHECK (company_id = auth_company_id());

CREATE POLICY inventory_movements_tenant ON inventory_movements
    FOR ALL USING (company_id = auth_company_id())
    WITH CHECK (company_id = auth_company_id());

CREATE POLICY requests_tenant ON requests
    FOR ALL USING (company_id = auth_company_id())
    WITH CHECK (company_id = auth_company_id());

CREATE POLICY request_items_tenant ON request_items
    FOR ALL USING (
        request_id IN (SELECT id FROM requests WHERE company_id = auth_company_id())
    );

CREATE POLICY purchase_pools_tenant ON purchase_pools
    FOR ALL USING (company_id = auth_company_id())
    WITH CHECK (company_id = auth_company_id());

CREATE POLICY pool_companies_tenant ON pool_companies
    FOR ALL USING (company_id = auth_company_id());

CREATE POLICY pool_requests_tenant ON pool_requests
    FOR ALL USING (
        pool_id IN (SELECT id FROM purchase_pools WHERE company_id = auth_company_id())
    );

CREATE POLICY pool_items_tenant ON pool_items
    FOR ALL USING (
        pool_id IN (SELECT id FROM purchase_pools WHERE company_id = auth_company_id())
    );

CREATE POLICY rfqs_tenant ON rfqs
    FOR ALL USING (company_id = auth_company_id())
    WITH CHECK (company_id = auth_company_id());

CREATE POLICY rfq_items_tenant ON rfq_items
    FOR ALL USING (
        rfq_id IN (SELECT id FROM rfqs WHERE company_id = auth_company_id())
    );

-- Providers: company sees its own providers OR global (company_id IS NULL)
CREATE POLICY providers_tenant ON providers
    FOR SELECT USING (company_id = auth_company_id() OR company_id IS NULL);

CREATE POLICY providers_write ON providers
    FOR INSERT WITH CHECK (company_id = auth_company_id());

CREATE POLICY provider_documents_tenant ON provider_documents
    FOR ALL USING (
        provider_id IN (SELECT id FROM providers WHERE company_id = auth_company_id())
        OR auth_is_provider()
    );

-- Supplier portal: provider users see only their own data
CREATE POLICY provider_users_own ON provider_users
    FOR ALL USING (user_id = auth.uid());

-- RFQ providers: company sees invitations for their RFQs; provider sees their own
CREATE POLICY rfq_providers_tenant ON rfq_providers
    FOR SELECT USING (
        rfq_id IN (SELECT id FROM rfqs WHERE company_id = auth_company_id())
        OR provider_id IN (SELECT provider_id FROM provider_users WHERE user_id = auth.uid())
    );

CREATE POLICY rfq_providers_write ON rfq_providers
    FOR INSERT WITH CHECK (
        rfq_id IN (SELECT id FROM rfqs WHERE company_id = auth_company_id())
    );

-- Quotes: company sees all quotes for their RFQs; provider sees own quotes
CREATE POLICY quotes_company_view ON quotes
    FOR SELECT USING (
        rfq_id IN (SELECT id FROM rfqs WHERE company_id = auth_company_id())
        OR provider_id IN (SELECT provider_id FROM provider_users WHERE user_id = auth.uid())
    );

CREATE POLICY quotes_provider_write ON quotes
    FOR INSERT WITH CHECK (
        provider_id IN (SELECT provider_id FROM provider_users WHERE user_id = auth.uid())
    );

CREATE POLICY quotes_provider_update ON quotes
    FOR UPDATE USING (
        provider_id IN (SELECT provider_id FROM provider_users WHERE user_id = auth.uid())
    );

CREATE POLICY quote_items_view ON quote_items
    FOR SELECT USING (
        quote_id IN (
            SELECT q.id FROM quotes q
            JOIN rfqs r ON r.id = q.rfq_id
            WHERE r.company_id = auth_company_id()
            UNION
            SELECT q.id FROM quotes q
            WHERE q.provider_id IN (
                SELECT provider_id FROM provider_users WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY quote_items_write ON quote_items
    FOR INSERT WITH CHECK (
        quote_id IN (
            SELECT q.id FROM quotes q
            WHERE q.provider_id IN (
                SELECT provider_id FROM provider_users WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY purchase_orders_tenant ON purchase_orders
    FOR ALL USING (company_id = auth_company_id())
    WITH CHECK (company_id = auth_company_id());

-- Providers see their own POs
CREATE POLICY purchase_orders_provider ON purchase_orders
    FOR SELECT USING (
        provider_id IN (SELECT provider_id FROM provider_users WHERE user_id = auth.uid())
    );

CREATE POLICY purchase_orders_provider_update ON purchase_orders
    FOR UPDATE USING (
        provider_id IN (SELECT provider_id FROM provider_users WHERE user_id = auth.uid())
    );

CREATE POLICY po_items_tenant ON purchase_order_items
    FOR ALL USING (
        purchase_order_id IN (
            SELECT id FROM purchase_orders WHERE company_id = auth_company_id()
        )
    );

CREATE POLICY remitos_tenant ON remitos
    FOR ALL USING (company_id = auth_company_id())
    WITH CHECK (company_id = auth_company_id());

CREATE POLICY remito_items_tenant ON remito_items
    FOR ALL USING (
        remito_id IN (SELECT id FROM remitos WHERE company_id = auth_company_id())
    );

CREATE POLICY whatsapp_numbers_tenant ON whatsapp_numbers
    FOR ALL USING (company_id = auth_company_id())
    WITH CHECK (company_id = auth_company_id());

CREATE POLICY whatsapp_messages_tenant ON whatsapp_messages
    FOR SELECT USING (company_id = auth_company_id());

CREATE POLICY notificaciones_own ON notificaciones
    FOR ALL USING (user_id = auth.uid());

-- ================================================================
-- pg_cron: Auto-close RFQs past closing_datetime
-- ================================================================

SELECT cron.schedule(
    'close-expired-rfqs',
    '0 * * * *',    -- every hour
    $$
    UPDATE rfqs
    SET status = 'closed', updated_at = NOW()
    WHERE status = 'sent'
      AND closing_datetime IS NOT NULL
      AND closing_datetime < NOW();
    $$
);
