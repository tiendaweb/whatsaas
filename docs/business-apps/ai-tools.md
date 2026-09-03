# Tools MCP para agentes IA

Todas viven en `lib/plugins/grok-connector/server/business-os-actions.ts` y se registran en los catálogos `businessOsReadTools` / `businessOsActionTools`, ejecutados por `executeBusinessOsReadTool` / `executeBusinessOsAction`. Cada tool valida el permiso correspondiente con `assertPermission(context, permiso, pluginId?)` antes de tocar la base de datos, y todas las queries están acotadas por `context.teamId`.

## Tools de lectura (`businessOsReadTools`)

| Tool | Descripción | Permiso | Parámetros clave |
|---|---|---|---|
| `whatspro_finance_summary` | Responde "¿cuánto dinero tenemos?" / "¿cuál fue la utilidad del período?". Devuelve saldo disponible por cuenta/moneda, ingresos y egresos pagados, utilidad, gasto por categoría, y totales de cuentas por cobrar/pagar. | `financeRead` (plugin `finance`) | `from`, `to` (ISO `YYYY-MM-DD`, por defecto mes actual) |
| `whatspro_finance_receivables_payables` | Responde "¿quién nos debe?" / "¿qué tenemos que pagar?". Lista obligaciones pendientes o vencidas. | `financeRead` (plugin `finance`) | `direction` (`receivable`\|`payable`, requerido), `due_within_days` (1-365), `only_overdue` |
| `whatspro_finance_cashflow_projection` | Proyecta el saldo de caja combinando saldo actual + obligaciones pendientes, agrupado por semana ISO. | `financeRead` (plugin `finance`) | `days` (7-365, default 90), `currency` (default `ARS`) |
| `whatspro_meeting_agenda` | Responde "¿qué reuniones/llamadas tengo?". Lista `team_events` de kind `meeting`/`call` en un rango, con cliente, participantes, resultado y próxima acción. | `calendarRead` (plugin `calendar`) | `from`, `to` (datetime), `kind` (`meeting`\|`call`), `user_id` |

## Tools de acción (`businessOsActionTools`)

| Tool | Descripción | Permiso | Parámetros clave |
|---|---|---|---|
| `whatspro_generate_tasks_from_note` | Genera tareas (Task OS) a partir de los `commitments` de una nota de reunión que aún no tienen tarea asociada. Idempotente: un commitment con `taskItemId` ya seteado no se reprocesa. Audita `GROK_NOTE_TASKS_GENERATED` vía `audit()` (ver [`events.md`](./events.md)). | `tasksWrite` | `note_id` (requerido) |

## Notas de implementación

- `isoWeek(dateStr)` (exportada desde el mismo archivo) implementa la fórmula estándar ISO-8601 (jueves de la semana + primer jueves del año) y es la que agrupa `whatspro_finance_cashflow_projection` por semana.
- `financeReceivablesPayables` y `meetingAgenda` construyen sus condiciones `where` dinámicamente (según `only_overdue`, `due_within_days`, `kind`, `user_id`) pero siempre incluyen `eq(..., context.teamId)` como primera condición — no hay combinación de filtros que pueda devolver datos de otro team.
- `meetingAgenda` con `user_id` resuelve primero los `eventId` en `team_event_participants` acotados por `teamId` **y** `userId`, y si no hay ninguno devuelve `{ count: 0, events: [] }` en vez de ignorar el filtro.
- Los montos financieros que devuelven estas tools están en la unidad mínima de la moneda (centavos), igual que en la base de datos.
