# Operaciones

## 1. Resumen ejecutivo

WhatsPro ya posee un gestor de trabajo completo, Task OS. Tiene workspaces, proyectos, columnas, tareas, subtareas, checklists, fechas, estados, ubicaciones múltiples, relaciones, dependencias, archivos, comentarios, plantillas, vistas Kanban/Calendario/Gantt, editor cascada, acceso embebido y herramientas de conector. **Operaciones no debe crear otro gestor de proyectos.**

La solución recomendada es un plugin global `operations` que especialice proyectos y tareas de Task OS para representar órdenes de trabajo y prestación empresarial. Un proyecto operativo continúa siendo un registro de `team_task_projects`; una actividad, hito o entregable continúa siendo `team_task_items`. Las tablas nuevas solo agregan contexto que Task OS hoy no modela: origen comercial, servicio/cliente, equipo responsable, estimaciones, entregables/hitos tipados, bloqueos externos, aprobaciones, horas, bindings de plantillas y ejecuciones idempotentes.

Aplicación del principio rector:

1. **Reutilizar:** Task OS completo, Ventas, Clientes, Contactos, Artículos/Servicios, Calendario, Reuniones, Documentos, archivos, Finanzas, equipos/departamentos, permisos, auditoría, plugins y conectores.
2. **Extender:** servicios de Task OS, tipos/metadata operacional, assignees, relaciones, templates, permisos y eventos.
3. **Relacionar:** venta → cliente/contacto → servicio → proyecto Task OS → tareas/entregables → costos Finanzas.
4. **Especializar:** un proyecto Task OS puede convertirse en orden de trabajo; una tarea puede ser actividad, hito, entregable o compuerta de aprobación.
5. **Crear:** únicamente perfiles y registros operativos sin equivalente real: asignaciones, tiempo, aprobaciones, bloqueos, bindings y runs de provisión.

Este documento es auditoría y diseño. No implementa tablas, APIs ni UI.

## 2. Arquitectura real auditada de Task OS

### 2.1 Modelo de datos existente

| Tabla/estructura | Capacidad confirmada | Decisión para Operaciones |
|---|---|---|
| `team_task_workspaces` | Agrupa proyectos por team, orden, apariencia y embed público read/manage. | Reutilizar para áreas operativas, por ejemplo `Operaciones`, `Soporte` o `Implementaciones`. No crear “espacios de operaciones” paralelos. |
| `team_task_projects` | Proyecto con workspace, nombre, fondo, labels JSON, orden, apariencia y embed. | Es la identidad canónica del proyecto/orden de trabajo. Especializar con perfil uno-a-uno. |
| `team_task_columns` | Etapas ordenadas por proyecto. | Reutilizar como flujo operativo configurable: Preparación, Diseño, Desarrollo, QA, Entrega. No crear estados Kanban duplicados. |
| `team_task_items` | Título, notas, labels, checklist JSON, status, `completedAt`, `parentTaskId`, orden, fechas, apariencia y portada. | Es la unidad de trabajo canónica. Hitos, entregables y gates son tipos especializados de tarea. |
| `TaskChecklistItem` | Texto/completado y referencia/snapshot opcional de tarea fuente. | Reutilizar para pasos internos; no usar checklist como sustituto de un entregable aprobable ni de una dependencia. |
| `team_task_item_locations` | Una tarea puede aparecer en varios proyectos/columnas con una ubicación primaria. | Reutilizar para trabajo transversal. Costos, progreso y horas se contabilizan una sola vez por task ID, no por ubicación. |
| `team_task_relations` | Relaciones polimórficas entre workspace/project/task/contact/customer con metadata y unicidad. | Extender mediante registry validado para sale, article/service, finance entry, calendar event, document y ticket futuro; no crear enlaces exclusivos de Operaciones. |
| `team_task_dependencies` | Grafo dirigido de dependencias entre tareas del team. | Reutilizar para bloqueos internos; agregar validación de ciclos y derivación de “bloqueada”. |
| `team_task_media` | Archivos por owner type/id e herencia workspace→project→task; incluye media de contactos relacionados. | Reutilizar para briefs, entregables, evidencia y aprobaciones. No crear almacenamiento binario propio. |
| `team_task_comments` | Comentarios ordenados, autor y team. | Reutilizar para conversación operativa; agregar eventos/menciones si el contrato transversal lo contempla. |
| `team_task_templates` | Tipos `task`, `project`, `labels`, payload JSON. | Extender con schema versionado `operation_project`; no crear una biblioteca de plantillas separada. |
| `dashboard_bookmark_*` | Marcadores de chats y proyectos. | Reutilizar para fijar órdenes críticas en Escritorio. |

Evidencia principal: `lib/db/schema.ts`, migraciones `0031_task_os.sql`, `0036_task_os_workspaces.sql`, `0037_task_os_expansion.sql`, `0039_task_item_appearance.sql`, `0040_task_item_schedule.sql`, `0041_add_workspace_project_stage_appearance_and_task_cover.sql` y `0044_task_os_embed.sql`.

### 2.2 Servicios existentes

`lib/plugins/tasks/server/task-os.ts` ya centraliza parcialmente:

- carga jerárquica de workspaces/proyectos/columnas/tareas;
- reparación de ubicaciones primarias faltantes;
- validadores tenant-aware para task, project, workspace, contact y customer;
- creación/movimiento de tareas y ubicaciones;
- actualización de estado/fechas/checklists/apariencia;
- sincronización de tareas vinculadas a chat como mensajes internos;
- borrado de tarea y limpieza de relaciones/media/mensajes;
- comentarios;
- creación/actualización/borrado de columnas;
- relaciones;
- copia de media;
- detalle de relaciones/dependencias/ubicaciones/media;
- herencia de archivos y media de chats relacionados.

Servicios adicionales:

- `lib/plugins/tasks/server/workspaces.ts`: workspace por defecto y asignación de proyectos sin scope.
- `lib/plugins/tasks/server/contact-tasks.ts`: proyecto `Tareas de contactos`, relación task-contact y proyección de tarea dentro del chat.
- `lib/plugins/tasks/server/embed.ts`: tokens públicos, scopes por workspace/proyecto y acceso read/manage.
- `lib/plugins/tasks/server/cascade-apply.ts`: preview/aplicación masiva por documento jerárquico.
- `lib/plugins/tasks/client/cascade-dsl.ts` y `cascade-scope.ts`: DSL de headings, notas y checklist.

### 2.3 APIs existentes

