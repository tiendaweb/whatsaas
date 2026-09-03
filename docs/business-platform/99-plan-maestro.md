# Plan maestro — Plataforma empresarial modular de WhatsPro

## 1. Decisión ejecutiva

WhatsPro debe evolucionar como **monolito modular**, conservando WhatsApp, CRM y el runtime actual de plugins como núcleo. Esta auditoría no autoriza todavía la implementación de los siete dominios empresariales: autoriza únicamente una fase de fundaciones y hardening previa.

El principio rector queda formalizado así:

1. **Reutilizar** entidades y servicios canónicos actuales.
2. **Extender** sus contratos e invariantes cuando la responsabilidad ya existe.
3. **Relacionar** por identificadores tenant-scoped, sin copiar datos maestros.
4. **Especializar** con tablas uno-a-uno o bitácoras de dominio cuando una entidad existente necesita comportamiento empresarial.
5. **Crear** solo aquello sin equivalente comprobado.

No se construirá otro CRM, calendario, gestor de proyectos, editor, catálogo, sistema de usuarios, canal de mensajería, almacenamiento, analytics aislado ni conector por proveedor.

## 2. Alcance y autoridad de los documentos

| Documento | Autoridad |
|---|---|
| `00-arquitectura-actual.md` | Baseline técnico, tenancy y contrato actual de plugin. |
| `10-finanzas.md` | Obligaciones, cuentas, movimientos, asignaciones y rentabilidad. |
| `20-reuniones-comunicaciones.md` | Especialización de eventos como reuniones/interacciones. |
| `30-equipo.md` | Identidad laboral, capacidad, objetivos y comisiones. |
| `40-clientes-soporte.md` | Postventa, onboarding, tickets, health y renovación. |
| `50-operaciones.md` | Especialización empresarial de Task OS. |
| `60-conocimiento.md` | Gobierno, clasificación, ACL y recuperación de Documentos. |
| `70-inteligencia-control.md` | Definiciones métricas, proyecciones, alertas y prioridades. |
| `80-integracion-eventos.md` | Catálogo normativo de eventos, nombres, productores y entrega. |
| `90-ia-conectores.md` | Gateway semántico común, scopes, tools y aprobaciones. |

Ante una diferencia de nombres de eventos prevalece `80`; ante una diferencia de seguridad/tenancy prevalecen `00` y `90`; ante una diferencia funcional prevalece el dominio propietario definido en este plan.

## 3. Qué ya existe

### Plataforma

- Next.js 16, React 19, App Router, TypeScript, Tailwind y componentes propios/shadcn.
- PostgreSQL y Drizzle con esquema central y migraciones SQL.
- Sesión web, API keys, OAuth de conectores, equipos, miembros, roles y permisos.
- Multi-tenancy aplicado principalmente mediante filtros manuales por `teamId`; no existe RLS.
- Registry de 24 plugins, manifests, modos `system/global/user/hybrid`, activación por team/miembro, navegación y page registry.
- Pusher para tiempo real de UI, notificaciones persistidas y crons HTTP.
- `activity_logs` y auditorías específicas de pagos, pero no AuditEnvelope empresarial.

### Dominios canónicos existentes

- CRM: `contacts`, funnels, tags, chats, messages, departamentos y asignaciones.
- Clientes: `team_customers`, contactos, stores y transacciones.
- Ventas: `team_sales` y catálogo Articles.
- Membresías: compañías, planes, suscripciones, reglas y candidatos de renovación.
- Finanzas inicial: `team_financial_entries`, receipts, overview y sync AAPP.
- Calendario: `team_events`, reminders y notifications.
- Task OS: workspaces, projects, columns, items, subtasks/checklists, locations, relations, dependencies, media, templates y comments.
- Documentos: folders, documents, links, media y editor Tiptap.
- Notas, drafts, forms, Meta Ads, social publishing, Sites, Domains y Files.
- IA: configuraciones, sesiones de chat, providers y tool calling.
- Conectores: un MCP remoto compartido por Grok, ChatGPT y Claude, OAuth y API read-only; Codex puede usar el mismo transporte.

## 4. Qué se reutiliza

