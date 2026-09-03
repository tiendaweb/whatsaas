# Reuniones y Comunicaciones

## 1. Resumen ejecutivo

WhatsPro ya tiene la base necesaria para agendar una interacción: `team_events`, el plugin `calendar`, participantes libres en JSON, notas, recordatorios, estado, departamento, usuario y contacto relacionados. También existen Task OS, Documentos, Notas, Clientes, Ventas, chats/mensajes, notificaciones, auditoría e IA. Por lo tanto, **no se debe crear otro calendario, otro gestor de tareas ni otro editor**.

La solución recomendada es un plugin global `meetings` que especialice un `team_event` mediante un expediente de reunión uno-a-uno, participantes estructurados y resultados verificables. La agenda temporal continúa perteneciendo a `team_events`; las tareas continúan en Task OS; las actas editables continúan en Documentos; los archivos se apoyan en el almacenamiento de media ya existente; contactos, clientes, empleados, departamentos, ventas y proyectos se relacionan con sus entidades reales.

Aplicación del principio rector:

1. **Reutilizar:** `team_events`, `team_notifications`, `team_task_items`, `team_documents`, `team_task_media`, `contacts`, `team_customers`, `team_sales`, `team_task_projects`, `users`, `team_members`, `departments`, `chats`, `messages`, configuración IA, permisos y registry de plugins.
2. **Extender:** servicio y API del calendario, tipos de evento, participantes estructurados, relaciones polimórficas validadas, permisos y catálogo de herramientas semánticas.
3. **Relacionar:** cada reunión con participantes y contexto empresarial sin copiar datos maestros.
4. **Especializar:** expediente, transcripción, resultados y procesamiento posterior para los eventos de tipo reunión/interacción.
5. **Crear:** solo tablas específicas que hoy no tienen equivalente: expediente, participantes estructurados, transcripción, resultados y ejecuciones IA.

Este documento es diseño y auditoría. No habilita todavía migraciones ni cambios de runtime.

## 2. Evidencia del repositorio real

### 2.1 Calendario y eventos

| Evidencia | Hallazgo confirmado | Consecuencia |
|---|---|---|
| `lib/db/schema.ts` (`teamEvents`, tabla `team_events`) | Ya guarda `teamId`, título, inicio/fin con zona horaria, `attendees`, notas, recordatorio, estado, departamento, usuario relacionado, contacto y auditoría de autor/fechas. | Es la entidad temporal canónica. Una reunión debe tener exactamente un `eventId`; no se crea `meetings.starts_at` ni un calendario paralelo. |
| `lib/db/migrations/0019_notes_calendar_plugins.sql` | Crea `team_events`, `team_notes` y `team_notifications` con índices por equipo/fecha/estado. | La migración de reuniones debe ser incremental y compatible con eventos existentes. |
| `app/api/plugins/calendar/events/route.ts` | GET por equipo; POST validado con Zod; valida duración y opcionalmente solapamiento; crea notificación. | Conviene extraer lógica a un servicio común antes de sumar reuniones. |
| `app/api/plugins/calendar/events/[id]/route.ts` | PATCH/DELETE con `calendarWrite` y filtro por `teamId`; PATCH no revalida rango ni solapamiento. | Debe corregirse en el servicio canónico para que UI, API y conectores compartan invariantes. |
| `lib/plugins/calendar/manifest.ts` | Plugin global con permisos `calendar.read/write`, rutas y configuración de vista. | `meetings` debe declarar dependencia de `calendar`, cuando el contrato de plugins soporte dependencias. |
| `lib/plugins/calendar/ui/CalendarTaskDashboard.tsx` y `TaskOsScheduleBoard.tsx` | La pantalla de calendario del dashboard actualmente representa fechas de Task OS, no `team_events`. | Integrar una capa “Reuniones” dentro del calendario existente; no copiar la grilla en otro módulo. |
| `app/[locale]/(admin)/admin/calendar/page.tsx` | El calendario administrativo sí consume `/api/plugins/calendar/events`. | Hay dos experiencias parciales que deben converger sobre la misma consulta/servicio. |
| `lib/plugins/grok-connector/server/extended-actions.ts` | `whatspro_manage_calendar_event` ya crea/edita eventos, valida referencias de equipo y audita. | Extender la herramienta existente para agenda básica y agregar herramientas semánticas de reunión; no publicar un CRUD duplicado. |
| `lib/readonly-api/catalog.ts` | Expone `calendar-events` en el API de solo lectura. | Agregar una proyección de reunión sin romper el recurso existente. Corregir durante implementación las columnas de búsqueda declaradas que no existen en `team_events`. |

Brechas confirmadas del calendario actual:

- `attendees` es `string[]`; no distingue empleados, contactos, invitados externos, rol ni asistencia.
- Solo admite un `relatedUserId`, un `contactId` y un `departmentId`.
- No hay tipo de interacción, canal, enlace, ubicación, agenda previa, duración real ni cierre formal.
- El esquema del manifest no declara `enforceOverlapValidation`, aunque el POST intenta leer ese ajuste.
- El POST HTTP y la acción de Grok implementan validaciones de solapamiento distintas; el PATCH HTTP no valida el intervalo resultante.
- La notificación `calendar.event.updated` no es un evento de dominio durable.
- El DELETE actual elimina físicamente. Para reuniones operativas se debe preferir cancelar y conservar trazabilidad.

### 2.2 Recursos que deben reutilizarse