| Área | Rutas confirmadas |
|---|---|
| Workspaces | `/api/plugins/tasks/workspaces`, `/workspaces/:id`, `/workspaces/:id/embed` |
| Proyectos | `/api/plugins/tasks`, `/projects/:id`, `/duplicate`, `/convert-to-task`, `/embed` |
| Columnas | `/api/plugins/tasks/columns`, `/columns/:id` |
| Tareas | `/api/plugins/tasks/items`, `/items/:id`, `/details`, `/duplicate`, `/share`, `/convert-to-project` |
| Checklist/subtareas | `/items/:id/checklist-to-tasks`, `/checklist-source` |
| Dependencias | `/api/plugins/tasks/dependencies`, `/dependencies/:id` |
| Relaciones | `/api/plugins/tasks/relations`, `/relations/:id` |
| Comentarios | `/items/:id/comments`, `/comments/:commentId` |
| Media | `/api/plugins/tasks/media`, `/media/:id` |
| Plantillas/cascada | `/api/plugins/tasks/templates`, `/cascade` |
| Trabajo diario | `/api/plugins/tasks/today`, `/api/dashboard/tasks` |
| Chat | `/api/chats/:id/tasks` |
| Embed sin sesión | `/api/task-embed/:token/**` |

Todas las rutas de plugin usan `getPluginRequestContext('tasksRead'|'tasksWrite')`; los embeds usan token bearer scopeado. El manifest `lib/plugins/tasks/manifest.ts` registra el plugin global y la ruta `/plugins/tasks`.

### 2.4 UI existente

`lib/plugins/tasks/ui/TasksOSDashboard.tsx` y sus componentes ya ofrecen:

- navegador workspace/proyecto;
- Kanban drag-and-drop;
- Calendar y Gantt reutilizando Calendar;
- alta/edición de columnas y tareas;
- inspector de tarea con resumen, checklist, perfil de contacto, calendario, relaciones, media y comentarios;
- subtareas, parent, dependencias y relaciones;
- mover, copiar, compartir, duplicar, convertir task↔project;
- labels y apariencia;
- archivos en workspace/proyecto/tarea;
- guardado como template;
- editor cascada con preview;
- modal/sheet responsive y navegación entre entidades.

Operaciones debe componer estos componentes y agregar paneles contextuales. No debe copiar el Kanban, Calendar, Gantt, TaskModal o MediaManager.

### 2.5 Conectores y lectura externa

`lib/plugins/grok-connector/server/extended-actions.ts` ya expone:

- `whatspro_create_task_project` con workspace, labels, columnas, tareas y subtareas;
- `whatspro_manage_task_workspace`;
- `whatspro_manage_task_project`;
- `whatspro_manage_task_column`;
- `whatspro_manage_task`;
- `whatspro_create_contact_task`;
- borrado de recursos Task OS con auditoría.

`lib/readonly-api/catalog.ts` publica workspaces, projects, columns, tasks, locations, relations, dependencies, media, templates y comments. Hay inconsistencias a corregir antes de depender de ese catálogo: declara `position` como orden para columnas/locations aunque el schema usa `order`, y declara filtro `userId` para comentarios aunque el campo es `createdBy`.

## 3. Brechas y riesgos confirmados de Task OS

Estos no justifican reemplazar Task OS; indican dónde endurecerlo antes de automatizar operación empresarial:

1. **No hay responsables:** tasks/projects no poseen assignees ni asignación de departamento.
2. **No hay esfuerzo/horas:** fechas existen, pero no estimación, timer ni time entries.
3. **No hay perfil de proyecto:** no existe estado de proyecto, cliente, servicio, venta, presupuesto, manager o prioridad.
4. **No hay entregables/hitos/aprobaciones tipados:** todo es task/checklist/label.
5. **Dependencias sin ciclos:** la API evita self-link pero no detecta ciclos directos o transitivos.
6. **Parent sin integridad:** `parentTaskId` no tiene FK declarada ni validación uniforme de mismo team/proyecto; puede formar ciclos.
7. **Payloads laxos:** varias rutas reciben body sin Zod; status, labels, checklist, order, fechas, parent y media cover no se validan consistentemente.
8. **Alta no atómica:** crear proyecto y luego columnas no ocurre en una transacción; una falla puede dejar proyecto parcial.
9. **Templates incompletos:** POST admite `payload` arbitrario; no hay endpoint claro para actualizar/eliminar/aplicar project/task templates y la UI auditada principalmente los guarda.
10. **Cascade por nombres:** usa nombres/rutas como clave, no IDs/keys estables; no modela assignees, dependencias, offsets, aprobaciones ni hooks.
11. **Duplicación parcial:** duplicate project copia contenido y media, pero no reconstruye de forma completa dependencias/relaciones y puede conservar `parentTaskId`/`sourceTaskId` del proyecto original.
12. **Borrado destructivo:** DELETE de project/task elimina datos; una orden de trabajo requiere cancelación/archivo y retención auditada.
13. **Visibilidad amplia:** cualquier miembro con `tasksRead` obtiene el árbol completo del team; no hay visibilidad por participante/departamento.
14. **Permiso binario:** solo `tasksRead/tasksWrite`; no distingue asignar, aprobar, gestionar templates, horas o costos.
15. **Embed manage:** un token público puede mutar un proyecto. No debe saltar gates/aprobaciones de un proyecto operacional.
16. **Sin eventos de dominio:** Pusher actualiza mensajes de tareas vinculadas a chats, pero no existe emisión durable confirmada de `task.created/completed/overdue` o `project.completed`.
17. **Auditoría desigual:** Grok audita sus mutaciones; las rutas HTTP generales de Task OS no registran el mismo nivel de evidencia.
18. **Carga monolítica:** `loadTaskOsData` hidrata todo el árbol del team; un portfolio empresarial necesitará rangos, filtros y paginación.
19. **Estado ambiguo:** columna Kanban y `task.status` pueden divergir; completar checklist puede marcar `done`, pero mover a “Completado” no define por sí mismo la regla de dominio.
20. **Borrado de columna y ubicaciones múltiples:** debe verificarse que eliminar una columna no destruya indebidamente tareas compartidas cuya ubicación primaria esté allí.

La Fase 0 de implementación debe corregir estos invariantes en servicios comunes, no con excepciones dentro de UI Operaciones.

## 4. Alcance funcional de Operaciones

### 4.1 Orden de trabajo

Una orden de trabajo es un **perfil operacional de `team_task_projects`**, no otro proyecto. Puede nacer de:

- venta/ítem de venta;
- cliente + servicio;
- onboarding;
- ticket/cambio aprobado;
- creación manual sobre un proyecto Task OS existente.

Cadena canónica:

```text
team_sales
  -> SaleItem.articleId
  -> team_articles (tipo service/digital/other según política)
  -> team_customers / contacts
  -> team_task_projects
  -> team_task_items
  -> team_financial_entries vinculados al proyecto
```

No copiar nombre, estado o importes como fuentes paralelas. Se permiten snapshots explícitos en el run/template para auditoría histórica, nunca para sustituir la entidad original.

### 4.2 Trabajo operativo

