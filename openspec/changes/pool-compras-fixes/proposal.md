# Proposal: Pool de Compras — fixes Módulo 2

## Intent

El **Módulo 2 — Pool de Compras** (compra interempresa: dos o más empresas BuildBuy se vinculan, mapean sus catálogos de materiales, agrupan requerimientos elegibles en una SC compartida, obtienen una comparativa centralizada y cada empresa genera su propia OC por su porción) ya tiene el **core implementado y sólido**: migraciones 017/018/019 (vínculos bidireccionales, mappings de materiales dual-confirmados, `pool_state` de 6 estados, contribuciones por empresa, RLS de comparativa compartida) más toda la UI de configuración y flujo (`PoolEmpresasPanel`, `PoolMateriasPanel`, `usePoolFlow`, `usePoolAward`, `Pools.tsx → PoolCard → PoolFlowPanel`).

Sin embargo, contra el spec del cliente quedan **5 gaps** que rompen reglas de negocio o dejan funcionalidad incompleta: la regla "no se puede armar un pool con una empresa no vinculada" NO está aplicada (cualquier empresa aparece para invitar), la adjudicación solo soporta el modo "líder / único ganador" (falta el modo "cada empresa adjudica su porción"), el despacho a proveedores no arma la "unión de proveedores" ni notifica, no existen las acciones de retiro/cancelación, y el historial del requerimiento no registra su participación en un pool. Este cambio cierra esos gaps del Módulo 2 (proceso interempresa).

## Scope

### In Scope (por prioridad)
1. **GAP 1 — [ALTA] Empresa no vinculada no puede iniciar/participar en un pool**: filtrar la lista de empresas en `CreatePoolDialog.tsx` y en el camino legacy "Invitar Empresa" de `PoolCard` a solo las que tienen un `company_links` activo. Idealmente reforzar con un guard a nivel DB/RLS sobre el insert en `pool_companies`. La data existe (migración 017) — falta el filtro y la validación.
2. **GAP 4 — [ALTA] Retiro y cancelación de pool**: implementar UI/mutaciones que escriban `pool_state` (no el `status` legacy). "Retirarse del pool" permitido **solo en `borrador`**; una vez `confirmado` una empresa no puede retirarse sin cancelar el pool completo (`pool_state='cancelado'`). Hoy `'cancelado'` existe en el enum pero ningún flujo lo setea.
3. **GAP 2 — [ALTA, decisión arquitectónica] Modelo de adjudicación líder vs. por-empresa**: hoy `PoolAwardPanel` solo permite elegir UN quote ganador para todo el pool. El spec requiere poder elegir entre "un líder adjudica todo" y "cada empresa adjudica su porción de forma independiente". El segundo modo no existe. **Esta es la decisión clave que la fase de diseño debe resolver** (ver "Decisión abierta para diseño").
4. **GAP 3 — [MEDIA] Despacho como "unión de proveedores" + notificación**: `usePoolFlow.ts generateSharedRfq` crea la RFQ con `status='sent'` pero NO inserta `rfq_providers` ni invoca la edge function `notify-providers`. Construir la unión de proveedores habilitados por las empresas participantes (o selección por pool) e invocar la notificación.
5. **GAP 5 — [MEDIA] Historial de requerimiento registra participación en pool**: `addMyRequirements` no escribe ningún evento. Registrar en el historial de cada requerimiento que participó en un pool (número de pool + empresas participantes) y derivar un `pool_number` legible (hoy solo hay UUID + nombre).

### Out of Scope
- **Remoción completa de la capa legacy de `PoolCard`** (badge de `status` viejo + "Cerrar Pool"/"Iniciar Cotización"/"Invitar Empresa"/"Agregar Pedidos"). En este cambio solo se **neutraliza la fuga** del GAP 1 en "Invitar Empresa"; la deprecación/eliminación total del enum `status` legacy y sus botones queda como **follow-up** (deuda técnica, abajo).
- **Búsqueda por CUIT en vínculos** y **búsqueda asistida (nombre/unidad/código) en mapping de materiales**: el spec lo menciona, pero hoy el vínculo busca solo por nombre y el mapping usa un `Select` plano. Mejora de UX, no de regla de negocio → follow-up.
- **Módulo 1 — Consolidación de requerimientos** (cambio hermano `consolidacion-requerimientos-fixes`).

## Decisión abierta para diseño (GAP 2 — clave)

El spec admite DOS modelos de adjudicación y la fase de diseño debe definir el modelo y el **flag de decisión** que lo controla por pool:

- **Modo A — Líder adjudica todo** (ya implementado): un miembro fija `winning_quote_id` para todo el pool → `pool_state='adjudicado'`; cada empresa genera su OC desde sus `pool_item_contributions`.
- **Modo B — Cada empresa adjudica su porción** (no existe): cada empresa elige su quote ganador para su propia porción de ítems, de forma independiente.

