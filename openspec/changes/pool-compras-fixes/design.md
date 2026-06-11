# Design — pool-compras-fixes

> Módulo 2 — Pool de Compras (proceso interempresa). Módulo 1 (Consolidación) fuera de alcance.
> Decisiones de negocio cerradas (NO re-abrir): GAP2 Mode B = per-item por empresa; ganador en tabla nueva `pool_company_awards`; transición a `adjudicado` cuando TODAS las empresas participantes adjudicaron; Mode A (líder, `winning_quote_id`) intacto y additivo detrás de `award_mode`. Migraciones nuevas desde **028** (027 es la última existente).

## Constraints reales confirmadas (leídas del código)

| Constraint / Objeto | Tabla / Función | Migración origen | Estado actual relevante |
|---------------------|-----------------|------------------|--------------------------|
| `pool_state` CHECK | `purchase_pools.pool_state` | `018_pool_flow.sql:269` | `('borrador','confirmado','en_comparativa','adjudicado','cerrado','cancelado')` — `cancelado` existe pero ningún flujo lo setea |
| `winning_quote_id` | `purchase_pools` | `019_pool_award.sql:110` | FK → `quotes(id)`; autoritativo SOLO en Mode A |
| `pool_item_contributions` | tabla | `018_pool_flow.sql:282` | grain `(pool_item_id, company_id)`; UNIQUE; "NOT confidential — any pool member can see all contributions" |
| `is_pool_member(uuid)` | función | `018_pool_flow.sql:69` | `SECURITY DEFINER STABLE`; usar SIEMPRE en predicados de membresía (evita recursión RLS) |
| `company_links.status` | tabla | `017_pool_foundation.sql:28` | `('pending','active','disabled')`; UNIQUE por par no ordenado (`uq_company_link_pair`) |
| `pool_companies` RLS | tabla | `018_pool_flow.sql:135` | `member_select` / `owner_insert` (creador) / `own_update` (su propia fila) |
| `chk_evento_tipo` | `requerimiento_evento.tipo` | **`024_consolidacion_fixes.sql:30`** (autoritativa) | **13 valores** — el set de 012 + `'consolidado'`. La 028 DEBE partir de ESTE set, no del de 012. |
| `requerimiento_evento` | tabla | `004_kanban_requerimientos.sql:87` | tiene `metadata jsonb`; RLS scope = empresa dueña del `request` (confidencialidad GAP5 ya garantizada) |
| `providers.company_id` | tabla | `001_initial_schema.sql:367` | FK → companies; **NULL = global**. RLS `providers_tenant` = tenant-scoped (cada empresa ve SOLO sus providers + globales) |
| `rfq_providers` | tabla | `001_initial_schema.sql:404` | `UNIQUE(rfq_id, provider_id)`; RLS `rfq_providers_write` exige `rfq_id IN (rfqs WHERE company_id = auth_company_id())` |
| `notify-providers` | edge function | invocada en `RfqNuevo/RfqCesta/RFQs/SolicitudDirecta` | patrón único: `supabase.functions.invoke("notify-providers", { body: { type: "rfq_sent", rfq_id } })`, envuelto en try/catch |

> **Hallazgo crítico (GAP3):** no existe tabla `company_providers`/`enabled_providers`. "Providers de una empresa" = `providers WHERE company_id = <empresa>` (más globales `company_id IS NULL`). **La selección de providers por pool es MANUAL, no automática:** cada empresa participante elige explícitamente cuáles de SUS propios providers (+ globales) trae a ESE pool específico. Esa selección se persiste en una tabla nueva `pool_providers` (ver Decisión 4). El despacho luego inserta en `rfq_providers` la unión deduplicada de lo seleccionado. Como `rfq_providers_write` exige ser dueño del rfq y la selección cruza tenants (el creador del pool no puede insertar `rfq_providers` con providers ajenos desde el cliente), el insert final requiere un **RPC `SECURITY DEFINER`** que LEE la selección persistida (ya no calcula una unión automática) e inserta de forma idempotente (ver Decisión 4). Es el equivalente al precedente de `create_consolidated_rfq` (024) y `021_consumos_rls_rpc`.

---

## Arquitectura general y patrón

El cambio es **aditivo y por slices**, alineado con el patrón ya establecido en 017–019:

- **DB defense-in-depth:** las invariantes de negocio (GAP1 vínculo activo, GAP2 escritura own-company, GAP3 unión cross-tenant, GAP4 transiciones de estado) viven en la base — vía RLS `WITH CHECK`, triggers, o RPC `SECURITY DEFINER` — y la UI sólo filtra/orquesta. La UI nunca es la única línea de defensa.
- **RPC `SECURITY DEFINER` SOLO donde hay cruce de tenant o atomicidad crítica:** GAP3 (unión cross-company de providers) y la transición de estado de GAP2 Mode B (debe leer awards de TODAS las empresas, lo que un miembro no puede agregar de forma confiable bajo RLS de confidencialidad). Todo lo demás sigue el patrón de inserts cliente + RLS ya usado en `usePoolFlow`/`usePoolAward`.
- **Mode A intacto:** `award_mode` default `'leader'`; toda la rama Mode B está detrás de `award_mode = 'per_company'`. Ningún test de Mode A debe cambiar. `pool_company_awards` no se escribe ni se lee jamás en Mode A.
- **`is_pool_member()` es la primitiva de membresía** en toda policy nueva, igual que 018/019.

### Mapa de componentes y data flow

```
                          ┌────────────────────────────────────────────┐
                          │              purchase_pools                 │
                          │  + award_mode  (028)   + pool_number (028)  │
                          │    winning_quote_id (Mode A, 019)           │
                          │    pool_state                               │
                          └───────┬───────────────────────────┬────────┘
                                  │                            │
            Mode A (líder)        │                            │   Mode B (per-company)
            winning_quote_id ─────┘                            └──── pool_company_awards (028, NEW)
                                                                       grain: (pool_id, company_id, rfq_item_id)
                                                                       → winning_quote_item_id / winning_quote_id

  GAP1: pool_companies INSERT ── trigger guard (028) ──> exige company_links.status='active'
  GAP3: cada empresa selecciona sus providers ── pool_providers (028, NEW) ── RLS write-own-company
        generateSharedRfq ── RPC pool_dispatch_providers(rfq_id) SECURITY DEFINER (029) ──> LEE pool_providers ──> rfq_providers (insert dedup idempotente) ──> notify-providers
  GAP4: usePoolLifecycle (withdraw/cancel) ──> pool_state writeback (NO status legacy)
  GAP5: addMyRequirements ── tras insertar pool_requests ──> requerimiento_evento tipo='pool_joined' (028 amplía chk_evento_tipo) ; pool_number secuencia (028)
```

### Plan de migraciones (resumen — detalle en cada decisión)

| Migración | Qué hace | Gaps | Riesgo |
|-----------|----------|------|--------|
| **028_pool_schema.sql** | (a) `award_mode` text CHECK default `'leader'`; (b) `pool_number` bigint + secuencia + backfill + NOT NULL + UNIQUE; (c) ampliar `chk_evento_tipo` += `'pool_joined'` (partiendo del set de 024); (d) tabla `pool_company_awards` + RLS; (e) tabla `pool_providers` (selección manual de providers por pool) + RLS write-own-company; (f) trigger guard `pool_companies` (vínculo activo); (g) trigger inmutabilidad `award_mode` post-borrador | 1,2,3,5 | Medio (trigger guard sobre inserts; DDL aditivo) |
| **029_pool_award_dispatch_rpc.sql** | RPC `pool_dispatch_providers(p_rfq_id)` `SECURITY DEFINER` (LEE la selección persistida en `pool_providers`, dedup + insert idempotente en `rfq_providers`); RPC `pool_finalize_award_mode_b(p_pool_id)` para evaluar/transicionar a `adjudicado` leyendo awards de todas las empresas | 2,3 | Medio (SECURITY DEFINER; correr DESPUÉS de que existan award_mode, pool_company_awards y pool_providers) |

