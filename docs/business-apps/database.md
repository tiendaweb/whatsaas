# Modelo de datos — Fase 1

Migración aplicada: `lib/db/migrations/0068_business_os_phase1.sql` (aplicada
directo a la BD real con guards `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`,
ver nota de journal desync más abajo). Todas las tablas nuevas son
`team_id → teams.id ON DELETE CASCADE`.

## Tablas nuevas

### `team_financial_accounts`
Cuentas financieras (efectivo, banco, Mercado Pago, Stripe, PayPal, otras).

| Columna | Tipo | Notas |
|---|---|---|
| type | varchar(20) | `cash`\|`bank`\|`mercadopago`\|`stripe`\|`paypal`\|`other` |
| currency | varchar(3) | default `ARS` |
| openingBalance | integer | centavos; el saldo real = opening + pagos vinculados |
| isActive | boolean | |

Saldo calculado (no almacenado): `openingBalance + Σ(entries pagadas con accountId = esta cuenta, income positivo, expense negativo)`.

### `team_cost_centers`
Centros de costo. `name`, `code` (único por team), `description`, `isActive`.

### `team_budgets`
Presupuesto por período/categoría/centro de costo. `costCenterId` (FK
opcional), `category` (texto libre, opcional), `periodStart`/`periodEnd`,
`amount`, `currency`. El "ejecutado" se calcula en `GET
/api/plugins/finance/budgets` sumando `team_financial_entries` con
`type='expense'`, mismo `category`/`costCenterId` si están seteados, y
`occurredOn` dentro del período.

### `team_financial_entry_payments`
Pagos parciales sobre una obligación (`team_financial_entries`). `entryId`
(FK cascade), `accountId` (FK opcional), `amount`, `paidOn`, `method`. Al
insertar un pago, si la suma de pagos de la entry cubre `entry.amount`, la
entry pasa a `status='paid'` automáticamente (misma transacción).

### `team_exchange_rates`
Tipo de cambio registrado manualmente. `baseCurrency`/`quoteCurrency`
(3 letras), `rate` (numeric 18,6), `rateDate`, `source`. Único por
`(team, base, quote, fecha)`.

### `team_event_participants`
Participantes reales de una reunión/llamada (`team_events`). `eventId` (FK
cascade), `userId` **o** `contactId` (uno de los dos, FK cascade), `role`
(default `attendee`), `responseStatus` (default `pending`). Reemplaza en
espíritu al jsonb `attendees` de `team_events`, que se mantiene intacto por
compatibilidad con datos existentes.

## Columnas nuevas en tablas existentes

### `team_financial_entries` (+4 columnas, todas FK opcionales `set null`)
`saleId → team_sales`, `projectId → team_task_projects`, `accountId →
team_financial_accounts`, `costCenterId → team_cost_centers`.

### `team_events` (+6 columnas)
`kind` (varchar 20, `meeting`\|`call`, default `meeting`), `subtype`
(varchar 40, libre — ver valores documentados en `api.md`), `outcome`
(text), `nextAction` (text), `customerId → team_customers` (set null),
`relatedEventId → team_events` (self-FK, set null — encadena seguimientos).

### `team_notes` (+2 columnas)
`eventId → team_events` (set null — presente = "nota de reunión"),
`commitments` (jsonb, `Array<{text, assigneeUserId?, dueDate?,
taskItemId?}>`, default `[]`).

## Relaciones — no se creó tabla nueva

`team_task_relations` (preexistente, polimórfica: `sourceType/sourceId/
targetType/targetId/relationType`, único por esa combinación) es la que usa
`generateTasksFromNoteCommitments` para vincular `note → task` con
`relationType: 'generated_from'`. Cualquier vínculo nuevo entre dominios de
Fase 2/3 (ticket↔sale, contract↔customer, etc.) debe reutilizar esta tabla,
documentando los valores de `sourceType`/`targetType` usados acá para no
generar strings inconsistentes (`'note'` no `'notes'`, `'task'` no
`'task_item'`, etc.).

## Nota sobre el desync del journal de drizzle

Al correr `drizzle-kit generate` para esta fase, el diff automático incluyó
de más — `CREATE TABLE` completo de `conversation_ai_summaries`,
`grok_connector_credentials`, `grok_connector_oauth_clients`,
`read_only_api_tokens`, `team_financial_entries`, `team_financial_receipts`,
y `ALTER TABLE` de `team_membership_plans.visibility` y
`dashboard_bookmark_groups.funnel_stage_group_id` — porque el snapshot base
de drizzle-kit estaba desincronizado de la BD real (esas tablas/columnas ya
existían en producción). Se verificó cada objeto contra la BD real
(`information_schema.tables`/`columns`) antes de aplicar, se removieron a
mano los statements de objetos ya existentes, y se aplicó el `.sql`
resultante directo con `psql` (no con `drizzle-kit migrate`, cuya tabla de
bookkeeping `drizzle.__drizzle_migrations` también está desincronizada: 36
filas contra 76+ archivos `.sql`). Detalle completo y procedimiento a seguir
la próxima vez en la memoria de proyecto `project_drizzle_journal_desync`.