| Dominio | Evidencia | Reutilización propuesta |
|---|---|---|
| Notas | `teamNotes`; `app/api/plugins/notes`; UI de notas | `team_events.notes` conserva las notas rápidas de la interacción. `team_notes` solo se vincula si el usuario decide convertir o adjuntar una nota; no se crea un tercer editor. |
| Documentos | `teamDocumentFolders`, `teamDocuments`, `teamDocumentLinks`, `teamDocumentMedia`; `lib/plugins/documents/server/*` | Acta y transcripción editable se publican como documentos mediante el servicio existente, con control de versión y carpeta “Reuniones”. No duplicar contenido editorial como un editor propio. |
| Contactos/CRM | `contacts` con `chatId`, responsable, departamento, etapa, notas y custom data; rutas de contactos | Participante comercial y oportunidad se referencian por `contactId`. Hoy “oportunidad” es estado/contexto del contacto en el funnel, no una tabla independiente; no crear una entidad oportunidad en este plugin. |
| Clientes | `teamCustomers`, `teamCustomerContacts`; API/UI del plugin customers | Relación a cliente real y derivación de sus contactos. La reunión aparece en la ficha del cliente como actividad relacionada. |
| Usuarios/equipo | `users`, `teamMembers`, `departmentMembers`, `departments` | Participantes internos siempre se validan contra membresía del mismo team. `users` no se duplica. |
| Tareas/proyectos | `teamTaskWorkspaces`, `teamTaskProjects`, `teamTaskItems`, checklist, comentarios, dependencias, media y `teamTaskRelations` | Compromisos aprobados crean tareas reales. Proyecto relacionado es `team_task_projects`. El resultado de reunión solo guarda el vínculo y contexto; Task OS conserva el estado de ejecución. |
| Ventas | `teamSales` y rutas `/api/plugins/sales` | Vincular por ID de venta con validación de tenant. No copiar importes, estado ni productos a la reunión. |
| Chats/mensajes | `chats`, `messages`, visibilidad por asignado/departamento, notas internas y resumen IA de conversación | Abrir contexto desde un chat/contacto y enlazar seguimientos WhatsApp. Los mensajes no prueban que una llamada ocurrió y no deben usarse como registro de llamada sin evidencia del proveedor. |
| Archivos | `teamTaskMedia` ya usa `ownerType/ownerId`; Files y media de documentos | Reutilizar media con `ownerType = calendar_event` para grabaciones/adjuntos. No crear almacenamiento binario paralelo. |
| Notificaciones | `teamNotifications` y `/api/plugins/calendar/notifications` | Avisos para participantes y recordatorios. No usar esta tabla como bus de eventos. |
| IA | `aiConfigs`, proveedores en `lib/plugins/ai-chat`, transcripción de audio y resumen estructurado de conversaciones | Compartir selección de proveedor, límites y transcripción. Crear un orquestador de post-reunión separado del chat, con salida tipada e idempotente. |
| Conectores | Grok MCP, ChatGPT y Claude Code connectors | Exponer capacidades semánticas con el mismo contexto de team, usuario, permisos, activación y auditoría. |

## 3. Alcance funcional

### 3.1 Tipos soportados

El tipo base sigue siendo un evento. `eventType` admite inicialmente:

- `general`
- `internal_meeting`
- `sales_meeting`
- `technical_meeting`
- `video_call`
- `phone_call`
- `whatsapp_call`
- `visit`
- `presentation`
- `onboarding`
- `follow_up`

`general` preserva todos los eventos históricos. Una llamada WhatsApp describe el canal planificado/registrado por el usuario; no se afirma que WhatsApp entregue grabación o duración real si el proveedor no la aporta.

### 3.2 Ciclo de vida

Se conservan los estados existentes de `team_events`:

- `scheduled`: planificada o en curso según hora actual.
- `completed`: finalizada.
- `canceled`: cancelada.

El expediente agrega `actualStartedAt`, `actualEndedAt` y `finishedAt` para diferenciar agenda de ejecución. La transición a `completed` se realiza exclusivamente mediante `finishMeeting()` para publicar `meeting.finished` una vez. Reabrir requiere permiso administrativo, incrementa versión y deja auditoría.

### 3.3 Contenido y relaciones

Cada reunión puede contener:

- agenda previa;
- participantes internos, contactos e invitados externos;
- duración programada y real;
- notas operativas en `team_events.notes`;
- resumen, próximos pasos y estado de procesamiento;
- decisiones y compromisos estructurados;
- enlaces de acceso, ubicación y proveedor de videollamada;
- adjuntos y grabaciones mediante media existente;
- transcripción versionada;
- acta mediante Documentos;
- tareas reales creadas desde compromisos aprobados.

Puede relacionarse con:

- cliente (`team_customers`);
- contactos (`contacts` y `team_customer_contacts`);
- empleados (`users` validados por `team_members`);
- departamento (`departments`);
- proyecto (`team_task_projects`);
- venta (`team_sales`);
- oportunidad (el contacto y su etapa de funnel actual; snapshot opcional en metadata del vínculo);
- ticket, solo cuando Clientes y Soporte entregue una entidad canónica de ticket.

No se crea una FK a un ticket hipotético ni una tabla de oportunidades duplicada.

## 4. Modelo de datos propuesto

### 4.1 Extensión de `team_events`

Migración aditiva:

| Columna | Tipo | Regla |
|---|---|---|
| `event_type` | `varchar(32) NOT NULL DEFAULT 'general'` | Enumeración validada en dominio/API. Índice `(team_id, event_type, starts_at)`. |

No se mueven ni duplican `startsAt`, `endsAt`, `notes`, `status`, `departmentId`, `contactId`, `relatedUserId`, autores ni timestamps. `attendees` se mantiene durante compatibilidad y queda deprecado después del backfill.

### 4.2 Nueva `team_meeting_details`

Especialización uno-a-uno, creada únicamente para tipos de reunión:

| Columna | Propósito |
|---|---|
| `event_id PK/FK -> team_events.id ON DELETE CASCADE` | Identidad compartida; impide dos expedientes para el mismo evento. |
| `team_id FK -> teams.id` | Defensa multi-tenant e índice explícito. Debe coincidir con el team del evento mediante servicio/transacción. |
| `channel` | `in_person`, `video`, `phone`, `whatsapp`, `other`. |
| `location_text`, `join_url`, `provider` | Ubicación/acceso sin fingir integración instalada. |
| `agenda` | Agenda previa; texto simple. |
| `summary`, `next_steps` | Resultado canónico visible aunque Documentos esté desactivado. |
| `actual_started_at`, `actual_ended_at`, `finished_at` | Ejecución real y emisión del cierre. |
| `processing_status` | `idle`, `queued`, `processing`, `review_required`, `completed`, `failed`. |
| `transcript_version` | Versión fuente usada por IA; incrementa al reemplazar/corregir transcripción. |
| `minutes_document_id FK -> team_documents.id ON DELETE SET NULL` | Acta editable opcional; validar mismo team. |
| `created_by`, `updated_by`, `created_at`, `updated_at` | Auditoría de registro. |

No guardar secretos del proveedor ni tokens de reunión en esta tabla. URLs sensibles deben limpiarse y nunca llegar a logs.

### 4.3 Nueva `team_event_participants`

Participación estructurada:

- `id`, `teamId`, `eventId`;
- `participantType`: `user`, `contact`, `external`;
- `userId` nullable, `contactId` nullable;
- `externalName`, `externalEmail`, `externalPhone` nullable;
- `role`: `organizer`, `host`, `required`, `optional`, `guest`;
- `responseStatus`: `invited`, `accepted`, `tentative`, `declined`;
- `attendanceStatus`: `unknown`, `attended`, `partial`, `no_show`;
- `joinedAt`, `leftAt`, `createdAt`, `updatedAt`.

Restricciones:

- exactamente uno entre `userId`, `contactId` o identidad externa según `participantType`;
- usuario perteneciente a `team_members`; contacto perteneciente al mismo `teamId`;
- único `(eventId, participantType, COALESCE(userId/contactId/externalEmail))` mediante índices parciales apropiados;
- todos los accesos se filtran también por `teamId`, no solo por `eventId`.

Backfill: strings reconocibles de `team_events.attendees` pasan a externos; `relatedUserId` y `contactId` pasan a participantes estructurados. El JSON histórico permanece durante al menos una versión de compatibilidad y se escribe en espejo solo durante esa ventana.

### 4.4 Relaciones empresariales

El repositorio ya posee `team_task_relations`, una estructura polimórfica con `teamId`, origen, destino, tipo, metadata, unicidad e índices. Aunque su nombre es específico de tareas, funcionalmente ya relaciona proyecto/tarea/contacto/cliente.

Decisión recomendada para el plan maestro:

- **no crear `team_meeting_relations`**;
- extraer un servicio compartido de relaciones y ampliar de forma backward-compatible los tipos admitidos con `calendar_event` y `sale`;
- conservar tabla, endpoints y exports anteriores como alias mientras se decide una futura renominación no destructiva;
- registrar validadores por tipo que comprueben siempre `teamId`;
- representar oportunidad como vínculo a `contact` con `relationType = opportunity_context` y metadata mínima (`funnelStageIdAtLink`), nunca como registro paralelo;
- agregar `ticket` al registry solamente cuando exista la tabla canónica del plugin de soporte.

Relaciones esperadas: `calendar_event -> customer`, `contact`, `project`, `sale`, `task`, `document`, `chat` y en el futuro `ticket`. Las relaciones con usuarios se modelan como participantes, no en la tabla genérica.

Esto requiere coordinación con Arquitectura, Operaciones, Clientes/Soporte e Integración/Eventos antes de tocar los archivos compartidos de Task OS.

### 4.5 Nueva `team_meeting_transcripts`

Necesaria porque una transcripción tiene versiones, idioma, procedencia y estado propios que no caben en `team_events.notes`:

- `id`, `teamId`, `eventId`;
- `version` y único `(eventId, version)`;
- `source`: `upload`, `manual`, `provider`, `ai_transcription`;
- `language`, `contentText`, `segments jsonb` opcional;
- `mediaId -> team_task_media.id ON DELETE SET NULL`;
- `status`: `processing`, `ready`, `failed`, `superseded`;
- `consentConfirmedAt`, `consentConfirmedBy`;
- `createdBy`, timestamps.

El texto canónico permite buscar/procesar; `segments` solo contiene timestamps/locutores cuando el proveedor realmente los entrega. No se inventan hablantes.

### 4.6 Nueva `team_meeting_outcomes`

Resultados consultables por humanos e IA:

- `id`, `teamId`, `eventId`;
- `type`: `decision`, `commitment`, `next_step`, `risk`, `question`;
- `body`;
- `responsibleUserId` y `responsibleContactId` opcionales;
- `dueAt` opcional;
- `status`: `proposed`, `approved`, `rejected`, `applied`;
- `taskId -> team_task_items.id ON DELETE SET NULL` opcional;
- `source`: `human`, `ai`;
- `confidence` y `sourceRefs jsonb` para trazabilidad;
- aprobador, timestamps.

Un compromiso aprobado puede crear una tarea. Desde ese momento Task OS es fuente de verdad de su ejecución; no se sincroniza manualmente un segundo estado `done` en outcomes. `applied` significa que la acción propuesta se materializó.

### 4.7 Nueva `team_meeting_ai_runs`

Registro idempotente y auditable del procesamiento:

- `id`, `teamId`, `eventId`, `transcriptVersion`;
- `operation`: `post_process`, `summarize`, `extract_outcomes`, `generate_minutes`;
- `provider`, `model` (sin API key), `promptVersion`;
- `status`, `attempt`, `errorCode`, timestamps;
- `inputHash`, `output jsonb` tipado y `usage jsonb`;
- clave única `(eventId, transcriptVersion, operation, promptVersion)`.

No guardar razonamientos internos del modelo. Guardar salida estructurada, referencias de origen y metadatos de costo/uso permitidos.

## 5. Contratos de dominio

### 5.1 Servicio canónico de calendario

Antes de ampliar las rutas, extraer de los handlers actuales:

```ts
type EventInput = {
  title: string;
  startsAt: Date;
  endsAt: Date;
  eventType: EventType;
  reminderAt?: Date | null;
  status?: 'scheduled' | 'completed' | 'canceled';
  departmentId?: number | null;
  relatedUserId?: number | null;
  contactId?: number | null;
  notes?: string;
};

createEvent(ctx, input)
updateEvent(ctx, eventId, patch)
cancelEvent(ctx, eventId, reason?)
validateEventReferences(ctx, input)
validateEventInterval(ctx, input, excludeEventId?)
```

Todas las entradas —UI, REST, Grok, ChatGPT, Claude y automatizaciones— deben usar este servicio. La validación de solapamiento debe cubrir contención en ambas direcciones y definir explícitamente si intervalos contiguos se permiten.

### 5.2 Servicio de reuniones

```ts
createMeeting(ctx, meetingInput)             // transacción event + details + participants + links
updateMeeting(ctx, meetingId, patch)          // valida referencias y versión
finishMeeting(ctx, meetingId, finishInput)    // transición única + outbox
addMeetingTranscript(ctx, meetingId, input)   // consentimiento + versión
requestMeetingProcessing(ctx, meetingId)      // job idempotente
reviewMeetingOutcomes(ctx, meetingId, input)  // aprobar/rechazar
applyMeetingOutcomes(ctx, meetingId, ids)     // Task OS / Documentos
```

Invariantes:

- todo ID se resuelve dentro del `teamId` autenticado;
- `endsAt > startsAt` y `actualEndedAt >= actualStartedAt`;
- solo eventos de tipo soportado tienen expediente de reunión;
- no se finaliza un evento cancelado;
- `meeting.finished` se emite una vez por versión de cierre;
- la IA nunca crea responsables, fechas o decisiones no sustentadas: usa `null` y marca revisión;
- tareas, actas y seguimientos se crean solo con permiso del actor y una clave de idempotencia.

### 5.3 Contrato del plugin

Propuesta de manifest:

- `id: 'meetings'`;
- `activationMode: 'global'`;
- ruta `/plugins/meetings` y detalle `/plugins/meetings/:id`;
- navegación “Reuniones”;
- dependencia requerida de `calendar` y capacidades opcionales `tasks`, `documents`, `files`, `ai-chat`;
- feature flags: `meetings.ai`, `meetings.recordings`, `meetings.external-calendar` solo cuando existan realmente.

El `AppPluginManifest` actual no soporta dependencias. El agente de Arquitectura debe definir una propiedad común (`dependencies`/`optionalDependencies`) antes de que este plugin introduzca una comprobación ad hoc.

Ajustes propios sugeridos: duración por defecto, tipo/canal por defecto, procesamiento IA automático, política de revisión, retención de transcripción y carpeta de actas. La validación de solapamiento permanece en Calendar y su schema debe alinearse con el valor que la API ya consulta.

## 6. Eventos e integración

### 6.1 Estado actual

Confirmado en el repositorio:

- `teamNotifications` es una bandeja persistida de avisos;
- Pusher emite actualizaciones de UI/chat en tiempo real;
- `activityLogs` conserva acciones simples;
- hay crons específicos en `app/api/cron/*`;
- pagos tienen tablas de webhook/idempotencia propias;
- no se encontró un Event Bus/outbox de dominio genérico ni una cola durable compartida.

Por ello no se debe simular `meeting.finished` con una fila de notificación ni con un `pusher.trigger`. Este plugin consumirá la infraestructura transversal definida en `80-integracion-eventos.md`.

### 6.2 Eventos de dominio

| Evento | Productor | Datos mínimos, sin PII innecesaria |
|---|---|---|
| `meeting.created` | `createMeeting` | `eventId`, `teamId`, tipo, inicio/fin, actor, versión. |
| `meeting.updated` | `updateMeeting` | ID, versión, campos cambiados, actor. |
| `meeting.canceled` | `cancelEvent` | ID, motivo opcional, actor. |
| `meeting.finished` | `finishMeeting` | ID, `finishedAt`, transcriptVersion disponible, actor, versión. |
| `meeting.transcript.ready` | transcripción | ID, transcriptId/version, idioma, source. |
| `meeting.ai_processed` | pipeline IA | ID, runId, número de resultados propuestos. |
| `meeting.outcomes.applied` | revisión | ID, IDs de tasks/documentos creados. |