> **Por qué dos migraciones y no una:** 028 es DDL puro (columnas, tablas, triggers, CHECK) — bajo y atómico. 029 son funciones `SECURITY DEFINER`/`INVOKER` que dependen de objetos creados en 028 (`pool_company_awards`, `award_mode`, `pool_providers`). Separarlas da un boundary de rollback limpio: revertir las funciones no toca el esquema, y revertir el esquema 028 no deja funciones colgadas. Numeración correlativa 028 → 029 sin huecos.

---

## Decisión 1 — GAP 1: Guard de invitación (empresa vinculada)

### 1a. Backend — trigger `BEFORE INSERT` sobre `pool_companies` (no RLS WITH CHECK)

**Decisión: trigger `BEFORE INSERT`, NO una nueva `WITH CHECK` en la policy de INSERT.**

**Por qué trigger y no RLS:**

| Opción | Pros | Contras |
|--------|------|---------|
| Ampliar `pool_companies_owner_insert` con `AND EXISTS(company_links activo)` | Mismo lugar que la regla de ownership | RLS `WITH CHECK` no produce un mensaje de error de negocio claro (da "new row violates row-level security policy"); además mezcla dos invariantes distintas (ownership + vínculo) en una sola policy, difícil de testear y revertir aislado |
| **Trigger `BEFORE INSERT` que valida vínculo activo y `RAISE EXCEPTION`** | Mensaje de negocio explícito ("No se puede invitar una empresa sin vínculo activo"); se revierte con `DROP TRIGGER` sin tocar las policies de 018; testeable de forma aislada; **defensa independiente** del filtro UI | Una primitiva más (trigger + función) |

El trigger valida: existe un `company_links` con `status='active'` que une la `company_id` que se inserta con la empresa **dueña del pool** (`purchase_pools.company_id` del `NEW.pool_id`). La propia empresa creadora insertándose a sí misma se permite (no requiere vínculo consigo misma).

```sql
CREATE OR REPLACE FUNCTION pool_companies_link_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_owner uuid;
BEGIN
  SELECT company_id INTO v_owner FROM purchase_pools WHERE id = NEW.pool_id;
  -- La empresa creadora puede unirse a su propio pool sin vínculo.
  IF NEW.company_id = v_owner THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM company_links cl
    WHERE cl.status = 'active'
      AND (
        (cl.requester_company_id = v_owner AND cl.target_company_id = NEW.company_id)
        OR
        (cl.target_company_id = v_owner AND cl.requester_company_id = NEW.company_id)
      )
  ) THEN
    RAISE EXCEPTION 'No se puede agregar una empresa sin vínculo activo con la empresa creadora del pool.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_pool_companies_link_guard
  BEFORE INSERT ON pool_companies
  FOR EACH ROW EXECUTE FUNCTION pool_companies_link_guard();
```

> **Filas legacy:** `BEFORE INSERT` sólo afecta inserts NUEVOS — las filas existentes de `pool_companies` no se tocan (cumple el escenario "Existing pool_companies rows are unaffected"). No hay `NOT VALID`/`VALIDATE` porque no es un CHECK constraint sobre datos históricos.

**Auditoría previa (mitigación de riesgo):** antes de aplicar 028 en prod, correr una query que liste `pool_companies` cuyo par (owner, company) NO tenga `company_links` activo. Si hay filas, son legacy y el trigger NO las invalida (sólo bloquea futuros inserts), pero conviene saberlo. Documentar el resultado en el PR.

### 1b. Frontend — filtro en `CreatePoolDialog` y "Invitar Empresa" de `PoolCard`

Ambos puntos cargan la lista de empresas invitables desde el mismo origen: empresas con `company_links.status='active'` que unen a la empresa del usuario. Patrón de query (mirror del `materials_select_linked_company` de 017):

```ts
// linked companies = parties del otro lado de un company_links activo de mi empresa
const { data } = await supabase
  .from("company_links")
  .select("requester_company_id, target_company_id, status, "
    + "requester:requester_company_id(id,name), target:target_company_id(id,name)")
  .eq("status", "active");
// map → la "otra" empresa (la que no es la mía) → {id, name}
```

- **`CreatePoolDialog`**: reemplazar la query de "todas las empresas" por la de vinculadas activas. Empty state explícito: "No tenés empresas vinculadas. Creá un vínculo activo primero." (cubre el escenario de lista vacía del spec).
- **`PoolCard` "Invitar Empresa"** (camino legacy): aplicar el MISMO filtro. Esto neutraliza la fuga sin remover la capa legacy (deuda técnica nombrada en el proposal). Sólo se filtra el origen de datos del Select de invitación.

> **Defensa en profundidad confirmada:** UI filtra (1b) + DB rechaza (1a). Un POST directo a la API saltando la UI choca con el trigger.

---

## Decisión 2 — GAP 2: Award Mode (líder vs. por empresa)

### 2a. Flag `award_mode` en `purchase_pools` (028)

```sql
ALTER TABLE purchase_pools
  ADD COLUMN IF NOT EXISTS award_mode text NOT NULL DEFAULT 'leader'
  CHECK (award_mode IN ('leader', 'per_company'));
```

Default `'leader'` → todos los pools existentes quedan en Mode A sin backfill ni cambio de comportamiento. Inmutable post-`borrador` vía trigger `BEFORE UPDATE` (resuelve "award_mode is immutable after confirmado"):

```sql
CREATE OR REPLACE FUNCTION purchase_pools_award_mode_lock()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.award_mode IS DISTINCT FROM OLD.award_mode
     AND OLD.pool_state <> 'borrador' THEN
    RAISE EXCEPTION 'award_mode no puede cambiarse una vez que el pool dejó borrador.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_purchase_pools_award_mode_lock
  BEFORE UPDATE ON purchase_pools
  FOR EACH ROW EXECUTE FUNCTION purchase_pools_award_mode_lock();
```

### 2b. Persistencia del ganador Mode B — tabla nueva `pool_company_awards` (028)

**Grain decidido: per (pool, company, rfq_item) → quote_item ganador.** El scope per-item (decisión cerrada) exige granularidad por ítem, no por quote. Se ancla al `rfq_item_id` de la SC compartida (el universo de ítems que todas las empresas ven en la comparativa), y se guarda el `quote_item_id` ganador (que ya lleva el `quote_id` y el `provider_id` resueltos vía join). Guardar `quote_item_id` (no sólo `quote_id`) es lo que habilita "distinto proveedor por ítem".

```sql
CREATE TABLE pool_company_awards (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id               uuid NOT NULL REFERENCES purchase_pools(id) ON DELETE CASCADE,
  company_id            uuid NOT NULL REFERENCES companies(id)      ON DELETE CASCADE,
  rfq_item_id           uuid NOT NULL REFERENCES rfq_items(id)      ON DELETE CASCADE,
  winning_quote_item_id uuid NOT NULL REFERENCES quote_items(id)    ON DELETE CASCADE,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pool_id, company_id, rfq_item_id)
);

CREATE INDEX idx_pool_company_awards_pool          ON pool_company_awards (pool_id);
CREATE INDEX idx_pool_company_awards_pool_company  ON pool_company_awards (pool_id, company_id);
```