**Recomendación por defecto**: mantener **Modo A como default** (es el flujo probado y cubre el caso más común de compra agregada con mejor precio único), e introducir un flag por pool (p. ej. `award_mode` en `purchase_pools`, default `'leader'`) que habilite el Modo B. Dejar el flag **visible** desde la creación del pool para no acoplar la decisión a una sola estrategia. El diseño debe definir: dónde vive el flag, cómo se persiste el ganador por-empresa en Modo B (¿`winning_quote_id` por contribución?), y cómo afecta a `generateMyOc` y a la transición a `cerrado`.

## Capabilities

### New Capabilities
- `pool-award-per-company` (condicional al GAP 2): adjudicación independiente por empresa sobre su porción del pool (Modo B).

### Modified Capabilities
- `pool-de-compras`: invitación restringida a empresas vinculadas (GAP 1); retiro en `borrador` y cancelación de pool vía `pool_state` (GAP 4); despacho que arma la unión de proveedores y notifica (GAP 3); historial de requerimiento registra participación en pool con número legible (GAP 5).

## Approach

- **Migraciones aditivas** bajo `supabase/migrations/` (verificar próximo nº libre antes de crear; la serie del pool es 017–019, y el Módulo 1 reserva la 024 — confirmar el siguiente disponible). Candidatas: guard de RLS/CHECK sobre `pool_companies` para vincular solo empresas con `company_links` activo (GAP 1); `award_mode` en `purchase_pools` y, si aplica el Modo B, ganador por `pool_item_contributions` (GAP 2); `pool_number` legible/correlativo (GAP 5); CHECK del `tipo` de evento de historial para soportar participación en pool.
- **GAP 1**: filtrar empresas por `company_links` activo en `CreatePoolDialog.tsx` y en el camino "Invitar Empresa" de `PoolCard`; reforzar con guard DB/RLS en el insert a `pool_companies` (defensa en profundidad: la UI filtra, la DB rechaza).
- **GAP 4**: `updatePoolStatus` en `Pools.tsx` hoy toca solo el `status` legacy → introducir mutaciones que escriban `pool_state`. "Retirarse" valida `pool_state='borrador'`; "Cancelar pool" setea `pool_state='cancelado'` (permitido por un participante una vez `confirmado`).
- **GAP 3**: en `generateSharedRfq` (`usePoolFlow.ts`), tras crear la RFQ, INSERT de `rfq_providers` con la unión de proveedores habilitados por las empresas participantes e invocación de `notify-providers`. Reutilizar el patrón de notificación del flujo de RFQ no-pool.
- **GAP 5**: en `addMyRequirements`, INSERT de evento de historial por requerimiento con el `pool_number` y las empresas participantes; derivar `pool_number` legible (correlativo) a nivel DB.
- **GAP 2**: según la decisión de diseño — agregar `award_mode` y, para Modo B, persistir ganador por contribución; adaptar `usePoolAward.ts` (`adjudicate`/`generateMyOc`) y `PoolAwardPanel`.

## Affected Areas

| Área | Impacto | Descripción |
|------|--------|-------------|
| `supabase/migrations/0XX_*.sql` | New | Guard `pool_companies` (vinculación activa); `award_mode` en `purchase_pools`; `pool_number` correlativo; CHECK tipo de evento de historial |
| `src/components/pools/CreatePoolDialog.tsx` | Modified | Filtrar empresas a vinculadas activas (GAP 1) |
| `src/components/pools/PoolCard.tsx` | Modified | Filtrar "Invitar Empresa" a vinculadas (GAP 1); acciones retiro/cancelar (GAP 4) |
| `src/components/pools/PoolFlowPanel.tsx` | Modified | Wiring de retiro/cancelación y, si aplica, selector de `award_mode` |
| `src/components/pools/PoolAwardPanel.tsx` | Modified | Soporte Modo B — adjudicación por empresa (GAP 2) |
| `src/hooks/usePoolFlow.ts` | Modified | `generateSharedRfq`: unión de proveedores + `notify-providers` (GAP 3); evento de historial en `addMyRequirements` (GAP 5); mutaciones de retiro/cancelar (GAP 4) |
| `src/hooks/usePoolAward.ts` | Modified | `adjudicate`/`generateMyOc` según `award_mode` (GAP 2) |
| `src/pages/Pools.tsx` | Modified | `updatePoolStatus` migra de `status` legacy a `pool_state` (GAP 4) |
| `supabase/functions/notify-providers` | Reused | Invocada desde el despacho del pool (GAP 3) |
| Tablas de historial/evento de requerimiento | Modified | Registrar participación en pool (GAP 5) |

## Risks

