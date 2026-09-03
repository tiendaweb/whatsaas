# Clientes y Soporte — auditoría y diseño del dominio postventa

## 1. Decisión ejecutiva

WhatsPro ya tiene CRM, contactos, WhatsApp, ventas, clientes, membresías, tareas, proyectos, calendario y una ficha de cliente funcional. Por lo tanto, **Clientes y Soporte no debe registrarse como un segundo CRM ni como una aplicación paralela**.

La decisión propuesta es evolucionar el plugin existente `customers` —manteniendo su ID, activaciones, rutas y datos— para convertirlo en la capa postventa de WhatsPro:

```text
Contacto/lead (CRM)
  → oportunidad (funnel CRM)
  → venta (Sales)
  → cliente (Customers)
  → onboarding (Customers + Tasks + Calendar)
  → prestación (Tasks/Operations)
  → soporte (ticket relacionado a chat/tareas)
  → renovación (Memberships + Scheduled Messages)
  → expansión (CRM/Sales)
```

Orden aplicado: **reutilizar → extender → relacionar → especializar → crear solo si no existe**.

### Responsabilidad del dominio

- convertir de manera controlada una venta en relación de cliente;
- organizar onboarding sin duplicar el gestor de proyectos;
- gestionar casos de soporte con ticket, prioridad, SLA y resolución;
- ofrecer una vista explicable de salud del cliente;
- coordinar renovaciones sin reemplazar Memberships ni Scheduled Messages;
- unir chats, tareas, proyectos, reuniones, documentos y datos económicos alrededor del cliente;
- exponer acciones semánticas a agentes IA con permisos y aislamiento por team.

### Límites explícitos

- CRM sigue siendo dueño de adquisición, contacto, funnel y oportunidad;
- Sales sigue siendo dueño de la venta y sus items;
- Memberships sigue siendo dueño de planes, suscripciones, estado de pago y vencimiento;
- Tasks/Operations sigue siendo dueño de proyectos, tareas, checklists, bloqueos y entregables;
- Calendar/Meetings sigue siendo dueño de reuniones y eventos;
- WhatsApp sigue siendo dueño del chat y los mensajes;
- Finance sigue siendo dueño de mora, cobros y pagos;
- Documents/Files sigue siendo dueño de contenido y binarios;
- el nuevo dominio no crea otro editor, calendario, mensajería, gestor de tareas ni catálogo de clientes.

## 2. Evidencia del repositorio real

### 2.1 Contactos, CRM y WhatsApp

| Evidencia | Estado confirmado | Uso postventa |
|---|---|---|
| `chats` en `lib/db/schema.ts` | Chat aislado por `teamId`, instancia/JID, última interacción del cliente, no leídos y bloqueo de automatizaciones. | Fuente de interacción y actividad; no convertir el chat en ticket. |
| `messages` | Contenido, medios, estado, dirección, IA/automatización, nota interna y timestamp con zona. | Evidencia conversacional; los tickets enlazan mensajes sin copiarlos. |
| `conversation_ai_summaries` | Resumen por chat, cobertura de mensajes/audio y frescura. | Reutilizar para contexto de soporte; generar resumen de caso especializado sin duplicar transcripciones. |
| `contacts` | Contacto por chat, asignación a usuario/departamento, etapa, notas y `customData`. | Sigue siendo persona/lead del CRM y requester/contacto de soporte. |
| `team_customer_contacts` | Relación N:M customer-contact con `teamId`. | Base para una empresa/cliente con varias personas y chats. |
| tags, funnel stages y departamentos | Clasificación y enrutamiento ya operativos. | Reutilizar para triage, segmentación y responsables; no modelar otra taxonomía CRM. |
| APIs de contacto | Actualizan nota, custom fields, agente, departamento, etapa y tags; escriben mensajes de sistema en el chat. | Las transiciones postventa pueden navegar a estas acciones sin duplicarlas. |
| `lib/auth/permissions-guard.ts` | Soporta visibilidad `all`, `assigned` y `department`. | Base de visibilidad para tickets vinculados a chats. |

Hallazgos relevantes:

- `chats.automationDisabled` significa que se cortaron automatizaciones; no es estado de soporte ni cierre de ticket.
- `messages.isInternal` permite notas internas del chat, pero esas notas son chat-scoped, no una bitácora durable de un ticket o de toda la cuenta cliente.
- `contacts.notes` es una nota editable y `app/api/contacts/[id]/notes` la reemplaza; las tools de Grok pueden anexar texto con timestamp. No debe usarse como historial de estados/SLA.
- La resolución de cliente por contacto primero usa `team_customer_contacts` y luego un fallback por teléfono. Ese fallback toma una coincidencia reciente y puede ser ambiguo; no debe iniciar procesos postventa destructivos sin vínculo explícito o coincidencia única.
- Las rutas de chat no aplican todas el mismo guard de visibilidad. La nueva capa debe centralizar el acceso y no copiar patrones antiguos que solo verifican sesión/team.

### 2.2 Entidad y ficha de cliente existentes

- `team_customers` ya es la entidad real compartida por CRM e integraciones: nombre, email, teléfono, fuente, datos externos, imagen, estado, nota principal y auditor de creación/edición.
- `team_customer_contacts`, `team_customer_stores` y `team_customer_transactions` agrupan personas, tiendas y pagos externos.
- `lib/plugins/customers/manifest.ts` registra `customers` como plugin global en `/plugins/customers` con `customers.read`.
- `app/api/plugins/customers/[id]/route.ts` ya compone cliente, contactos, membresías, tiendas, transacciones, tareas y adjuntos.
- `CustomerDetail.tsx` ya muestra membresías, pagos, sitios, contactos, tareas, nota principal, archivos y metadatos.
- `components/chat/CustomerProfileDialog.tsx` ya ofrece desde la bandeja: nota principal del contacto, campos personalizados, situación CRM, notas internas, tareas, archivos, membresía activa y transacciones, con enlace a la ficha completa.
- `app/api/plugins/customers/[id]/tasks` crea o vincula tareas mediante Tasks OS y `team_task_relations`.
- `app/api/plugins/customers/[id]/attachments` reutiliza `team_task_media` con `ownerType='customer'`.
- Grok ya expone `whatspro_register_customer`, evitando duplicados por vínculo, email o teléfono.

