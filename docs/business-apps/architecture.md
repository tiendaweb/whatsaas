# Arquitectura

## Principio

No se creó ningún sistema paralelo. Antes de escribir código se auditó el
repositorio para identificar qué entidades ya cubrían cada necesidad del
prompt maestro:

| Necesidad del prompt maestro | Entidad reutilizada |
|---|---|
| Ingresos/egresos/comprobantes | `team_financial_entries` / `team_financial_receipts` (plugin `finance`, ya existía) |
| Agenda/reuniones/llamadas | `team_events` (plugin `calendar`, ya existía) |
| Notas/compromisos de reunión | `team_notes` (plugin `notes`, ya existía) |
| Grafo de relaciones (venta↔cliente↔reunión↔tarea) | `team_task_relations`, genérica y polimórfica — **no se creó una tabla de relaciones nueva** |
| Auditoría de acciones sensibles | `activity_logs` — reutilizada tal cual vía el helper `audit()` del conector MCP |
| Notificaciones | `team_notifications` — no se tocó, sigue disponible para alertas de vencimientos futuras |
| Generación de tareas | `team_task_items` / `createTaskInColumn` (plugin `tasks`) — reutilizado desde `generateTasksFromNoteCommitments`, no se reimplementó el insert |

Solo se creó tabla nueva donde no existía ningún equivalente: cuentas
financieras, centros de costo, presupuestos, pagos parciales, tipo de cambio,
y participantes estructurados de evento.

## Patrón de plugin (sin cambios, ya existía)

```
lib/plugins/<id>/manifest.ts              — id, navItems, activationMode
lib/plugins/<id>/server/{schema.ts,access.ts}  — zod schemas + getPluginRequestContext(permiso)
app/api/plugins/<id>/**/route.ts          — REST, siempre valida team vía el contexto anterior
lib/plugins/<id>/ui/*.tsx                 — montado en /plugins/[pluginId]/[[...slug]]
lib/plugins/core/registry.ts              — pluginLoaders (alta final)
```

Fase 1 **extendió** los plugins `finance`, `calendar` y `notes` existentes
siguiendo este mismo patrón — no se registró ningún plugin nuevo porque no
hacía falta (a diferencia de Fase 2/3, donde `purchases`, `hr`, `support` y
`contracts` sí serán plugins nuevos).

## Multi-tenancy

Todas las tablas nuevas llevan `team_id → teams.id (cascade)` como primera
columna real, y todo endpoint nuevo obtiene el team desde el contexto de
sesión (`getFinanceRequestContext` / `getPluginRequestContext`), nunca del
body del request. Esto es el mismo mecanismo que ya usaba el resto de la
plataforma — no se introdujo un mecanismo de tenancy alternativo.

## Decisiones de diseño específicas de Fase 1

- **`team_events` se extendió con columnas (`kind`, `subtype`, `outcome`,
  `nextAction`, `customerId`, `relatedEventId`) en vez de crear una tabla
  `team_meeting_details` 1:1.** Es la opción más simple dado que el volumen de
  columnas nuevas es chico (6) y evita un join extra en cada lectura del
  calendario. Si en el futuro Reuniones necesita mucho más detalle
  (transcripciones, resultados estructurados, IA runs — ver plan de Codex),
  ahí sí conviene una tabla de especialización 1:1 aparte.
- **`attendees` (jsonb de strings) se mantuvo intacto en `team_events`** por
  compatibilidad con datos existentes. `team_event_participants` es la tabla
  nueva y es la que hay que usar en código nuevo; `attendees` queda como
  campo legado de solo lectura.
- **`team_notes.commitments` es un jsonb de compromisos, no una tabla
  aparte.** Cada compromiso es `{text, assigneeUserId?, dueDate?,
  taskItemId?}`. Cuando se generan tareas, se completa `taskItemId` en el
  mismo array (idempotencia: un compromiso con `taskItemId` ya seteado no
  genera una tarea nueva).
- **Los montos financieros son enteros en la unidad mínima de la moneda
  (centavos)**, siguiendo la convención que ya tenía `team_financial_entries`.
- **No hay ledger de doble entrada** (`movements` + `movement_legs`). Los
  pagos parciales (`team_financial_entry_payments`) son la única capa de
  detalle sobre una obligación (`team_financial_entries`); cuando la suma de
  pagos cubre el monto, la entry pasa a `status: 'paid'` automáticamente.
  Esto es intencionalmente más simple que el diseño de doble entrada que
  propone el plan de Codex — ver `README.md` para el porqué de esa decisión.
