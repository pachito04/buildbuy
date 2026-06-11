# Canonical Spec — Dominio: consumos-cuenta-corriente

> BuildBuy — Gestión de Consumos por Obra + Cuenta Corriente con Proveedores.
> Versión estable (SDD Mejorado). RLS por `provider_users`, snake_case, multiempresa.

## REQUIREMENTS

### REQ-01 — Maestro de Lista de Precios por Proveedor

El sistema **MUST** permitir cargar y mantener la lista de precios vigente de cada proveedor, asociando cada ítem a los materiales (`materials`) ya existentes en BuildBuy.

- **Given** un usuario con perfil Compras o Proveedor.
- **When** se actualiza un precio de material.
- **Then** el sistema guarda el precio con su fecha de vigencia y conserva el registro anterior en el historial de precios.
- **Rules**:
  - Un proveedor solo puede modificar su propia lista, vía `provider_users` (RLS estricto).
  - Un usuario interno solo opera dentro de su empresa (`company_id = auth_company_id()`).
  - No se permiten vigencias solapadas para el mismo `(provider_id, material_id)`.
  - El sistema **MUST** impedir el registro de retiros si el material no tiene un precio vigente activo para el proveedor seleccionado.

### REQ-02 — Registro de Retiro en Proveedor

El sistema **MUST** ofrecer un formulario ágil para registrar los retiros de materiales notificados por los arquitectos.

- **Given** un usuario con perfil Compras.
- **When** selecciona Proveedor + Obra (`project_id`) + Arquitecto (`architect_id`) + Fecha de retiro e ingresa ítems (material + cantidad).
- **Then** el sistema calcula los subtotales automáticamente congelando el precio unitario vigente a la fecha del retiro (`retiro_item.precio_unitario_aplicado`), y al confirmar, genera el consumo en la obra y el débito en la cuenta corriente del proveedor.
- **Rules**:
  - Los campos Obra y Arquitecto son obligatorios.
  - No se permiten fechas de retiro futuras (`fecha_retiro <= current_date`).
  - Un retiro confirmado no se puede eliminar; solo se puede anular (`estado = 'anulado'`) generando un movimiento de crédito compensatorio.
  - La inserción se hace mediante RPC transaccional (retiro + ítems + débito en un solo commit).

### REQ-03 — Cuenta Corriente con Proveedor

El sistema **MUST** consolidar de forma automatizada todos los movimientos (débitos por retiros, créditos por pagos y notas de crédito) de cada proveedor.

- **Given** un usuario con perfil Compras o Proveedor.
- **When** accede a la sección de Cuenta Corriente.
- **Then** ve el saldo acumulado neto y un historial completo de movimientos filtrable por fecha, tipo de movimiento y obra.
- **Rules**:
  - Los proveedores solo ven su propia cuenta corriente en modo lectura, vía `provider_users`.
  - Los usuarios internos ven solo la de su empresa (`company_id = auth_company_id()`).
  - Compras puede registrar de forma manual pagos y notas de crédito.
  - `movimiento_cuenta_corriente` es INSERT-only (sin UPDATE/DELETE): las correcciones se hacen con contra-asientos.

### REQ-04 — Reporte de Consumos por Obra

El sistema **MUST** proveer un reporte analítico de todos los consumos imputados a cada obra (`project_id`).

- **Given** un usuario con perfil Compras.
- **When** filtra consumos por obra y período.
- **Then** ve el desglose detallado de materiales, cantidades, precios históricos aplicados, arquitecto responsable y totales valorizados acumulados.
- **Rules**:
  - Los retiros anulados no se computan en los totales, pero se visualizan con estado 'Anulado' para auditoría.

### REQ-05 — Portal del Proveedor — Lista de Precios

El sistema **MUST** permitir al Proveedor autogestionar su lista de precios mediante carga individual o masiva vía Excel.