Decisión: la ficha actual es el **sistema de registro visual**. Se agregan secciones postventa y endpoints agregados; no se crea `support_customers` ni una segunda vista de perfil.

Limitaciones confirmadas:

- `team_customers.status` solo cubre `active | inactive | archived`; no describe onboarding, renovación o riesgo;
- no hay owner/departamento de cuenta a nivel customer; solo a nivel contacto;
- `team_customer_contacts` no identifica contacto principal ni rol;
- el detalle carga varias colecciones completas y hasta 100 transacciones; debe dividirse/paginarse al crecer;
- DELETE borra físicamente un customer; con tickets/onboarding/historial debe pasar a archivo controlado;
- `team_customers.notes` es una nota única, no una cronología;
- no hay health score, feedback/CSAT, onboarding ni tickets.

### 2.3 Ventas y paso a cliente

- `team_sales` contiene `contactId`, número, estado, items, importes, vencimiento y pago.
- Sus estados son `draft`, `confirmed`, `paid`, `cancelled`, `refunded`.
- La venta no tiene `customerId`, vendedor explícito ni evento de dominio.
- Los items referencian `team_articles`, que ya clasifica producto, servicio, membresía u otro.

Decisión: la venta sigue en Sales. Para una conversión no ambigua debe añadirse `customerId` nullable a `team_sales`, compartido con los planes de Finanzas/Operaciones. Si no existe, el servicio de conversión puede resolver un vínculo único por `contactId`; ante ambigüedad debe pedir revisión, no elegir silenciosamente.

Una venta confirmada/pagada puede:

1. vincular o crear el customer desde el contacto;
2. crear una propuesta de onboarding idempotente;
3. solicitar a Operaciones un proyecto desde la plantilla del servicio;
4. crear reunión inicial mediante Calendar/Meetings;
5. conservar `saleId` como origen navegable.

No toda venta requiere onboarding. La regla depende del artículo/servicio o de una configuración explícita, nunca de un supuesto global.

### 2.4 Membresías y renovaciones existentes

- `team_membership_plans` define precio, modalidad, setup/mantenimiento, características, moneda y visibilidad.
- `team_membership_subscriptions` relaciona plan, empresa, customer/contact, estado de servicio, estado de pago, inicio y vencimiento.
- `team_membership_reminder_rules` y `app/api/cron/membership-reminders` ya envían mensajes o automatizaciones antes/después del vencimiento.
- Para AAPP existen `team_aapp_renewal_configs` y `team_aapp_renewal_candidates`, con reglas `before_30`, `before_14`, `before_3`, `expired`, aprobación/rechazo, destinatario, envío, error e idempotencia por subscription/regla/vencimiento.
- El listado de clientes ya calcula membresías activas y próximo vencimiento.

Decisión: no crear otra suscripción ni otra cola de mensajes de renovación. Se crea un **caso comercial de renovación** que coordina responsable, siguiente acción, negociación y resultado; se relaciona con la suscripción y consume los candidatos/reglas existentes como canales de comunicación.

### 2.5 Tasks OS, proyectos, archivos y comentarios

- Ya existen workspaces, projects, columns, tasks, subtasks, checklist JSON, fechas, estados, múltiples ubicaciones, relaciones, dependencias, media, templates y comentarios.
- `team_task_relations` relaciona workspace/project/task/contact/customer y tiene metadata/idempotencia por relación.
- `createContactTask` crea/reutiliza el proyecto “Tareas de contactos”, relaciona la tarea y publica un mensaje interno en la conversación.
- Las tareas todavía no tienen `assignedUserId` ni `departmentId`; `createdBy` no equivale a responsable.
- `team_task_templates` admite `task`, `project` y `labels` con payload flexible.
- `team_task_media.ownerType/ownerId` ya sirve como almacenamiento relacionado y la ficha de cliente lo usa.

Decisión:

- onboarding usa un proyecto/checklist/plantilla real de Tasks OS;
- un ticket no se modela como una tarea, porque necesita requester, SLA, conversación, resolución, reaperturas y estados propios;
- el ticket puede relacionar cero o muchas tareas internas para ejecución;
- los archivos de ticket/onboarding reutilizan `team_task_media` con owner types validados;
- asignación de tareas depende de la extensión transversal que definan Equipo/Operaciones; mientras tanto, responsable vive en onboarding/ticket.

### 2.6 Calendario, reuniones y notificaciones

- `team_events` ya contiene fechas, asistentes, nota, recordatorio, estado, departamento, usuario relacionado y contacto.
- Calendar valida opcionalmente solapamientos y crea `team_notifications`.
- `team_notifications` ya soporta `entityType/entityId` y bandeja de no leídos.

Decisión: reunión inicial, seguimiento y renovación reutilizan `team_events`/la extensión de Reuniones. El onboarding solo guarda la referencia al evento. Alertas de SLA y renovación reutilizan `team_notifications`; no se crea otra bandeja de alertas.

### 2.7 IA y conectores

- el resumen IA de conversación ya procesa mensajes completos y transcribe audios, con control de acceso por usuario/departamento;
- Grok ya puede gestionar contactos, nota interna, customer, membership, tarea de contacto, proyectos, eventos y mensajes programados;
- el read-only catalog ya expone chats, mensajes, customers, customer links/transactions, sales, memberships, tasks, projects y calendar events;
- no existen herramientas semánticas de soporte, health, onboarding o renovación general.

## 3. Fronteras del dominio

### CRM vs postventa

- **CRM/contacto:** quién es la persona, cómo llegó, etapa, asignación comercial, tags y custom fields.
- **Customer:** organización/persona que ya tiene una relación comercial y puede agrupar varios contactos.
- **Onboarding:** preparación para prestar lo vendido.
- **Operaciones:** ejecución del proyecto/servicio y sus entregables.
- **Ticket:** caso puntual de soporte con compromiso medible.
- **Renovación:** decisión comercial sobre continuidad de una suscripción existente.

“Soporte” no se añade como etapa del funnel. “En riesgo” tampoco reemplaza el estado del customer: es una evaluación derivada y explicable.

### Chat vs ticket