| Necesidad | Fuente canónica reutilizada |
|---|---|
| Identidad y acceso | `users`, `team_members`, departamentos y permisos. |
| Adquisición/oportunidad | `contacts` + funnel; no tabla de oportunidades nueva. |
| Cliente | `team_customers`; la ficha actual se amplía. |
| Venta/producto | `team_sales`, Articles y líneas de venta. |
| Suscripción/renovación | Memberships y candidatos AAPP existentes. |
| Agenda | `team_events`; Meetings no crea calendario. |
| Ejecución | Task OS; Operations no crea gestor de proyectos. |
| Contenido | Documents/Tiptap; Knowledge no crea editor. |
| Captura rápida | Notes y Drafts, con promoción explícita y procedencia. |
| Mensajería | chats/messages y Evolution; ticket no copia conversaciones. |
| Binarios | media existente detrás de un servicio privado y policy común. |
| Publicidad | Meta Ads como fuente de spend e insights. |
| Activación | manifest, registry y capas de activación actuales. |
| Tiempo real | Pusher como hint de UI, nunca como bus durable. |
| Notificación humana | `team_notifications`, separada de eventos/auditoría. |
| Conectores | MCP/OAuth compartidos con adapters delgados por transporte. |

## 5. Qué se extiende

### Núcleo técnico

- `AppPluginManifest`: `dependencies`, `optionalCapabilities`, permisos y versión contractual.
- Guard único `getActivePluginRequestContext`: auth + team activo + membresía + activación + permiso + visibility/policy.
- `MemberPermissions`, presets, mapa de permisos de plugin y `ROUTE_PERMISSIONS`.
- Contexto explícito de team activo; eliminar la selección ambigua por `findFirst`.
- Servicios tenant-scoped que validen todas las relaciones por `(teamId, id)`.
- Migraciones: baseline/journal reconciliado y prohibición de DDL en request.
- Auditoría estructurada, errores tipados, correlation e idempotency.
- API read-only/MCP: enforcement real de actor, scopes, permisos, chat visibility, ACL y field policy.

### Entidades actuales

- `team_events`: `eventType` y servicio canónico de rango/overlap/finalización.
- `team_sales`: `customerId`, line ID estable y atribución N:M; no segundo vendedor canónico.
- `team_financial_entries`: obligación/documento, vencimiento, saldo y recurrencia; no representa por sí sola movimiento de caja.
- `team_task_projects/items/templates`: lifecycle, versionado, status y hooks operativos.
- `team_document_folders/documents`: espacio, lifecycle, ownership y policy compartida.
- Customers: lifecycle postventa, account owner y borrado lógico.
- Webhook inboxes de Evolution/pagos: autenticación, estados reintentables y dedupe por transición.

## 6. Qué se crea

Solo se aprueban conceptualmente las siguientes familias. Los nombres y columnas definitivos se congelan en el plan técnico de cada etapa, después del baseline de migraciones.

### Fundaciones transversales

- `team_domain_event_streams`
- `team_domain_event_outbox`
- `team_domain_event_inbox`
- `team_audit_events` para AuditEnvelope; `activity_logs` queda como compatibilidad/UI legacy.

### Finanzas

- `team_financial_accounts`
- `team_financial_movements`
- `team_financial_movement_legs`
- `team_financial_allocations`
- `team_financial_counterparties`
- `team_financial_cost_centers`
- `team_financial_entry_cost_allocations`
- `team_financial_recurrence_rules`
- `team_financial_exchange_rates`
- aportes/reparto: equity events, policies, runs y run lines, en fase posterior.

### Reuniones

- `team_meeting_details` uno-a-uno con `team_events`.
- `team_event_participants` estructurados.
- `team_meeting_transcripts`, `team_meeting_outcomes`, `team_meeting_ai_runs`.

No se crea `team_meeting_relations`: se usa el contrato transversal de relaciones.

### Equipo y asignación compartida

- `team_member_profiles`, schedules, time off, goals, goal snapshots y performance reviews.
- `team_task_assignees` único, con `memberProfileId` y `allocationBps`.
- `team_operation_project_members` único, también con `memberProfileId` y `allocationBps`.
- `team_sale_attributions` y `team_membership_attributions` N:M.
- commission plans, rules, assignments y ledger reversible.