- **Given** un usuario con perfil Proveedor logueado (vinculado en `provider_users`).
- **When** importa una planilla Excel estructurada (reutilizando `xlsx`) o guarda cambios en el ABM.
- **Then** el sistema actualiza su lista de precios vigente, mantiene el historial de vigencia y notifica a Compras sobre el cambio.

## Data Model

Convención: **snake_case**, FK `{entidad}_id`, timestamps `created_at` / autor `created_by` (FK `auth.users`).

### `precio_proveedor`

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| company_id | uuid FK companies | `NULL` = global |
| provider_id | uuid FK providers | NOT NULL |
| material_id | uuid FK materials | NOT NULL |
| precio_unitario | numeric(14,2) | NOT NULL |
| unidad_medida | text | |
| vigencia_desde | date | NOT NULL |
| vigencia_hasta | date | NULL = vigente |
| created_by | uuid FK auth.users | |
| created_at | timestamptz | default now() |

- **Índice**: `(provider_id, material_id, vigencia_desde)`
- **Constraint**: Exclusión de vigencias solapadas para `(provider_id, material_id)` → `EXCLUDE USING gist`

### `retiro`

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK companies | NOT NULL |
| provider_id | uuid FK providers | NOT NULL |
| project_id | uuid FK projects | NOT NULL (obra) |
| architect_id | uuid FK architects | NOT NULL |
| fecha_retiro | date | NOT NULL, `<= current_date` |
| fecha_registro | timestamptz | default now() |
| observaciones | text | |
| estado | text | NOT NULL default `'activo'`, CHECK in (`'activo'`,`'anulado'`) |
| anulado_por | uuid FK auth.users | NULL |
| fecha_anulacion | timestamptz | NULL |
| motivo_anulacion | text | NULL |
| created_by | uuid FK auth.users | |
| created_at | timestamptz | default now() |

### `retiro_item`

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| retiro_id | uuid FK retiro | ON DELETE CASCADE |
| material_id | uuid FK materials | NOT NULL |
| precio_proveedor_id | uuid FK precio_proveedor | Trazabilidad (precio aplicado) |
| cantidad | numeric(12,3) | NOT NULL |
| precio_unitario_aplicado | numeric(14,2) | **Congelado** al momento de confirmación |
| subtotal | numeric(14,2) | cantidad × precio_unitario_aplicado |

### `movimiento_cuenta_corriente` (INSERT-only)

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK companies | NOT NULL |
| provider_id | uuid FK providers | NOT NULL |
| tipo | text | NOT NULL, CHECK in (`'debito'`,`'credito'`) |
| retiro_id | uuid FK retiro | NULL (pagos/NC manuales no tienen retiro) |
| monto | numeric(14,2) | NOT NULL (positivo; el signo lo da `tipo`) |
| fecha | date | NOT NULL default current_date |
| concepto | text | |
| medio_pago | text | NULL |
| referencia | text | NULL |
| created_by | uuid FK auth.users | `registrado_por` |
| created_at | timestamptz | default now() |

- **Saldo neto** = `SUM(CASE tipo WHEN 'debito' THEN monto ELSE -monto END)` por `provider_id`

## Row Level Security (RLS)

- **Interno (Compras/Admin)**: `company_id = auth_company_id()`
- **Proveedor**: `provider_id IN (SELECT provider_id FROM provider_users WHERE user_id = auth.uid() AND active = TRUE)`
- **Movimientos**: INSERT solo perfiles internos o RPC SECURITY DEFINER; SIN UPDATE/DELETE (inmutable)
- **Helpers existentes reutilizados**: `auth_company_id()`, `auth_is_provider()`, `auth_user_role()` (definidos en `001_initial_schema.sql`)

## Transactional RPCs

- **`registrar_retiro(...)`**: Inserta retiro + retiro_items (precio congelado) + movimiento débito en una transacción SECURITY DEFINER
- **`anular_retiro(...)`**: Actualiza estado de retiro + genera movimiento de crédito compensatorio

## Frontend Capabilities