**Por qué tabla nueva y NO columnas en `pool_item_contributions` (decisión cerrada, fundamentada):**
- `pool_item_contributions` tiene grain `(pool_item_id, company_id)` — NO tiene `rfq_item_id`. El award per-item se ancla al `rfq_item_id` de la SC, no al `pool_item_id` de consolidación. Forzarlo ahí mezclaría dos conceptos (contribución de cantidad vs. elección de proveedor) y rompería su semántica "NOT confidential / sumatoria = total".
- Una tabla dedicada da UNIQUE limpio, RLS propio member-scoped write-own, y rollback `DROP TABLE` sin tocar 018.

**RLS de `pool_company_awards` — member-read, write-own-company (espejo de `pool_item_contributions` de 018):**

```sql
ALTER TABLE pool_company_awards ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier miembro del pool ve todas las filas (señal agregada "todos adjudicaron").
-- Justificación de visibilidad member-wide: awards/contributions YA son no-confidenciales
-- por 018 (pool_item_contributions: "any pool member can see all contributions"). El award
-- expone solo "empresa X eligió quote_item Y" — el quote_item de un proveedor en la SC
-- compartida ya es visible a todos los miembros vía las policies AD-1 de 019. NO expone
-- el request/precio/cantidad interno de otra empresa (eso vive en pool_requests, aislado).
CREATE POLICY "pool_company_awards_member_select"
  ON pool_company_awards FOR SELECT TO authenticated
  USING ( is_pool_member(pool_company_awards.pool_id) );

-- INSERT/UPDATE/DELETE: miembro del pool Y sólo su propia empresa.
CREATE POLICY "pool_company_awards_own_insert"
  ON pool_company_awards FOR INSERT TO authenticated
  WITH CHECK (
    is_pool_member(pool_company_awards.pool_id)
    AND company_id = (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid())
  );

CREATE POLICY "pool_company_awards_own_update"
  ON pool_company_awards FOR UPDATE TO authenticated
  USING (
    is_pool_member(pool_company_awards.pool_id)
    AND company_id = (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid())
  )
  WITH CHECK (
    is_pool_member(pool_company_awards.pool_id)
    AND company_id = (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid())
  );

CREATE POLICY "pool_company_awards_own_delete"
  ON pool_company_awards FOR DELETE TO authenticated
  USING (
    is_pool_member(pool_company_awards.pool_id)
    AND company_id = (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid())
  );
```

> **Llamada sobre confidencialidad (explícita, como pidió el constraint):** el award SÍ es visible member-wide. Esto NO viola el invariante porque (a) 018 ya declara contributions/awards no-confidenciales, y (b) el `quote_item` referenciado pertenece a la comparativa compartida que TODOS los miembros leen por 019. Lo que permanece aislado (pool_requests = el detalle de requerimiento interno por empresa) no se toca. La señal "qué proveedor eligió la empresa X" es justamente la información agregada que el spec permite compartir ("all companies have decided"). Se elige member-wide read para poder calcular la transición a `adjudicado` y mostrar progreso, sin exponer datos internos.

### 2c. ¿Quién dispara la transición a `adjudicado` en Mode B? — RPC `SECURITY DEFINER` (029)

**Open Question 2 resuelta:** el cliente NO puede evaluar de forma confiable "todas las empresas adjudicaron" porque necesitaría contar awards de empresas ajenas y rfq_items por empresa. Aunque el SELECT de awards es member-wide, la **escritura de `pool_state`** y la lógica de completitud deben ser server-side para evitar carreras (dos empresas confirmando casi simultáneamente). Se usa un RPC `pool_finalize_award_mode_b(p_pool_id)` `SECURITY DEFINER` que:

1. Determina los `rfq_item_id` de la SC del pool y, por cada empresa participante, qué ítems le corresponden (los que tiene contribución `pool_item_contributions` mapeada a ese material → rfq_item).
2. Verifica que cada empresa participante tiene un award para CADA uno de SUS ítems.
3. Si TODAS están completas → `UPDATE purchase_pools SET pool_state='adjudicado'` (sólo si estaba en `en_comparativa`, idempotente). Si no, no hace nada.

El cliente llama este RPC al final de cada confirmación de award de una empresa. Así el "último que confirma" dispara la transición sin que ninguna empresa tenga que coordinar.

```
client (company A confirma sus awards)
   └─> INSERT/UPSERT pool_company_awards (RLS own-company)  [N filas, una por rfq_item de A]
   └─> rpc pool_finalize_award_mode_b(pool_id)  [SECURITY DEFINER, idempotente]
          └─> ¿todas las empresas completas? → pool_state='adjudicado' | no-op
```

### 2d. Contrato de renderizado `PoolAwardPanel` ↔ `usePoolAward` (Open Question 4)

`usePoolAward` expone `awardMode: 'leader' | 'per_company'` (leído de `purchase_pools.award_mode`) y bifurca:

| | Mode A (`leader`) | Mode B (`per_company`) |
|---|---|---|
| Acción de adjudicar | `adjudicate(poolId, winningQuoteId)` (existente, intacta) → set `winning_quote_id` + `pool_state='adjudicado'` | `confirmMyAward(poolId, awards: {rfqItemId, quoteItemId}[])` (nuevo) → UPSERT `pool_company_awards` (own-company) + `rpc pool_finalize_award_mode_b` |
| Quién adjudica | sólo el líder (gated en UI; en DB cualquier miembro puede, el líder es convención de UI) | cada empresa, sólo su porción |
| Transición a `adjudicado` | inmediata en `adjudicate` | sólo cuando el RPC detecta completitud global |
| `generateMyOc` | resuelve `winning_quote_id` (existente, intacto) | resuelve los `pool_company_awards` de MI empresa → arma OC per-item con el `quote_item` ganado por ítem |
| `PoolAwardPanel` UI | comparativa con UN ganador seleccionable (rendering actual) | grilla per-item donde MI empresa elige proveedor por ítem; muestra progreso "X de N empresas adjudicaron" desde el SELECT member-wide |

**`generateMyOc` en Mode B (refactor de `usePoolAward.ts`):** en vez de un único `winning_quote_id`, agrupa los `pool_company_awards` de mi empresa por `provider_id` (resuelto vía `quote_item → quote → provider_id`). Si una empresa eligió distintos proveedores por ítem, se generan **múltiples OC (una por proveedor)**. Esto es coherente con el modelo per-item flexible: una OC por proveedor ganador. El guard de doble-generación pasa de "tiene PO para el rfq" a "tiene PO por (rfq, provider)".

> **No regresión Mode A:** todo el bloque `adjudicate`/`winning_quote_id`/`generateMyOc` actual permanece byte-por-byte para `award_mode='leader'`. La bifurcación es un `if (awardMode === 'per_company')` al tope de cada mutación. Los tests existentes de Mode A no se tocan.

### Sequence diagram — GAP2 Mode B: award → OC

```
 Company A user        PoolAwardPanel     usePoolAward      Supabase RLS        RPC (DEFINER)
      │                      │                 │                  │                  │
      │ select provider     │                 │                  │                  │
      │ per item (A's items)│                 │                  │                  │
      ├─────────────────────>                 │                  │                  │
      │  Confirmar mi adjud. │ confirmMyAward  │                  │                  │
      │                      ├────────────────>│                  │                  │
      │                      │                 │ UPSERT pool_company_awards (own)    │
      │                      │                 ├─────────────────>│  (RLS own-company)
      │                      │                 │<─────────────────┤  ok              │
      │                      │                 │ rpc pool_finalize_award_mode_b      │
      │                      │                 ├────────────────────────────────────>│
      │                      │                 │                  │  ¿todas completas?│
      │                      │                 │                  │   A sí, B no → no-op
      │                      │                 │<────────────────────────────────────┤
      │                      │  pool_state sigue en_comparativa   │                  │
      │ ...                  │                 │                  │                  │
 (Company B confirma sus awards igual; en SU llamada el RPC detecta completitud)
      │                      │                 │ rpc pool_finalize_award_mode_b      │
      │                      │                 ├────────────────────────────────────>│
      │                      │                 │                  │  todas completas →│
      │                      │                 │                  │  pool_state='adjudicado'
      │                      │                 │<────────────────────────────────────┤
      │ generateMyOc (A)     │                 │                  │                  │
      ├─────────────────────────────────────> │ read A's pool_company_awards (own)  │
      │                      │                 │ group by provider → OC per provider │
      │                      │                 │ INSERT purchase_orders + items      │
      │                      │                 │ if all companies have PO → cerrado  │
```