- actividades y subtareas;
- checklist;
- entregables;
- hitos;
- fechas y Gantt;
- responsables y colaboradores;
- dependencias y bloqueos;
- aprobaciones internas/cliente;
- carga/capacidad;
- horas estimadas/reales;
- presupuesto de costo y costos reales desde Finanzas;
- documentación, archivos, reunión inicial y onboarding mediante plugins existentes.

## 5. Modelo de datos propuesto

### 5.1 Nueva `team_operation_projects`

Especialización uno-a-uno de proyecto Task OS:

| Columna | Regla |
|---|---|
| `project_id PK/FK -> team_task_projects.id ON DELETE CASCADE` | Una sola orden/perfil por proyecto. |
| `team_id FK -> teams.id` | Debe coincidir con team del proyecto; índice de seguridad. |
| `work_order_number` | Único por team. Generar desde ID (`OT-000123`) para evitar secuencias concurrentes. |
| `source_type` | `sale`, `onboarding`, `ticket`, `manual`, `renewal`, `change_request`. |
| `sale_id FK -> team_sales.id ON DELETE SET NULL` | Venta origen. |
| `sale_line_id` | ID estable del ítem de venta; ver compatibilidad. |
| `service_article_id FK -> team_articles.id ON DELETE SET NULL` | Producto/servicio canónico. |
| `customer_id FK -> team_customers.id ON DELETE SET NULL` | Cliente real. |
| `primary_contact_id FK -> contacts.id ON DELETE SET NULL` | Contacto operativo principal. |
| `department_id FK -> departments.id ON DELETE SET NULL` | Área responsable. |
| `manager_user_id FK -> users.id ON DELETE SET NULL` | Validado contra `team_members`. |
| `status` | `draft`, `planned`, `active`, `on_hold`, `completed`, `canceled`. |
| `priority` | `low`, `normal`, `high`, `critical`. |
| `planned_start_at`, `planned_end_at`, `actual_start_at`, `actual_end_at` | Fechas de nivel proyecto; tareas conservan sus propias fechas. |
| `cost_budget_amount`, `cost_budget_currency` | Presupuesto operativo aprobado; no es movimiento financiero. |
| `completion_policy` | JSON tipado/versionado: tareas requeridas, entregables aprobados, gates. |
| `template_id FK -> team_task_templates.id ON DELETE SET NULL` | Plantilla usada. |
| `created_by`, `updated_by`, timestamps | Auditoría. |

Índices: `(team_id,status,planned_end_at)`, `(team_id,customer_id)`, `(team_id,sale_id)`, `(team_id,manager_user_id)` y unique `(team_id,source_type,sale_id,sale_line_id)` cuando el origen sea venta.

`team_sales.items` actualmente es JSON y no tiene ID de línea estable. Antes de disparar órdenes por ítem, extender `SaleItem` con `lineId` inmutable y backfill idempotente. No identificar líneas por nombre/SKU/posición.

### 5.2 Nueva `team_operation_project_members`

- `id`, `teamId`, `projectId`, `userId`;
- `role`: `manager`, `lead`, `member`, `reviewer`, `observer`;
- `allocationPercent` opcional;
- `startsAt`, `endsAt` opcionales;
- único `(projectId,userId,role)`;
- usuario validado contra `team_members`.

No almacena cargo, skills, horario o vacaciones: pertenecen al plugin Equipo. Operaciones solo referencia personas y su asignación a este proyecto.

### 5.3 Nueva `team_task_assignees`

Extensión transversal de Task OS, utilizable también fuera de Operaciones:

- `taskId`, `teamId`, `userId`;
- `role`: `owner`, `contributor`, `reviewer`;
- `allocationPercent` opcional;
- unique `(taskId,userId,role)`;
- timestamps/asignador.

La existencia de esta tabla evita poner un solo `assignedUserId` en task y permite carga compartida. El responsable principal se define como máximo un `owner` mediante constraint/índice parcial.

### 5.4 Nueva `team_operation_task_details`

Especialización opcional uno-a-uno de `team_task_items`:

- `taskId PK`, `teamId`, `projectId`;
- `kind`: `activity`, `milestone`, `deliverable`, `approval_gate`;
- `estimatedMinutes`;
- `billable`;
- `acceptanceCriteria`;
- `weight` para progreso ponderado;
- `requiredForCompletion`;
- `templateKey` estable para idempotencia;
- `createdBy`, `updatedBy`, timestamps.

Reutilizaciones:

- título/notas/checklist/status/fechas siguen en task;
- hito usa `dueDate`/`endDate`, no otra fecha paralela;
- entregable usa media/documents y aprobación;
- subtarea continúa con `parentTaskId` después de reforzar FK/ciclos.

### 5.5 Nueva `team_operation_blockers`

Las dependencias incompletas producen bloqueos **derivados** y no requieren duplicación. Esta tabla guarda bloqueos no expresables como dependencia:

- `id`, `teamId`, `projectId`, `taskId` opcional;
- `type`: `external`, `customer`, `decision`, `resource`, `approval`, `incident`;
- descripción, severidad, owner user, fecha esperada;
- `status`: `open`, `resolved`, `canceled`;
- resolución, resolvedBy/At, timestamps.

El estado visible “Bloqueado” resulta de dependencia pendiente o blocker abierto. No se agrega un booleano que pueda quedar desincronizado.

### 5.6 Nueva `team_operation_approvals`

- `id`, `teamId`;
- exactamente uno de `projectId` o `taskId`;
- `approvalType`: `internal`, `customer`, `quality`, `financial`, `scope_change`;
- `status`: `pending`, `approved`, `rejected`, `changes_requested`, `canceled`;
- requestor user, approver user/contact;
- solicitud, decisión, timestamps;
- evidencia `mediaId`/`documentId` opcional;
- `version` del entregable aprobado;
- `idempotencyKey` único por team.

El embed público `manage` no constituye una aprobación válida. La aprobación externa futura necesita un token de acción de un solo propósito, expiración y evidencia, no acceso total al board.

### 5.7 Nueva `team_operation_time_entries`

- `id`, `teamId`, `projectId`, `taskId`, `userId`;
- `startedAt`, `endedAt`, `durationMinutes`;
- `source`: `timer`, `manual`, `import`;
- descripción;
- `billable`;
- `status`: `draft`, `submitted`, `approved`, `rejected`;
- aprobador y timestamps;
- `hourlyCostSnapshot` y currency solo al aprobar, obtenido del perfil Equipo autorizado;
- `financeEntryId` opcional si se contabiliza como costo operativo;
- idempotency/external source para importaciones.

Reglas: no intervalos negativos, no timers abiertos duplicados por usuario, no solapamientos configurables, edición limitada después de aprobar y duración máxima razonable. El costo no se inventa: si el perfil no tiene tarifa, queda desconocido.

### 5.8 Extensión de `team_task_templates`

Agregar un tipo `operation_project` al mismo catálogo y validar payload con Zod/versionado:

```ts
type OperationTemplateV1 = {
  schemaVersion: 1;
  project: { namePattern: string; completionPolicy: CompletionPolicy };
  columns: Array<{ key: string; title: string; order: number }>;
  tasks: Array<{
    key: string;
    columnKey: string;
    parentKey?: string;
    kind: 'activity' | 'milestone' | 'deliverable' | 'approval_gate';
    title: string;
    notes?: string;
    checklist?: Array<{ key: string; text: string }>;
    estimatedMinutes?: number;
    startOffsetDays?: number;
    dueOffsetDays?: number;
    roleKey?: string;
    requiredForCompletion?: boolean;
  }>;
  dependencies: Array<{ taskKey: string; dependsOnKey: string }>;
  optionalHooks: Array<'meeting.initial' | 'customer.onboarding' | 'documents.folder'>;
};
```

Keys estables, no nombres, resuelven dependencias y reintentos. Cascade sigue siendo editor masivo humano, pero no reemplaza este contrato de provisión.

### 5.9 Nueva `team_operation_template_bindings`

Mapea una fuente comercial a una plantilla:

- `teamId`, `articleId`/`articlePlanId` opcional;
- `templateId`;
- trigger `sale_confirmed`, `sale_paid`, `manual`;
- workspace destino;
- reglas de rol y offsets;
- enabled, prioridad y timestamps;
- unique por fuente/trigger activo.

### 5.10 Nueva `team_operation_provision_runs`

Ejecución durable e idempotente:

- `teamId`, `sourceType`, `saleId`, `saleLineId`, `templateId`;
- `projectId` resultado;
- `status`: `queued`, `running`, `completed`, `partial`, `failed`, `canceled`;
- `inputSnapshot`, `result`, `warnings`, `errorCode`;
- `idempotencyKey`, `attempt`, timestamps, actor/correlation ID;
- unique `(teamId,idempotencyKey)`.

No crear una segunda orden al reintentar. Los hooks opcionales fallidos quedan como warnings/retryables sin duplicar el proyecto base.

## 6. Relaciones y fuentes de verdad

| Dato | Fuente de verdad |
|---|---|
| Venta, estado, moneda e ingreso | `team_sales` y Finanzas cuando registre el movimiento. |
| Línea/servicio vendido | `SaleItem.lineId` + `team_articles`; snapshot del run solo para auditoría. |
| Cliente/contacto | `team_customers`, `team_customer_contacts`, `contacts`. |
| Proyecto, columnas, tarea, checklist, fechas | Task OS. |
| Responsable/colaboradores | `team_task_assignees` y project members, referenciando `team_members/users`. |
| Skills, horario, licencia, tarifa | Equipo; Operaciones consume, no copia. |
| Dependencia interna | `team_task_dependencies`. |
| Bloqueo externo | `team_operation_blockers`. |
| Archivos | `team_task_media`/Documentos. |
| Reunión inicial | `team_events` + especialización Meetings. |
| Onboarding cliente | Clientes y Soporte. |
| Presupuesto de costo | perfil operacional aprobado. |
| Costo real monetario | Finanzas; time entries aportan costo laboral con procedencia. |
| Actas/procedimientos | Documentos/Conocimiento. |

La relación polimórfica existente debe extraerse a un registry compartido y admitir `sale`, `article`, `finance_entry`, `calendar_event`, `document` y `ticket` cuando exista. Cada tipo tiene validador `(teamId,id)`. No renombrar destructivamente `team_task_relations` en la primera etapa.

## 7. Flujo solicitado: venta “Tienda Online” → operación Ecommerce

### 7.1 Preparación

1. En Artículos existe un artículo real `Tienda Online`, preferentemente de tipo `service`.
2. En `team_task_templates` existe `Ecommerce v1`, schema `operation_project`.
3. Un binding relaciona `articleId` con la plantilla y trigger `sale_confirmed` o `sale_paid` según política del team.
4. Roles abstractos de plantilla (`project_manager`, `designer`, `developer`, `qa`) se resuelven contra miembros/Equipo al aplicar; si no hay persona válida, la tarea queda sin asignar y produce warning, no se asigna arbitrariamente.

### 7.2 Plantilla Ecommerce de referencia

```text
Workspace: Operaciones
Proyecto: {customer.name} · Tienda Online · {sale.saleNumber}

Preparación
  - Validar alcance y datos vendidos
  - Reunir accesos y contenido
  - Reunión inicial [milestone]

Diseño
  - Arquitectura de información
  - Diseño visual
  - Aprobación de diseño [deliverable + customer approval]

Desarrollo
  - Configurar entorno
  - Implementar catálogo y checkout
  - Configurar dominio e integraciones

QA
  - Pruebas responsive
  - Pruebas de compra/pago
  - Correcciones críticas
  - Aprobación QA [approval_gate]

Entrega
  - Publicar producción [milestone]
  - Capacitación/entrega [deliverable]
  - Documentar accesos y operación
  - Cierre y aprobación cliente [approval_gate]
```

Las dependencias se expresan por `taskKey`, no por orden textual. Checklist contiene validaciones internas. Los entregables contienen criterios de aceptación y archivos/documentos reales.

### 7.3 Ejecución idempotente

```text
sale.confirmed/sale.paid
  -> localizar cada lineId con binding activo
  -> crear/adquirir provision_run con idempotency key
  -> validar team, venta, artículo, contacto y cliente
  -> si no existe customer canónico: detener customer_required; no duplicarlo silenciosamente
  -> transacción: Task project + columnas + tasks + details + dependencies + assignees resolubles
  -> perfil operation_project con sale/customer/service/template
  -> relaciones explícitas y polimórficas
  -> commit + operation.work_order.created
  -> hooks opcionales idempotentes:
       meeting.initial
       customer.onboarding
       documents.folder
  -> completed o partial con warnings
```

No disparar por coincidencia del texto “Tienda Online”. Se usa `articleId`/binding. No asumir que una venta pagada siempre debe comenzar inmediatamente: la política del binding decide confirmed, paid o manual.

## 8. Contratos de dominio

### 8.1 Endurecimiento Task OS

Todas las rutas, UI y conectores deben usar los mismos servicios:

```ts
createProject(ctx, input)
updateProject(ctx, projectId, patch)
archiveProject(ctx, projectId, reason)
createTask(ctx, input)
updateTask(ctx, taskId, patch)
completeTask(ctx, taskId, completionInput)
addDependency(ctx, taskId, dependsOnTaskId)
assignTask(ctx, taskId, assignments)
instantiateTaskTemplate(ctx, templateId, input)
```

Invariantes:

- Zod estricto y límites en todos los payloads;
- referencias del mismo team;
- proyecto y columnas creados en transacción;
- parent del mismo team, sin self/ciclos y política de mismo proyecto;
- dependencias sin ciclos;
- status permitido y transición explícita;
- fechas coherentes (`end >= start`, `due` según política);
- cover media perteneciente a task/team;
- hooks de Operaciones ejecutados en dominio, no solo en UI;
- evento y auditoría dentro de la misma unidad lógica;
- mutación idempotente para conectores/automatizaciones.