| Página | Ruta | Perfil | Responsabilidad |
|---|---|---|---|
| ListaPreciosProveedor | /lista-precios-proveedor | Proveedor/Compras | ABM, import Excel, comparativa |
| RegistroRetiro | /retiros | Compras | Formulario ágil + cálculo automático |
| CuentaCorriente | /cuenta-corriente | Compras | Saldo, movimientos, pagos/NC manuales |
| ReporteConsumos | /reporte-consumos | Compras | Reporte analítico + Excel export |
| MiCuentaCorriente | /mi-cuenta-corriente | Proveedor | Solo lectura + PDF descarga |
| Configuracion (alert limit) | /config | Admin | Saldo máximo por proveedor |

## Gap Closures (SDD: gestion-consumos-fixes)

### GAP-1 — Notificaciones Internas Proveedor ↔ Compras en Cambios de Precio (REQ-01, REQ-05)

El sistema **MUST** enviar notificaciones internas (tabla `notificaciones` existente) cuando el proveedor actualiza su lista de precios O cuando Compras edita un precio. Se reutiliza el patrón de triggers de la migración `002_notification_triggers`, sin introducir un sistema paralelo.

#### Requirement: Extensión de `notification_type` enum

Migration **030** MUST extend the `notification_type` enum with two new values:

- `precio_actualizado_por_proveedor` — fired when a provider updates their own price list
- `precio_editado_por_compras` — fired when a Compras/admin user edits a price on behalf of a provider

The `ALTER TYPE … ADD VALUE` statements MUST be executed outside of a transaction block, matching the pattern used in migration `002`.

#### Requirement: Trigger — Proveedor actualiza su lista (REQ-05)

A PL/pgSQL trigger function `fn_notify_price_updated_by_provider` MUST be created on the `precio_proveedor` table. It MUST fire `AFTER INSERT OR UPDATE` for each row. **Key constraint:** the trigger MUST insert exactly **one** aggregated notification into `notificaciones` per bulk-import event; for single-row edits, it MUST insert one notification.

The notification record MUST use:

| Field       | Value |
|-------------|-------|
| `company_id`| the `company_id` from `precio_proveedor` (resolved via `created_by` for global prices) |
| `user_id`   | each `user_id` of compras/admin users for that `company_id` (broadcast pattern) |
| `type`      | `precio_actualizado_por_proveedor` |
| `message`   | `'Lista de precios actualizada por <provider_name>'` |
| `metadata`  | `{ "provider_id": <uuid>, "detail_message": <string> }` |

**Behavioral scenarios:**

- GIVEN provider P belongs to company C with two compras/admin users
- WHEN provider P updates a single price row
- THEN exactly 2 rows are inserted into `notificaciones`, each with `user_id` of a compras/admin user

- GIVEN provider P uploads 50 prices in a bulk-import RPC call
- AND company C has one Compras user
- WHEN the bulk import completes
- THEN exactly 1 row is inserted into `notificaciones` for that Compras user (summary notification)

- GIVEN provider P with 0 Compras users in their company
- WHEN provider P updates a price
- THEN 0 notifications are inserted (no error)

#### Requirement: Trigger — Compras edita un precio (REQ-01)

A PL/pgSQL trigger function `fn_notify_price_edited_by_compras` MUST be created on the `precio_proveedor` table. It MUST fire `AFTER UPDATE` for each row, conditionally — only when the editing session is identified as belonging to a Compras/admin user (via `current_setting('app.precio_actor', true) = 'compras'`).

The notification MUST be delivered to all active `provider_users` for the affected provider:

| Field       | Value |
|-------------|-------|
| `company_id`| the `company_id` from `precio_proveedor` |
| `user_id`   | each active `provider_users.user_id` for the affected `provider_id` |
| `type`      | `precio_editado_por_compras` |
| `message`   | `'Compras actualizó un precio en tu lista'` |
| `metadata`  | `{ "provider_id": <uuid>, "material_codigo": <materials.name>, "detail_message": <string> }` |