---

## Decisión 3 — GAP 4: Retiro y cancelación (vía `pool_state`)

### 3a. Nuevo hook `usePoolLifecycle` (o ampliar `usePoolFlow`)

Tres mutaciones, todas escriben `pool_state` (nunca `status` legacy):

| Acción | Precondición (DB-enforced) | Efecto |
|--------|----------------------------|--------|
| `withdrawFromPool(poolId)` | `pool_state='borrador'` | DELETE de la fila propia en `pool_companies`; si la empresa era el creador y no quedan otros miembros → `pool_state='cancelado'` |
| `cancelPool(poolId)` | `pool_state NOT IN ('cerrado','cancelado')` | `pool_state='cancelado'` |
| `updatePoolStatus` (migrar) | — | reescribir para tocar `pool_state`, NO `status` |

### 3b. Enforcement de transiciones — trigger de validación (no sólo cliente)

Las precondiciones de estado (retiro sólo en borrador; cancel no desde cerrado/cancelado) se validan en un **trigger `BEFORE UPDATE`/`BEFORE DELETE`** para que un cliente que mande el UPDATE/DELETE crudo no rompa la regla. Patrón: una función que valide la transición de `pool_state` contra una whitelist.

```sql
-- Guard de cancelación: bloquea pool_state -> cancelado desde cerrado/cancelado.
CREATE OR REPLACE FUNCTION purchase_pools_state_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.pool_state = 'cancelado' AND OLD.pool_state IN ('cerrado','cancelado') THEN
    RAISE EXCEPTION 'No se puede cancelar un pool % .', OLD.pool_state USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $$;
-- (se fusiona con trg_purchase_pools_award_mode_lock en un único BEFORE UPDATE trigger por orden)
```

Para el retiro (DELETE en `pool_companies`), un trigger `BEFORE DELETE` que exija `pool_state='borrador'` del pool referido:

```sql
CREATE OR REPLACE FUNCTION pool_companies_withdraw_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_state text;
BEGIN
  SELECT pool_state INTO v_state FROM purchase_pools WHERE id = OLD.pool_id;
  IF v_state <> 'borrador' THEN
    RAISE EXCEPTION 'Solo se puede retirar de un pool en borrador. Estado actual: %', v_state
      USING ERRCODE='P0001';
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER trg_pool_companies_withdraw_guard
  BEFORE DELETE ON pool_companies
  FOR EACH ROW EXECUTE FUNCTION pool_companies_withdraw_guard();
```

> **Nota de migración:** estos triggers de GAP4 son DDL aditivo. Por proximidad conceptual con los triggers de estado de GAP2 (`award_mode_lock`) podrían vivir en 028. **Decisión:** poner los triggers de estado de `purchase_pools` (award_mode_lock + state_guard) y el `pool_companies_withdraw_guard` en **028** junto al resto del esquema, ya que no dependen del RPC de 029. El `DELETE` policy sobre `pool_companies` no existe hoy (018 sólo definió select/insert/update) → **agregar `pool_companies_own_delete`** (miembro puede borrar su propia fila) en 028.

```sql
CREATE POLICY "pool_companies_own_delete"
  ON pool_companies FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.company_id = pool_companies.company_id)
  );
```

### 3c. UI — acciones por estado (`PoolFlowPanel` / `PoolCard`)

Tabla de visibilidad del spec → render condicional por `pool_state`:

| pool_state | Retirarse | Cancelar |
|------------|-----------|----------|
| borrador | visible | visible (con confirm) |
| confirmado | oculto/disabled + tooltip | visible (con confirm) |
| en_comparativa | oculto | visible (con confirm) |
| adjudicado | oculto | visible (con confirm) |
| cerrado / cancelado | oculto | oculto |

Cancelar usa `AlertDialog` de confirmación (irreversibilidad + "afecta a todos los participantes" cuando `pool_state != 'borrador'`). `updatePoolStatus` en `Pools.tsx` se reescribe para `.update({ pool_state: ... })`.

### Sequence diagram — GAP4 withdraw / cancel

```
 member        PoolFlowPanel       usePoolLifecycle      Supabase (RLS + triggers)
   │                │                     │                       │
   │ Retirarse      │                     │                       │
   ├───────────────>│ AlertDialog confirm │                       │
   │   confirm      ├────────────────────>│ DELETE pool_companies (own row)
   │                │                     ├──────────────────────>│ trg_withdraw_guard:
   │                │                     │                       │   pool_state='borrador'? sí→ok / no→RAISE
   │                │                     │ if creator & no others left:
   │                │                     │   UPDATE pool_state='cancelado'
   │                │                     │<──────────────────────┤
   │                │                     │                       │
   │ Cancelar Pool  │                     │                       │
   ├───────────────>│ AlertDialog (irrev.,│                       │
   │   confirm      │  afecta a todos)    │ UPDATE pool_state='cancelado'
   │                ├────────────────────>├──────────────────────>│ trg_state_guard:
   │                │                     │                       │   OLD in (cerrado,cancelado)? → RAISE
   │                │                     │<──────────────────────┤ ok
```

---

## Decisión 4 — GAP 3: Despacho como unión de proveedores SELECCIONADOS + notify

> **Cambio de modelo (decisión de cliente, OVERRIDE del diseño previo):** los providers del pool NO se unen automáticamente. Cada empresa participante **selecciona manualmente** cuáles de SUS propios providers (+ globales) habilita "para ese pool específico". El conjunto despachado = unión deduplicada de lo seleccionado por cada empresa. Los **globales (`company_id IS NULL`) SÍ son seleccionables** (antes estaban excluidos).

### 4a. Selección manual por pool — tabla nueva `pool_providers` (028)

**Decisión: tabla dedicada `pool_providers`, NO reusar `rfq_providers` para la selección.**

**Por qué tabla nueva y no escribir `rfq_providers` directo:**

| Opción | Pros | Contras |
|--------|------|---------|
| Que cada empresa escriba `rfq_providers` directo | Una tabla menos | El rfq del pool pertenece a la empresa creadora; `rfq_providers_write` (001) exige `rfq_id IN (rfqs WHERE company_id = auth_company_id())` → las empresas NO-creadoras NO pueden insertar su selección. Además la selección debe poder hacerse ANTES de existir el rfq (en `borrador`/`confirmado`, antes de despachar) — el rfq recién nace en `generateSharedRfq`. Y se perdería la atribución `selected_by_company_id` necesaria para RLS write-own. |
| **Tabla `pool_providers` (pool_id, provider_id, selected_by_company_id)** | RLS write-own-company limpia; selección persistible antes del despacho; atribución por empresa para escritura; rollback `DROP TABLE` sin tocar `rfq_providers`; el despacho la consume y dedup → `rfq_providers` (donde la atribución NO se persiste, preservando confidencialidad) | Una tabla más |

