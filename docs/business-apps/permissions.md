# Permisos — Fase 1

**No se agregó ningún permiso nuevo.** Los permisos existentes ya cubrían
todo lo que necesitaba Fase 1:

| Dominio | Permiso read | Permiso write |
|---|---|---|
| Finanzas (entries, cuentas, centros de costo, presupuestos, pagos, tipo de cambio, cashflow) | `financeRead` | `financeWrite` |
| Reuniones/Llamadas (team_events, participantes) | `calendarRead` | `calendarWrite` |
| Notas de reunión (commitments, generación de tareas) | `notesRead` | `notesWrite` |
| Generación de tareas desde una nota (crea `team_task_items`) | — | `tasksWrite` (además de `notesWrite` para editar la nota) |

Los tres están definidos en `lib/permissions.ts` (`MemberPermissions`) y
tienen valores en los tres `ROLE_PRESETS` (`owner`, `admin`, `agent`) desde
antes de esta fase — no hizo falta tocar ese archivo.

## Cómo se valida

- **API routes**: `getFinanceRequestContext('read'|'write')` (finance) /
  `getPluginRequestContext('calendarRead'|...)` (calendar, notes) — helpers
  ya existentes, reutilizados tal cual.
- **MCP tools**: `assertPermission(context, 'financeRead', 'finance')` etc.
  al inicio de cada función en `business-os-actions.ts`, antes de tocar la
  base de datos. `assertPermission` chequea el permiso del miembro Y (cuando
  se pasa un `pluginId`) que el plugin esté activo para el team.
- **Lectura genérica** (`whatspro_list_records`/`/api/readonly/v1/*`): no
  pasa por `MemberPermissions` — usa el sistema de tokens read-only /
  conector MCP existente, que ya scopea todo por `teamId`. No es un permiso
  nuevo, es el mecanismo que ya usaban `notes`/`calendar-events` antes de
  esta fase.

## Deuda pendiente (no introducida por esta fase, señalada por el plan de Codex)

El plan de `docs/business-platform/99-plan-maestro.md` propone separar
permisos de lectura/escritura de acciones sensibles (`finance.post`,
`finance.approve`, `meetings.finish`) con más granularidad que el booleano
read/write actual. Para Fase 1 no hizo falta — no hay ninguna acción de
"aprobar" o "postear" todavía (los pagos parciales los crea cualquiera con
`financeWrite`). Si Fase 2/3 agrega flujos de aprobación (ej. compras por
encima de un monto), ahí sí conviene revisar esa granularidad.