**Behavioral scenarios:**

- GIVEN provider P has 2 active `provider_users`
- AND Compras edits one `precio_proveedor` row for provider P
- THEN exactly 2 rows are inserted into `notificaciones`, type = `precio_editado_por_compras`

- GIVEN provider P edits their own price (provider session, no actor token)
- THEN no notification of type `precio_editado_por_compras` is inserted

- GIVEN provider P with 0 active `provider_users`
- AND Compras edits a price for provider P
- THEN 0 notifications inserted, no error

#### Requirement: RPCs de soporte

- **`precio_proveedor_bulk_insert(p_rows jsonb, p_provider_id uuid, p_company_id uuid)`** SECURITY DEFINER: Sets batch token via `current_setting('app.precio_batch')`, inserts all rows in one transaction, inserts ONE summary notification to Compras/admin. Returns `{inserted: int, rejected: []}` JSON. GRANT EXECUTE TO authenticated.
- **`precio_proveedor_edit(p_id uuid, p_patch jsonb)`** SECURITY DEFINER: Sets actor token via `current_setting('app.precio_actor', 'compras', true)`, applies PATCH UPDATE, triggers `fn_notify_price_edited_by_compras` automatically. GRANT EXECUTE TO authenticated.

#### Requirement: No regression

Migration 030 MUST NOT drop, modify, or replace any trigger/function from migration `002`.

#### Requirement: Rollback

Migration 030 MUST include rollback that drops the new triggers and functions (NOT the enum values — they are harmless if unused).

---

### GAP-2 — ReporteConsumos: Conjunto Completo de Filtros (REQ-04)

El `ReporteConsumos` **MUST** soportar filtrado por proveedor, material, y arquitecto (además de los existentes obra y fechas). Todos los filtros operan en combinación AND a nivel server-side. Los retiros anulados MUST ser siempre excluidos.

#### Requirement: Filtro por proveedor

`ReporteConsumos` MUST expose a proveedor filter that restricts the report to retiro rows whose `provider_id` matches the selected provider. Only providers with ≥1 retiro in the current company MUST appear in the dropdown.

**Scenarios:**
- GIVEN retiros for provider A and B in obra X
- WHEN user selects provider A
- THEN only retiros from provider A are shown

#### Requirement: Filtro por material

`ReporteConsumos` MUST expose a material filter that restricts to retiro_item rows whose `material_id` matches. Only materials appearing in ≥1 retiro for the current company MUST appear in the dropdown.

**Scenarios:**
- GIVEN retiro items for material M1 and M2
- WHEN user selects M1
- THEN only items with material M1 are shown

#### Requirement: Filtro por arquitecto

`ReporteConsumos` MUST expose an arquitecto filter that restricts to retiros whose `retiro.architect_id` matches the selected architect. Only architects with ≥1 retiro in the current company MUST appear in the dropdown.

> **Design note**: The spec text references `created_by`, but the correct semantic field in the schema is `retiro.architect_id`. This spec uses `architect_id`.

**Scenarios:**
- GIVEN retiros by architect ArqA and ArqB
- WHEN user selects ArqA
- THEN only retiros by ArqA are shown

#### Requirement: Composición AND de filtros

All five filters (obra, proveedor, material, fechas, arquitecto) MUST be combinable in any combination using AND logic.

**Scenario:**
- GIVEN user selects obra X, provider A, material M1, date range D, arquitecto ArqA
- WHEN report loads
- THEN only retiros matching ALL five criteria are shown

#### Requirement: Anulados siempre excluidos

Retiros with `estado = 'anulado'` MUST be excluded from all totals and rows, regardless of active filters.

#### Requirement: Server-side filtering

Filters MUST be applied at the query level (server-side), not client-side in-memory filtering.

---

### GAP-3 — ReporteConsumos: Vista Comparativa por Material en el Tiempo (REQ-04)