No se crea `team_project_members` competidora. Porcentaje se almacena en basis points enteros.

### Clientes y Soporte

- customer onboardings.
- support categories, SLA policies, tickets, ticket messages/links y ticket event ledger.
- customer feedback, health snapshots/overrides y renewal cases.

La bitácora de ticket es historial navegable; el outbox contiene una sola publicación por transición y ambos comparten correlation ID.

### Operaciones

- `team_operation_projects` uno-a-uno con Task Project.
- task operational details, blockers, approvals y time entries.
- template bindings y provision runs idempotentes.

### Conocimiento

- `team_knowledge_records` uno-a-uno con Documents.
- `team_document_revisions` inmutables.
- knowledge tags/links y ACL entries.

Embeddings/chunks quedan diferidos hasta demostrar necesidad y filtrado ACL previo al ranking.

### Inteligencia

- metric snapshots reconstruibles.
- projection state.
- alert policies y alert instances.

El Metric Registry vive versionado en código; las tablas no son nuevas fuentes de verdad.

### IA y conectores

- tool runs, immutable action plans, approval receipts y model runs.
- No se crea una tabla o gateway por proveedor.

## 7. Qué no se crea

- CRM, contacto, cliente, usuario, equipo, departamento, calendario o proyecto alternativo.
- Editor de reuniones/conocimiento o almacenamiento binario paralelo.
- Opportunity table mientras funnel+contact sea la representación canónica.
- Ledger financiero dentro de Sales, Support, Operations, Team o Intelligence.
- Data warehouse antes de medir límites de queries/views/snapshots PostgreSQL.
- Kafka, RabbitMQ, BullMQ u otro broker antes de medir el outbox PostgreSQL.
- Conector específico por ChatGPT, Codex, Claude o Grok.
- CRUD/SQL genérico como interfaz principal para agentes.
- Facturación fiscal, impuestos, ARCA, Marangatu, SIFEN o contabilidad fiscal.
- Métricas de CAC/CPL/ROAS/conversión cuando falte atribución o historial.

## 8. Resolución de conflictos detectados

| Conflicto | Resolución maestra |
|---|---|
| Assignees Equipo vs Operaciones | Una sola `team_task_assignees`; perfil laboral tenant-scoped + `allocationBps`. |
| Miembros de proyecto duplicados | Solo `team_operation_project_members`; no `team_project_members`. |
| `sellerUserId` vs atribución N:M | N:M es verdad; vendedor principal, si se conserva, es derivado/compatibilidad. |
| Relaciones por plugin | Generalizar el contrato y registry de `team_task_relations` primero; no crear tablas competidoras. Renombre futuro separado. |
| Media en Tasks/Documents/Files | Servicio/policy común sobre storage existente; no nueva tabla hasta resolver privacidad, ACL y retención. |
| `meeting.completed` | Nombre canónico `meeting.finished`. |
| Eventos con `.v1` en nombre | Nombre estable + `schemaVersion` en envelope. |
| `meta.insights_synced` | `meta.insights.synced`. |
| Health/onboarding | `customer.health.changed` y `customer.onboarding.*`. |
| `sale.paid` vs dinero | Sales declara estado comercial; solo Finance produce `payment.received` por movimiento conciliado. |
| Meta alert vs Intelligence | Meta emite hecho; Intelligence crea/gestiona alerta, sin reevaluar el origen. |
| Project vs work order | Task Project produce `project.*`; perfil Operations produce `work_order.*`. |
| Audit vs event vs bitácora | Tres responsabilidades separadas y correlacionadas. |
| Activación Documents user vs Knowledge global | capability `documents-core`; nunca activación silenciosa ni bypass de policy. |

## 9. Contratos comunes obligatorios

### Contexto y autorización

```ts
type RequestContext = {
  teamId: number;
  actorUserId: number;
  memberId: number;
  role: 'owner' | 'admin' | 'agent';
  permissions: MemberPermissions;
  pluginId?: string;
  correlationId: string;
};
```