```sql
CREATE TABLE pool_providers (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id                uuid NOT NULL REFERENCES purchase_pools(id) ON DELETE CASCADE,
  provider_id            uuid NOT NULL REFERENCES providers(id)      ON DELETE CASCADE,
  selected_by_company_id uuid NOT NULL REFERENCES companies(id)      ON DELETE CASCADE,
  created_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  -- Una empresa marca un provider para un pool una sola vez. Dos empresas pueden
  -- marcar el MISMO provider (p. ej. un global) → la dedup a rfq_providers ocurre en el despacho.
  UNIQUE (pool_id, provider_id, selected_by_company_id)
);

CREATE INDEX idx_pool_providers_pool         ON pool_providers (pool_id);
CREATE INDEX idx_pool_providers_pool_company ON pool_providers (pool_id, selected_by_company_id);
```

**Candidate set que una empresa puede seleccionar** = sus propios providers ∪ globales:

```
providers WHERE company_id = <mi empresa>  OR  company_id IS NULL
```

Este candidate set ya es exactamente lo que la RLS `providers_tenant` (001) le deja LEER a cada empresa desde el cliente — no hace falta DEFINER para listar candidatos ni para insertar la selección propia. La selección se hace con inserts normales del cliente bajo RLS.

**RLS de `pool_providers` — member-read, write-own-company:**

```sql
ALTER TABLE pool_providers ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier miembro del pool ve la selección consolidada (qué providers entran al pool).
-- Esto NO expone la lista privada de providers de otra empresa fuera del pool: sólo revela
-- "estos providers fueron habilitados PARA este pool". Ver llamada de confidencialidad (4b).
CREATE POLICY "pool_providers_member_select"
  ON pool_providers FOR SELECT TO authenticated
  USING ( is_pool_member(pool_providers.pool_id) );

-- INSERT/DELETE: miembro del pool Y sólo en nombre de su propia empresa, Y el provider debe ser
-- elegible para esa empresa (propio o global). El predicado de elegibilidad replica providers_tenant.
CREATE POLICY "pool_providers_own_insert"
  ON pool_providers FOR INSERT TO authenticated
  WITH CHECK (
    is_pool_member(pool_providers.pool_id)
    AND selected_by_company_id = (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM providers pr
      WHERE pr.id = pool_providers.provider_id
        AND (pr.company_id = pool_providers.selected_by_company_id OR pr.company_id IS NULL)
    )
  );

CREATE POLICY "pool_providers_own_delete"
  ON pool_providers FOR DELETE TO authenticated
  USING (
    is_pool_member(pool_providers.pool_id)
    AND selected_by_company_id = (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid())
  );
```

> No hay UPDATE: la selección es add/remove (insert/delete de filas), no mutación de filas existentes.

### 4b. Confidencialidad y decisiones finas

- **Globales (`company_id IS NULL`):** SÍ seleccionables (cambio respecto del diseño previo). Forman parte del candidate set de toda empresa. Sólo entran al pool si alguna empresa los selecciona explícitamente — no se incluyen "por defecto".
- **Confidencialidad — llamada explícita:** la RLS de `SELECT` de `pool_providers` es member-wide. Esto significa que un miembro ve la lista consolidada de providers habilitados PARA el pool, incluyendo cuál empresa los seleccionó (`selected_by_company_id`). **Decisión:** se acepta esta visibilidad porque (a) habilitar un provider para un pool compartido es un acto deliberado de colaboración, no una fuga de la lista privada general de la empresa; (b) la identidad de los proveedores en una SC compartida es información operativa del pool, no secreto comercial sensible en este dominio; (c) NO se expone la lista de providers de una empresa FUERA del pool — sólo lo que ella misma marcó para este pool. Si el negocio considerara la atribución sensible, se puede ocultar `selected_by_company_id` en la vista de UI sin cambiar el esquema (la columna sigue siendo necesaria para la RLS write-own). El `rfq_providers` resultante NO persiste atribución alguna (cumple el invariante "rfq_providers MUST NOT record which company contributed each provider").
- **Idempotencia del despacho:** `ON CONFLICT (rfq_id, provider_id) DO NOTHING` usa el UNIQUE existente de `rfq_providers` (001). Re-ejecutar `generateSharedRfq` para el mismo rfq no duplica filas. El COUNT final es estable.
- **Filtro por material:** el spec dice "enabled by company for the materials". No existe relación provider↔material en el esquema; con selección manual, "habilitado para el pool" lo decide la empresa explícitamente, lo cual es MÁS fiel al spec del cliente que cualquier inferencia automática por material. Anotado.

### 4c. RPC de despacho — `pool_dispatch_providers(p_rfq_id)` `SECURITY DEFINER` (029)

El RPC ya NO calcula una unión automática: **LEE la selección persistida en `pool_providers`** y la dedup por `provider_id` hacia `rfq_providers`. Sigue siendo `SECURITY DEFINER` porque el insert en `rfq_providers` cruza tenant (providers de empresas no-creadoras referenciados sobre el rfq de la creadora) y la RLS `rfq_providers_write` lo bloquearía desde el cliente. Autocomprueba membresía. Mismo precedente que `create_consolidated_rfq` (024).

```sql
CREATE OR REPLACE FUNCTION pool_dispatch_providers(p_rfq_id uuid)
RETURNS int  -- cantidad de providers en rfq_providers (0 = no notificar)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pool_id uuid; v_count int;
BEGIN
  SELECT pool_id INTO v_pool_id FROM rfqs WHERE id = p_rfq_id;
  IF v_pool_id IS NULL THEN
    RAISE EXCEPTION 'rfq % no es un pool rfq', p_rfq_id USING ERRCODE='P0001';
  END IF;

  -- Autorización manual (porque DEFINER bypassa RLS): el caller debe ser miembro del pool.
  IF NOT is_pool_member(v_pool_id) THEN
    RAISE EXCEPTION 'no autorizado' USING ERRCODE='P0001';
  END IF;

  -- LEE la selección manual persistida (NO unión automática) y la dedup por provider_id.
  -- Dos empresas pueden haber seleccionado el mismo provider (p. ej. un global) → DISTINCT colapsa.
  -- Insert idempotente vía ON CONFLICT (rfq_id, provider_id) DO NOTHING.
  WITH selected AS (
    SELECT DISTINCT pp.provider_id
    FROM pool_providers pp
    JOIN providers pr ON pr.id = pp.provider_id
    WHERE pp.pool_id = v_pool_id
      AND pr.active = true
  )
  INSERT INTO rfq_providers (rfq_id, provider_id)
  SELECT p_rfq_id, provider_id FROM selected
  ON CONFLICT (rfq_id, provider_id) DO NOTHING;

  SELECT COUNT(*) INTO v_count FROM rfq_providers WHERE rfq_id = p_rfq_id;
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION pool_dispatch_providers(uuid) TO authenticated;
```

> **Conjunto vacío:** si ninguna empresa seleccionó providers para el pool, `pool_providers` está vacío → no se inserta nada → COUNT=0 → no se notifica (cumple el escenario "no enabled providers").

### 4d. UI — selección de providers por pool

Cada empresa participante, mientras el pool está en `borrador`/`confirmado` (antes de despachar la SC), marca sus providers para el pool desde un panel (p. ej. `PoolProvidersPanel` dentro de `PoolFlowPanel`). El selector ofrece el candidate set `providers WHERE company_id = <mi empresa> OR company_id IS NULL` (lo que la RLS ya le deja leer) con checkboxes; marcar = INSERT en `pool_providers` (own-company), desmarcar = DELETE. La lista consolidada member-wide muestra qué providers ya entran al pool. Hook nuevo `usePoolProviders(poolId)`:

```ts
// candidatos = mis providers + globales (RLS providers_tenant ya filtra a eso)
const candidates = await supabase.from("providers")
  .select("id,name,company_id")
  .or(`company_id.eq.${myCompanyId},company_id.is.null`);

// marcar para el pool
await supabase.from("pool_providers")
  .insert({ pool_id, provider_id, selected_by_company_id: myCompanyId });
// desmarcar
await supabase.from("pool_providers")
  .delete().match({ pool_id, provider_id, selected_by_company_id: myCompanyId });
```