- un chat es un canal continuo y puede contener ventas, soporte y conversaciones generales;
- un ticket delimita un problema, período, prioridad, responsable, SLA y resolución;
- un chat puede tener varios tickets históricos o concurrentes;
- un ticket puede originarse en WhatsApp, formulario, manual o integración;
- el contenido permanece en `messages`; el ticket enlaza los mensajes pertinentes.

### Ticket vs tarea

- el ticket registra compromiso con el cliente;
- la tarea registra trabajo interno;
- cerrar una tarea no resuelve automáticamente un ticket salvo regla explícita;
- resolver un ticket no borra tareas pendientes; genera alerta para revisión.

## 4. Qué se reutiliza, extiende, crea y no se crea

### Reutilizar

- ID/manifest/ruta/permisos del plugin `customers`;
- `team_customers` y su ficha;
- contactos, links customer-contact, chats, mensajes, notas internas y custom fields;
- ventas y catálogo de artículos/servicios;
- suscripciones, candidatos y recordatorios de renovación;
- Tasks OS completo para trabajo interno/onboarding;
- team events para reuniones;
- team notifications para alertas;
- task media, Documents y Files para evidencia;
- conversación AI summary como contexto base;
- registry, guards, activación y conectores existentes.

### Extender tablas existentes

#### `team_customers`

Agregar columnas nullable/backward-compatible:

- `lifecycleStage`: `unknown | pending_onboarding | onboarding | active | renewal_due | expansion | churned`;
- `accountOwnerUserId` y `accountDepartmentId`;
- `becameCustomerAt`, `churnedAt`, `churnReason`;
- `lastHealthScore`, `lastHealthBand`, `healthComputedAt` como cache para listados, nunca como única fuente histórica;
- `updatedAt` sigue siendo técnico y no se usa como “última interacción”.

Conservar `status` para vigencia del registro (`active/inactive/archived`). Un customer puede estar activo y en lifecycle `renewal_due`.

#### `team_customer_contacts`

- `role`: `primary | billing | technical | decision_maker | user | other`;
- `isPrimary` boolean;
- `notes` opcional sobre la relación, no sobre la persona;
- unique parcial para un solo contacto principal por customer;
- las relaciones históricas se desvinculan, no se borra el contacto CRM.

#### `team_sales`

- `customerId` nullable y tenant-validado;
- eventos de transición;
- no copiar items ni totales a Customers.

#### `team_task_relations`

Extender el catálogo/validador de tipos, no la tabla, para admitir `support_ticket`, `customer_onboarding` y `renewal_case`. Toda entidad se valida dentro del mismo team antes de insertar.

#### `customers` manifest/settings

Mantener `id: 'customers'` y `activationMode: 'global'`. Extender settings con:

- horizonte de renovación;
- SLA/default calendar;
- bandas y pesos del health score;
- automatización de onboarding por tipo de artículo;
- feature flags de rollout.

### Tablas nuevas justificadas

#### `team_customer_onboardings`

- `id`, `teamId`, `customerId` obligatorio;
- `saleId`, `subscriptionId`, `serviceArticleId` opcionales;
- `taskProjectId` y `taskTemplateId` para ejecución/checklist;
- `kickoffEventId` para reunión inicial;
- `documentFolderId` opcional para documentación existente;
- `status`: `planned | in_progress | blocked | completed | cancelled`;
- `ownerUserId`, `departmentId`;
- `plannedStartAt`, `dueAt`, `startedAt`, `completedAt`;
- `blockReason`, `notes`, `source`, `idempotencyKey`;
- auditoría de creación/edición;
- unique `(teamId, idempotencyKey)`.

No hay tabla `onboarding_checklist_items`: checklist, tareas, dependencias, responsables, archivos y avance se obtienen de Tasks OS. El progreso se deriva del proyecto relacionado.

Accesos de terceros se representan como solicitudes/checklist y enlaces autorizados. No guardar contraseñas, tokens o secretos en notas, custom fields o JSON de onboarding.

#### `team_support_categories`

- nombre, descripción, estado y orden;
- departamento predeterminado;
- política SLA predeterminada;
- clasificación configurable sin reutilizar tags CRM como catálogo rígido.

Los tags pueden complementar la categoría, pero una categoría es única/operativa para enrutamiento y métricas.

#### `team_support_sla_policies`

- nombre, prioridad aplicable y estado;
- minutos de primera respuesta y resolución;
- zona horaria;
- calendario de atención versionado en JSON semántico;
- estados que pausan el reloj, típicamente `waiting_customer`;
- umbrales de advertencia;
- timestamps/auditoría.

La política aplicada se snapshottea en el ticket para que un cambio futuro no reescriba métricas históricas.

#### `team_support_tickets`

Campos mínimos:

- `id` serial como número seguro; referencia visible derivada `T-{id}`, evitando `count+1` y carreras;
- `teamId`;
- `customerId` nullable y `requesterContactId` nullable, con CHECK que exige al menos uno;
- `chatId` y `sourceMessageId` opcionales;
- `saleId`, `subscriptionId`, `taskProjectId` opcionales;
- `categoryId`, `departmentId`, `assignedUserId`, `slaPolicyId`;
- `type`: `question | support | incident | problem | change | request | maintenance`;
- `priority`: `low | normal | high | urgent`;
- `status`: `new | open | in_progress | waiting_customer | waiting_internal | resolved | closed | cancelled`;
- `subject`, `description`, `resolution`, `rootCause`;
- `firstResponseDueAt`, `resolutionDueAt` y snapshot de targets/calendario;
- `firstRespondedAt`, `resolvedAt`, `closedAt`, `cancelledAt`;
- `slaPausedAt`, `slaPausedSeconds`, `firstResponseBreachedAt`, `resolutionBreachedAt`;
- `reopenCount`, `lastCustomerMessageAt`, `lastAgentMessageAt`;
- idempotencia/origen externo y auditoría.

Reglas:

- mensajes internos no cuentan como primera respuesta;
- primera respuesta es el primer mensaje saliente real enlazado después de la apertura;
- `waiting_customer` puede pausar resolución según la política snapshot;
- `resolved` exige resolución; `closed` confirma finalización;
- reapertura conserva la resolución histórica como evento y recalcula el compromiso según política;
- prioridad urgente no evita permisos ni permite saltar team scope.