Toda operación aplica `scope ∩ permission ∩ plugin activation ∩ visibility ∩ field policy`. IDs externos se resuelven dentro del team; otro tenant devuelve 404 sin side channel.

### Dinero

- monto en minor units entero seguro + ISO 4217 currency;
- sin sumar monedas distintas;
- FX versionado con source, instant, direction y rounding;
- transfers balanceadas mediante legs;
- reversa, nunca edición destructiva de movimiento posteado;
- allocations y shares en basis points cuando corresponda.

### Tiempo

- timestamps UTC, zona IANA de presentación/negocio;
- rangos half-open `[start, end)`;
- business calendar común para SLA, capacidad, vencimientos y recurrencia;
- reglas explícitas para DST.

### Relaciones

`EntityRef { teamId, type, id }` con registry de validadores y capabilities. Primero se extiende `team_task_relations`; cada plugin prohíbe IDs opacos no validados.

### Eventos

- envelope con event ID, team, aggregate, sequence, name, `schemaVersion`, occurredAt, actor, correlation, causation, idempotency y payload mínimo;
- mutación + outbox en la misma transacción;
- entrega at-least-once, inbox por consumer, handlers idempotentes;
- claim con `FOR UPDATE SKIP LOCKED`, lease, retry+jitter y dead letter;
- orden por consumer+aggregate; no prometer exactly-once externo.

### Auditoría

AuditEnvelope separado de outbox: actor, acción, entidad, before/after redacted, metadata, reason, IP real, correlation e idempotency. No usar `activity_logs.ipAddress` como metadata.

### IA

- registry semántico provider-neutral sobre servicios de dominio;
- discovery filtrado por permisos;
- read, low/medium write y high/critical risk;
- high/critical: plan inmutable → approval receipt → execute con expected version e idempotency;
- el modelo no aprueba su propio plan y `confirm:true` no es consentimiento.

## 10. Ownership de dominios

| Hecho | Dueño |
|---|---|
| lead, stage, opportunity | CRM/Contacts |
| customer master | Customers |
| sale y líneas | Sales |
| suscripción/renovación | Memberships |
| obligación, cuenta, movimiento, cobro/pago | Finance |
| agenda | Calendar; Meetings especializa interacción |
| task/project | Task OS; Operations especializa prestación |
| perfil/capacidad/comisión | Team |
| ticket/onboarding/health | Customers & Support |
| documento/cuerpo | Documents; Knowledge gobierna clasificación/ACL |
| spend/insight | Meta Ads |
| métricas/alert instances/prioridades | Intelligence |
| evento durable | Servicio propietario + Events runtime |
| tool execution | AI Gateway; mutación sigue en servicio de dominio |

## 11. Servicios propuestos

### Compartidos

- `active-plugin-context`, `tenant-relation-policy`, `entity-ref-registry`.
- `money`, `business-time`, `audit`, `domain-events` y `private-media`.
- `connector-gateway`, `tool-policy`, `action-plan`, `approval` y `tool-run`.

### Por dominio

- Finance: accounts, entries, movements, allocations, recurrence, cost centers, profitability, distribution.
- Meetings: calendar service, meeting lifecycle, participants, outcomes, transcription and processing.
- Team: profiles, schedules, availability, goals, performance, attribution, commissions.
- Support: onboarding, ticket/SLA, health, renewal and feedback.
- Operations: hardened Task OS, work orders, assignments, approvals, time and provisioning.
- Knowledge: lifecycle, revisions, ACL/policy, tags, search and citations.
- Intelligence: metric registry/query, freshness/quality, projections, alerts and priorities.

Los route handlers, UI, jobs y conectores delegan siempre a estos servicios; no duplican reglas.

## 12. Catálogo canónico de eventos

El detalle normativo vive en `80-integracion-eventos.md`. Catálogo inicial:

- `contact.created`, `contact.stage_changed`, `customer.created`.
- `sale.created`, `sale.paid`.
- `payment.received`, `receivable.overdue`, `payable.due`.
- `membership.created`, `membership.expiring`, `membership.expired`.
- `meeting.created`, `meeting.finished`.
- `ticket.created`, `ticket.resolved`, `ticket.sla_breached`.
- `project.created`, `project.completed`, `work_order.created`.
- `task.created`, `task.overdue`, `task.completed`, `time_entry.approved`.
- `document.created`, `document.published`.
- `meta.insights.synced`, `meta.performance_alert`.
- `customer.health.changed`, `customer.onboarding.*`.
- `intelligence.alert.opened/updated/resolved`.

Scanners de deadlines pertenecen al dominio propietario; Intelligence consume hechos y no crea un segundo scanner.

## 13. Permisos

### Fundaciones

- Extender `MemberPermissions`, presets, settings, route map y plugin permission map juntos.
- Separar read/write de acciones sensibles: approve, manage, compensation, health, finance posting, knowledge publish, intelligence sensitive.
- Roles owner/admin no sustituyen visibility contextual ni field policy en datos sensibles.

### Mínimos por plugin

- `finance.read/write/post/approve/manage`
- `meetings.read/write/finish/process`
- `team.read/write/manage/compensation`
- `support.read/write/assign/manage_sla`
- `operations.read/write/assign/approve/time`
- `knowledge.read/write/publish/manage_acl`
- `intelligence.read/manage_alerts/read_sensitive`

Chat visibility se conserva al navegar desde customer/ticket/meeting. Knowledge aplica ACL incluso por rutas legacy, API read-only y MCP.

## 14. APIs

- Mantener rutas REST bajo `/api/plugins/{plugin}` con Zod, contexto común y servicios canónicos.
- Endpoints de comandos explícitos para finish, post, reverse, approve, resolve, publish y provision; no PATCH ambiguo.
- `Idempotency-Key` y expected version obligatorios para commands reintentables.
- Endpoints internos/admin de outbox, dead-letter/redrive y projection health protegidos.
- API read-only queda como exportación controlada; los agentes consumen tools/resources semánticos.
- Ninguna API recibe `teamId` del cliente como autoridad sin validar la sesión/token.

## 15. Herramientas IA prioritarias

### Finanzas

`obtener_salud_financiera`, `listar_cobros_vencidos`, `proyectar_caja`, `obtener_rentabilidad_cliente`; registrar cobro/pago solo con plan/idempotencia/aprobación según umbral.

### Reuniones

`crear_reunion`, `resumir_reunion`, `extraer_compromisos`, `crear_tareas_desde_reunion`, con evidencia y aprobación de outcomes.

### Equipo

`obtener_capacidad_equipo`, `obtener_disponibilidad`, `detectar_sobrecarga`, `calcular_comisiones`.

### Clientes

`obtener_salud_cliente`, `listar_clientes_en_riesgo`, `listar_tickets_criticos`, `listar_renovaciones`, `detectar_ventas_sin_onboarding`.

### Operaciones

`crear_proyecto_desde_venta`, `detectar_proyectos_en_riesgo`, `obtener_carga_operativa`, con preview y provision run.

### Conocimiento

`buscar_conocimiento_empresa`, `obtener_procedimiento`, `crear_borrador_de_conocimiento`, `publicar_documento` con citas/ACL/approval.

### Inteligencia

`obtener_salud_empresa`, `obtener_prioridades_del_dia`, paneles por área, `explicar_metrica`, `obtener_calidad_datos`.

Codex, ChatGPT, Claude y Grok usan el mismo registry y MCP OAuth. Las tools solo se anuncian cuando dominio, permiso, scope y datos están disponibles.

## 16. UI

- Aplicaciones/registry actual como entrada a plugins activables.
- Finance extiende el dashboard existente: resumen, cuentas, obligaciones, movimientos, cashflow, costos y rentabilidad.
- Meetings converge la UI fragmentada de `team_events` y calendario Task OS; expediente conectado a chat/customer.
- Team: directorio, persona, disponibilidad, objetivos, desempeño y comisiones con privacidad.
- Customers: ficha 360 existente + onboarding, tickets, health y renovaciones; soporte accesible desde Inbox.
- Operations: vistas Task OS existentes + perfil de orden, gates, deliverables, approvals, time/cost.
- Knowledge: shell de Documents con spaces, lifecycle, owner, ACL, review y búsqueda.
- Intelligence: paneles con MetricResult, freshness, quality, capability y drilldown; nunca números sin fuente.
- AI approvals: bandeja humana de planes de alto riesgo con diff, impacto, expiración y actor.