Todos requieren `eventId`/`idempotencyKey`, versión de esquema, `occurredAt`, `correlationId` y `causationId`. Los consumidores deben ser reintentables e idempotentes.

### 6.3 Flujo `meeting.finished`

```text
Usuario/API finaliza reunión
  -> transacción: valida tenant/permiso, actualiza team_events + details, audita, inserta outbox
  -> dispatcher entrega meeting.finished
  -> handler solicita/espera transcripción si corresponde
  -> job IA genera resumen + decisiones + compromisos + fechas/responsables + próximos pasos
  -> persiste borradores con evidencia y estado review_required
  -> notifica a organizador/revisor
  -> usuario aprueba
  -> crea tareas reales en Task OS y relaciones calendar_event -> task
  -> genera acta en Documentos si está habilitado y hay documentsWrite
  -> programa seguimiento confirmado mediante Calendario o Mensajes Programados
  -> publica meeting.outcomes.applied
```

El default seguro es **revisión humana antes de crear tareas, enviar mensajes o programar seguimientos**. Una futura política de autoaplicación debe ser explícita, por team, limitada a acciones reversibles y nunca eludir permisos.

## 7. Permisos y aislamiento multi-tenant

Permisos nuevos propuestos:

- `meetingsRead`;
- `meetingsWrite`;
- `meetingsProcessAi`;
- `meetingsManageRecordings`;
- `meetingsVisibility: 'all' | 'participant' | 'department'`.

Reglas:

- owner/admin: acceso total según políticas de grabación;
- agente `participant`: ve reuniones donde es organizador/participante interno o cuyo contacto/chat puede ver;
- agente `department`: además ve reuniones del departamento al que pertenece;
- invitado externo no obtiene sesión ni acceso al expediente;
- quien puede leer calendario no recibe automáticamente acceso a grabaciones/transcripciones sensibles;
- crear tarea exige también `tasksWrite`; publicar acta exige `documentsWrite`; enviar seguimiento exige el permiso del canal correspondiente;
- la ausencia de un plugin opcional devuelve una capacidad no disponible, no un error destructivo ni una activación silenciosa.

Cada query/UPDATE/DELETE incorpora `teamId`. Antes de insertar una relación se valida que evento, usuario miembro, departamento, contacto, cliente, venta, proyecto, tarea, documento y chat pertenecen al mismo team. Las APIs deben responder 404 ante IDs de otro tenant para no filtrar existencia.

Auditoría mínima: creación/cambio/cancelación/finalización, alta o eliminación de grabación/transcripción, solicitud y resultado IA, aprobación/rechazo de resultados, tareas/documentos/seguimientos creados y reintentos fallidos. `activity_logs.action` actual es demasiado compacto para toda la evidencia; usar el contrato de auditoría común que consolide el plan maestro, manteniendo compatibilidad.

## 8. APIs propuestas

Las rutas de reuniones son una fachada del dominio de Calendar, no un segundo origen de agenda:

| Método y ruta | Función |
|---|---|
| `GET /api/plugins/meetings` | Lista paginada/rango con filtros tipo, estado, participante, departamento, cliente, contacto, proyecto y búsqueda. |
| `POST /api/plugins/meetings` | Transacción de evento + expediente + participantes + relaciones. |
| `GET /api/plugins/meetings/:id` | Expediente agregado con permisos/capacidades. |
| `PATCH /api/plugins/meetings/:id` | Actualización con versión optimista. |
| `POST /api/plugins/meetings/:id/finish` | Cierre idempotente y `meeting.finished`. |
| `POST/DELETE /api/plugins/meetings/:id/participants` | Participantes estructurados. |
| `POST /api/plugins/meetings/:id/media` | Adjuntos/grabaciones usando servicio de media. |
| `POST /api/plugins/meetings/:id/transcripts` | Carga/transcripción con consentimiento y versión. |
| `POST /api/plugins/meetings/:id/process` | Solicita pipeline IA; `202` con `runId`. |
| `GET /api/plugins/meetings/:id/outcomes` | Resultados, evidencia y estado de revisión. |
| `POST /api/plugins/meetings/:id/outcomes/review` | Aprueba/rechaza; no aplica acciones todavía. |
| `POST /api/plugins/meetings/:id/outcomes/apply` | Crea tasks/acta/seguimientos con idempotency key. |
| `POST /api/plugins/meetings/:id/minutes` | Genera/actualiza acta en Documentos si está autorizado. |

Extensiones de rutas existentes:

- `GET /api/plugins/calendar/events` debe aceptar `from`, `to`, `type`, `status` y paginación, evitando cargar todo el historial.
- POST/PATCH de Calendar y herramientas externas llaman al mismo servicio de dominio.
- La respuesta de Calendar incluye un indicador `hasMeetingDetails`, no toda la transcripción.
- El recurso readonly `calendar-events` conserva compatibilidad; se agrega `meetings` como vista segura sin grabaciones ni transcript completo por defecto.

Validación con Zod, límites de texto/archivo, MIME allowlist, URLs `https`, timestamps ISO con offset, control de tamaño de transcript y respuestas de error comunes. Nunca aceptar `teamId`, `createdBy`, provider/model ni estado IA desde el cliente.