#### `team_support_ticket_messages`

- join `teamId`, `ticketId`, `messageId`, `role` (`request | reply | evidence`), timestamps;
- unique `(ticketId, messageId)`;
- no duplica texto/medio;
- el servicio valida que message → chat → team coincida con el ticket.

Esto permite delimitar un caso dentro de un chat continuo y medir respuesta sin copiar mensajes.

#### `team_support_ticket_events`

Bitácora append-only:

- `ticketId`, `teamId`, `eventType`;
- actor usuario o `system/integration/customer`;
- estado/valor anterior y siguiente;
- nota interna o metadata estructurada;
- `messageId`, `correlationId`, `occurredAt`;
- eventos de creación, asignación, prioridad, pausa/reanudación SLA, respuesta, incumplimiento, resolución, cierre y reapertura.

Esta tabla es historial operativo del ticket. Debe integrarse con el contrato transversal de auditoría/eventos para no crear dos hechos contradictorios.

#### `team_customer_feedback`

- customer, ticket y contacto opcionales;
- tipo `csat | nps | ces`;
- escala y score validados, comentario, canal/origen;
- message/external ID para idempotencia;
- submittedAt.

No inferir satisfacción a partir de sentimiento como reemplazo de feedback explícito.

#### `team_customer_health_snapshots`

- customer, team, score 0–100 y banda;
- componentes y razones como JSON versionado;
- `modelVersion`, `dataCompleteness`, `computedAt`;
- índices `(teamId, band, computedAt)` y por customer/fecha.

El cache en `team_customers` acelera listados; snapshots explican tendencias y auditoría.

#### `team_customer_health_overrides`

- customer, banda/score forzado opcional;
- motivo obligatorio, autor, vigencia y expiración;
- no borra el cálculo automático; la UI muestra ambos y quién aplicó el override.

#### `team_customer_renewal_cases`

- `teamId`, `customerId`, `subscriptionId`, `expirationDate`;
- `status`: `upcoming | contact_pending | contacted | negotiating | renewed | lost | dismissed`;
- owner/departamento, `nextActionAt`, `lastContactAt`;
- `renewalSaleId`, `renewedSubscriptionId`, motivo de pérdida y notas;
- health snapshot/risk al abrir el caso;
- unique `(teamId, subscriptionId, expirationDate)`.

El renewal case coordina trabajo humano/comercial. `team_aapp_renewal_candidates` continúa siendo la cola de comunicaciones AAPP y `remindersSent` sigue evitando duplicar recordatorios generales.

### Qué no se crea

- otro customer/contact/funnel/sale/subscription/project/task/calendar/message;
- una tabla de checklist de onboarding;
- una copia de cada mensaje dentro del ticket;
- una cola duplicada de avisos AAPP;
- tickets automáticos para todos los chats históricos;
- un score opaco generado solo por IA;
- una bóveda improvisada de contraseñas;
- una oportunidad de expansión paralela al CRM/Sales;
- un Event Bus exclusivo del plugin.

## 5. Flujos de dominio

### 5.1 Venta → cliente → onboarding

1. `sale.confirmed` o `sale.paid` llega con team, sale, contact y customer si existe.
2. Resolver customer por `sale.customerId` o vínculo único explícito.
3. Si no existe, crear customer y link al contacto con servicio común/idempotente.
4. Evaluar artículos contra configuración de onboarding/plantilla.
5. Crear `team_customer_onboardings` en `planned` con idempotency key.
6. Solicitar a Operations/Tasks crear proyecto desde template.
7. Relacionar customer, sale, onboarding, project y tareas mediante referencias existentes.
8. Crear kickoff `team_event` mediante Calendar/Meetings, si la regla lo indica.
9. Notificar responsable y mostrar “venta sin onboarding” si falta configuración/datos.

Una venta legacy o ambigua entra a una cola de revisión; nunca crea customers/proyectos duplicados por heurística de teléfono.

### 5.2 Onboarding

Estados permitidos:

```text
planned → in_progress → completed
                 ↘ blocked → in_progress
planned/in_progress/blocked → cancelled
```

El progreso se obtiene de tareas/checklist del proyecto relacionado. Completar todas las tareas puede **proponer** finalizar onboarding; el cierre automático solo ocurre si la plantilla lo configura. Al completar:

- cambiar lifecycle a `active` si corresponde;
- registrar evento;
- generar acta/documento si Meetings/Knowledge lo provee;
- programar seguimiento y/o encuesta;
- no activar membresía ni marcar venta pagada: esos dominios mantienen su verdad.

### 5.3 Ticket y SLA

Fuentes:

- desde mensaje/chat de WhatsApp;
- manual desde ficha customer;
- formulario/integración con idempotencia;
- automatización o IA como borrador que un humano confirma si la confianza no es suficiente.

Triage:

1. identificar/link customer y requester;
2. clasificar tipo, categoría y prioridad;
3. resolver departamento, responsable y SLA;
4. snapshot de targets y cálculo con zona/calendario;
5. relacionar mensaje inicial/chat/proyecto/suscripción;
6. crear tareas internas solo cuando haya trabajo ejecutable.

Transiciones principales:

```text
new → open → in_progress → waiting_customer/waiting_internal
                         ↘ resolved → closed
resolved/closed → open (reopened)
new/open/in_progress → cancelled
```

No se permite cerrar sin resolución. Un ticket `waiting_customer` conserva el próximo seguimiento. Los workers generan advertencia y breach idempotentes, con `team_notifications` y eventos.

### 5.4 Renovación y expansión

1. Materializar renewal case para suscripciones activas con vencimiento dentro del horizonte.
2. Enlazar candidatos AAPP y recordatorios existentes por subscription, sin copiarlos.
3. Priorizar por health, mora, valor, días al vencimiento, tickets y estado del servicio.
4. Crear tarea/reunión de seguimiento si falta acción.
5. `renewed`: enlazar nueva/actualizada suscripción y venta de renovación.
6. `lost`: motivo obligatorio; actualizar lifecycle solo si no quedan otros servicios activos.
7. Expansión crea oportunidad/venta borrador en CRM/Sales, no un registro comercial local.

