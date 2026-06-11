# Proposal: Gestión de Consumos por Obra + Cuenta Corriente — fixes

## Intent

El módulo **Gestión de Consumos por Obra + Cuenta Corriente con Proveedores** (spec del cliente "BuildBuy Cuenta corriente", REQ-01..REQ-06) ya tiene el **MVP implementado y sólido**: migraciones 020–023 (tablas `precio_proveedor`, `retiro`, `retiro_item`, `movimiento_cuenta_corriente`; RLS por empresa + proveedor; RPCs `registrar_retiro` —bloquea sin precio, congela precio, débito automático— y `anular_retiro` —crédito compensatorio—; precio global por proveedor; `saldo_limite_proveedor` como umbral) más toda la UI del flujo (`ListaPreciosProveedor`, `RegistroRetiro`, `CuentaCorriente`, `MiCuentaCorriente`, `ReporteConsumos`), el ocultamiento del módulo al rol Arquitecto en el sidebar y la alerta de umbral en el Dashboard.

Sin embargo, contra el spec quedan **7 gaps**: dos reglas de negocio explícitas no implementadas (notificaciones internas proveedor↔Compras en cambios de precio; filtros y comparativa faltantes en el reporte de consumos), tres ítems menores de paridad funcional (PDF de estado de cuenta para Compras, plantilla Excel descargable para la carga masiva, guard de rol a nivel de ruta), y una preparación de roadmap que el spec pidió encarar **desde el inicio** para evitar una migración posterior (campos de la tabla `retiro` para la Fase 2 de WhatsApp). Este cambio cierra esos gaps respetando el core ya probado: las migraciones son **aditivas** y la mayor parte del trabajo es UI + reutilización de infraestructura existente (la tabla `notificaciones` ya existe; la lógica de PDF ya existe en la vista de proveedor).

## Scope

### In Scope (closed in this change — Slices A–F)

1. **GAP 1 — [MEDIA] Notificaciones internas proveedor↔Compras en cambios de precio**: REQ-01 ("Compras... debe notificar al proveedor") y REQ-05 ("Compras recibe una notificación interna cuando un proveedor actualiza su lista"). Implementado mediante migration 030 con triggers DB (reuso tabla `notificaciones`, patrón de 002). Eventos: proveedor actualiza lista → notif a Compras; Compras edita precio → notif a proveedor.
2. **GAP 2 — [MEDIA] Filtros incompletos en `ReporteConsumos`**: REQ-04 exige filtros por obra, proveedor, material, rango de fechas y Arquitecto. Implementado: proveedor, material y arquitecto agregados a query server-side. Helper puro `filterRetiros` testeable.
3. **GAP 3 — [MEDIA] Vista comparativa faltante en `ReporteConsumos`**: REQ-04 pide "consumo por material a lo largo del tiempo". Implementado: helper `buildTimeSeries` (qty/monto, mes), toggle Lista|Comparativa, Recharts LineChart, empty state, default últimos 12 meses.
4. **GAP 4 — [MENOR] PDF de estado de cuenta para Compras**: REQ-03. Implementado: helper `generateEstadoCuentaPDF` extraído de `MiCuentaCorriente`, botón "Exportar PDF" en `CuentaCorriente` (gated por provider+movs). Byte-for-byte identical para proveedor (regresión).
5. **GAP 5 — [MENOR] Plantilla Excel descargable para carga masiva de precios**: REQ-05. Implementado: helper `buildPlantillaPreciosWorkbook`, botón "Descargar plantilla" en `PreciosUploader` (siempre visible, sin reset upload state). 5 headers exactos en orden, 0 data rows, filename `plantilla-precios.xlsx`.
6. **GAP 6 — [MENOR / seguridad] Guard de rol a nivel de ruta**: Spec §7. Implementado: componente `RequireRole`, wrapping 5 consumos routes en `App.tsx`, matriz de rol (Arquitecto denied all). Defensa en profundidad.

### Out of Scope (Deferred to Fase 2)

- **GAP 7 — Preparación de Fase 2 WhatsApp**: El spec pidió incluir `id_mensaje_whatsapp` y ampliación de `retiro.estado`. Decision-gated; deferred a user discretion y Fase 2 roadmap.
- **Implementación funcional de la Fase 2 de WhatsApp** (flujo de confirmación por proveedor, integración del canal, máquina de estados completa del retiro).
- **Notificaciones por canal externo** (email, push, WhatsApp). GAP 1 cubre solo notificación **interna** (tabla `notificaciones`).
- **Rediseño del modelo de precios/cuenta corriente** ya implementado en 020–023.
- **Reporte de consumos a nivel consolidado entre obras/empresas** más allá de los filtros pedidos por REQ-04.