## 9. UI propuesta

### 9.1 Calendario existente

Extender `/plugins/calendar` con capas conmutables:

- Tareas;
- Reuniones/eventos;
- ambas.

El mismo rango, navegación mes/semana y detector de solapamiento alimentan ambas capas. Un clic en reunión abre su expediente; un clic en tarea conserva el inspector actual. El calendario administrativo debe reutilizar componentes/queries compartidos o retirarse gradualmente, no continuar como una tercera implementación.

### 9.2 Aplicación Reuniones

`/plugins/meetings` ofrece una vista operativa complementaria, no otra grilla de calendario:

- próximas, hoy, pendientes de cierre y pendientes de revisión;
- filtros por tipo, cliente, responsable y departamento;
- CTA “Nueva reunión”, que crea un `team_event`;
- estados vacíos, carga, error y permisos explícitos.

Detalle `/plugins/meetings/:id`:

- cabecera compacta con fecha, duración, canal, estado y participantes;
- Preparación: agenda, contexto de cliente/venta/proyecto y documentos;
- En vivo: notas y enlaces;
- Resultado: resumen, decisiones, compromisos y próximos pasos;
- Transcripción: contenido, versión, consentimiento y fuente;
- Trabajo: tareas reales y seguimiento;
- Archivos: media existente;
- actividad auditada.

Accesos contextuales:

- desde chat/contacto: “Programar reunión” preselecciona contacto y respeta visibilidad del chat;
- desde cliente: lista cronológica y nueva reunión con cliente/contactos;
- desde venta/proyecto/ticket: vincula la entidad sin copiar sus datos;
- desde tarea: enlaza una reunión de seguimiento mediante la relación existente ampliada.

Responsive: inspector como sheet en móvil, foco visible, navegación por teclado, labels accesibles, contraste, reducción de movimiento y ninguna acción crítica únicamente en hover.

## 10. Inteligencia artificial

### 10.1 Pipeline post-reunión

Entrada mínima: metadatos autorizados, notas, transcripción activa y referencias empresariales necesarias. Salida JSON validada con schema:

- resumen factual;
- decisiones;
- compromisos;
- responsables solo si fueron identificados de forma inequívoca;
- fechas ISO solo si aparecen explícitamente o están confirmadas;
- próximos pasos;
- riesgos/preguntas abiertas;
- referencias a fragmentos o timestamps y confianza.

El pipeline reutiliza `getAIProviderForConfig` y el patrón de resumen/transcripción de conversación, pero no reutiliza `ai_sessions`: esas sesiones pertenecen al chat. Los runs de reuniones necesitan versionado, reintentos e idempotencia propios.

Protecciones:

- consentimiento registrado antes de subir/procesar grabación;
- minimización de PII y retención configurable;
- prompts versionados;
- límite de tamaño y chunking determinista;
- resultado `review_required` si falta responsable/fecha o hay baja confianza;
- ninguna tarea, notificación externa o seguimiento enviado por el modelo sin autorización aplicable;
- al cambiar la transcripción, los resultados previos permanecen auditables pero se marcan obsoletos.

### 10.2 Herramientas semánticas para conectores/agentes

- `crear_reunion`: crea evento, expediente, participantes y relaciones de una vez.
- `actualizar_reunion`: cambia agenda/logística con control de versión.
- `finalizar_reunion`: transición controlada que publica el evento de dominio.
- `resumir_reunion`: crea/consulta un run versionado.
- `extraer_compromisos`: devuelve propuestas con evidencia, no ejecuta cambios.
- `crear_tareas_desde_reunion`: aplica únicamente outcomes aprobados en Task OS.
- `generar_acta_reunion`: usa Documentos, conserva vínculo y versión.
- `listar_reuniones_pendientes_de_seguimiento`: consulta operacional con filtros de acceso.
- `obtener_contexto_reunion`: devuelve contexto mínimo autorizado, sin transcript/recordings salvo permiso explícito.

`whatspro_manage_calendar_event` se conserva para agenda genérica y pasa a usar el servicio común. No debe transformarse en una herramienta monolítica con decenas de campos ni coexistir con otro CRUD equivalente.

## 11. Migraciones y compatibilidad

Orden propuesto, cada paso con `IF NOT EXISTS`/guards siguiendo las migraciones existentes:

1. Agregar `team_events.event_type DEFAULT 'general'` e índice; no reescribir eventos.
2. Crear tablas de details y participantes; backfill de usuario/contacto/attendees históricos en lotes idempotentes.
3. Crear transcripts, outcomes y AI runs.
4. Ampliar el registry compartido de relaciones y sus validadores; no renombrar ni borrar `team_task_relations`.
5. Desplegar lectura dual de attendees; luego escritura estructurada + espejo JSON.
6. Migrar UI/conectores al servicio común.
7. Retirar escritura de `attendees` solo en una versión posterior, después de telemetría y compatibilidad comprobada.

Rollback:

- la primera versión revierte código sin borrar columnas/tablas: los lectores antiguos ignoran datos nuevos;
- nunca eliminar `team_events` ni convertir fechas destructivamente;
- no hacer `DROP` automático de detalles/transcripts/outcomes con datos reales;
- un rollback de schema material se hace con migración explícita, exportación y ventana de mantenimiento.