### 8.2 Servicio Operaciones

```ts
createWorkOrderFromSale(ctx, saleId, lineId, options)
promoteProjectToWorkOrder(ctx, projectId, profile)
updateWorkOrder(ctx, projectId, patch)
assignProjectTeam(ctx, projectId, assignments)
addOperationalBlocker(ctx, input)
requestApproval(ctx, input)
decideApproval(ctx, approvalId, decision)
startTimer(ctx, taskId)
stopTimer(ctx, timeEntryId)
submitTime(ctx, timeEntryIds)
approveTime(ctx, timeEntryIds)
completeWorkOrder(ctx, projectId)
calculateProjectProgress(ctx, projectId)
calculateProjectCost(ctx, projectId, asOf)
getCapacity(ctx, horizon)
```

`completeWorkOrder` valida la `completionPolicy`: tasks requeridas terminadas, dependencias resueltas, blockers críticos cerrados y entregables/gates aprobados. Mover una tarjeta a la última columna no salta estas reglas.

### 8.3 Contrato del plugin

Propuesta:

- `id: 'operations'`;
- `activationMode: 'global'`;
- rutas `/plugins/operations`, `/plugins/operations/work-orders/:id`, `/plugins/operations/templates`, `/plugins/operations/capacity`;
- dependencia requerida `tasks`;
- capacidades opcionales `sales`, `customers`, `articles`, `finance`, `calendar`, `meetings`, `documents` y futuro `team`/`support`.

El manifest actual no expresa dependencias. El contrato común debe agregar required/optional dependencies; Operaciones no implementará checks ad hoc irrepetibles.

## 9. Capacidad, carga y horas

### 9.1 Cálculo

Por usuario y horizonte:

```text
capacidad_disponible
  = minutos laborales del perfil Equipo
  - ausencias/licencias/vacaciones
  - bloqueos de calendario configurados

carga_planificada
  = suma de estimatedMinutes asignados y distribuidos entre start/end

utilización
  = carga_planificada / capacidad_disponible

carga_real
  = suma de time entries aprobados
```

Reglas:

- una tarea con varios assignees reparte según allocationPercent o se marca indeterminada;
- una task compartida en varias locations se cuenta una vez;
- backlog sin fecha aparece aparte, no se reparte arbitrariamente;
- sin estimatedMinutes no se trata como cero: se muestra “sin estimar”;
- sin perfil de disponibilidad se usa un default explícito del team, marcado como supuesto;
- no sumar horas de monedas/costos diferentes sin conversión acordada.

### 9.2 Bloqueos y riesgo

Proyecto en riesgo si, por reglas configurables:

- hito vencido;
- critical path supera fecha final;
- tarea requerida atrasada;
- dependencia pendiente bloquea trabajo próximo;
- blocker crítico abierto;
- aprobación excede SLA;
- capacidad asignada insuficiente;
- horas reales superan estimación/umbral;
- costo comprometido supera presupuesto.

No etiquetar riesgo solo por cantidad de tareas.

## 10. Integración con Finanzas

El repositorio ya tiene `team_financial_entries` con ingresos/egresos, monto en unidad mínima, moneda, estado, recurrencia y relaciones a customer/membership. Aún no tiene `projectId`, `departmentId`, `serviceArticleId` ni centro de costo.

Contrato coordinado con Finanzas:

- Finanzas amplía entradas/centros de costo para relacionar proyecto, servicio y departamento o adopta la relación empresarial común;
- Operaciones nunca inserta directamente en tablas de Finanzas desde UI;
- usa un servicio `recordOperationalCost`/evento idempotente;
- time entry aprobada puede generar costo laboral con `externalSource='operations_time_entry'` y `externalId=<id>` una sola vez, si la política lo habilita;
- compras/proveedores/herramientas se registran en Finanzas y se vinculan al proyecto;
- ingreso proviene de venta/cobro, no de completar tareas;
- `actualCost` consume entradas financieras vinculadas, evitando doble contar time entry y asiento generado;
- `profitability = recognizedRevenue - actualCost`, desglosado y sin mezclar monedas;
- presupuesto no es egreso real.

Si Finanzas no está activo, Operaciones muestra horas y presupuesto, pero costo/rentabilidad como capability no disponible; no inventa cero.

## 11. Permisos, visibilidad y seguridad

Permisos propuestos:

- `operationsRead`;
- `operationsWrite`;
- `operationsAssign`;
- `operationsApprove`;
- `operationsManageTemplates`;
- `operationsTimeTrack`;
- `operationsApproveTime`;
- `operationsViewCosts`;
- `operationsManageCosts`;
- `operationsVisibility: all | assigned | department`.

Permisos dependientes:

- crear/modificar task requiere `tasksWrite` y autorización operacional del proyecto;
- relacionar venta/cliente/artículo requiere read correspondiente;
- crear costo requiere `financeWrite`/capacidad financiera;
- reunión requiere calendar/meetings;
- documento requiere documentsWrite.

Problema de bypass a resolver: las rutas genéricas de Task OS hoy solo comprueban `tasksWrite`. Si un proyecto tiene `team_operation_projects`, toda mutación Task OS debe consultar la política operacional (gates, visibilidad, archivo, rol). No basta con proteger `/api/plugins/operations` si `/api/plugins/tasks/items/:id` puede saltarla.

Embeds:

- proyectos operativos nuevos: embed desactivado por defecto;
- read embed puede mostrar proyección sanitizada si la política lo permite;
- manage embed no puede aprobar, registrar horas, ver costos ni cambiar gates;
- migrar a scopes granulares o bloquear manage para órdenes empresariales;
- nunca exponer presupuesto, tarifa, costo ni datos internos del cliente en payload público.

Multi-tenant:

- toda query/update/delete usa `(teamId,id)`;
- validar workspace/project/column/task/user/department/sale/customer/contact/article/finance entry en el mismo team;
- responder 404 para referencias ajenas;
- constraints/índices incluyen team cuando sea posible;
- QA debe intentar relaciones cruzadas, assignees de otro team, sale line ajena y tokens embed.

## 12. APIs propuestas

Operaciones agrega fachadas empresariales; la mecánica Task OS continúa en sus rutas endurecidas.