## 6. Customer Health Score

### Principios

- explicable, versionado y recalculable;
- señales reales, no datos inventados;
- missing data no equivale a mala salud;
- IA puede resumir razones, pero no altera el cálculo sin una regla versionada;
- score operativo, no diagnóstico contractual ni financiero.

### Componentes predeterminados

| Componente | Peso inicial | Fuentes reales |
|---|---:|---|
| Pagos y renovación | 25 | membership payment/status/endDate, renewal cases y Finanzas cuando esté activo. |
| Soporte | 25 | tickets abiertos/críticos, SLA, reaperturas y problemas recurrentes. |
| Interacción | 20 | `chats.lastCustomerInteraction`, mensajes y seguimientos. |
| Prestación/onboarding | 20 | onboarding, tareas/proyectos vinculados, vencimientos y bloqueos. |
| Satisfacción | 10 | feedback CSAT/NPS/CES explícito. |

Cada componente devuelve 0–100 y reason codes. Si una fuente no existe o el usuario no tiene su plugin habilitado, el componente queda `unavailable` y los pesos restantes se renormalizan. Con cobertura insuficiente, mostrar `insufficient_data` en lugar de fabricar un score neutral.

Bandas iniciales configurables:

- 80–100: saludable;
- 60–79: atención;
- 40–59: en riesgo;
- 0–39: crítico.

Ejemplos de razones:

- `payment_overdue`;
- `renewal_due_14d`;
- `urgent_ticket_open`;
- `resolution_sla_breached`;
- `no_customer_interaction_30d`;
- `onboarding_blocked`;
- `project_overdue`;
- `repeated_incident`;
- `low_csat`.

El job diario crea snapshot; eventos críticos recalculan al customer afectado. La ficha muestra score, tendencia, cobertura, causas y siguiente acción. Un override humano tiene motivo/vencimiento y no oculta el automático.

## 7. Servicios

Ubicación: `lib/plugins/customers/server/`, manteniendo backend y UI dentro del plugin actual.

| Servicio | Responsabilidad |
|---|---|
| `customers.ts` | Registro, vínculo, lifecycle, primary contact y archivo seguro. |
| `access.ts` | Contexto customers/support + chat visibility + departamento/asignación. |
| `onboarding.ts` | Crear desde venta/template, relacionar proyecto/evento y derivar progreso. |
| `tickets.ts` | Alta, triage, transiciones, resolución, reapertura y referencias. |
| `ticket-messages.ts` | Enlazar mensajes tenant-safe y detectar primera respuesta/reply. |
| `sla.ts` | Calendario, deadlines, pausa/reanudación, warning y breach. |
| `health.ts` | Componentes, score, snapshots, cache, overrides y explicaciones. |
| `renewals.ts` | Materializar/actualizar casos desde Memberships y navegar candidatos. |
| `feedback.ts` | Validar/guardar CSAT/NPS/CES y activar recomputación. |
| `timeline.ts` | Componer eventos, tickets, reuniones, tareas, ventas y renovaciones paginadas. |
| `integrations/*.ts` | Adaptadores Sales, Memberships, Tasks, Calendar, Finance y mensajes. |

Las rutas HTTP y tools IA llaman a estos servicios; no replican queries/transiciones.

## 8. Permisos y visibilidad

### Compatibilidad

- `customersRead` y `customersWrite` siguen protegiendo cliente/ficha;
- `contacts` sigue protegiendo cambios CRM;
- `tasksRead/Write`, `calendarRead/Write`, `membershipsRead/Write` se respetan al ejecutar acciones de esos dominios;
- owner/admin conservan comportamiento actual según el guard común.

### Nuevos permisos propuestos

- `customerOnboardingRead`, `customerOnboardingWrite`;
- `supportTicketsRead`, `supportTicketsWrite`;
- `supportTicketsManage` para categoría, SLA, reasignación y cierre administrativo;
- `customerHealthRead`, `customerHealthOverride`;
- `customerRenewalsRead`, `customerRenewalsWrite`;
- `customerFeedbackRead`.

No crear ACL separada. Extender `MemberPermissions`, presets, settings UI, route permissions y plugin permission map.

### Regla de acceso a ticket

Un usuario necesita `supportTicketsRead` y además una de:

- rol owner/admin o chatVisibility `all`;
- `assignedUserId` igual al usuario;
- pertenecer al `departmentId` del ticket con visibilidad `department`;
- política explícita para tickets no vinculados a chat, basada en asignación/departamento.

La ficha customer no debe filtrar información de otros teams ni convertir `customersRead` en acceso automático a todos los chats. Si se muestran snippets conversacionales/tickets, se aplica la intersección de permisos.

Mutaciones sensibles (override health, cambio SLA retroactivo, resolución administrativa, reapertura masiva) requieren permiso reforzado y auditoría.

## 9. APIs propuestas

### Customers y ficha

- conservar `GET/PATCH /api/plugins/customers/:id` para compatibilidad;
- `GET /api/plugins/customers/:id/overview` con resúmenes, no colecciones infinitas;
- `GET /api/plugins/customers/:id/timeline?cursor=`;
- `GET /api/plugins/customers/:id/health`;
- `POST /api/plugins/customers/:id/health/override`;
- `GET /api/plugins/customers/:id/onboardings`;
- `GET /api/plugins/customers/:id/tickets`;
- `GET /api/plugins/customers/:id/renewals`;
- `POST /api/plugins/customers/:id/archive` en lugar de DELETE destructivo con historial.

### Onboarding

- `GET/POST /api/plugins/customers/onboardings`;
- `GET/PATCH /api/plugins/customers/onboardings/:id`;
- `POST /api/plugins/customers/onboardings/from-sale`;
- `POST /api/plugins/customers/onboardings/:id/create-project`;
- `POST /api/plugins/customers/onboardings/:id/create-kickoff`;
- `POST /api/plugins/customers/onboardings/:id/complete`.

### Tickets