Dependencia crítica: el número de migración real se elige al implementar, después de sincronizar con las demás ramas/agentes; no reservarlo en este documento.

## 12. Pruebas y criterios de aceptación

### Unitarias

- enumeraciones, intervalos y zonas horarias/DST;
- solapamiento: parcial, contención, igualdad, contiguos y exclusión del propio ID;
- transición programada/completada/cancelada y finalización idempotente;
- participantes exactamente tipados;
- mapeo de relaciones y validadores por entidad;
- schema de salida IA, baja confianza y ausencia de responsable/fecha;
- derivación de duración real.

### Integración backend/DB

- crear reunión inserta event/details/participants/links en una transacción;
- fallo de cualquier referencia hace rollback total;
- todos los CRUD rechazan IDs de otro team con 404;
- constraint uno-a-uno y claves idempotentes;
- backfill repetible sin duplicados;
- cancelación conserva expediente y auditoría;
- cambio de transcript invalida/reversiona runs;
- outbox reintentado no crea tasks/documentos duplicados.

### Permisos

- matriz owner/admin/agent y permisos custom;
- visibilidad `all/participant/department`;
- usuario de otro departamento y contacto/chat no visible;
- transcript/recording protegido aun con `calendarRead`;
- `meetingsProcessAi` sin `tasksWrite` puede proponer pero no aplicar tareas;
- plugin opcional desactivado no ejecuta su acción.

### Funcionales/E2E

- programar desde calendario, chat, cliente, venta y proyecto;
- mover fecha desde calendario y conservar expediente;
- completar con notas, cargar transcripción consentida, revisar resumen y aprobar compromisos;
- crear tareas y abrirlas en Task OS;
- generar acta y abrirla en Documentos;
- estados vacío/carga/error y 360/768/1440 px;
- navegación por teclado, foco, lector de pantalla y reduced motion;
- regresión de calendario de tareas y eventos históricos `general`.

### Contratos/eventos

- schema versionado de `meeting.finished`;
- entrega duplicada, fuera de orden y retry;
- consumidor IA caído no revierte el cierre de la reunión;
- trazabilidad `correlationId` desde cierre hasta task/documento;
- Pusher y notificaciones pueden fallar sin perder el evento durable.

## 13. Fases de implementación

### Fase 0 — Contratos compartidos

- aprobar dependencias de plugins, eventos/outbox, auditoría y relaciones empresariales con Agentes 0, 1 y 9;
- acordar la entidad ticket con Clientes/Soporte y el uso de proyectos con Operaciones;
- unificar validación y service layer de `team_events`.

### Fase 1 — Calendario especializado, sin IA

- migración aditiva de tipo/details/participants;
- API y UI de creación/detalle;
- capas de eventos + tareas en Calendar;
- relaciones con contacto/cliente/venta/proyecto/departamento;
- permisos, auditoría y pruebas multi-tenant.

### Fase 2 — Cierre y operación

- `finishMeeting`, outbox y notificaciones;
- outcomes humanos;
- creación manual/aprobada de tareas;
- acta en Documentos y media/archivos.

### Fase 3 — IA controlada

- transcripts versionados y consentimiento;
- runs, resumen/extracción con revisión;
- herramientas semánticas en conectores;
- observabilidad, costos, reintentos y retención.

### Fase 4 — Proveedores externos opcionales

- Google/Outlook/Zoom/Meet u otros solo como plugins/conectores separados;
- OAuth, webhooks, sync tokens e idempotencia específicos;
- no prometer sincronización, grabación automática ni llamadas hasta implementar y verificar cada proveedor.

## 14. Límites explícitos

No se incluye en este plugin:

- otro calendario o gestor de proyectos;
- editor de documentos o sistema de archivos paralelo;
- entidad duplicada de usuario, cliente, contacto, venta, proyecto u oportunidad;
- videollamada propia, telefonía, grabación automática o sincronización externa ficticia;
- inferir asistencia a partir de un mensaje de WhatsApp;
- envío automático de comunicaciones sin permiso/revisión;
- contabilidad de costos de reuniones (Finanzas podrá consumir duración/resultados más adelante);
- tabla propia de eventos de dominio si el plan transversal adopta una infraestructura común.

## 15. Riesgos y mitigaciones

| Riesgo | Evidencia/impacto | Mitigación |
|---|---|---|
| Dos calendarios de UI divergentes | Dashboard muestra Tasks y Admin consume `team_events`. | Fuente de datos/servicio común y componentes compartidos; capa única en Calendar. |
| Relaciones polimórficas sin FK completa | `team_task_relations` usa tipo+ID. | Registry de validadores tenant-aware, tests por entidad e índices; futura generalización coordinada. |
| Evento perdido o duplicado | No hay bus durable genérico. | Outbox transaccional común, idempotency key y consumidores reintentables. |
| Fuga multi-tenant | Numerosos IDs relacionados. | Resolver todos por `(teamId,id)`, 404 uniforme, transacción y QA dedicado. |
| Acceso excesivo a grabaciones | `calendarRead` hoy es amplio. | Permiso separado, consentimiento, retención y auditoría. |
| IA alucina compromisos | Texto ambiguo o transcript incompleto. | Evidencia/confianza, schema estricto y revisión humana por defecto. |
| Duplicación tasks/outcomes | Commitments tienen ciclo propio. | Outcome es propuesta/aplicación; Task OS es fuente de verdad tras crear `taskId`. |
| Dependencia Documents por usuario | `documents` usa activación `user`. | Resumen canónico en expediente; acta solo cuando capability y permiso estén activos. |
| Compatibilidad de attendees | Integraciones pueden leer `string[]`. | Backfill y dual-write temporal; deprecación medida, no DROP inmediato. |
| Reglas de solapamiento inconsistentes | HTTP, PATCH y Grok difieren. | Extraer una sola función/servicio y pruebas de intervalos. |
| Conflictos de migración concurrente | Varios plugins se diseñan a la vez. | Numerar y aplicar migraciones solo en fase coordinada; commits pequeños. |