| Método/ruta | Propósito |
|---|---|
| `GET /api/plugins/operations/overview` | Portfolio: activas, atrasadas, bloqueadas, próximas entregas, capacidad y aprobaciones. |
| `GET /api/plugins/operations/work-orders` | Lista paginada con cliente, servicio, manager, estado, riesgo y fechas. |
| `POST /api/plugins/operations/work-orders` | Promueve/crea proyecto operacional manual. |
| `POST /api/plugins/operations/work-orders/from-sale` | Provisión idempotente por saleId/lineId/template. |
| `GET/PATCH /api/plugins/operations/work-orders/:projectId` | Perfil agregado y actualización controlada. |
| `POST /api/plugins/operations/work-orders/:projectId/complete` | Completa tras evaluar política. |
| `POST /api/plugins/operations/work-orders/:projectId/cancel` | Cancela/archiva con razón; no hard delete. |
| `GET/PUT /api/plugins/operations/work-orders/:projectId/team` | Equipo y allocations. |
| `GET/POST /api/plugins/operations/tasks/:taskId/assignees` | Responsables Task OS. |
| `GET/POST /api/plugins/operations/blockers` | Bloqueos operativos. |
| `POST /api/plugins/operations/blockers/:id/resolve` | Resolución auditada. |
| `GET/POST /api/plugins/operations/approvals` | Solicitudes. |
| `POST /api/plugins/operations/approvals/:id/decision` | Decisión idempotente. |
| `GET/POST /api/plugins/operations/time-entries` | Registro/listado scopeado. |
| `POST /api/plugins/operations/time-entries/start|stop|submit|approve` | Timer y workflow. |
| `GET /api/plugins/operations/capacity` | Horizonte, usuarios/departamentos y supuestos. |
| `GET /api/plugins/operations/work-orders/:id/costs` | Presupuesto, real y procedencia desde Finanzas. |
| `GET/POST/PATCH /api/plugins/operations/template-bindings` | Bindings artículo→template. |
| `POST /api/plugins/operations/templates/:id/preview` | Preview determinista de instanciación. |
| `GET /api/plugins/operations/provision-runs/:id` | Estado/retry seguro. |

Contratos comunes: Zod estricto, paginación cursor/rango, version optimista, idempotency key, transacciones, auditoría y envelope de error común. El cliente no envía `teamId`, actor, costo calculado ni estado final derivado.

## 13. UI propuesta

### 13.1 Aplicación Operaciones

No abre directamente otro board. Es un cockpit de portfolio:

- métrica principal: entregas en riesgo o trabajo comprometido del período;
- órdenes activas, próximas entregas, bloqueos críticos y aprobaciones pendientes;
- carga/capacidad por persona/departamento;
- horas planificadas/reales;
- presupuesto/costo/margen solo con permiso;
- CTA “Crear desde venta” y “Convertir proyecto existente”.

### 13.2 Detalle de orden

Composición del proyecto Task OS real:

- cabecera operativa: OT, cliente, servicio, venta, manager, prioridad, fechas, estado/riesgo;
- tabs Kanban, Calendar y Gantt existentes;
- panel Resumen: progreso ponderado, hitos, entregables, blockers y siguiente acción;
- panel Equipo: assignees, carga, disponibilidad;
- panel Tiempo: estimado/real y entries;
- panel Aprobaciones;
- panel Costos con datos de Finanzas;
- panel Archivos/Documentos reutilizado;
- actividad/eventos auditados.

El `TaskModal` existente añade una sección Operaciones solo cuando el proyecto está especializado: kind, estimación, assignees, blocker, approval, time entries y acceptance criteria. No se duplica el editor de título/notas/checklist/fecha/media/comments.

### 13.3 Entrada contextual

- Ventas: acción “Crear orden/proyecto” y estado de provisión.
- Cliente: timeline de proyectos, entregables y próxima fecha.
- Artículo/Servicio: binding de plantilla.
- Reunión: compromisos aprobados crean tasks en el proyecto.
- Ticket: cambio aprobado puede crear task/proyecto cuando exista soporte.
- Finanzas: costos vinculados abren el proyecto sin revelar datos a quien no tenga permiso.

### 13.4 UX obligatoria

- estados vacío/carga/error/partial run;
- preview antes de aplicar plantilla;
- warnings claros para roles/plugins opcionales faltantes;
- acciones destructivas visibles, confirmadas y preferentemente archive/cancel;
- 360/768/1440 px, foco visible, teclado, contraste y reduced motion;
- no esconder aprobación, bloqueo o riesgo solo en hover;
- no presentar estimaciones/supuestos como datos reales.

## 14. Eventos e integración

### 14.1 Estado actual

Task OS usa Pusher para proyección de tareas en chats y Grok escribe `activityLogs`. No se confirmó un outbox/event bus durable genérico. Operaciones debe adoptar el contrato de `80-integracion-eventos.md`, no convertir Pusher ni comments en cola.

### 14.2 Eventos requeridos

| Evento | Regla |
|---|---|
| `work_order.created` | Proyecto + perfil + plantilla comprometidos. |
| `work_order.started` | Primera transición a active. |
| `work_order.blocked/unblocked` | Cambio efectivo derivado/manual. |
| `work_order.completed/canceled` | Transición única y auditada. |
| `project.created/completed` | Evento transversal de Task OS, no duplicado por cada UI. |
| `task.created/updated/completed` | Emitir solo transición real; versión e idempotencia. |
| `task.overdue` | Scanner durable emite una vez por task/version/fecha. |
| `deliverable.ready` | Task deliverable listo para review. |
| `approval.requested/decided` | Notificación y gate. |
| `blocker.created/resolved` | Alertas/Inteligencia. |
| `time_entry.submitted/approved` | Capacidad y costo laboral. |
| `capacity.threshold_exceeded` | Dedupe por usuario/horizonte/regla. |
| `operation.cost_recognized` | Integración idempotente con Finanzas. |

Evento incluye schemaVersion, teamId, entity ID, version, occurredAt, actor, correlation/causation e idempotencyKey. Consumidores reintentables; el fallo de un hook no revierte una orden ya creada, queda `partial` y observable.

### 14.3 Eventos consumidores

- `sale.confirmed`/`sale.paid`: evaluar bindings y crear provision runs.
- `meeting.outcomes.applied`: relacionar tasks creadas al proyecto.
- `customer.onboarding.created`: incorporar checklist/proyecto según política.
- `ticket.approved`: crear actividad/cambio.
- `membership.expiring`: crear renovación operativa si existe template.
- `payment.received`: opcionalmente desbloquear trabajo bajo política explícita.

No acoplar Operaciones a handlers de pago específicos.

## 15. Inteligencia artificial y conectores

### 15.1 Reutilización

Las herramientas CRUD actuales de Grok siguen disponibles para edición granular. Deben migrar a los servicios comunes endurecidos. Operaciones agrega herramientas semánticas:

- `crear_proyecto_desde_venta(sale_id, line_id, template_id?, dry_run=true)`;
- `previsualizar_orden_desde_venta`;
- `obtener_estado_operacion(project_id)`;
- `listar_proyectos_en_riesgo(horizon)`;
- `detectar_bloqueos(project_id?)`;
- `obtener_capacidad_equipo(from,to,department_id?)`;
- `sugerir_asignacion(task_id)`;
- `registrar_tiempo(task_id,duration,description)`;
- `solicitar_aprobacion(deliverable_task_id, approver)`;
- `obtener_costos_proyecto(project_id)`;
- `replanificar_proyecto(project_id,constraints,dry_run=true)`;
- `obtener_prioridades_operativas_del_dia`.

No exponer solamente CRUD genérico ni una herramienta que aplique cientos de cambios sin preview.

### 15.2 Reglas IA

- `dry_run` por defecto para crear/replanificar;
- resolver IDs por búsqueda y devolver candidatos si hay ambigüedad;
- no asignar personas por intuición: usar skills/capacidad/permisos reales y explicar señales;
- no cambiar fecha comprometida, costo, alcance o approval sin confirmación;
- no marcar tarea/proyecto completado si gates fallan;
- acciones idempotentes y auditadas;
- respetar operations visibility y permisos dependientes;
- devolver `unknown/missing_data`, no valores inventados;
- sugerencia de plan no es mutación hasta aprobación.

## 16. Migraciones y compatibilidad

Orden propuesto:

1. Endurecer servicios y schemas Task OS; no cambiar UI aún.
2. Agregar `lineId` compatible a SaleItem y backfill controlado.
3. Crear `team_operation_projects`, project members, task assignees y task details.
4. Crear blockers, approvals y time entries.
5. Extender templates con schema versionado; crear bindings y provision runs.
6. Ampliar registry de relaciones y eventos/outbox común.
7. Migrar conectores/rutas al servicio común.
8. Activar UI portfolio y luego automatización por ventas.

Compatibilidad:

- proyectos/tareas existentes siguen siendo genéricos si no tienen perfil/detail;
- un proyecto existente se promueve sin mover/copiar tareas;
- status/fechas/labels/checklists actuales permanecen;
- no renombrar/eliminar tablas Task OS;
- no convertir todos los proyectos automáticamente;
- no habilitar embeds ni costos por defecto;
- backfills idempotentes, por lotes y con métricas.

Rollback:

- código previo ignora tablas nuevas;
- desactivar event consumers/bindings detiene nuevas provisiones sin borrar proyectos;
- no hacer DROP automático de datos operativos, hours o approvals;
- revertir un run no elimina una orden con actividad: se cancela/archiva;
- número real de migración se asigna solo al integrar después de coordinar otros agentes.

## 17. Pruebas y DoD

No se encontraron tests dedicados de Tasks OS en los scripts de `package.json`; los suites declarados cubren resellers y automation. La implementación empresarial necesita cobertura propia.

### Unitarias

- parent y dependencia sin ciclos;
- transición de task/project/work order;
- fechas/zonas y critical path;
- progreso simple/ponderado;
- completion policy/gates;
- carga y reparto multi-assignee;
- time entries y solapamientos;
- costo sin doble conteo y monedas separadas;
- parse/validación OperationTemplateV1;
- stable keys/idempotency.

### Backend/DB

- alta transaccional de proyecto completo;
- provisioning repetido devuelve el mismo project/run;
- rollback de referencia inválida;
- constraints de assignee/owner, detalles uno-a-uno y approval target;
- sale line backfill sin duplicados;
- template apply crea hierarchy/dependencies/assignees correctos;
- fallo de hook deja partial y reintenta solo hook pendiente;
- hard delete bloqueado para orden con actividad.

### Multi-tenant/permisos

- IDs cruzados de workspace/project/column/task/sale/customer/article/user/finance;
- visibility all/assigned/department;
- tasksWrite sin operationsApprove no aprueba;
- operationsWrite sin financeWrite no genera costo;
- usuario sin operationsViewCosts no ve monto en API/UI/export;
- embed read/manage no elude gates ni expone costos;
- conector usa exactamente el team/user del token.

### Funcionales/E2E

- crear manualmente desde proyecto existente;
- venta Ecommerce → preview → orden → columnas/tasks/deps → meeting/onboarding/doc hooks;
- roles faltantes generan warning y proyecto utilizable;
- completar checklist no aprueba entregable;
- blocker/dependency actualizan riesgo;
- time timer/manual/submit/approve;
- carga y capacidad reflejan ausencia del plugin Equipo como supuesto;
- costo Finanzas activo/desactivado;
- cancelar/archive sin perder evidencia;
- responsive, teclado, foco, loading/error/empty/partial.

### Regresión

- Kanban DnD, Calendar, Gantt, comments, media, contacts, locations múltiples;
- duplicate/convert/share con reglas corregidas;
- chat tasks y Pusher;
- cascade preview/apply;
- embeds genéricos no operacionales;
- herramientas Grok existentes.

Un plugin no está terminado si solo compila: exige migración y estrategia de rollback, permisos, aislamiento, APIs, UI, eventos, IA, tests, documentación, observabilidad e idempotencia.

## 18. Fases de implementación

### Fase 0 — Fundaciones Task OS

- Zod/servicio/transacciones comunes;
- ciclos parent/dependency;
- auditoría y eventos;
- autorización por proyecto y protección de embeds;
- paginación/proyecciones;
- corregir catálogo readonly y duplicación/ubicaciones.

### Fase 1 — Órdenes y equipo

- perfiles de work order;
- promoción de proyecto existente;
- project members/task assignees;
- hitos/entregables tipados;
- portfolio y detalle compuesto.

### Fase 2 — Templates desde ventas

- SaleItem lineId;
- OperationTemplateV1, bindings, preview y provision runs;
- flujo Ecommerce transaccional/idempotente;
- hooks opcionales Meetings/Clientes/Documentos.

### Fase 3 — Control operativo

- blockers, approvals y completion policy;
- horas estimadas/reales;
- capacidad con Equipo;
- alertas y eventos overdue/risk.

### Fase 4 — Costos, IA y optimización

- integración Finanzas y rentabilidad;
- herramientas semánticas;
- replanificación asistida y prioridades diarias;
- métricas transversales para Inteligencia y Control.

## 19. Límites explícitos

Operaciones no crea:

- otro Kanban/Gantt/calendario/task manager;
- tabla de usuarios, clientes, ventas, artículos, documentos o finanzas duplicada;
- nómina, control horario legal o liquidación salarial;
- contabilidad/facturación fiscal;
- motor de moneda/cambio implícito;
- portal cliente completo dentro de embed Task OS;
- autoasignación o replanificación irreversible sin confirmación;
- proyecto por coincidencia de nombre de producto;
- evento bus propio si la plataforma adopta uno transversal.

