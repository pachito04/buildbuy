-- ================================================================
-- Company Settings: parametrización por empresa
-- ================================================================

CREATE TABLE company_settings (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
    urgente_threshold_days  INT NOT NULL DEFAULT 7,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed: crear settings para todas las companies existentes
INSERT INTO company_settings (company_id)
SELECT id FROM companies
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_settings_tenant ON company_settings
    FOR ALL USING (
        company_id IN (
            SELECT company_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Auto-updated_at
CREATE TRIGGER set_company_settings_updated_at
    BEFORE UPDATE ON company_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
