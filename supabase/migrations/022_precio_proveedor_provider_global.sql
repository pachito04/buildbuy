-- ================================================================
-- 022 — Hardening PR2: el proveedor solo escribe precios GLOBALES
-- SDD: gestion-consumos-cuenta-corriente-mejorado (Fase 2 / PR2)
-- Verify W-6: la policy de escritura del proveedor no restringía company_id,
-- permitiéndole insertar un override de empresa ajena. El precio del proveedor
-- debe ser siempre global (company_id IS NULL); los overrides son solo de Compras/Admin.
-- ================================================================

DROP POLICY IF EXISTS precio_proveedor_provider_write ON precio_proveedor;

CREATE POLICY precio_proveedor_provider_write ON precio_proveedor
    FOR ALL USING (
        provider_id IN (
            SELECT provider_id FROM provider_users
            WHERE user_id = auth.uid() AND active = TRUE
        )
    ) WITH CHECK (
        company_id IS NULL  -- el proveedor solo publica su precio global
        AND provider_id IN (
            SELECT provider_id FROM provider_users
            WHERE user_id = auth.uid() AND active = TRUE
        )
    );