Todas las pantallas requieren loading/empty/error/success, teclado, contraste, responsive, dark mode y estados de permiso/capability.

## 17. Estrategia de migraciones

### Gate previo absoluto

El repositorio tiene 75 SQL frente a 59 entradas de journal, archivos no registrados y prefijos duplicados. Antes de cualquier DDL:

1. inventariar producción y checksums;
2. reconciliar journal y baseline sin reejecutar migraciones aplicadas;
3. fijar número monotónico único;
4. probar forward, reejecución, backup/restore y down en PostgreSQL efímero;
5. prohibir runtime DDL.

### Política

- migraciones aditivas, nullable primero, backfill idempotente por lotes, constraint después;
- dual read/write solo con ventana y telemetría;
- rollback de aplicación/feature flag antes que DROP productivo;
- no borrar evidencia financiera, approvals, revisions, events o audit;
- cada tabla/index tenant-scoped comienza por `teamId` y tiene unique/idempotency coherente.

## 18. Seguridad bloqueante

Antes de datos empresariales sensibles:

1. team activo explícito y guard combinado;
2. relaciones `(teamId,id)` y pruebas cross-tenant;
3. autenticar/verificar webhook Evolution y endurecer Mercado Pago/pagos retries;
4. Pusher privado y payload sin PII;
5. scopes OAuth granulares, target multiusuario y read-only actor-bound;
6. cerrar bypass de ACL en Documents/media/MCP y usar URLs privadas/firmadas;
7. cifrar/provider-secret reference para API keys IA;
8. prohibir batch writes paralelo y delete genérico irreversible;
9. scheduler/worker declarado y observable;
10. corregir `/analytics` para no aceptar team arbitrario.

## 19. Testing

Cada etapa ejecutará en paralelo:

- QA funcional de flujos y UI.
- QA backend de servicios, DB, transacciones y concurrencia.
- QA permisos/privacidad por rol, visibility, ACL y field policy.
- QA multi-tenant con IDs cruzados y ausencia de side channels.
- QA regresión de CRM, WhatsApp, Tasks, Calendar, Documents y pagos.
- QA integración de outbox, inbox, retry, ordering, dead-letter e idempotencia.
- QA IA/conectores de OAuth, scopes, discovery, plans/approvals, prompt injection, SSRF y redacción.

DoD de plugin: migration/rollback, permisos, tenant, validaciones, API, UI, relaciones, eventos, IA aplicable, observabilidad, tests y documentación; compilar no basta.

## 20. Riesgos priorizados

| Severidad | Riesgo | Control |
|---|---|---|
| Crítica | fuga cross-tenant por filtros/FK simples | contexto/servicios tenant-scoped + QA dedicado |
| Crítica | baseline de migraciones divergente | reconciliar antes de DDL |
| Crítica | conectores/read-only sobreprivilegiados | policy por actor/scope/ACL y discovery filtrado |
| Crítica | documentos/media sensibles públicos | storage privado, signed URLs y policy común |
| Alta | efectos perdidos/duplicados | outbox/inbox + idempotencia destino |
| Alta | doble contabilización | source/correlation/reconciliation y bounded contexts |
| Alta | agregación multi-moneda | Money/FX y no sumar currencies |
| Alta | consentimiento IA falso | plan hash + approval receipt + revalidación |
| Alta | ownership duplicado | decisiones de §8 antes de migrar |
| Alta | webhooks falsos/retry roto | firma, inbox y state machine reintentable |
| Media | métricas inventadas | quality/freshness/capability/insufficient data |
| Media | conocimiento obsoleto o filtrado | owner/review/ACL/citations |
| Media | sobrecarga de PostgreSQL | índices, views/snapshots y medir antes de broker/DWH |

## 21. Roadmap aprobado

### Gate 0 — Baseline y seguridad