- `GET/POST /api/plugins/customers/tickets` con cursor/filtros;
- `GET/PATCH /api/plugins/customers/tickets/:id`;
- `POST /api/plugins/customers/tickets/from-message`;
- `POST /api/plugins/customers/tickets/:id/transition`;
- `POST/DELETE /api/plugins/customers/tickets/:id/messages`;
- `POST /api/plugins/customers/tickets/:id/tasks` reutilizando Tasks OS;
- `POST /api/plugins/customers/tickets/:id/resolve`;
- `POST /api/plugins/customers/tickets/:id/reopen`;
- `GET /api/plugins/customers/tickets/:id/timeline`;
- `GET/POST/PATCH /api/plugins/customers/support/categories`;
- `GET/POST/PATCH /api/plugins/customers/support/sla-policies`.

### Renovaciones/feedback

- `GET/PATCH /api/plugins/customers/renewals`;
- `POST /api/plugins/customers/renewals/materialize` para admin/job idempotente;
- `POST /api/plugins/customers/renewals/:id/contact` delegando a Scheduled Messages/WhatsApp;
- `POST /api/plugins/customers/renewals/:id/mark-result`;
- `POST /api/plugins/customers/feedback` con token/canal seguro si es público;
- `GET /api/plugins/customers/feedback?customerId=`.

Requisitos comunes:

- Zod estricto, transiciones de estado en servicio, team scope en cada query/join;
- cursor y límites en listas;
- `Idempotency-Key` para creación desde evento/integración;
- no retornar mensajes/archivos sin verificar visibilidad;
- 404 para IDs ajenos sin filtrar su existencia;
- agregados calculados en servidor.

## 10. Eventos y jobs

No se encontró Event Bus general. Este plugin depende del contrato transversal y no debe inventar uno propio.

### Consumidos

- `sale.confirmed`, `sale.paid`, `sale.cancelled`, `sale.refunded`;
- `customer.created`, `customer.updated`;
- `message.received`, `message.sent` para tickets explícitamente vinculados;
- `task.completed`, `task.overdue`, `project.created`, `project.completed`;
- `membership.created`, `membership.expiring`, `membership.expired`, `membership.payment_status_changed`;
- `payment.received`, `receivable.overdue` desde Finanzas;
- `meeting.completed` para compromisos/seguimientos cuando exista.

### Producidos

- `customer.onboarding.created`, `.started`, `.blocked`, `.completed`;
- `ticket.created`, `.assigned`, `.first_responded`, `.sla_warning`, `.sla_breached`, `.resolved`, `.closed`, `.reopened`;
- `customer.health.changed`, `customer.health.critical`;
- `customer.feedback.received`;
- `customer.renewal_due`, `.contacted`, `.renewed`, `.lost`;
- `customer.expansion_suggested` como recomendación, no venta automática.

### Jobs

- reloj SLA: incremental por próximos deadlines, warning/breach idempotente;
- materialización diaria de renewal cases;
- health snapshots diarios y recomputación por eventos;
- detección de ventas sin onboarding;
- seguimientos vencidos de onboarding/ticket/renovación.

Cada job trabaja por team, tiene cursor/lock, reintentos limitados, idempotency key, resultado auditable y métricas. Los deadlines SLA se almacenan; no se recalculan masivamente en cada render.

## 11. UI y compatibilidad con la ficha actual

### Rutas del mismo plugin

- `/plugins/customers`: cartera postventa;
- `/plugins/customers/:id`: ficha 360 existente ampliada;
- `/plugins/customers/onboarding`: cola de puesta en marcha;
- `/plugins/customers/support`: inbox de tickets, no inbox de WhatsApp;
- `/plugins/customers/support/:ticketId`: caso/SLA con conversación relacionada;
- `/plugins/customers/renewals`: cartera de renovaciones;
- `/plugins/customers/settings`: categorías, SLA, health y reglas.

### Cartera de clientes

Extender `CustomersList` con:

- health/banda y causas principales;
- lifecycle/onboarding;
- tickets abiertos/críticos;
- próxima renovación;
- owner/departamento;
- filtros: riesgo, sin seguimiento, vendido sin onboarding, SLA, renovación y source;
- búsqueda/paginación server-side.

### Ficha 360

Mantener encabezado, información, membresías, pagos, sitios, contactos, tareas, nota y adjuntos. Reorganizar en:

1. **Resumen:** nota principal, health, lifecycle, owner y próximas acciones.
2. **Onboarding/prestación:** avance, proyecto, entregables, bloqueos y reunión inicial.
3. **Soporte:** tickets abiertos, SLA, historial y feedback.
4. **Renovaciones:** suscripciones, candidatos, caso y próximo contacto.
5. **Actividad:** timeline paginada de ventas, chats accesibles, eventos, tareas y decisiones.
6. **Documentos/archivos:** referencias a recursos existentes.
7. **Datos actuales:** contactos, sitios, pagos y metadatos.

No cargar todas las secciones en un payload monolítico. Cada tab usa su endpoint paginado y conserva estados de carga/vacío/error/sin permiso.

### Desde la bandeja de entrada

`CustomerProfileDialog` se conserva como vista rápida. Añadir solamente:

- health resumido con cobertura;
- onboarding activo;
- tickets abiertos y acción “crear ticket desde mensaje/chat”;
- renovación próxima;
- enlace claro a ficha completa.

No duplicar en el diálogo el editor completo de SLA, proyecto o renovación. Las notas internas siguen siendo mensajes `isInternal`; los comentarios del ticket viven en su timeline.

### Inbox de soporte

Diseño de tres zonas reutilizando patrones actuales:

- cola con búsqueda, prioridad, SLA y asignación;
- detalle del ticket con timeline/resolución/tareas;
- panel de contexto customer con health, membresía, proyecto y acciones.

Al abrir el chat se navega al inbox WhatsApp existente. No se renderiza un segundo compositor ni se envían mensajes desde un flujo paralelo sin usar las APIs actuales.

Estados necesarios: loading, empty, error, plugin dependiente desactivado, acceso limitado, ticket no vinculado, SLA pausado/incumplido, datos insuficientes de health y modo offline/reintento. Acciones críticas son visibles, accesibles por teclado y confirmadas cuando son destructivas.

## 12. IA y herramientas semánticas

### Lectura/priorización