### 4e. Wiring en `generateSharedRfq` (`usePoolFlow.ts`)

Sin cambios respecto del contrato de despacho previo — sólo cambia QUÉ lee el RPC (selección persistida, no unión). Tras crear el rfq + rfq_items + set `pool_state='en_comparativa'` (todo existente):

```ts
// 1. Insertar rfq_providers desde la selección persistida (cross-tenant, vía RPC DEFINER).
const { data: providerCount, error: dispErr } =
  await supabase.rpc("pool_dispatch_providers", { p_rfq_id: rfqId });
if (dispErr) throw dispErr;

// 2. Notificar sólo si hay providers — mismo patrón que el flujo no-pool.
if ((providerCount ?? 0) > 0) {
  await supabase.functions.invoke("notify-providers", {
    body: { type: "rfq_sent", rfq_id: rfqId },
  });
}
```

- **Una sola invocación** de `notify-providers` por despacho, reutilizando el patrón exacto del flujo no-pool (`RfqNuevo`/`RfqCesta`). No se introduce un segundo mecanismo.
- **Selección vacía → no notificar** (cumple el escenario "no enabled providers").
- **Failure isolation:** el rfq + rfq_providers ya quedaron escritos por el RPC antes del invoke. Si `notify-providers` falla, se propaga el error pero esas filas persisten → reintento re-invoca sin recrear rfq. (El spec exige no rollback de esas filas.)

> **Diferencia con el flujo no-pool:** `RfqNuevo` envuelve el invoke en try/catch silencioso. El spec de GAP3 (Failure Isolation) pide **surface** del error al caller. Decisión: en el pool, NO silenciar — propagar el error del invoke para que la UI muestre "SC creada, falló la notificación, reintentá". Las filas ya escritas habilitan el retry.

### Sequence diagram — GAP3 selección manual → despacho → notify

```
 Company A user   Company B user   PoolProvidersPanel   usePoolFlow.generateSharedRfq   Supabase   RPC (DEFINER)   notify-providers
      │                │                  │                       │                        │             │              │
      │ marca P1,P2 (propios+global)      │                       │                        │             │              │
      ├──────────────────────────────────>│ INSERT pool_providers (selected_by=A)          │             │              │
      │                │                  ├───────────────────────────────────────────────>│ (RLS own-company A)        │
      │                │ marca P2,P3       │                       │                        │             │              │
      │                ├──────────────────>│ INSERT pool_providers (selected_by=B)          │             │              │
      │                │                  ├───────────────────────────────────────────────>│ (RLS own-company B)        │
      │   (P2 quedó seleccionado por A y por B — dedup ocurre en el despacho)              │             │              │
      │                │                  │                       │                        │             │              │
      │ Despachar SC   │                  │                       │ INSERT rfqs(pool)+items │             │              │
      ├──────────────────────────────────────────────────────────>├───────────────────────>│             │              │
      │                │                  │                       │ UPDATE pool_state=en_comparativa      │              │
      │                │                  │                       ├───────────────────────>│             │              │
      │                │                  │                       │ rpc pool_dispatch_providers(rfq_id)   │              │
      │                │                  │                       ├─────────────────────────────────────>│              │
      │                │                  │                       │           is_pool_member? sí          │              │
      │                │                  │                       │           LEE pool_providers (A∪B) dedup → {P1,P2,P3} │
      │                │                  │                       │           INSERT rfq_providers ON CONFLICT DO NOTHING│
      │                │                  │                       │<─────────────────────────────────────┤ return count=3
      │                │                  │                       │ if count>0: invoke notify-providers {rfq_id}         │
      │                │                  │                       ├────────────────────────────────────────────────────>│
      │                │                  │                       │           resuelve rfq_providers, envía              │
      │                │                  │                       │<────────────────────────────────────────────────────┤
      │  (count=0 → skip invoke; error en invoke → propaga, filas persisten para retry)                                 │
```

---

## Decisión 5 — GAP 5: Historial de pool + `pool_number`

### 5a. `pool_number` correlativo (028) — patrón de 025

Réplica exacta del patrón `rfq_number` (025): secuencia + columna nullable + backfill ordenado por `created_at` + `setval` + default `nextval` + NOT NULL + UNIQUE index. Asignación 100% a nivel DB (cumple "no client-side", "no race", "NOT NULL").

```sql
CREATE SEQUENCE IF NOT EXISTS purchase_pools_pool_number_seq;
ALTER TABLE purchase_pools ADD COLUMN IF NOT EXISTS pool_number bigint;
UPDATE purchase_pools SET pool_number = sub.rn
FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn FROM purchase_pools) sub
WHERE purchase_pools.id = sub.id AND purchase_pools.pool_number IS NULL;
SELECT setval('purchase_pools_pool_number_seq', COALESCE((SELECT MAX(pool_number) FROM purchase_pools), 0));
ALTER TABLE purchase_pools ALTER COLUMN pool_number SET DEFAULT nextval('purchase_pools_pool_number_seq');
ALTER TABLE purchase_pools ALTER COLUMN pool_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_pools_pool_number ON purchase_pools(pool_number);
```

### 5b. Evento de historial `pool_joined` (028 amplía `chk_evento_tipo`)

**Valor del tipo decidido: `'pool_joined'`.** La 028 reescribe `chk_evento_tipo` partiendo del set autoritativo de **024 (13 valores)** + `'pool_joined'` (14 valores). NO partir del set de 012.

```sql
ALTER TABLE requerimiento_evento DROP CONSTRAINT IF EXISTS chk_evento_tipo;
ALTER TABLE requerimiento_evento ADD CONSTRAINT chk_evento_tipo
  CHECK (tipo IN ('creado','pendiente','en_curso','recibido',
                  'procesado_parcial','procesado_total','rechazado',
                  'item_actualizado','nota','recepcion_obra',
                  'solicitud_cotizacion','procesado','consolidado',
                  'pool_joined'));
```

### 5c. Inserción del evento en `addMyRequirements` — atomicidad vía RPC

El spec exige que si el INSERT del evento falla (p. ej. CHECK), TODA la operación se revierta — `pool_requests` no debe quedar parcial. Supabase JS no da transacción multi-statement desde el cliente. Hoy `addMyRequirements` hace un único INSERT a `pool_requests`. Agregar el INSERT de eventos como segundo statement best-effort deja la ventana de inconsistencia que el spec prohíbe.

**Decisión: RPC `pool_add_requirements(p_pool_id, p_request_ids uuid[])`** que envuelve en una transacción: (1) INSERT `pool_requests`; (2) leer `pool_number` + nombres de empresas participantes; (3) INSERT un `requerimiento_evento` por request con `tipo='pool_joined'` y metadata. Mismo precedente que `create_consolidated_rfq` (024). El RPC NO necesita `SECURITY DEFINER` si las RLS de `pool_requests` (own-only, 018) y `requerimiento_evento` (own-company) ya cubren al caller — corre `SECURITY INVOKER` y las policies aplican transparentemente. La lista de nombres de empresas se arma desde `pool_companies → companies.name` (visible al miembro por RLS de 018).

