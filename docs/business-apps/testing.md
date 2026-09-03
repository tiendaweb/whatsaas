# Testing

## Convención

Sigue el mismo patrón que ya usaban `test:resellers` y `test:automation`: TypeScript compilado a `/tmp` y ejecutado con el test runner nativo de Node (sin Jest/Vitest).

```json
"test:business-os": "tsc -p tsconfig.business-os-tests.json && node --test /tmp/whatsaas-business-os-tests/tests/business-os/*.test.js"
```

Los tests usan `node:test` (`test(...)`, sin `describe`) y no levantan servidor ni base de datos real — son tests unitarios/estáticos sobre el código fuente (schema, SQL de migración, catálogos de permisos y tools, handlers), no integración contra Postgres.

## Cobertura por archivo (`tests/business-os/`)

| Archivo | Qué cubre |
|---|---|
| `schema.test.ts` | Que `lib/db/schema.ts` declara las tablas nuevas de Fase 1 (finanzas, `team_event_participants`), que todas tienen `teamId` con FK cascade a `teams`, que `team_financial_entries` suma sus relaciones opcionales (sale/project/account/cost center), y que `team_events`/`team_notes` ganaron las columnas nuevas (`kind`, `subtype`, `outcome`, `nextAction`, `customerId`, `relatedEventId`, `commitments`). |
| `migration.test.ts` | Que `0068_business_os_phase1.sql` crea tablas con `IF NOT EXISTS` y columnas con `ADD COLUMN IF NOT EXISTS` (idempotente, re-ejecutable), que no recrea objetos preexistentes (evita el desync de `_journal.json` — ver memoria del proyecto), que las FKs nuevas apuntan a las tablas correctas, y que todas las tablas nuevas quedan indexadas por `teamId`. |
| `permissions.test.ts` | Que los permisos de Fase 1 (finance/calendar/notes) ya existen para los tres roles sin campos nuevos, que owner/admin tienen acceso total y agent no tiene finance/calendar por defecto, y que un `custom_permissions` explícito puede ganarle al preset del rol. |
| `finance-api.test.ts` | Que las rutas de cuentas financieras usan `getFinanceRequestContext` y filtran por `ctx.team.id`; que DELETE de cuenta/centro de costo bloquea con 409 si está en uso; que registrar un pago parcial queda acotado al team y marca la entry `paid` al cubrir el monto; que el overview agrega tesorería correctamente; que la proyección de cashflow está acotada por team/moneda y usa fecha efectiva (`dueOn` u `occurredOn`); que `financialEntrySchema`/`resolveFinancialRelations` validan las relaciones dentro del team. |
| `meetings-notes-api.test.ts` | Que el POST de eventos acepta los campos nuevos (`kind`/`subtype`/`outcome`/`nextAction`/`customerId`/`relatedEventId`/`participants`) acotado al team; que GET/PATCH/DELETE de un evento combinan `id` + `teamId`; que `syncEventParticipants` reemplaza la lista completa sin tocar `attendees` legado; que `generateTasksFromNoteCommitments` es idempotente (solo procesa commitments sin `taskItemId`); que el endpoint de generar tareas exige `notesWrite` y queda acotado al team. |
| `mcp-tools.test.ts` | Que cada tool MCP de negocio valida el permiso correcto antes de tocar la base de datos; que las 4 tools de lectura + la de generación de tareas están registradas en los catálogos exportados; que `financeReceivablesPayables` filtra siempre por `teamId`; que `meetingAgenda` con `user_id` nunca cruza participantes de otro team; que `generateTasksFromNote` audita la generación (trazabilidad IA); que `isoWeek` implementa la fórmula ISO-8601 correctamente. |
| `readonly-catalog.test.ts` | Que todas las tablas nuevas de Fase 1 quedan registradas en el catálogo readonly (`whatspro_list_records`/`get_record`); que los recursos nuevos usan `direct()`/`through()` (tenant-scoped por construcción); que `event-participants` se resuelve a través de `team_events` sin exponer participantes de otro team. |

## Qué NO está testeado

No hay tests de integración end-to-end (request HTTP real contra una base de datos de prueba) para Fase 1 — toda la cobertura es sobre el código fuente (schema, SQL, catálogos, funciones puras) con mocks/asserts estáticos, no sobre un servidor corriendo. Tampoco hay tests de UI para `FinanceDashboard.tsx`, el calendario de reuniones ni el editor de notas.