| Riesgo | Prob. | Mitigación |
|------|------------|------------|
| Guard RLS/CHECK sobre `pool_companies` bloquea inserts legítimos o de data legacy | Media | Auditar pools existentes antes de aplicar; guard solo rechaza nuevos inserts sin `company_links` activo; ventana de bajo tráfico |
| GAP 2: persistir ganador por-empresa rompe `generateMyOc`/transición a `cerrado` | Media | Decisión de diseño explícita; Modo A default intacto; Modo B detrás de flag `award_mode` |
| Despacho duplica notificaciones o notifica proveedores no deseados | Media | Deduplicar la unión de proveedores; idempotencia en `rfq_providers`; testear `notify-providers` mockeado |
| Capa legacy de `PoolCard` sigue conviviendo con `pool_state` y reintroduce inconsistencias | Media | Neutralizar solo "Invitar Empresa" ahora; documentar follow-up de deprecación del `status` legacy |
| `pool_number` correlativo con concurrencia (carrera al asignar) | Baja | Asignación a nivel DB (secuencia/función), no en cliente |
| Cancelación de pool por un solo participante afecta a otros sin aviso | Media | Confirmación explícita en UI; registrar evento; permitido por spec una vez `confirmado` |

## Rollback Plan

- **Migraciones reversibles**: cada nueva migración incluye su revert. Guard de `pool_companies`: DROP de la policy/constraint restaura el comportamiento anterior. `award_mode`: columna con default `'leader'` → DROP no afecta el Modo A. `pool_number`: columna/secuencia aditiva, DROP-able. CHECK de tipo de evento: DROP+ADD restaurando el set original.
- **Cambios de código revertibles por commit**, agrupados por slice (abajo) para revertir un gap sin arrastrar los demás.
- **RLS**: cualquier policy nueva se prueba contra `is_pool_member`/`company_links` existentes; rollback = DROP POLICY restaurando las de 017–019.

## Dependencies
- Edge function `notify-providers` debe existir y ser invocable desde el contexto del pool (GAP 3).
- `company_links` activos (migración 017) como fuente de verdad del GAP 1.
- Confirmar el próximo número de migración libre antes de crear archivos (serie pool 017–019; Módulo 1 reserva 024).

## Suggested Slicing

Ordenado por prioridad (integridad de regla de negocio primero), cada slice independientemente entregable:

1. **Slice A — GAP 1 (integridad de invitación)** [ALTA]: filtro UI + guard DB/RLS sobre `pool_companies`. Cierra la fuga de la capa legacy. Mínimo riesgo de acople.
2. **Slice B — GAP 4 (retiro/cancelación vía `pool_state`)** [ALTA]: mutaciones + UI; migra `updatePoolStatus` fuera del `status` legacy.
3. **Slice C — GAP 2 (modelo de adjudicación)** [ALTA, requiere diseño]: `award_mode` + Modo B. Bloqueado por la decisión de diseño; entregar tras A/B.
4. **Slice D — GAP 3 (despacho unión de proveedores + notificación)** [MEDIA]: `rfq_providers` + `notify-providers` en `generateSharedRfq`.
5. **Slice E — GAP 5 (historial + `pool_number` legible)** [MEDIA]: evento de participación + correlativo.

## Deuda técnica (nombrada, no necesariamente resuelta aquí)
- **Capa legacy de `PoolCard`**: el enum `status` viejo y sus botones ("Cerrar Pool"/"Iniciar Cotización"/"Invitar Empresa"/"Agregar Pedidos") conviven con el flujo `pool_state`. Es exactamente donde fuga el GAP 1. Follow-up: deprecar y eliminar el `status` legacy una vez consolidado `pool_state`.
- **Búsqueda de vínculos solo por nombre** (spec pide nombre O CUIT).
- **Mapping de materiales con `Select` plano** (spec pide búsqueda asistida por nombre/unidad/código).

## Notas de testing / TDD (Strict TDD activo)
- **GAP 1**: test de que `CreatePoolDialog`/"Invitar Empresa" solo listan empresas con `company_links` activo; test de que el insert a `pool_companies` sin vínculo activo es rechazado (mock supabase / guard).
- **GAP 4**: retiro permitido solo en `borrador`; cancelación setea `pool_state='cancelado'`; `updatePoolStatus` ya no toca el `status` legacy.
- **GAP 2**: Modo A intacto (regresión); Modo B persiste ganador por empresa y `generateMyOc` arma OC por porción; transición a `cerrado` correcta en ambos modos.
- **GAP 3**: `generateSharedRfq` inserta la unión deduplicada de `rfq_providers` e invoca `notify-providers` (mockeado) una sola vez.
- **GAP 5**: `addMyRequirements` emite 1 evento de historial por requerimiento con `pool_number` + empresas; `pool_number` correlativo único.

## Success Criteria
- [ ] No se puede invitar ni iniciar un pool con una empresa sin `company_links` activo (UI y DB).
- [ ] Una empresa puede retirarse de un pool en `borrador`; una vez `confirmado` solo puede cancelar el pool completo (`pool_state='cancelado'`).
- [ ] El pool soporta el modo de adjudicación por defecto (líder) y, vía flag, la adjudicación por empresa.
- [ ] Al despachar la SC compartida, se notifica a la unión de proveedores habilitados por las empresas participantes.
- [ ] El historial de cada requerimiento muestra su participación en el pool (número legible + empresas).
- [ ] `updatePoolStatus` opera sobre `pool_state`, no sobre el `status` legacy.