```sql
CREATE OR REPLACE FUNCTION pool_add_requirements(p_pool_id uuid, p_request_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_pool_number bigint; v_companies jsonb; v_user uuid := auth.uid();
BEGIN
  IF p_request_ids IS NULL OR array_length(p_request_ids,1) IS NULL THEN RETURN; END IF;

  -- 1. INSERT pool_requests (RLS pool_requests_own_insert valida own + member).
  INSERT INTO pool_requests (pool_id, request_id)
  SELECT p_pool_id, unnest(p_request_ids)
  ON CONFLICT DO NOTHING;  -- idempotencia ante retry (ver 5d)

  -- 2. Snapshot del pool al momento del join.
  SELECT pool_number INTO v_pool_number FROM purchase_pools WHERE id = p_pool_id;
  SELECT jsonb_agg(c.name ORDER BY c.name) INTO v_companies
    FROM pool_companies pc JOIN companies c ON c.id = pc.company_id
   WHERE pc.pool_id = p_pool_id;

  -- 3. Un evento por request agregado en ESTA llamada.
  INSERT INTO requerimiento_evento (request_id, created_by, tipo, descripcion, metadata)
  SELECT rid, v_user, 'pool_joined',
         'Requerimiento incorporado a un pool de compras',
         jsonb_build_object('pool_id', p_pool_id, 'pool_number', v_pool_number, 'companies', v_companies)
  FROM unnest(p_request_ids) AS rid;
END $$;

GRANT EXECUTE ON FUNCTION pool_add_requirements(uuid, uuid[]) TO authenticated;
```

> **Ubicación de la migración:** la función `pool_add_requirements` depende del CHECK ampliado (`pool_joined`) y de `pool_number`, ambos en 028. Como es `SECURITY INVOKER` (no cruza tenant), puede ir en **028** tras el DDL, o en 029 con los otros RPC. **Decisión: ponerla en 029** junto a los demás RPC, para que 028 sea esquema-puro y 029 sea funciones-puro (boundary de rollback más limpio). 029 corre después de 028, así que las dependencias (`pool_joined`, `pool_number`) ya existen.

### 5d. Idempotencia (Open Question del spec resuelta)

**Decisión: dedup en el INSERT de `pool_requests` (`ON CONFLICT DO NOTHING`) pero el evento se inserta por cada request del array de la llamada.** Si `addMyRequirements` se reintenta con el mismo set, `pool_requests` no duplica (UNIQUE pool_id+request_id si existe; si no, agregar UNIQUE en 028), pero podría insertar un segundo evento. El spec acepta esto ("MAY insert duplicate events"). Para evitar ruido, el cliente sólo llama el RPC con los request_ids realmente nuevos (los que no estaban en el pool) — coherente con el escenario "No event for requirements not added in this call". El mínimo garantizado (≥1 evento con metadata correcta por join) se cumple.

> **Nota:** verificar si `pool_requests` tiene UNIQUE(pool_id, request_id). Si NO, agregarlo en 028 (es lo que hace el `ON CONFLICT` confiable). Si la tabla ya lo tiene, omitir.

### 5e. UI — `RequestDetailModal` (o timeline equivalente)

El render del timeline mapea `tipo='pool_joined'` a un texto legible desde `metadata`: "Participó en Pool #{pool_number} junto a {companies.join(', ')}". Sólo lectura de `metadata`; sin query extra.

### Sequence diagram — GAP5 add-to-pool history event

```
 member     usePoolFlow.addMyRequirements     Supabase            RPC pool_add_requirements
   │                 │                          │                     │
   │ Agregar req.    │ (filtra request_ids nuevos)                    │
   ├────────────────>│ rpc pool_add_requirements(pool_id, [r1,r2])    │
   │                 ├───────────────────────────────────────────────>│ (1 transacción, INVOKER)
   │                 │                          │  INSERT pool_requests ON CONFLICT DO NOTHING
   │                 │                          │  (RLS own_insert valida own+member)
   │                 │                          │  read pool_number + companies(names)
   │                 │                          │  INSERT requerimiento_evento 'pool_joined' x request
   │                 │                          │  (si CHECK falla → ROLLBACK total, pool_requests revierte)
   │                 │<───────────────────────────────────────────────┤ ok
   │ ver historial   │                          │                     │
   ├────────────────> RequestDetailModal lee metadata → "Pool #3 junto a A, B"
```

---

## Lista precisa de archivos a tocar

| Archivo | Tipo | Qué cambia |
|---------|------|-----------|
| `supabase/migrations/028_pool_schema.sql` | NEW | `award_mode` (col+CHECK), `pool_number` (seq+backfill+NOT NULL+UNIQUE), `chk_evento_tipo` += `pool_joined` (desde set 024), tabla `pool_company_awards` + RLS, **tabla `pool_providers` + RLS write-own-company (GAP3)**, `pool_companies_own_delete` policy, triggers: `pool_companies_link_guard` (GAP1), `purchase_pools_award_mode_lock` + `state_guard` (GAP2/4), `pool_companies_withdraw_guard` (GAP4), UNIQUE(pool_id,request_id) en `pool_requests` si falta. Rollback comentado. |
| `supabase/migrations/029_pool_award_dispatch_rpc.sql` | NEW | RPC `pool_dispatch_providers` (DEFINER, GAP3 — LEE `pool_providers`), `pool_finalize_award_mode_b` (DEFINER, GAP2), `pool_add_requirements` (INVOKER, GAP5). GRANT EXECUTE. Rollback = DROP FUNCTION. |
| `src/components/pools/CreatePoolDialog.tsx` | MOD | Filtrar empresas a vinculadas activas (GAP1) + empty state; selector `award_mode` (default 'leader') (GAP2). |
| `src/components/pools/PoolCard.tsx` | MOD | "Invitar Empresa" filtra a vinculadas activas (GAP1); acciones retiro/cancelar por estado (GAP4). |
| `src/components/pools/PoolFlowPanel.tsx` | MOD | Wiring retiro/cancelar (AlertDialog) por `pool_state` (GAP4); selector `award_mode` read-only post-borrador (GAP2); montar `PoolProvidersPanel` para selección manual de providers (GAP3). |
| `src/components/pools/PoolProvidersPanel.tsx` | NEW | Selección manual de providers por pool: candidate set = mis providers ∪ globales; checkbox marca/desmarca → `pool_providers` (own-company); lista consolidada member-wide (GAP3). |
| `src/components/pools/PoolAwardPanel.tsx` | MOD | Render condicional por `awardMode`: Mode A (UN ganador, intacto) vs Mode B (grilla per-item + progreso "X de N empresas") (GAP2). |
| `src/hooks/usePoolFlow.ts` | MOD | `generateSharedRfq`: `rpc pool_dispatch_providers` + `notify-providers` (GAP3); `addMyRequirements`: `rpc pool_add_requirements` (GAP5). |
| `src/hooks/usePoolAward.ts` | MOD | Exponer `awardMode`; `confirmMyAward` (Mode B, UPSERT awards + rpc finalize); `generateMyOc` bifurca per-item/multi-OC en Mode B; Mode A intacto (GAP2). |
| `src/hooks/usePoolLifecycle.ts` | NEW (o dentro de usePoolFlow) | `withdrawFromPool`, `cancelPool` (GAP4). |
| `src/hooks/usePoolProviders.ts` | NEW | Cargar candidate set (mis providers ∪ globales); `selectProvider`/`deselectProvider` (INSERT/DELETE `pool_providers` own-company); leer selección consolidada del pool (GAP3). |
| `src/pages/Pools.tsx` | MOD | `updatePoolStatus` migra de `status` legacy a `pool_state` (GAP4). |
| `src/components/pedidos/RequestDetailModal.tsx` | MOD | Render `tipo='pool_joined'` desde metadata (GAP5). |
| `src/integrations/supabase/types.ts` | MOD | Regenerar/añadir tipos: `pool_company_awards`, `pool_providers`, `award_mode`, `pool_number`, nuevos RPC. |

---

## Plan de testing (Strict TDD activo)