- `obtener_salud_cliente({customer_id})`;
- `listar_clientes_en_riesgo({banda, owner_id, limite})`;
- `listar_clientes_sin_seguimiento({dias})`;
- `listar_tickets_criticos({departamento_id, responsable_id})`;
- `listar_sla_incumplidos({tipo, desde})`;
- `listar_clientes_proximos_a_renovar({dias, riesgo})`;
- `listar_ventas_sin_onboarding()`;
- `obtener_contexto_ticket({ticket_id})`;
- `obtener_prioridades_postventa_del_dia()`.

### Asistencia

- `triage_ticket`: sugerir tipo/categoría/prioridad/SLA con evidencia;
- `resumir_ticket`: usar mensajes enlazados, tareas y eventos;
- `proponer_respuesta_soporte`: borrador, nunca envío implícito;
- `detectar_problemas_recurrentes`: agrupar por causas/categorías con enlaces;
- `generar_plan_onboarding_desde_venta`: devuelve preview de proyecto/tareas;
- `proponer_siguiente_accion_renovacion`;
- `explicar_health_score`: componentes, fuentes faltantes y cambios.

### Mutaciones controladas

- `crear_ticket_desde_conversacion`;
- `asignar_ticket`;
- `crear_tareas_desde_ticket`;
- `resolver_ticket` con resolución explícita;
- `crear_onboarding_desde_venta` con preview/idempotencia;
- `crear_seguimiento_renovacion`.

Controles:

- permisos efectivos + visibilidad del chat + plugin activo;
- mutaciones idempotentes y auditadas;
- confirmación para resolver/reabrir, crear proyecto o enviar contacto;
- IA no cambia prioridad/SLA/health silenciosamente;
- toda recomendación cita datos (ticket, mensaje, vencimiento, tarea);
- no exponer conversaciones de otros departamentos/teams;
- respuestas distinguen hecho, inferencia y dato faltante.

## 13. Migraciones, backfill y rollback

### Migración aditiva

1. Añadir columnas nullable a customers, customer contacts y sales.
2. Crear tablas nuevas con FK, CHECK e índices tenant-first.
3. Extender permisos/presets/settings con defaults backward-compatible.
4. Extender catálogo de relaciones de Tasks sin cambiar filas existentes.
5. Mantener payload actual de customer detail mientras la UI migra por tabs.
6. Activar secciones nuevas por feature flags/settings del plugin actual.

### Backfill seguro

- `lifecycleStage`: `unknown` por defecto; usar `active` solamente con evidencia de venta/membresía vigente;
- primary contact: asignar automáticamente solo cuando existe un único link; casos múltiples quedan para revisión;
- `team_sales.customerId`: backfill únicamente con una relación customer-contact inequívoca;
- no crear tickets a partir de todos los chats históricos;
- no crear onboarding retroactivo automáticamente: generar reporte/propuestas por ventas elegibles;
- materializar renewal cases de suscripciones activas dentro del horizonte de forma idempotente;
- calcular health después de completar links y marcar cobertura insuficiente cuando corresponda.

### Cambio de borrado

- customers con tickets/onboarding/renewals se archivan;
- tickets y eventos no se borran físicamente: se cancelan/anonimizan según política;
- mensajes siguen la política del dominio WhatsApp;
- desvincular no borra contactos, ventas, tareas ni suscripciones.

### Rollback

El repositorio usa migraciones forward-only. Estrategia:

- desactivar feature flags y volver a la ficha/rutas legacy;
- conservar tablas y datos postventa; no ejecutar DROP en producción como rollback;
- workers se pueden detener sin perder deadlines materializados;
- script compensatorio/destructivo solo para entorno vacío de prueba;
- probar backup/restore, reejecución idempotente y rollback de aplicación antes de desplegar.

## 14. Pruebas y criterios de aceptación

### Unitarias

- máquina de estados de ticket/onboarding/renewal;
- SLA por horario, timezone, fines de semana, DST, pausas y reapertura;
- primera respuesta excluye notas internas;
- health score, renormalización por missing sources, bandas, reasons y overrides;
- horizon/expiración de renewal cases;
- resolución única de customer y detección de ambigüedad;
- progreso derivado de tareas/checklist;
- idempotency keys de sale/message/subscription.

### Backend/DB

- ticket desde mensaje sin copiar contenido;
- impedir message/chat/customer/project de otro team;
- respuesta saliente actualiza primera respuesta una sola vez;
- warning/breach job repetido no duplica eventos/notificaciones;
- cierre exige resolución; reapertura conserva historial;
- venta dispara un solo onboarding;
- completar onboarding no cambia pago/membresía indebidamente;
- renewal case convive con candidatos AAPP sin duplicarlos;
- customer archive conserva historial;
- timeline usa cursor y orden estable.

### Permisos

- owner/admin, soporte, account manager, ventas, operaciones y agente;
- chatVisibility `all/assigned/department` aplicada a tickets y snippets;
- un usuario con customersRead sin supportTicketsRead no ve detalle de ticket;
- un usuario con supportTicketsRead no obtiene finanzas/membresías sin permisos asociados;
- tools IA replican exactamente permisos/visibilidad de UI/API.

### Multi-tenancy

- IDs secuenciales ajenos retornan 404;
- joins customer-contact-chat-message-ticket siempre incluyen team;
- categorías/SLA de otro team no pueden asignarse;
- jobs procesan un team/cursor y no mezclan notificaciones;
- exports, health y agregados no mezclan customers homónimos.

### Regresión

- CRM/funnel/asignaciones/tags continúan;
- inbox y envío WhatsApp continúan;
- CustomerProfileDialog mantiene nota/custom fields/notas internas/tareas/files;
- ficha mantiene memberships/payments/sites/contacts/tasks/attachments;
- Tasks OS no cambia su gestión;
- Calendar/Meetings no se duplica;
- Membership reminders y AAPP candidates continúan idempotentes;
- Sales no cambia sus totales/estados;
- conectores actuales conservan sus tools.

### Rendimiento

- cursor e índices en tickets/timeline/events;
- prueba con 100.000 tickets por team y 1 millón de links de mensajes;
- health incremental por customer, no recomputación global por request;
- cola SLA indexada por próximos deadlines y status;
- customer list sin subqueries N+1 costosas.

## 15. Fases recomendadas