## Capabilities Closed

### New Capabilities
- `consumos-notificaciones-precio` (GAP 1): notificación interna proveedor↔Compras ante cambios en la lista de precios, sobre la tabla `notificaciones` existente.

### Modified Capabilities
- `reporte-consumos`: filtros completos por obra/proveedor/material/fechas/arquitecto (GAP 2) y vista comparativa de consumo por material en el tiempo (GAP 3).
- `cuenta-corriente`: PDF de estado de cuenta también en la vista de Compras (GAP 4).
- `lista-precios-proveedor`: plantilla Excel descargable para la carga masiva (GAP 5).
- `consumos-route-guards`: restricción de rol a nivel de ruta para el módulo (GAP 6, defensa en profundidad).

## Approach Summary

- **GAP 1**: Migration 030 (notif infra, triggers SECURITY DEFINER, RPCs: `precio_proveedor_bulk_insert`, `precio_proveedor_edit`). Batch token + actor token via `current_setting`. Reuso tabla `notificaciones`, patrón 002.
- **GAP 2**: Helper `filterRetiros` (puro, AND combination, anulado exclusion). Server-side query filters. Dropdowns no-orphan.
- **GAP 3**: Helper `buildTimeSeries` (qty/monto, mes, anulado excluido). Toggle UI + Recharts LineChart. Empty state. Default 12 meses.
- **GAP 4**: Extraction de jsPDF logic a `generateEstadoCuentaPDF`. Byte-for-byte identical proveedor. Botón Compras gated por provider+movs.
- **GAP 5**: Helper `buildPlantillaPreciosWorkbook` (xlsx, 5 headers). Botón en `PreciosUploader` siempre visible.
- **GAP 6**: Componente `RequireRole` (spinner loading, redirect /dashboard no-allowed, /login no-session). 5 routes wrapped con matriz.

## Integration

- **Branch**: feat/consumos-fixes (merged to main at dcc5510)
- **Commit**: dcc5510 (includes 18/18 tasks, W1/W2 post-verify fixes)
- **Tests**: 468 passed / 0 failed (baseline 428 → +40 new)
- **Slices**: A–F (6 slices, 18 tasks total)
- **Dependencies**: Migration 030 (T01) before slices B–F; T05/T08/T11/T14/T16 (RED test tasks) can parallelize

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Batch token cross-request persistence in supabase-js | RPC encapsulates set_config + write (transaction-local, valid) |
| W1: Provider bulk import empty-string UUID | Fixed: pass `null`, RPC resolves via profile.company_id |
| W2: Actor detection misclassifies | Fixed: use `actualRole !== 'proveedor'` from useViewRole |
| GAP4 PDF extraction breaks proveedor output | Byte-for-byte regression test GREEN; extraction mechanical |
| GAP3 aggregation on large dataset | Data already filtered server-side; Fase 2 can move to RPC if needed |
| GAP6 RequireRole false-negative redirect during loading | Spinner shown while loading; NEVER redirect before role resolved |

## Rollback Plan

- **Migration 030**: DROP triggers/RPCs + enum values stay (harmless if unused).
- **Code changes (Slices A–F)**: Revertible by commit without DB impact.
- **GAP4 helper**: If reverted, both views revert to previous state.

## Success Criteria (All ✅ in this change)

- ✅ Editar precio → notif interna en tabla `notificaciones` (proveedor or Compras, según lado)
- ✅ `ReporteConsumos` filtra por 5 criterios (obra, proveedor, material, fechas, arquitecto)
- ✅ `ReporteConsumos` ofrece vista comparativa (serie temporal por material, toggle qty/monto, empty state)
- ✅ `CuentaCorriente` (Compras) exporta PDF (botón gated, reusa helper)
- ✅ `PreciosUploader` descarga plantilla (5 headers exactos, 0 data rows, filename determinista)
- ✅ Tipear URL de ruta siendo Arquitecto → rechazado por guard (no render)
- ✅ 468/468 tests passed, tsc clean, verify PASS (W1/W2 fixed post-verify)

---

**Change Status**: ARCHIVED — SDD cycle complete, integrated to main at dcc5510, ready for production.