### Migración (checklist manual en el .sql, patrón 017–025)
1. **028**: INSERT pool con `award_mode='per_company'` ok; con valor inválido → CHECK; `pool_number` se asigna y es único; INSERT `requerimiento_evento` tipo `'pool_joined'` ok y `'consolidado'` sigue ok (no regresión); INSERT `pool_companies` sin vínculo activo → RAISE (trigger); DELETE `pool_companies` con pool no-borrador → RAISE; UPDATE `award_mode` post-borrador → RAISE; UPDATE `pool_state='cancelado'` desde `cerrado` → RAISE; INSERT `pool_providers` de un provider propio o global → ok; de un provider de OTRA empresa → bloqueado por WITH CHECK; INSERT con `selected_by_company_id` ≠ mi empresa → bloqueado.
2. **029**: `pool_dispatch_providers` por miembro → inserta la unión deduplicada de `pool_providers` (incluye globales seleccionados); re-ejecución no duplica; `pool_providers` vacío → COUNT=0; no-miembro → RAISE; `pool_finalize_award_mode_b` con awards parciales → no transiciona, con todas completas → `adjudicado`; `pool_add_requirements` con tipo inválido (simular) → rollback total.

### RLS (espejo de los checklists de 018/019)
3. `pool_company_awards`: miembro lee todas las filas; miembro inserta sólo su company; no-miembro → 0 rows / bloqueado.
3b. `pool_providers`: miembro lee la selección consolidada del pool; miembro inserta sólo en nombre de su empresa y sólo providers propios/globales; no-miembro → 0 rows / bloqueado; DELETE sólo de la propia selección.

### Hooks — mutation con Supabase mockeado
4. **`usePoolFlow.test.ts`**: `generateSharedRfq` llama `rpc("pool_dispatch_providers")` y, si count>0, `functions.invoke("notify-providers", {rfq_id})` exactamente una vez; count=0 → NO invoca. `addMyRequirements` llama `rpc("pool_add_requirements", {p_pool_id, p_request_ids})`.
4b. **`usePoolProviders.test.ts`** (NEW): carga candidate set = mis providers ∪ globales (`.or(company_id.eq.mine, company_id.is.null)`); `selectProvider` INSERTs en `pool_providers` con `selected_by_company_id=mine`; `deselectProvider` DELETE de la propia selección.
5. **`usePoolAward.test.ts`**: Mode A — `adjudicate` setea `winning_quote_id`+`adjudicado` (regresión, sin cambios). Mode B — `confirmMyAward` UPSERTs en `pool_company_awards` + llama `rpc pool_finalize_award_mode_b`; `generateMyOc` agrupa awards por provider → 1 OC por provider; Mode B NO toca `winning_quote_id`.
6. **`usePoolLifecycle.test.ts`** (NEW): `withdrawFromPool` DELETE own row; `cancelPool` UPDATE `pool_state='cancelado'` (no `status`).

### Componentes
7. **`CreatePoolDialog`**: lista sólo empresas vinculadas activas; empty state cuando no hay vínculos; selector `award_mode` visible con default 'leader'.
8. **`PoolFlowPanel`/`PoolCard`**: botones de retiro/cancelar por `pool_state` (tabla de visibilidad); confirm dialog antes de cancelar; `award_mode` read-only post-borrador.
9. **`RequestDetailModal`**: evento `pool_joined` renderiza `pool_number` + companies.
9b. **`PoolProvidersPanel`** (NEW): muestra candidate set (mis providers + globales); marcar inserta en `pool_providers`, desmarcar borra; lista consolidada del pool member-wide.

### Utils puros (si se extraen)
10. Derivación de la unión de providers (si parte se hace en util cliente) y agrupación de OC por provider en Mode B → funciones puras testeables.

---

## Orden de implementación y boundary de riesgo

> **Boundary de riesgo:** las migraciones 028 (triggers de guard + tabla awards) y 029 (RPC `SECURITY DEFINER` cross-tenant) son lo crítico e irreversible-en-prod. Los hooks/UI de cada gap son aditivos y aislados por slice.

Orden alineado al slicing del proposal (integridad de regla de negocio primero):

1. **028 + 029** (esquema + RPC). Aplicar y verificar checklists. Prerequisito de todo. **Slice de alto riesgo — revisar a fondo.**
2. **Slice A — GAP1** [ALTA]: filtro UI (`CreatePoolDialog`, `PoolCard`) + ya está el trigger en 028. Tests 7.
3. **Slice B — GAP4** [ALTA]: `usePoolLifecycle` + UI por estado + `updatePoolStatus`→`pool_state`. Tests 6, 8.
4. **Slice C — GAP2** [ALTA, requiere 028/029]: `award_mode` selector, `pool_company_awards`, Mode B en `usePoolAward`/`PoolAwardPanel`. Tests 5, 3. El más grande — candidato a sub-slice (C1: flag+selector+RLS; C2: Mode B award flow; C3: generateMyOc multi-OC).
5. **Slice D — GAP3** [MEDIA]: `pool_providers` (selección manual, ya en 028) + `usePoolProviders` + `PoolProvidersPanel` (selección por empresa, candidate set propio∪global) + `generateSharedRfq` consume vía `pool_dispatch_providers` + notify. Tests 4, 4b, 3b.
6. **Slice E — GAP5** [MEDIA]: `pool_add_requirements` + `pool_number` + render historial. Tests 4, 9.

---

## Riesgos / supuestos a validar

| Riesgo / supuesto | Mitigación |
|-------------------|------------|
| Trigger guard de GAP1 bloquea inserts legítimos de data legacy | `BEFORE INSERT` sólo afecta nuevos; auditar pares sin vínculo antes de aplicar; documentar en PR |
| RPC `SECURITY DEFINER` (GAP3-dispatch/GAP2-finalize) bypassa RLS → debe autocomprobar membresía | Cada DEFINER llama `is_pool_member()` explícito antes de actuar; el de GAP3 sólo LEE `pool_providers` (selección ya validada por RLS write-own en su insert) e inserta dedup en `rfq_providers`; revisión adversarial obligatoria del SQL |
| Selección manual de providers por pool (cambio de modelo: no más unión automática) | Tabla `pool_providers` con RLS write-own-company; el RPC LEE la selección persistida; cada empresa elige sus propios providers ∪ globales para ese pool |
| Globales (`providers.company_id IS NULL`) ahora SÍ seleccionables | Decisión de cliente; entran al pool sólo si una empresa los marca explícitamente (no por defecto) |
| Visibilidad member-wide de `pool_providers` (incluye `selected_by_company_id`) | Justificada: habilitar un provider para un pool compartido es colaboración deliberada, no fuga de la lista privada general; se puede ocultar la atribución en UI sin cambiar esquema; `rfq_providers` no persiste atribución |
| "Providers enabled for the materials" sin tabla provider↔material | Con selección manual, "habilitado para el pool" lo decide la empresa explícitamente — más fiel al spec que inferir por material |
| Mode B multi-OC (distinto provider por ítem) cambia el guard de doble-generación | Guard pasa a (rfq, provider); cubrir con test de idempotencia |
| `pool_requests` podría no tener UNIQUE(pool_id, request_id) → `ON CONFLICT` falla | Verificar en apply; agregar UNIQUE en 028 si falta |
| Visibilidad member-wide de `pool_company_awards` | Justificada: awards no-confidenciales por 018; quote_items ya visibles por 019; pool_requests (detalle interno) permanece aislado |
| Numeración: 028 antes de 027 ya tomado | Confirmado: 027 es la última; 028/029 libres y correlativas |
| `chk_evento_tipo` partir del set equivocado | Confirmado: 024 es autoritativa (13 valores), 028 parte de ESE set + `pool_joined` |
