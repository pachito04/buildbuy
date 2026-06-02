-- Migration 023: Add saldo_limite_proveedor to company_settings
-- Run this manually in the Supabase SQL editor.
--
-- NULL = no limit configured (the alert card shows nothing).
-- A positive numeric value means the system will flag any provider
-- whose net saldo exceeds this threshold.

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS saldo_limite_proveedor NUMERIC(14,2) DEFAULT NULL;

COMMENT ON COLUMN company_settings.saldo_limite_proveedor
  IS 'Maximum acceptable net saldo per provider (debits minus credits). NULL = no limit.';
