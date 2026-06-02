-- ================================================================
-- 021 — RLS + RPCs para consumos / cuenta corriente
-- SDD: gestion-consumos-cuenta-corriente-mejorado (Fase 1 / PR1)
-- Aislamiento: empresa via auth_company_id(); proveedor via provider_users.
-- Movimientos: INSERT-only (sin UPDATE/DELETE).
-- ================================================================

ALTER TABLE precio_proveedor             ENABLE ROW LEVEL SECURITY;
ALTER TABLE retiro                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE retiro_item                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimiento_cuenta_corriente  ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- precio_proveedor
-- ----------------------------------------------------------------
-- Interno: ve precios de proveedores visibles a su empresa (propios o globales),
-- y solo overrides de su empresa o globales (no overrides de otra empresa).
CREATE POLICY precio_proveedor_select_internal ON precio_proveedor
    FOR SELECT USING (
        (company_id = auth_company_id() OR company_id IS NULL)
        AND provider_id IN (
            SELECT id FROM providers
            WHERE company_id = auth_company_id() OR company_id IS NULL
        )
    );

-- Proveedor: ve solo sus propios precios (vía provider_users).
CREATE POLICY precio_proveedor_select_provider ON precio_proveedor
    FOR SELECT USING (
        provider_id IN (
            SELECT provider_id FROM provider_users
            WHERE user_id = auth.uid() AND active = TRUE
        )
    );

-- Proveedor gestiona su propia lista.
CREATE POLICY precio_proveedor_provider_write ON precio_proveedor
    FOR ALL USING (
        provider_id IN (
            SELECT provider_id FROM provider_users
            WHERE user_id = auth.uid() AND active = TRUE
        )
    ) WITH CHECK (
        provider_id IN (
            SELECT provider_id FROM provider_users
            WHERE user_id = auth.uid() AND active = TRUE
        )
    );

-- Compras/Admin gestiona overrides de su empresa.
CREATE POLICY precio_proveedor_internal_write ON precio_proveedor
    FOR ALL USING (
        company_id = auth_company_id() AND auth_user_role() IN ('compras', 'admin')
    ) WITH CHECK (
        company_id = auth_company_id() AND auth_user_role() IN ('compras', 'admin')
    );

-- ----------------------------------------------------------------
-- retiro  (escrituras solo vía RPC registrar_retiro / anular_retiro)
-- ----------------------------------------------------------------
CREATE POLICY retiro_select_internal ON retiro
    FOR SELECT USING (company_id = auth_company_id());

CREATE POLICY retiro_select_provider ON retiro
    FOR SELECT USING (
        provider_id IN (
            SELECT provider_id FROM provider_users
            WHERE user_id = auth.uid() AND active = TRUE
        )
    );

-- ----------------------------------------------------------------
-- retiro_item  (visibilidad heredada del retiro; escrituras vía RPC)
-- ----------------------------------------------------------------
CREATE POLICY retiro_item_select ON retiro_item
    FOR SELECT USING (
        retiro_id IN (
            SELECT id FROM retiro
            WHERE company_id = auth_company_id()
               OR provider_id IN (
                    SELECT provider_id FROM provider_users
                    WHERE user_id = auth.uid() AND active = TRUE
                  )
        )
    );

-- ----------------------------------------------------------------
-- movimiento_cuenta_corriente  (INSERT-only, sin UPDATE/DELETE)
-- ----------------------------------------------------------------
CREATE POLICY mov_cc_select_internal ON movimiento_cuenta_corriente
    FOR SELECT USING (company_id = auth_company_id());

CREATE POLICY mov_cc_select_provider ON movimiento_cuenta_corriente
    FOR SELECT USING (
        provider_id IN (
            SELECT provider_id FROM provider_users
            WHERE user_id = auth.uid() AND active = TRUE
        )
    );

-- Pagos / notas de crédito manuales: solo Compras/Admin de la empresa.
-- (Los débitos por retiro los inserta el RPC con SECURITY DEFINER.)
CREATE POLICY mov_cc_insert_internal ON movimiento_cuenta_corriente
    FOR INSERT WITH CHECK (
        company_id = auth_company_id() AND auth_user_role() IN ('compras', 'admin')
    );