El `ReporteConsumos` **MUST** ofrecer una vista comparativa (time-series) que muestre consumo por material a lo largo del tiempo. La vista es independiente de la tabla actual (lista view).

#### Requirement: Modo comparativa distinto

`ReporteConsumos` MUST offer a comparativa view separate from the existing list view. User MUST be able to toggle between list and comparativa within the same page without losing active filters.

#### Requirement: Data shape

The comparativa view MUST render a time-series chart (using Recharts) where:

- **X-axis**: time periods. Default grouping = month (calendar month, `YYYY-MM`).
- **Y-axis**: consumed total (quantity or monetary value). The design chose **both**, via a metric toggle: `cantidad` (default, sum of `retiro_item.cantidad`) or `monto` (sum of `retiro_item.subtotal`).
- **Series**: each line/bar represents a distinct material (`material_id` + `materials.name`).

Each data point MUST carry:

| Field         | Type   | Value |
|---------------|--------|-------|
| `period`      | string | `YYYY-MM` |
| `material_codigo` | string | Material identifier (from `materials.name`) |
| `descripcion` | string | Material display name |
| `total`       | number | Aggregated quantity/monetary value for the period, excluding anulados |

#### Requirement: Anulados excluidos

Retiro items from retiros with `estado = 'anulado'` MUST be excluded from all series totals, regardless of filters.

#### Requirement: Filtros propagan

All filters active in `ReporteConsumos` (GAP-2) MUST also apply to comparativa view data. The two views share filter state.

#### Requirement: Empty state

When no retiro data exists for the active filter combination, the comparativa view MUST display an informative empty-state message instead of an empty chart.

#### Requirement: Default period range

When a date-range filter is active, the x-axis MUST span only the filtered range. When no date-range filter is active, the x-axis MUST default to the last 12 calendar months.

#### Requirement: Sin regresión en list view

The existing list view MUST continue to work unchanged.

---

### GAP-4 — CuentaCorriente (Compras): Exportación de PDF (REQ-03)

El `CuentaCorriente` (Compras) **MUST** permitir exportar a PDF el estado de cuenta, reutilizando la lógica de PDF existente en `MiCuentaCorriente` (proveedor). Sin duplicación de código.

#### Requirement: Helper extraído

The jsPDF export logic MUST be extracted from `MiCuentaCorriente` into a standalone helper (e.g., `generateEstadoCuentaPDF`). After extraction, `MiCuentaCorriente` MUST import and invoke the shared helper. The provider export output MUST remain byte-for-byte identical before and after extraction.

#### Requirement: Botón "Exportar PDF" en CuentaCorriente

`CuentaCorriente` MUST expose an "Exportar PDF" button. The button MUST be visible only when a provider is selected AND the statement has ≥1 movement row.

**Scenarios:**
- GIVEN no provider is selected
- THEN "Exportar PDF" button is NOT visible

- GIVEN provider P is selected but has 0 movimientos
- THEN button is NOT visible (or disabled)

- GIVEN provider P is selected with N movimientos
- WHEN user activates "Exportar PDF"
- THEN browser triggers PDF download with provider name, period, all N movements, and saldo

#### Requirement: PDF content

The exported PDF MUST include:

| Section       | Content |
|---------------|---------|
| Header        | Provider name, period covered (from/to dates in filter) |
| Movements table | All `movimiento_cuenta_corriente` rows for selected provider and period, ordered by `created_at` asc. Each row: date, description, debit, credit, running balance |
| Footer        | Saldo final |

The Compras view PDF MUST use the same visual template as the provider view PDF.

#### Requirement: RLS

The Compras user MUST be able to read `movimiento_cuenta_corriente` rows for any provider in their `company_id`. The existing RLS policy already permits this; no RLS change is required.

#### Requirement: No duplicate PDF logic

After this change, there MUST be exactly one canonical jsPDF implementation for estado de cuenta generation.

---

### GAP-5 — PreciosUploader: Descarga de Plantilla Excel (REQ-05)

