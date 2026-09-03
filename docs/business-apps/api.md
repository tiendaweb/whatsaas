# API — Fase 1

Todas las rutas están bajo `/api/plugins/<plugin>` y siguen el patrón
existente: `getFinanceRequestContext` / `getPluginRequestContext(permiso)`
resuelve `{ team, user, membership }` desde la sesión, nunca del body; zod
valida el input; errores de negocio (`invalid_*`, 404, 409) se devuelven con
el status apropiado.

## Finanzas (`/api/plugins/finance`)

| Método | Ruta | Qué hace |
|---|---|---|
| GET/POST | `/entries` | Ya existía. El POST ahora acepta `saleId`/`projectId`/`accountId`/`costCenterId` opcionales. |
| GET/PATCH/DELETE | `/entries/[id]` | Ya existía, mismos campos nuevos. |
| GET/POST | `/entries/[id]/payments` | **Nuevo.** Lista/crea pagos parciales. Si la suma cubre el monto, marca la entry `paid`. |
| GET/POST | `/accounts` | **Nuevo.** Cuentas financieras. |
| GET/PATCH/DELETE | `/accounts/[id]` | **Nuevo.** DELETE → 409 si tiene entries/payments vinculados. |
| GET/POST | `/cost-centers` | **Nuevo.** |
| GET/PATCH/DELETE | `/cost-centers/[id]` | **Nuevo.** DELETE → 409 si tiene entries vinculadas. |
| GET/POST | `/budgets` | **Nuevo.** El GET devuelve además el gasto ejecutado por período/categoría/centro de costo. |
| GET/PATCH/DELETE | `/budgets/[id]` | **Nuevo.** |
| GET/POST | `/exchange-rates` | **Nuevo.** |
| GET | `/cashflow?days=90&currency=ARS` | **Nuevo.** Proyección semanal de saldo. |
| GET | `/overview` | Ya existía. Ahora incluye `treasury` (saldo por cuenta/moneda, cuentas por cobrar/pagar, gasto por centro de costo) y `options.accounts`/`options.costCenters`. |

## Reuniones/Llamadas (`/api/plugins/calendar`)

| Método | Ruta | Qué cambió |
|---|---|---|
| GET/POST | `/events` | Acepta `kind` (`meeting`\|`call`), `subtype`, `outcome`, `nextAction`, `customerId`, `relatedEventId`, `participants[]` (`{userId?, contactId?, role?}`). El GET devuelve `participants` embebidos. |
| GET/PATCH/DELETE | `/events/[id]` | Mismos campos nuevos; el GET individual es nuevo (antes solo existía list+patch). |

Valores documentados de `subtype` (no hay enum en DB, es texto libre — usar
estos valores para que las consultas de IA funcionen):
- `kind: 'meeting'` → `presencial`, `videollamada`, `interna`, `comercial`, `onboarding`, `soporte`, `seguimiento`
- `kind: 'call'` → `entrante`, `saliente`, `no_respondido`, `reagendada`

## Notas de reunión (`/api/plugins/notes`)

| Método | Ruta | Qué cambió |
|---|---|---|
| GET/POST | `/` | Acepta `eventId` y `commitments[]`. |
| GET/PATCH/DELETE | `/[id]` | Idem. |
| POST | `/[id]/generate-tasks` | **Nuevo.** Genera una `team_task_items` por cada `commitment` sin `taskItemId`, en un proyecto "Reuniones" autogenerado, vinculada vía `team_task_relations` (`sourceType: 'note'`, `targetType: 'task'`, `relationType: 'generated_from'`). Idempotente. |

## Lectura genérica (MCP + `/api/readonly/v1/*`)

Se registraron las tablas nuevas en `lib/readonly-api/catalog.ts`, lo que
habilita automáticamente `whatspro_list_records` / `whatspro_get_record` (MCP)
y `/api/readonly/v1/<key>` (API con token read-only) para:

`financial-entries`, `financial-accounts`, `financial-entry-payments`,
`financial-receipts`, `cost-centers`, `budgets`, `exchange-rates`,
`event-participants`, más las claves `notes` y `calendar-events` ya
existentes (ahora con filtros nuevos: `notes` por `eventId`, `calendar-events`
por `kind`/`customerId`/`status`).

Ver `ai-tools.md` para las tools MCP computadas (resúmenes, proyecciones,
generación de tareas).