-- ================================================================
-- RPC 1 — registrar_retiro
-- Inserta retiro + ítems (congela precio) + débito en cuenta corriente,
-- todo en una transacción. Bloquea si falta precio vigente.
-- p_items: jsonb array de objetos { "material_id": uuid, "cantidad": numeric }
-- ================================================================
CREATE OR REPLACE FUNCTION registrar_retiro(
    p_provider_id   UUID,
    p_project_id    UUID,
    p_architect_id  UUID,
    p_fecha_retiro  DATE,
    p_items         JSONB,
    p_observaciones TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_company    UUID := auth_company_id();
    v_retiro_id  UUID;
    v_total      NUMERIC(14,2) := 0;
    v_item       JSONB;
    v_material   UUID;
    v_cantidad   NUMERIC(12,3);
    v_precio_id  UUID;
    v_precio     NUMERIC(14,2);
    v_subtotal   NUMERIC(14,2);
    v_count      INT := 0;
BEGIN
    IF v_company IS NULL THEN
        RAISE EXCEPTION 'Usuario sin empresa asignada';
    END IF;
    IF COALESCE(auth_user_role()::text, '') NOT IN ('compras', 'admin') THEN
        RAISE EXCEPTION 'Solo Compras/Admin pueden registrar retiros' USING ERRCODE = '42501';
    END IF;
    IF p_fecha_retiro > CURRENT_DATE THEN
        RAISE EXCEPTION 'La fecha de retiro no puede ser futura';
    END IF;

    -- Validar pertenencia a la empresa
    IF NOT EXISTS (SELECT 1 FROM projects   WHERE id = p_project_id   AND company_id = v_company) THEN
        RAISE EXCEPTION 'Obra inexistente o de otra empresa';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM architects WHERE id = p_architect_id AND company_id = v_company) THEN
        RAISE EXCEPTION 'Arquitecto inexistente o de otra empresa';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM providers  WHERE id = p_provider_id  AND (company_id = v_company OR company_id IS NULL)) THEN
        RAISE EXCEPTION 'Proveedor inexistente o no visible para la empresa';
    END IF;

    INSERT INTO retiro (company_id, provider_id, project_id, architect_id,
                        fecha_retiro, observaciones, created_by)
    VALUES (v_company, p_provider_id, p_project_id, p_architect_id,
            p_fecha_retiro, p_observaciones, auth.uid())
    RETURNING id INTO v_retiro_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_material := (v_item->>'material_id')::uuid;
        v_cantidad := (v_item->>'cantidad')::numeric;

        IF v_cantidad IS NULL OR v_cantidad <= 0 THEN
            RAISE EXCEPTION 'Cantidad inválida para el material %', v_material;
        END IF;

        -- Precio vigente a la fecha del retiro (prioriza override de empresa sobre global)
        SELECT pp.id, pp.precio_unitario
          INTO v_precio_id, v_precio
          FROM precio_proveedor pp
         WHERE pp.provider_id = p_provider_id
           AND pp.material_id = v_material
           AND pp.vigencia_desde <= p_fecha_retiro
           AND (pp.vigencia_hasta IS NULL OR pp.vigencia_hasta > p_fecha_retiro)
           AND (pp.company_id = v_company OR pp.company_id IS NULL)
         ORDER BY (pp.company_id IS NOT NULL) DESC, pp.vigencia_desde DESC
         LIMIT 1;

        IF v_precio_id IS NULL THEN
            RAISE EXCEPTION 'No hay precio vigente para el material % a la fecha %',
                v_material, p_fecha_retiro;
        END IF;

        v_subtotal := ROUND(v_cantidad * v_precio, 2);

        INSERT INTO retiro_item (retiro_id, material_id, precio_proveedor_id,
                                 cantidad, precio_unitario_aplicado, subtotal)
        VALUES (v_retiro_id, v_material, v_precio_id, v_cantidad, v_precio, v_subtotal);

        v_total := v_total + v_subtotal;
        v_count := v_count + 1;
    END LOOP;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'El retiro debe tener al menos un ítem';
    END IF;

    INSERT INTO movimiento_cuenta_corriente (company_id, provider_id, tipo, retiro_id,
                                             monto, fecha, concepto, created_by)
    VALUES (v_company, p_provider_id, 'debito', v_retiro_id,
            v_total, p_fecha_retiro, 'Retiro de materiales', auth.uid());

    RETURN v_retiro_id;
END;
$$;

-- ================================================================
-- RPC 2 — anular_retiro
-- Marca el retiro como anulado y genera el crédito compensatorio.
-- ================================================================
CREATE OR REPLACE FUNCTION anular_retiro(
    p_retiro_id UUID,
    p_motivo    TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_company  UUID := auth_company_id();
    v_ret      retiro%ROWTYPE;
    v_total    NUMERIC(14,2);
BEGIN
    IF COALESCE(auth_user_role()::text, '') NOT IN ('compras', 'admin') THEN
        RAISE EXCEPTION 'Solo Compras/Admin pueden anular retiros' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_ret FROM retiro WHERE id = p_retiro_id FOR UPDATE;
    IF NOT FOUND OR v_ret.company_id <> v_company THEN
        RAISE EXCEPTION 'Retiro inexistente o de otra empresa';
    END IF;
    IF v_ret.estado = 'anulado' THEN
        RAISE EXCEPTION 'El retiro ya está anulado';
    END IF;

    SELECT COALESCE(SUM(subtotal), 0) INTO v_total
      FROM retiro_item WHERE retiro_id = p_retiro_id;

    UPDATE retiro
       SET estado = 'anulado',
           anulado_por = auth.uid(),
           fecha_anulacion = NOW(),
           motivo_anulacion = p_motivo
     WHERE id = p_retiro_id;

    INSERT INTO movimiento_cuenta_corriente (company_id, provider_id, tipo, retiro_id,
                                             monto, fecha, concepto, created_by)
    VALUES (v_ret.company_id, v_ret.provider_id, 'credito', p_retiro_id,
            v_total, CURRENT_DATE,
            'Anulación de retiro' || COALESCE(' — ' || p_motivo, ''), auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION registrar_retiro(UUID, UUID, UUID, DATE, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION anular_retiro(UUID, TEXT) TO authenticated;