- reconciliar migraciones y esquema productivo;
- team activo, guard combinado y tenant checks;
- webhook/payment/Pusher/media/read-only/MCP/OAuth/analytics hardening;
- scheduler/worker y secrets.

**Salida:** pruebas de seguridad y multi-tenant verdes; ningún plugin funcional nuevo.

### Gate 1 — Contratos compartidos

- Money/FX, BusinessTime, EntityRef, AuditEnvelope;
- manifest dependencies/capabilities;
- permisos granulares y error/idempotency contracts;
- outbox/inbox en shadow mode con un producer/consumer observador;
- registry IA y policy en shadow mode.

### Etapa 1 — Finanzas + Reuniones

- Finance F1: accounts, obligations, movements, allocations y CxC/CxP;
- Meetings F1/F2: event specialization, participants, finish, outcomes;
- eventos transaccionales, UI y tools read-only primero.

### Etapa 2 — Clientes/Soporte + Operaciones

- onboarding, tickets/SLA, renewal cases y health v1;
- hardening Task OS, work orders, assignees, approvals, time;
- provisioning desde venta solo con stable line ID, binding y preview idempotente.

### Etapa 3 — Equipo + Conocimiento

- perfiles, schedules, absence, capacity, goals y attribution;
- commissions después de Money/attribution;
- Knowledge después de cerrar ACL/storage: lifecycle, revisions, taxonomy y lexical search.

### Etapa 4 — Inteligencia + Eventos + IA

- paneles direct-query sobre métricas confiables;
- alertas y projections tras productores estables;
- prioridades del día;
- tools mutables progresivas con plans/approvals;
- CAC/CPL/ROAS únicamente después de attribution/historia verificable.

### Escala posterior

Broker externo, vector search, warehouse y separación de workers solo con métricas que lo justifiquen.

## 22. Respuestas objetivo

`obtener_salud_empresa` debe responder con corte temporal, moneda, freshness, quality, capabilities y drilldowns sobre dinero, ventas, marketing, clientes, reuniones, soporte, operaciones, equipo y renovaciones. Ausencia de fuente devuelve `not_supported`, `partial` o `insufficient_data`, nunca cero inventado.

`obtener_prioridades_del_dia` ordena hechos accionables con motivo, impacto, vencimiento, responsable y enlace:

1. cobros vencidos;
2. tickets críticos/SLA;
3. leads abandonados;
4. campañas con alerta confiable;
5. proyectos/tareas bloqueados o atrasados;
6. renovaciones próximas;
7. compromisos de reunión y tareas críticas.

## 23. Agentes ejecutados y trazabilidad

| Agente | Alcance | Entregable |
|---|---|---|
| 1 | Arquitectura real | `00-arquitectura-actual.md` |
| 2 | Finanzas | `10-finanzas.md` |
| 3 | Reuniones | `20-reuniones-comunicaciones.md` |
| 4 | Equipo | `30-equipo.md` |
| 5 | Clientes/Soporte | `40-clientes-soporte.md` |
| 6 | Operaciones | `50-operaciones.md` |
| 7 | Conocimiento | `60-conocimiento.md` |
| 8 | Inteligencia | `70-inteligencia-control.md` |
| 9 | Integración/Eventos | `80-integracion-eventos.md` |
| 10 | IA/Conectores | `90-ia-conectores.md` |
| revisión cruzada | duplicación, ownership, eventos, migraciones, security y gates | informe al coordinador, incorporado en §§8, 18 y 21 |

Cada agente modificó solo su documento. No se cambió runtime, esquema, migraciones, APIs ni UI durante esta primera ejecución.

## 24. Próximo paso recomendado

Abrir una iniciativa limitada a **Gate 0**, con planes técnicos y worktrees separados para:

1. baseline de migraciones;
2. contexto/guard/tenant;
3. webhooks y payments hardening;
4. MCP/read-only/OAuth/media/secret security;
5. scheduler/observabilidad.

Recién después de verificar Gate 0 se aprueba Gate 1. Recién después de Gate 1 comienza el plan técnico de Finanzas y Reuniones. Ningún plugin empresarial debe implementarse antes de estos gates.