## 20. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Automatizar sobre rutas laxas | Proyecto parcial/inválido. | Fase 0, Zod, services y transacciones antes de bindings. |
| Venta JSON sin line ID | Órdenes duplicadas/ítem ambiguo. | `lineId` estable + unique/idempotency. |
| Bypass por Task API/embed | Saltar permisos/aprobaciones. | Authorization hook operacional en servicios Task OS y scopes de embed. |
| Ciclos de dependencias/parent | Gantt/bloqueos imposibles. | Detección DFS/CTE, constraint y tests. |
| Templates por nombres | Colisiones/reintentos no deterministas. | Keys estables y schema versionado. |
| Duplicate project conserva IDs origen | Parent/checklist/deps cruzados. | Remapeo completo y tests antes de usar como provisioning. |
| Task compartida doble contabilizada | Carga/horas/costo inflados. | Agregar por task ID, ubicación solo visual. |
| Columna y status divergen | Progreso incorrecto. | Política explícita y transiciones en dominio. |
| Costos duplicados | Margen falso. | Finance entry idempotente y una fuente de actual cost. |
| Monedas mezcladas | Rentabilidad inválida. | Separar por currency hasta contar con FX común. |
| Sin datos de capacidad/tarifa | Recomendación engañosa. | Mostrar missing/assumption, integrar Equipo. |
| Hooks de otros plugins fallan | Orden incompleta. | Provision run partial, retries por hook, no duplicar core. |
| Hard delete | Pérdida de evidencia. | Cancel/archive y borrado excepcional auditado. |
| Árbol completo sin paginar | Rendimiento con escala. | Endpoints portfolio/rango y lazy load por proyecto. |
| Concurrencia de migraciones | Conflictos entre agentes. | Numerar/integrar después del plan maestro, commits pequeños. |

## 21. Dependencias con otros dominios

- **Arquitectura:** dependencias de plugins, autorización contextual, auditoría y convenciones de migración.
- **Finanzas:** centros de costo, vínculo project/service/department, costo laboral y rentabilidad sin doble conteo.
- **Reuniones:** reunión inicial y commitments → Task OS.
- **Equipo:** perfil, skills, horarios, ausencias, capacidad y tarifa autorizada.
- **Clientes y Soporte:** onboarding y tickets/change requests; Operaciones no crea ticket.
- **Conocimiento:** SOP/templates/documentación de entrega.
- **Integración y Eventos:** outbox, jobs, retries, event envelope y alertas overdue.
- **IA y Conectores:** tools semánticas, dry-run, scopes, confirmaciones y auditoría.
- **Inteligencia y Control:** proyecciones de riesgo/capacidad/costo; no queries directas que ignoren permisos.

## 22. Informe del agente

### Archivos analizados

- `lib/db/schema.ts`
- `lib/db/migrations/0031_task_os.sql`
- `lib/db/migrations/0036_task_os_workspaces.sql`
- `lib/db/migrations/0037_task_os_expansion.sql`
- `lib/db/migrations/0039_task_item_appearance.sql`
- `lib/db/migrations/0040_task_item_schedule.sql`
- `lib/db/migrations/0041_add_workspace_project_stage_appearance_and_task_cover.sql`
- `lib/db/migrations/0044_task_os_embed.sql`
- `lib/plugins/tasks/manifest.ts`
- `lib/plugins/tasks/server/task-os.ts`
- `lib/plugins/tasks/server/workspaces.ts`
- `lib/plugins/tasks/server/contact-tasks.ts`
- `lib/plugins/tasks/server/embed.ts`
- `lib/plugins/tasks/server/cascade-apply.ts`
- `lib/plugins/tasks/client/types.ts`
- `lib/plugins/tasks/client/api.ts`
- `lib/plugins/tasks/client/constants.ts`
- `lib/plugins/tasks/client/cascade-dsl.ts`
- `lib/plugins/tasks/client/cascade-scope.ts`
- `lib/plugins/tasks/hooks/useTaskOsBoard.ts`
- `lib/plugins/tasks/hooks/useTaskMutations.ts`
- `lib/plugins/tasks/hooks/useTaskDragDrop.ts`
- `lib/plugins/tasks/ui/TasksOSDashboard.tsx`
- `lib/plugins/tasks/ui/project/**`
- `lib/plugins/tasks/ui/board/**`
- `lib/plugins/tasks/ui/task/**`
- `lib/plugins/tasks/ui/media/**`
- `lib/plugins/tasks/ui/cascade/TaskOsCascadeEditor.tsx`
- `lib/plugins/tasks/ui/embed/**`
- `app/api/plugins/tasks/**`
- `app/api/task-embed/**`
- `app/api/chats/[id]/tasks/route.ts`
- `app/api/dashboard/tasks/route.ts`
- `lib/plugins/calendar/ui/TaskOsScheduleBoard.tsx`
- `lib/plugins/grok-connector/server/extended-actions.ts`
- `lib/readonly-api/catalog.ts`
- `lib/permissions.ts`
- `lib/plugins/core/runtime-permissions.ts`
- `lib/plugins/core/registry.ts`
- `lib/db/schema.ts` (`teamSales`, `SaleItem`, customers, articles/services, users/team/departments, finance)
- `lib/plugins/sales/ui/SaleForm.tsx`
- `app/api/plugins/sales/**`
- `lib/plugins/articles/constants.ts`
- `lib/plugins/finance/server/schema.ts`
- `lib/plugins/finance/server/access.ts`
- `app/api/plugins/finance/**`
- `lib/desktop/service.ts`
- `package.json`

### Archivo modificado

- `docs/business-platform/50-operaciones.md` (único archivo).

### Decisiones principales

- Task OS permanece como único gestor de proyectos/tareas.
- Orden de trabajo es perfil uno-a-uno de `team_task_projects`.
- Entregable/hito/gate es especialización de `team_task_items`.
- Checklist, dependencies, relations, media, comments, templates y vistas actuales se reutilizan.
- Se agregan assignees multiusuario, horas, approvals, blockers externos y provisioning idempotente porque no existen equivalentes.
- La venta dispara por `articleId + lineId + binding`, nunca por nombre.
- Task API genérica debe respetar invariantes operacionales para impedir bypass.
- Finanzas es fuente de costo real; Operaciones no crea un ledger paralelo.

### Riesgos principales

- Validación/transacciones/auditoría/eventos actuales son insuficientes para provisión automática.
- Dependencias y parents pueden formar ciclos o referencias inválidas.
- Templates/cascade actuales no tienen keys/versionado suficiente para instanciación empresarial.
- Embed manage y `tasksWrite` amplio pueden eludir controles.
- SaleItem no tiene ID de línea estable.
- No hay suite de tests Task OS dedicada confirmada.

### Próximo paso recomendado

No implementar aún. Consolidar con Arquitectura, Finanzas, Equipo, Clientes/Soporte, Reuniones, Eventos e IA. El plan maestro debe aprobar primero cuatro contratos compartidos: autorización contextual de proyectos, relaciones empresariales, outbox/eventos y template/versioning. Luego comenzar Fase 0; solo después habilitar el binding Ecommerce y la creación automática desde ventas.