### F0 — Contratos y hardening

- acordar eventos/outbox/auditoría y permisos nuevos;
- centralizar `customers/support access` con chat visibility;
- agregar pruebas al comportamiento actual;
- definir estados, SLA calendar, health v1 y ownership con Sales/Operations;
- paginar ficha/listado sin cambiar UX.

### F1 — Onboarding

- extensiones customer/contact/sale;
- onboarding record + integración Tasks/Calendar;
- cola ventas sin onboarding;
- vista en ficha y tablero;
- eventos e idempotencia sale→customer→onboarding.

### F2 — Tickets y SLA

- categorías, SLA, tickets, message links y timeline;
- soporte queue + ticket detail;
- tasks/media/notifications integrados;
- workers warning/breach;
- CSAT posterior a resolución.

### F3 — Renovaciones

- renewal cases generales;
- integración con Memberships/reminders/AAPP candidates;
- tareas, reuniones, resultado y expansión hacia Sales;
- alertas y cartera priorizada.

### F4 — Health e IA

- feedback, snapshots, componentes y overrides;
- riesgo/prioridades explicables;
- semantic tools read-only;
- luego mutaciones con preview, confirmación e idempotencia.

## 16. Riesgos y dependencias

### Riesgos

1. **Duplicar CRM/inbox/tasks:** mitigado manteniendo `customers`, links a mensajes y Tasks OS.
2. **Customer incorrecto por teléfono:** el fallback actual puede ser ambiguo; procesos de escritura exigen link explícito o coincidencia única.
3. **Filtración por permisos:** customer agrupa contactos de varios departamentos; tickets/snippets requieren intersección con chat visibility.
4. **SLA falso:** inferir cierre desde chat o task es incorrecto; ticket tiene reloj/estado propio.
5. **Score opaco o injusto:** health necesita fuentes, reasons, model version y missing-data explícito.
6. **Doble renovación:** candidates/reminders y renewal case tienen responsabilidades distintas; no duplicar mensajes.
7. **Onboarding duplicado:** sale events/reintentos requieren idempotency key.
8. **Datos sensibles:** no guardar accesos/contraseñas en notas, task payloads o media metadata.
9. **Borrado histórico:** DELETE customer actual debe cambiar a archive cuando haya hechos postventa.
10. **Asignación incompleta en Tasks:** tasks no tiene assignee/departamento; coordinar con Equipo/Operaciones.
11. **Ausencia de event bus general:** no construir workers/listeners incompatibles antes del contrato transversal.
12. **Sin cobertura de tests:** no se encontraron tests de customers/chats/memberships/tasks/calendar/support.
13. **Estado del worktree compartido:** otros agentes modifican documentos y archivos centrales; implementación debe asignar ownership/worktrees antes de tocar registry/schema/permissions.

### Dependencias

- **Arquitectura/Eventos:** outbox, contratos, jobs, auditoría, retry/dead-letter.
- **Operaciones:** project-from-sale, templates, entregables, carga y bloqueos.
- **Reuniones:** extensión customer/project/sale/ticket en team events y actas.
- **Equipo:** assignees, disponibilidad, departamentos y métricas de desempeño.
- **Finanzas:** mora/CxC y valor del cliente.
- **Conocimiento:** documentos/SOP/resoluciones reutilizables.
- **IA/Connectors:** identidad, scopes, confirmación y tool registry.
- **Sales:** customerId/eventos y reglas por artículo.
- **Memberships/Scheduled Messages:** vencimientos, candidatos y comunicaciones.

## 17. Decisiones para el plan maestro

1. Evolucionar `customers`; no crear otro manifest/ID de Clientes y Soporte.
2. Mantener CRM para preventa y Customers para postventa.
3. Crear ticket como caso propio, relacionado pero distinto de chat y task.
4. Reutilizar Tasks OS para onboarding/trabajo interno; no crear checklists paralelos.
5. Crear renewal case de coordinación y conservar candidatos/reminders como entrega de mensajes.
6. Health score determinista, explicable, versionado y consciente de missing data.
7. Extender Sales con customerId y eventos para conversión inequívoca.
8. Aplicar chat visibility también dentro de la ficha/tickets.
9. Reemplazar borrado destructivo por archivo cuando exista historial.
10. Implementar onboarding y tickets antes de health/IA: el score necesita hechos confiables.

## 18. Reporte del agente

### Archivos y áreas analizados

- `lib/db/schema.ts`: chats, messages, contacts, customer links, sales, memberships, renewal candidates, events, notifications, Tasks OS y Documents;
- `lib/plugins/customers/**` y `app/api/plugins/customers/**`;
- `components/chat/CustomerProfileDialog.tsx`, resumen IA y panel de tareas del chat;
- APIs de contactos, asignación, departamentos, funnel y notas;
- rutas/servicios de chats, mensajes y visibilidad;
- `lib/plugins/sales/**` y rutas Sales;
- `lib/plugins/memberships/**`, cron de reminders y subscriptions;
- `lib/plugins/scheduled-messages/aapp-renewals.ts` y APIs de candidates;
- esquema, servicios, relaciones, templates, media y APIs de Tasks OS;
- Calendar events, notificaciones y manifest;
- Documents/Files como fuentes de recursos;
- permisos, plugin registry/page registry, read-only catalog y acciones Grok;
- búsqueda de tickets, SLA, onboarding, health y tests existentes.

### Archivo modificado

- `docs/business-platform/40-clientes-soporte.md` únicamente.

### Decisiones

- ampliar plugin/ficha `customers`;
- customer como agregador postventa;
- onboarding sobre Tasks/Calendar;
- ticket propio con links a chats/messages/tasks;
- renewal case sobre Memberships/Scheduled Messages;
- health explicable sobre señales reales;
- ninguna implementación en esta fase.

### Riesgos

- identificación ambigua customer-contact;
- permisos al cruzar customer con chats/departamentos;
- doble procesamiento por falta de eventos/idempotencia;
- borrado físico actual;
- ausencia de assignee en tareas y de tests;
- datos sensibles en onboarding.

### Dependencias

- Eventos/Jobs, Sales, Operaciones, Reuniones, Equipo, Finanzas, Memberships, Conocimiento e IA/Connectors.