El `PreciosUploader` **MUST** ofrecer una descarga de plantilla Excel que contenga exactamente las 5 columnas requeridas, sin datos.

#### Requirement: Botón "Descargar plantilla"

`PreciosUploader` MUST expose a "Descargar plantilla" button. The button MUST be visible at all times (not hidden behind conditional state).

#### Requirement: Formato y columnas del archivo

The downloaded file MUST be a valid `.xlsx` file with exactly one worksheet. The worksheet MUST have a header row as the first row with exactly these 5 columns in order:

| Index | Header              |
|-------|---------------------|
| 1     | Código Material     |
| 2     | Descripción propia  |
| 3     | Unidad de Medida    |
| 4     | Precio Unitario     |
| 5     | Vigencia desde      |

No additional columns. No data rows below the header.

**Scenario:**
- GIVEN user activates "Descargar plantilla"
- WHEN browser receives the file
- THEN file is valid `.xlsx` with exactly 5 headers in order
- AND no data rows

#### Requirement: Template download does not interfere with upload

- GIVEN user has already selected a file to upload
- WHEN user activates "Descargar plantilla"
- THEN the selected file for upload is unchanged
- AND upload state is not reset

#### Requirement: Client-side generation

The template MUST be generated client-side. The `xlsx` library (already in the project stack) MUST be used. No new dependency added.

#### Requirement: Filename

The downloaded file MUST use a deterministic filename: `plantilla-precios.xlsx` (no timestamp or random suffix).

---

### GAP-6 — Route Role-Guards (Defense in Depth) (Spec §7)

El sistema **MUST** aplicar restricción de rol a nivel de ruta (no solo sidebar), de modo que navegación directa a URLs del módulo sea rechazada para roles no autorizados.

#### Requirement: Matriz de rol por ruta

The following routes MUST enforce access by role. A user whose active role is not in the "Allowed roles" column MUST be redirected away.

| Route                  | Allowed roles                    |
|------------------------|----------------------------------|
| `/retiros`             | `compras`, `admin`               |
| `/cuenta-corriente`    | `compras`, `admin`               |
| `/reporte-consumos`    | `compras`, `admin`               |
| `/lista-precios`       | `proveedor`, `compras`, `admin`  |
| `/mi-cuenta-corriente` | `proveedor`                      |

The Arquitecto role MUST be denied access to ALL five routes, even when navigating directly by URL.

#### Requirement: Guard implementation

The guard MUST be implemented at the route definition level in `App.tsx` (or router config). If no role-guard component exists, a minimal `RequireRole` component MUST be introduced that:

1. Reads the current user's role from the auth context (e.g., `useViewRole`).
2. Checks the role against the allowed list.
3. Shows a loading spinner while determining the role (avoid false-negative redirects).
4. Redirects to `/dashboard` if role is not allowed (or `/login` if no session exists).
5. Otherwise renders children.

#### Requirement: Arquitecto denied all routes

**Scenarios:**

- GIVEN user has role `arquitecto`
- WHEN navigates directly to `/retiros` (or any of the 5 routes)
- THEN guard intercepts and redirects away
- AND content is NOT rendered

#### Requirement: Allowed roles granted access

- GIVEN user has role `compras`
- WHEN navigates to `/retiros`
- THEN route renders normally without redirection

- GIVEN user has role `proveedor`
- WHEN navigates to `/mi-cuenta-corriente`
- THEN route renders normally without redirection

---

## Out-of-Scope (Roadmap)

- **GAP-7 — Fase 2 (Automatización WhatsApp)**: Preparación de esquema para mensajes WhatsApp (campos `id_mensaje_whatsapp`, ampliación de dominio de `retiro.estado`). Deferred a Fase 2; solo esquema en este cambio, sin consumo de lógica.
- **REQ-06 — Fase 2 (Full WhatsApp Integration)**: Recepción, parseo e integración automática de mensajes de WhatsApp del Arquitecto con el portal del proveedor.