## 16. Dependencias inter-plugin

- **Arquitectura actual:** contrato de dependencias, permisos, activación y convenciones de servicio/migración.
- **Integración y Eventos:** outbox, envelope, dispatcher, retry, dead-letter y observabilidad.
- **Operaciones:** Task OS y semántica de proyecto/tarea/plantillas.
- **Clientes y Soporte:** entidad ticket canónica y timeline de postventa.
- **Equipo:** perfil/horario/capacidad de participantes; meetings no duplica esos datos.
- **Conocimiento:** clasificación y búsqueda de actas/decisiones dentro de Documentos.
- **IA y Conectores:** catálogo uniforme de herramientas, scopes y confirmaciones.
- **Inteligencia y Control:** métricas derivadas de reuniones cerradas, outcomes y seguimiento, no acceso directo a grabaciones.

## 17. Informe del agente

### Archivos analizados

- `lib/db/schema.ts`
- `lib/db/migrations/0019_notes_calendar_plugins.sql`
- `lib/plugins/calendar/manifest.ts`
- `lib/plugins/calendar/client/types.ts`
- `lib/plugins/calendar/ui/CalendarDashboard.tsx`
- `lib/plugins/calendar/ui/CalendarTaskDashboard.tsx`
- `lib/plugins/calendar/ui/TaskOsScheduleBoard.tsx`
- `lib/plugins/calendar/ui/CalendarSettings.tsx`
- `app/api/plugins/calendar/events/route.ts`
- `app/api/plugins/calendar/events/[id]/route.ts`
- `app/api/plugins/calendar/tasks/route.ts`
- `app/api/plugins/calendar/notifications/route.ts`
- `app/[locale]/(admin)/admin/calendar/page.tsx`
- `lib/plugins/notes/manifest.ts`
- `app/api/plugins/notes/route.ts`
- `app/api/plugins/notes/[id]/route.ts`
- `lib/plugins/documents/manifest.ts`
- `lib/plugins/documents/server/documents.ts`
- `lib/plugins/documents/server/folders.ts`
- `app/api/plugins/documents/**`
- `lib/plugins/customers/manifest.ts`
- `lib/plugins/customers/ui/CustomerDetail.tsx`
- `app/api/plugins/customers/**`
- `lib/plugins/tasks/manifest.ts`
- `lib/plugins/tasks/server/task-os.ts`
- `lib/plugins/tasks/server/contact-tasks.ts`
- `app/api/plugins/tasks/relations/route.ts`
- `app/api/chats/[id]/tasks/route.ts`
- `app/api/chats/[id]/ai-summary/route.ts`
- `app/api/messages/route.ts`
- `app/api/departments/**`
- `lib/plugins/ai-chat/service.ts`
- `lib/plugins/ai-chat/tools.ts`
- `lib/plugins/grok-connector/server/actions.ts`
- `lib/plugins/grok-connector/server/extended-actions.ts`
- `lib/plugins/core/types.ts`
- `lib/plugins/core/registry.ts`
- `lib/plugins/core/runtime-permissions.ts`
- `lib/plugins/core/page-registry.tsx`
- `lib/permissions.ts`
- `lib/readonly-api/catalog.ts`
- `app/api/cron/**`

### Archivo modificado

- `docs/business-platform/20-reuniones-comunicaciones.md` (único archivo).

### Decisiones principales

- `team_events` permanece como calendario y tiempo canónico.
- Reunión es especialización uno-a-uno, no entidad temporal independiente.
- Tasks, Documents, media, Contacts, Customers, Sales, Projects, Users y Departments siguen siendo fuentes de verdad.
- Participantes, transcripciones, outcomes y runs IA requieren estructuras específicas.
- Oportunidad se representa con contacto/funnel existente; ticket espera al plugin de soporte.
- `meeting.finished` requiere la infraestructura durable transversal; notificaciones/Pusher no sustituyen un bus.
- IA propone y deja evidencia; la aplicación de acciones requiere revisión y permisos por defecto.

### Riesgos principales

- UI de calendario actualmente fragmentada entre tareas y eventos administrativos.
- Solapamiento y validaciones no son uniformes entre HTTP y Grok.
- No existe bus de dominio durable genérico confirmado.
- Relaciones genéricas actuales necesitan ampliación coordinada y validadores fuertes.
- Transcripciones/grabaciones requieren privacidad, consentimiento y retención específicos.

### Próximo paso recomendado

No implementar aún. Consolidar este diseño con `00-arquitectura-actual.md`, `40-clientes-soporte.md`, `50-operaciones.md`, `60-conocimiento.md`, `80-integracion-eventos.md` y `90-ia-conectores.md`. Después, aprobar en el plan maestro cuatro contratos compartidos —dependencias de plugins, eventos/outbox, relaciones empresariales y auditoría/permisos— y recién entonces iniciar Fase 0 con migraciones aditivas y pruebas multi-tenant.
