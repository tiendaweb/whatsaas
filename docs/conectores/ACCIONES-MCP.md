# Acciones MCP — qué expone hoy WhatsPro y qué debería exponer

Documento de diseño. **No es una implementación**: es el catálogo de lo que el conector `whatspro_*` podría ofrecerle a una IA (Claude, Grok, ChatGPT), con el costo real de cada cosa.

Todo lo que dice "se apoya en" está verificado contra el código: archivo y nombre de función existen. Donde no existe, dice **requiere código nuevo** con el alcance estimado.

**Registro central:** `app/api/plugins/grok-connector/mcp/route.ts` (el mismo handler sirve los tres conectores: `grok-connector`, `chatgpt-connector`, `claude-code-connector`).
**Contexto de ejecución de una tool:** `{ teamId, userId }`. No hay sesión, no hay cookies. Esto es la restricción arquitectónica que manda en todo el documento (ver §5.1).

> **Actualizado el 2026-08-23.** Las §0 a §5 son el diseño original (67 tools). Desde entonces se implementaron 13 tools más — el estado real está marcado en cada tabla. La **§6 es la auditoría de cobertura**: qué porcentaje del sistema ve realmente una IA hoy, qué agujeros importan para operar el negocio, y **qué riesgos de control y seguridad tiene darle este poder a un modelo**. Si vas a leer una sola sección, leé la §6.
>
> **Actualizado el 2026-08-28.** El catálogo pasó de 165 a **187 tools** (más las 20 de App Maker) y el catálogo read-only de 116 a **131 recursos**. Estado real: **la §7 (al final) es la foto de hoy** — qué se cerró en esta tanda, qué queda abierto y por qué. Los pendientes de la §6.5 marcados ❌ que ya no lo están: A6 (Radar overview/clients/client + save_analysis) ✅, A7 parcial (metadata jsonb ya existía; ahora también se registra **cada tools/call con tool + conector + tokenId**) ✅. Siguen pendientes A3 (visibleChatScope) y A4 (permisos en listReadOnlyResource).

---

## 0. El negocio, en números (equipo 2)

Sirve para no proponer CRUD genérico. Datos reales de la base, **releídos el 2026-08-23** (`pg_stat_user_tables` + conteos por equipo):

| Entidad | Volumen | Lectura |
| --- | --- | --- |
| Contactos / chats / mensajes | 897 / 1047 / **58.636** | 297 en "Conversando", 205 en "Seguimiento", 156 "Nuevo lead" → **el cuello de botella es el seguimiento** |
| Contactos con análisis Radar | **71 de 897** | Sin moverse desde el relevamiento anterior. Hay 826 contactos sin analizar. |
| Widgets Radar / informes Radar | **0 / 0** | Las 10 tools de Radar ya están implementadas y **nadie las usó todavía**. El tablero sigue vacío. |
| Tareas | 433 (363 abiertas, **51 vencidas**) | 23 proyectos, 7 espacios, 99 columnas. Las vencidas se duplicaron (eran 25). |
| Clientes | 290 | |
| Suscripciones | 239 (**162 activas, 76 vencidas**) | Vencimientos desde 2026-08-21 en adelante. Es el ingreso recurrente. |
| Dominios | 62 | |
| Documentos | 130 | |
| Mensajes programados | **210, todos `once` y todos `completed`** | Evidencia dura: se usa como "mandar un mensaje" porque **no hay forma de mandar un mensaje** (ver H1). En `activity_logs` hay **321 `GROK_SCHEDULED_MESSAGE_CREATED` y 119 `GROK_SCHEDULED_MESSAGE_DELETED`**: la IA programa, se manda, y después limpia. |
| Cola de renovaciones AAPP | **736 candidatos** (638 pendientes, 48 cancelados, 25 rechazados, 14 fallidos, 6 aprobados, 5 enviados) | Es el módulo con más volumen operativo sin atender de toda la plataforma. |
| Registros en `activity_logs` | 4.198, de los cuales **3.312 (79 %) son del conector** (`GROK_*` / `connector.*`) | El MCP ya no es un experimento: es el principal escritor del sistema. |
| Asientos financieros | 91 (46 ingresos cobrados, 40 gastos pagados, 3 por cobrar) | Gasto dominante: liquidaciones a Martín, 34 asientos |
| Registros de mini-apps | 1999 (todos de `business-woman-planner`) | |
| Compras, soporte, contratos, ventas, posts sociales | **0 filas cada uno** (artículos: 3) | Plugins construidos y sin uso. **Verificado de nuevo el 2026-08-23: siguen en cero.** No merecen tools. |

---

## 1. Estado actual — 80 herramientas

**23 de lectura + 57 de acción**, repartidas en nueve archivos de `lib/plugins/grok-connector/server/`. (Eran 67 cuando se escribió este documento; las 13 nuevas están marcadas con **NUEVO**.) El conteo se verificó el 2026-08-23 sobre `grep "name: 'whatspro_"` de los nueve archivos más las cuatro genéricas del route; **si estás leyendo esto después de esa fecha, contá de nuevo: hay trabajo en curso sobre `tasks-actions.ts`.** Las de acción sólo aparecen si el token trae el scope `whatspro:write` (`GROK_WRITE_SCOPE`, `lib/plugins/grok-connector/server/oauth.ts`).

### 1.1 Genéricas / catálogo — `app/api/plugins/grok-connector/mcp/route.ts`

| Herramienta | R/W | Qué hace |
| --- | --- | --- |
| `whatspro_list_resources` | R | Enumera los ~109 recursos de sólo lectura de `lib/readonly-api/catalog.ts` con sus filtros. |
| `whatspro_list_records` | R | Lista paginada de cualquier recurso (`page`, `per_page` ≤100, `q`, `filters`). |
| `whatspro_get_record` | R | Un registro por `resource` + `id`. |
| `whatspro_ai_context` | R | Guía completa en markdown (`buildAiContext`, `lib/readonly-api/openapi.ts`). |

El catálogo de sólo lectura ya cubre casi todo el esquema: `chats`, `messages`, `contacts`, `tags`, `funnel-stages`, `custom-fields`, `automations`, `tasks`, `task-relations`, `documents`, `financial-entries`, `membership-subscriptions`, `domains`, `sites`, `forms`, `social-posts`, `meta-campaigns`, `mini-app-records`… **Lo que falta en el catálogo:** tickets de soporte (`teamSupportTickets`), comentarios de tareas ya está (`task-comments`), y los widgets de Radar (`teamRadarWidgets`).

### 1.2 CRM y contactos — `lib/plugins/grok-connector/server/actions.ts` + `extended-actions.ts`

| Herramienta | R/W | Permiso | Qué hace |
| --- | --- | --- | --- |
| `whatspro_save_contact` | W | `contacts` | Crea/actualiza contacto desde un chat, con asignaciones. |
| `whatspro_change_crm_stage` | W | `contacts` | Mueve el contacto de etapa (o la quita). |
| `whatspro_set_custom_fields` | W | `contacts` | Guarda valores de campos personalizados (las claves deben existir). |
| `whatspro_set_contact_tags` | W | `contacts` | Agrega / quita / reemplaza etiquetas. |
| `whatspro_add_contact_note` | W | `contacts` | Nota en el historial del contacto. |
| `whatspro_add_internal_note` | W | `contacts` | Nota interna visible en la conversación; **nunca la envía**. Acepta `idempotency_key`. |
| `whatspro_manage_crm_stage_group` | W | `contacts` | Crea/edita grupo de etapas y su contenido. |
| `whatspro_manage_crm_stage` | W | `contacts` | Crea/edita etapa (orden, emoji, grupos). |
| `whatspro_manage_tag` | W | `contacts` | Crea/edita etiqueta. |
| `whatspro_manage_custom_field` | W | `contacts` | Define un campo personalizado. |
| `whatspro_manage_department` | W | `contacts` | Crea/edita departamento. |
| `whatspro_manage_department_member` | W | `contacts` | Agrega/quita agente de un departamento. |
| `whatspro_manage_agenda` | W | `contacts` | Crea/edita agenda del escritorio, vinculable a un grupo de etapas. |
| `whatspro_manage_agenda_contact` | W | `contacts` | Agrega/mueve/quita un contacto de una agenda. |
| `whatspro_assign_to_agenda` | W | `contacts` | Alta idempotente de un chat en una agenda. |

### 1.3 Tareas OS — `extended-actions.ts`

| Herramienta | R/W | Permiso | Qué hace |
| --- | --- | --- | --- |
| `whatspro_manage_task_workspace` | W | `tasksWrite` | Crea/edita espacio. |
| `whatspro_create_task_project` | W | `tasksWrite` | Crea proyecto completo (espacio + etiquetas + columnas + tareas + subtareas) en una llamada. |
| `whatspro_manage_task_project` | W | `tasksWrite` | Edita/mueve proyecto. |
| `whatspro_manage_task_column` | W | `tasksWrite` | Crea/edita columna. |
| `whatspro_manage_task` | W | `tasksWrite` | Crea/edita tarea o subtarea (fechas, checklist, etiquetas, estado, columna). |
| `whatspro_create_contact_task` | W | `tasksWrite` | Tarea ligada a un contacto; aparece en el lateral del chat. |
| `whatspro_share_task` | W | `tasksWrite` | La misma tarea en otro tablero (location secundaria + relación `shared_in`). |
| `whatspro_manage_task_relation` | W | `tasksWrite` | Relación polimórfica task/project/workspace/contact/customer/note/event. |
| `whatspro_link_customer_task` | W | `tasksWrite` | Vincula tarea ↔ cliente del CRM. |

### 1.4 Documentos, notas, calendario, mensajes programados — `extended-actions.ts`

| Herramienta | R/W | Permiso | Qué hace |
| --- | --- | --- | --- |
| `whatspro_manage_document_folder` | W | `documentsWrite` | Carpeta de Documentos (máx 5 niveles, sin ciclos). |
| `whatspro_manage_document` | W | `documentsWrite` | Documento en markdown o `format:"html"` crudo. |
| `whatspro_create_note` / `whatspro_manage_note` | W | `notesWrite` | Nota de equipo. |
| `whatspro_manage_calendar_event` | W | `calendarWrite` | Evento con asistentes, recordatorio y relación a contacto/agente/departamento. |
| `whatspro_manage_scheduled_message` | W | `scheduledMessagesWrite` | Mensaje programado `once`/`daily`/`weekly`, o disparo de automatización. |

### 1.5 Clientes, membresías, comercio — `actions.ts` + `extended-actions.ts` + `platform-admin-actions.ts`

| Herramienta | R/W | Permiso | Qué hace |
| --- | --- | --- | --- |
| `whatspro_register_customer` | W | `customersWrite` | Alta/actualización de cliente sin duplicar por contacto, email o teléfono. |
| `whatspro_manage_customer` | W | `customersWrite` | Crea/edita/archiva/elimina cliente (`delete` exige `confirm`). |
| `whatspro_link_customer_contact` | W | `customersWrite` | Vincula/desvincula contacto CRM ↔ cliente. |
| `whatspro_manage_membership_plan` | W | `membershipsWrite` | Plan con precio, frecuencia, features, visibilidad. |
| `whatspro_register_membership` | W | `membershipsWrite` | Alta de suscripción; idempotente por `idempotency_key` (se guarda en `externalId`). |
| `whatspro_update_membership` | W | `membershipsWrite` | Edita plan, fechas, precio, estado de membresía y de pago. |

### 1.6 Finanzas y agenda ejecutiva — `business-os-actions.ts`

| Herramienta | R/W | Permiso | Qué hace |
| --- | --- | --- | --- |
| `whatspro_finance_summary` | R | `financeRead` | Saldo por cuenta/moneda, ingresos/egresos del período, utilidad, gasto por categoría, por cobrar y por pagar. |
| `whatspro_finance_receivables_payables` | R | `financeRead` | "¿Quién nos debe?" / "¿Qué hay que pagar?" con `due_within_days` y `only_overdue`. |
| `whatspro_finance_cashflow_projection` | R | `financeRead` | Proyección de caja por semana ISO. |
| `whatspro_meeting_agenda` | R | `calendarRead` | Reuniones y llamadas de un rango, con cliente, participantes, resultado y próxima acción. |
| `whatspro_generate_tasks_from_note` | W | `tasksWrite` | Compromisos de una nota de reunión → tareas. Idempotente. |

### 1.7 Sitios y dominios — `platform-admin-actions.ts`

| Herramienta | R/W | Permiso | Qué hace |
| --- | --- | --- | --- |
| `whatspro_list_sites` | R | `sitesRead` | Sitios con slug, subdominio, dominio propio, publicación, métricas. |
| `whatspro_list_site_files` | R | `sitesRead` | Árbol de archivos, filtrable por prefijo. |
| `whatspro_read_site_file` | R | `sitesRead` | Contenido + `expected_updated_at` para edición sin colisiones. |
| `whatspro_manage_site` | W | `sitesWrite` | Crea/configura/publica/renombra/elimina sitio. |
| `whatspro_manage_site_file` | W | `sitesWrite` | Crea, reemplaza, renombra, mueve, elimina nodos. |
| `whatspro_patch_site_file` | W | `sitesWrite` | Reemplazos exactos con verificación de coincidencias y `expected_updated_at`. |
| `whatspro_list_domains` | R | `domainsRead` | Dominios con registrador, renovación, cliente, vencimiento. |
| `whatspro_manage_domain` | W | `domainsWrite` | Crea/edita/elimina dominio. |

### 1.8 Automatizaciones — `automation-actions.ts`

| Herramienta | R/W | Permiso | Qué hace |
| --- | --- | --- | --- |
| `whatspro_automation_guide` | R | `automation` | Contrato operativo completo: nodos, propiedades, conexiones, variables. |
| `whatspro_inspect_automation` | R | `automation` | Audita un flujo: grafo, errores, nodos inalcanzables, salidas incompletas. |
| `whatspro_manage_automation_folder` | W | `automation` | Carpetas (al borrar, reubica flujos de forma segura). |
| `whatspro_manage_automation` | W | `automation` | Crea/edita/mueve/activa/desactiva/elimina flujo. |
| `whatspro_replace_automation_flow` | W | `automation` | Reemplazo atómico y validado de todo el grafo. |
| `whatspro_manage_automation_node` / `_edge` | W | `automation` | Nodo/conexión individual con validación del grafo entero. |

### 1.9 Radar — `radar-actions.ts`

| Herramienta | R/W | Permiso | Qué hace |
| --- | --- | --- | --- |
| `whatspro_radar_block_catalog` | R | `intelligenceRead` | Los 29 tipos de bloque con ejemplo JSON + listas cerradas de iconos y tonos, secciones REALES del equipo (builtins + personalizadas), tamaños (`xs`/`sm`/`md`/`lg`/`full` = 4/3/2/1.5/1 por fila) y superficies. |
| `whatspro_radar_list_widgets` | R | `intelligenceRead` | Widgets vivos con key, sección, superficie, posición, origen y bloques. |
| `whatspro_radar_list_reports` | R | `intelligenceRead` | Informes publicados y vinculados, por categoría/contacto/asignado. |
| `whatspro_radar_upsert_widget` | W | `contacts` | Crea/actualiza widget por `key`. Es "dibujar" en Radar. |
| `whatspro_radar_delete_widget` | W | `contacts` | Manda el widget al banco (soft). |
| `whatspro_radar_publish_report` | W | `documentsWrite` | Publica informe HTML/markdown en Documentos, lo archiva en `Radar · Informes` y lo vincula. |
| `whatspro_radar_patch_widget` **NUEVO** | W | `contacts` | Cambia título, bajada, icono, tono, sección, tamaño, posición o `enabled` **sin reenviar los bloques**. Sobre `widgets.ts:patchRadarWidget`. |
| `whatspro_radar_manage_widget` **NUEVO** | W | `contacts` | `reorder` / `restore` / `duplicate` / `purge` (este último exige `confirm:true`). Cierra el ciclo de vida completo de `widgets.ts`. |
| `whatspro_radar_note_to_widget` **NUEVO** | W | `contacts` | Toma la nota `🎯 RADAR` de un chat y la dibuja como widget (`note-parser.ts:radarNoteToBlocks` + `upsertRadarWidget`). |
| `whatspro_radar_set_appearance` | W | `contacts` | Retoca icono/etiqueta/tono/hint de las 7 secciones builtin (`appearance.ts:setRadarAppearance`). |
| `whatspro_radar_manage_section` **NUEVO** | W | `contacts` | El MENÚ como entidad editable: `create` / `update` / `reorder` / `hide` / `show` / `delete` de secciones. Las personalizadas viven en `team_plugins.settings.appearance` (`custom` + `order`); `delete` muda los widgets a `move_widgets_to` (default `resumen`) vía `widgets.ts:reassignRadarWidgetsSection`. |

**Lo que quedó implementado de §3.2:** `patch_widget`, `manage_widget` (con las cinco funciones huérfanas de `widgets.ts`, incluida `reorderRadarWidgets` que no tenía consumidor) y `note_to_widget`. **Sigue faltando:** `radar_overview`, `radar_list_clients`, `radar_get_client`, `radar_save_analysis`, `radar_list_bank`, `radar_update_report`, `radar_unlink_report`.

### 1.10 Tareas OS — lectura y DSL cascade — `tasks-actions.ts` **(archivo nuevo)**

| Herramienta | R/W | Permiso | Qué hace |
| --- | --- | --- | --- |
| `whatspro_tasks_board` **NUEVO** | R | `tasksRead` + plugin `tasks` | El tablero entero en una llamada (`task-os.ts:loadTaskOsData`). Resuelve el hueco H4. |
| `whatspro_tasks_cascade_export` **NUEVO** | R | `tasksRead` | Serializa tablero/espacio/proyecto/columna/tarea al DSL de texto. |
| `whatspro_tasks_cascade_apply` **NUEVO** | W | `tasksWrite` | Aplica el DSL. **`mode` es `preview` por defecto** y devuelve `dry_run:true` con el diff. Es el mejor ejemplo del patrón de §5.2 en todo el conector. |
| `whatspro_tasks_comment` **NUEVO** | R/W | `tasksRead` / `tasksWrite` | Lista y agrega comentarios de una tarea. |

**Sigue faltando de §3.3:** `tasks_today` (hay 51 tareas vencidas y ninguna tool las junta), `tasks_get_details`, `tasks_bulk_patch`, `tasks_cascade_guide`, `tasks_list_contact_tasks`, `tasks_manage_dependency`, `tasks_merge_duplicate_projects`.

### 1.11 Conocimiento y renovaciones — `knowledge-actions.ts` **(archivo nuevo)**

| Herramienta | R/W | Permiso | Qué hace |
| --- | --- | --- | --- |
| `whatspro_documents_search` **NUEVO** | R | `documentsRead` + plugin `documents` | Busca por título y contenido en los 131 documentos (`documents.ts:searchDocuments`). |
| `whatspro_memberships_renewal_queue` **NUEVO** | R/W | `scheduledMessagesRead`/`Write` **y** `aappSpaceRead`/`Write` | `list` y `apply` sobre la cola de avisos AAPP. **`apply` exige `confirm:true`** y la descripción de la tool explica que aprobar es autorizar un WhatsApp real. Es, junto con `radar_manage_widget:purge`, la única tool nueva con confirmación. |

### 1.12 Media de conversaciones — `media-actions.ts` **(archivo nuevo)**

| Herramienta | R/W | Permiso | Qué hace |
| --- | --- | --- | --- |
| `whatspro_chat_media_list` **NUEVO** | R | `contacts` | Adjuntos de un chat con `message_id`, tipo, MIME, epígrafe, duración y `available` (si el archivo sigue en disco). |
| `whatspro_chat_media_get` **NUEVO** | R | `contacts` | Devuelve la foto o el audio como **bloque nativo del protocolo MCP** (`isMcpRawResult` en el route): el modelo la ve y lo escucha de verdad. Documentos de texto vuelven en texto; PDF/Office/ZIP y video, sólo metadata. |
| `whatspro_chat_media_summary` **NUEVO** | R | `contacts` | Agregado por tipo, remitente y fechas, sin traer archivos. |

`mediaActionTools` está vacío a propósito: **el conector lee media, no la sube.**

### 1.13 Destructivas

`whatspro_delete_record` (`extended-actions.ts`) borra de forma irreversible, con `confirm:true`, sobre 17 tipos: `crm_stage_group`, `crm_stage`, `tag`, `department`, `agenda`, `membership_plan`, `membership`, `task_workspace`, `task_project`, `task_column`, `task`, `document_folder`, `document`, `scheduled_message`, `team_note`, `custom_field`, `calendar_event`. El permiso se elige según el recurso.

---

## 2. Huecos detectados

Ordenados por cuánto duelen, no por dominio.

### H1 — La IA no puede mandar un mensaje de WhatsApp

Es el hueco más grande y el más invisible. `whatspro_add_internal_note` sólo escribe notas internas. **No hay ninguna herramienta que envíe texto, media, audio ni plantilla.**

El equipo ya encontró el atajo: **208 mensajes programados, todos `once` y todos `completed`**. Se programa un mensaje para dentro de un minuto porque es la única puerta. Eso significa latencia, un registro basura en `team_scheduled_messages`, ningún control de la ventana de 24 h de WhatsApp y ninguna trazabilidad de "esto lo mandó la IA".

Por qué no está: el envío vive inline en `app/api/messages/send/route.ts` (253 líneas), `sendMedia/route.ts`, `sendAudio/route.ts` y `send-template/route.ts`, todos atados a sesión. El único helper reutilizable es `sendEvolutionRequestWithRetry` (`lib/evolution.ts:87`) — el HTTP, no la lógica de negocio (resolver instancia, insertar en `messages`, actualizar el chat, emitir Pusher).

### H2 — Radar es "una entidad viva" que la IA no puede terminar de manipular

`lib/plugins/radar/server/widgets.ts` tiene **seis funciones exportadas sin ninguna herramienta MCP** y, en dos casos, sin ningún consumidor en todo el repo:

- `restoreRadarWidget` — sacar del banco
- `duplicateRadarWidget` — usar el banco como biblioteca de plantillas
- `purgeRadarWidget` — borrado físico
- `patchRadarWidget` — cambiar sólo el título / la sección / el tamaño sin reenviar los 60 bloques
- `reorderRadarWidgets` — **nadie la llama en todo el repo**. El reordenamiento de la grilla no existe end-to-end.
- `listRadarWidgets({ onlyArchived: true })` — el banco no se puede listar por MCP

Peor: `whatspro_radar_list_widgets` es la única lectura, y **no existe ninguna herramienta que devuelva el tablero de Radar**. `app/api/plugins/radar/overview/route.ts` y `clients/route.ts` calculan exactamente lo que la IA necesita (contadores por prioridad, contactos ordenados P1→P3, `reportCount`, `openTaskCount`, `lastNoteAt`) pero la lógica está **dentro del route handler**, detrás de `getRadarTarget()` que lee la sesión. Desde MCP es inalcanzable.

Y el ciclo de análisis es caro: escribir el diagnóstico de un contacto hoy son **10+ llamadas** (nueve `whatspro_set_custom_fields` para los `radar_*` + `whatspro_add_internal_note` con la nota `🎯 RADAR` + el widget). Con 824 contactos sin analizar, eso es el techo real del feature.

Detalle relacionado: `radarNoteToBlocks()` (`lib/plugins/radar/server/note-parser.ts:339`) convierte una nota `🎯 RADAR` en bloques listos para un widget. Existe, funciona, y **la IA no la puede invocar**.

### H3 — El DSL "cascade" de Tareas está escrito y no se puede usar desde una IA

`lib/plugins/tasks/server/cascade-apply.ts` expone:

- `previewCascadeApply(teamId, document)` → cuántos workspaces/proyectos/columnas/tareas se crearían y cuántas se actualizarían, **sin escribir nada**
- `applyCascadeDocument(teamId, userId, document, scope?)` → lo aplica

Y `lib/plugins/tasks/client/cascade-dsl.ts` tiene `serializeCascadeDocument`, `parseCascadeDocument`, `summarizeCascadeDocument` y `CASCADE_SYNTAX_HELP` (la guía de sintaxis, ya redactada).

Es decir: existe un formato de texto que representa el tablero entero, con exportación, parseo, **dry-run nativo** y aplicación transaccional. Es la herramienta ideal para "reorganizá el tablero de Noelia" o "armá el plan de producción de GoldPampa". Hoy la IA tiene que hacerlo tarea por tarea con `whatspro_manage_task`, sin poder ver el diff antes.

### H4 — La IA no puede ver el tablero de tareas de un saque

`loadTaskOsData(teamId)` (`lib/plugins/tasks/server/task-os.ts`) devuelve el universo completo: workspaces → proyectos → columnas → ítems, con `commentCount` y portada. Es lo que consume `GET /api/plugins/tasks/workspaces`. Por MCP hay que reconstruirlo paginando cuatro recursos de sólo lectura (`task-workspaces`, `task-projects`, `task-columns`, `tasks`) y cruzarlos a mano. Con 433 tareas y 20+ proyectos, eso son ~10 llamadas y mucho contexto quemado.

Tampoco están expuestos: `listTaskComments` / `addTaskComment` (comentar una tarea es la forma natural de que la IA deje una devolución), `listTaskDetails` (relaciones + dependencias + locations + media) ni `mergeDuplicateNamedProjects`.

### H5 — Finanzas es sólo lectura, y la agencia mueve plata todos los meses

Las tres herramientas de finanzas responden preguntas y no registran nada. No se puede: crear un asiento, marcar una factura como pagada, registrar un pago parcial, ni cargar un gasto. La liquidación mensual a Martín son 34 asientos cargados a mano.

Todo el material está: `financialEntrySchema`, `resolveFinancialRelations` y `nextRecurrenceDate` en `lib/plugins/finance/server/schema.ts` son funciones puras y llamables. Lo que falta es el envoltorio y las escrituras (que hoy viven inline en `app/api/plugins/finance/entries/route.ts` y `entries/[id]/payments/route.ts`).

Dato incómodo que conviene saber antes de diseñar: **`recurrence` se guarda y `nextDueOn` se calcula, pero nadie materializa el asiento siguiente.** No hay cron de recurrencia en finanzas. Si la IA carga un gasto mensual, el mes que viene no aparece solo.

### H6 — El ingreso recurrente (renovaciones) no tiene puerta MCP

162 suscripciones activas y 76 vencidas. El motor de avisos existe y es bueno: `materializeAappRenewalCandidates`, `listAappRenewalCandidates`, `applyAappRenewalAction` (`approve`/`reject`/`revoke`/`reopen`/`retry`) y `processDueAappRenewals` en `lib/plugins/scheduled-messages/aapp-renewals.ts`, más las reglas de `teamMembershipReminderRules` y el cron `app/api/cron/membership-reminders`.

Desde una IA no se puede: ver la cola de avisos, aprobarlos en lote, ni preguntar "¿a quién se le vence el servicio esta semana?". Y `whatspro_update_membership` existe, pero renovar es "correr `endDate` + registrar el cobro", dos escrituras en dos plugins que hoy nadie coordina.

### H7 — No hay operaciones en lote en ningún dominio

Mover 30 contactos de etapa son 30 llamadas. Etiquetar 50, 50 llamadas. Cerrar 12 tareas, 12 llamadas. Con 296 contactos en "Conversando" y 205 en "Seguimiento", cualquier trabajo de limpieza del embudo es inviable por MCP.

### H8 — Búsqueda pobre

`searchDocuments(teamId, query, limit)` existe (`lib/plugins/documents/server/documents.ts:363`) y busca en título y `contentText` de los 130 documentos. No está expuesta: la IA sólo puede listar `documents` y filtrar por `folderId`.

Igual con contactos: `whatspro_list_records` filtra por igualdad exacta sobre columnas. No hay forma de pedir "contactos en Seguimiento, sin respuesta hace 7 días, asignados a Noelia, sin tarea abierta" — que es literalmente la pregunta del negocio.

### H9 — Ficha de cliente inalcanzable

`GET /api/plugins/customers/[id]` arma la vista 360 (contactos vinculados, suscripciones con plan y fechas, tiendas con URL resuelta, últimas 100 transacciones, adjuntos, tareas relacionadas, campos personalizados). Todo inline en el route handler. Por MCP hay que hacer siete `whatspro_list_records` y cruzarlos.

### H10 — Archivos y adjuntos

`listChatFiles` y `readArchiveFile` (`lib/plugins/files/server/files.ts`) están escritas y no expuestas. Cuando GoldPampa manda 20 fotos y una etiqueta en PDF, la IA no puede enumerarlas ni leerlas. (Nota: el plugin `files` es sólo lectura de adjuntos de chat; no sube nada.)

### H11 — Las integraciones no se pueden disparar

`syncTeamAapp(teamId, apiKey)`, `importHostingerDomains(teamId, accountId, userId)` y `syncAdAccount({...})` son funciones exportadas que reciben `teamId` directo. Ninguna tiene tool. "Traeme lo último de AAPP antes de armar el informe" no se puede.

### H12 — Huecos que NO valen la pena todavía

Compras, contratos, RRHH, soporte, artículos, ventas y publicaciones sociales tienen **cero filas**. Están bien construidos pero nadie los usa. Exponerlos por MCP ahora es escribir código para que no lo llame nadie. Van a Tanda 3, y sólo cuando el plugin empiece a tener datos.

---

## 3. Catálogo propuesto — 54 acciones nuevas

Formato de cada entrada:

> **`nombre`** — qué resuelve. *Ejemplo de pedido real.*
> **Params:** … · **Se apoya en:** … · **Permiso:** … · **Riesgo:** …

Convención de nombres: `whatspro_<dominio>_<verbo>`. Los dominios ya establecidos son `radar_`, `finance_` y `automation_`; para lo nuevo uso `chat_`, `tasks_`, `crm_`, `customers_`, `memberships_`, `documents_`, `domains_`, `integrations_`. Las herramientas viejas con nombre plano (`whatspro_manage_task`, `whatspro_save_contact`) **no se renombran**: romper nombres de tools rompe las skills y los prompts guardados. Se dejan como están y se documenta la inconsistencia.

---

### 3.1 Conversaciones y WhatsApp — el hueco H1

**`whatspro_chat_send_message`** — manda un mensaje de texto real por WhatsApp, ahora. *"Contestale a GoldPampa que el presupuesto de $60.000 incluye sitio + tienda y que mañana le mando el detalle."*
**Params:** `chat_id` | `contact_id`, `text`, `instance_id?`, `quoted_message_id?`, `idempotency_key` (obligatoria), `dry_run?`
**Se apoya en:** `lib/evolution.ts:sendEvolutionRequestWithRetry` para el HTTP. La lógica de negocio (resolver instancia, insertar en `messages`, actualizar `chats`, Pusher) está inline en `app/api/messages/send/route.ts` → **requiere código nuevo: extraer ~120 líneas a `lib/messaging/send.ts` y reutilizarla desde la route y desde la tool.** Es la refactorización más valiosa del documento porque desbloquea cuatro tools.
**Permiso:** **nuevo — `messagesSend`**. No hay ninguna clave en `MemberPermissions` que gobierne el envío (`chatVisibility` gobierna la lectura). Usar `contacts` sería mentir: quien puede etiquetar no debería poder escribirle al cliente.
**Riesgo:** **alto.** Escribe hacia afuera, es irreversible y llega a un humano. Exige `idempotency_key` sí o sí, y `dry_run` que devuelva el texto resuelto y el destinatario sin mandar.

**`whatspro_chat_send_media`** — manda imagen, video, PDF o audio. *"Mandale el catálogo en PDF a los 4 interesados en Tienda Online."*
**Params:** `chat_id`, `media_url`, `kind` (`image|video|document|audio`), `caption?`, `filename?`, `idempotency_key`
**Se apoya en:** misma extracción que la anterior (`app/api/messages/sendMedia/route.ts`, `sendAudio/route.ts`). **Requiere código nuevo**, ~80 líneas adicionales una vez hecha la extracción de `send`.
**Permiso:** `messagesSend` (nuevo) · **Riesgo:** alto.

**`whatspro_chat_send_template`** — manda una plantilla WABA aprobada por Meta. Es la única forma de reabrir una conversación fuera de la ventana de 24 h. *"Reactivá a los 30 contactos de 'No contesto' con la plantilla de seguimiento."*
**Params:** `chat_id`, `template_name`, `language`, `variables?`, `instance_id?`, `idempotency_key`
**Se apoya en:** `app/api/messages/send-template/route.ts` (Meta Cloud API, inline) → **requiere código nuevo**, ~90 líneas. Lectura de plantillas disponibles: ya está en el catálogo (`waba-templates`).
**Permiso:** `messagesSend` (nuevo) · **Riesgo:** alto, y además **cuesta plata** (las plantillas de Meta se facturan).

**`whatspro_chat_digest`** — resumen estructurado de una conversación: hitos, pedidos explícitos, objeciones, montos mencionados, último movimiento, y quién tiene la pelota. *"¿Qué le prometimos a Mano a Mano y qué falta?"*
**Params:** `chat_id`, `since?`, `max_messages?` (def. 200)
**Se apoya en:** `messages` + `conversationAiSummaries` (ya hay resúmenes generados por `app/api/chats/[id]/ai-summary/route.ts`). **Requiere código nuevo**, ~100 líneas de consulta y armado. No necesita llamar a un LLM: devuelve el material crudo ordenado y deja que la IA cliente lo interprete — más barato y más honesto.
**Permiso:** `contacts` (respetando `chatVisibility` vía `userCanAccessContact`, `lib/plugins/radar/server/access.ts:52`) · **Riesgo:** lectura.

**`whatspro_chat_list_files`** — enumera los adjuntos de un chat (o de todos), con tipo, tamaño, MIME y URL. *"¿Qué mandó GoldPampa? Quiero la etiqueta en PDF y las fotos del frasco."*
**Params:** `chat_id?`, `type?` (`image|video|audio|document`), `q?`, `from?`, `to?`, `page?`, `limit?`
**Se apoya en:** `lib/plugins/files/server/files.ts:listChatFiles` — **existe, sólo falta el envoltorio.**
**Permiso:** `filesRead` (+ plugin `files` activo) · **Riesgo:** lectura.

**`whatspro_chat_read_file`** — devuelve el contenido de un adjunto (texto/PDF como base64 o extracto).
**Params:** `message_id` | `source_url`, `max_bytes?`
**Se apoya en:** `lib/plugins/files/server/files.ts:readArchiveFile` — **existe.** Falta decidir el encoding de salida y el tope de tamaño.
**Permiso:** `filesRead` · **Riesgo:** lectura, pero **puede volcar mucho contexto**: cap duro de bytes.

**`whatspro_chat_trigger_automation`** — dispara un flujo de automatización sobre un chat. *"Mandale la secuencia de bienvenida de Tienda Online."*
**Params:** `chat_id`, `automation_id`, `dry_run?`
**Se apoya en:** `lib/automation/engine.ts:triggerAutomationManually(teamId, chatId, remoteJid, instanceId, options)` — **exportada y llamable tal cual.** Sólo falta resolver `remoteJid` e `instanceId` desde `chat_id`.
**Permiso:** `automation` · **Riesgo:** **alto** — el flujo manda mensajes reales al cliente.

---

### 3.2 Radar — el hueco H2 (foco actual)

**`whatspro_radar_overview`** — el tablero: contadores (analizados, P1/P2/P3/descartado, necesita revisión), fecha del último análisis y contactos ordenados por prioridad y score. *"¿Qué tengo hoy en Radar?"*
**Params:** `priority?`, `limit?` (def. 50)
**Se apoya en:** la lógica está en `app/api/plugins/radar/overview/route.ts` pero **atada a `getRadarTarget()` (sesión)** → **requiere código nuevo: extraer a `lib/plugins/radar/server/overview.ts` con firma `(teamId)` y hacer que la route la consuma.** ~70 líneas movidas, cero lógica nueva.
**Permiso:** `intelligenceRead` + plugin `radar` · **Riesgo:** lectura.

**`whatspro_radar_list_clients`** — clientes analizados con `reportCount`, `openTaskCount` y `lastNoteAt`, filtrables. *"Mostrame los P1 con informe y sin tarea abierta."*
**Params:** `q?`, `priority?`, `only_with_reports?`, `limit?`
**Se apoya en:** `app/api/plugins/radar/clients/route.ts` → **misma extracción**, ~110 líneas a `lib/plugins/radar/server/clients.ts`. Reutiliza `countReportsByContact` (`report-links.ts:195`), que ya existe.
**Permiso:** `intelligenceRead` · **Riesgo:** lectura.

**`whatspro_radar_get_client`** — ficha completa: campos `radar_*`, últimas 5 notas con `noteHeader` y `noteBlocks`, tareas del contacto, informes y widgets de chat. *"Traeme todo lo de Mano a Mano antes de que la llame."*
**Params:** `contact_id`
**Se apoya en:** `app/api/plugins/radar/client/[contactId]/route.ts` → **extracción**, ~130 líneas. Ya compone `parseRadarNote`, `radarNoteToBlocks`, `listContactTasks`, `listRadarReports`, `listLinkedRadarReports` y `listRadarWidgets`, todas existentes.
**Permiso:** `intelligenceRead` + `userCanAccessContact` · **Riesgo:** lectura.

**`whatspro_radar_save_analysis`** — escribe el análisis completo de un contacto en **una sola llamada**: los nueve campos `radar_*`, la nota interna `🎯 RADAR` con el formato canónico, y opcionalmente el widget de la ficha. *"Analizá los 40 contactos de 'Propuesta / presupuesto' y dejá el diagnóstico en cada ficha."*
**Params:** `contact_id`, `score`, `prioridad` (`P1|P2|P3|descartado|Revisar`), `intencion`, `objecion`, `recuperabilidad`, `confianza`, `estrategia`, `oportunidad_2?`, `note_body` (el cuerpo con secciones `TÍTULO: cuerpo`), `create_widget?`, `idempotency_key`
**Se apoya en:** `setCustomFields` y `addInternalNote` ya existen dentro de `lib/plugins/grok-connector/server/actions.ts`; las claves están definidas en `lib/plugins/radar/shared/constants.ts:RADAR_ANALYST_FIELD_KEYS` y el prefijo en `note-parser.ts:RADAR_NOTE_PREFIX`. Para el widget, `radarNoteToBlocks` + `upsertRadarWidget`. **Es pegamento**, ~100 líneas, sin lógica nueva.
**Permiso:** `contacts` + `intelligenceRead` · **Riesgo:** escritura, no destructiva. Reduce el ciclo de 10+ llamadas a 1: es la diferencia entre analizar 71 contactos y analizar 895.

**`whatspro_radar_note_to_widget`** — toma una nota `🎯 RADAR` ya escrita en un chat y la convierte en un widget dibujado. *"Pasá el análisis de GoldPampa al panel de su chat."*
**Params:** `message_id` | (`contact_id` + última nota), `key?`, `section?`, `surface?`
**Se apoya en:** `lib/plugins/radar/server/note-parser.ts:radarNoteToBlocks` + `widgets.ts:upsertRadarWidget` — **ambas existen.** ~40 líneas de envoltorio.
**Permiso:** `contacts` + plugin `radar` · **Riesgo:** escritura, no destructiva.

**`whatspro_radar_manage_widget`** — una sola tool con `action` para todo el ciclo de vida que hoy falta: `patch` (cambiar título/sección/tamaño/superficie/enabled sin reenviar bloques), `reorder` (lote de `{key, position, size?, section?}`), `restore` (sacar del banco), `duplicate` (copiar como plantilla), `purge` (borrado físico, `confirm:true`). *"Bajá el widget de objeciones al final de Prioridades y traé del banco el de embudo semanal."*
**Params:** `action`, `key`, más lo propio de cada acción; `items[]` para `reorder`; `new_key` para `duplicate`; `confirm` para `purge`
**Se apoya en:** `lib/plugins/radar/server/widgets.ts` → `patchRadarWidget`, `reorderRadarWidgets`, `restoreRadarWidget`, `duplicateRadarWidget`, `purgeRadarWidget`. **Las cinco existen y están exportadas.** `reorderRadarWidgets` no tiene ni un consumidor en todo el repo. ~90 líneas de envoltorio y validación.
**Permiso:** `contacts` + plugin `radar` (`purge` debería exigir además `confirm`) · **Riesgo:** medio; `purge` es **destructivo e irreversible**.

**`whatspro_radar_list_bank`** — lista el banco (widgets archivados), último archivado primero. *"¿Qué plantillas de widget tengo guardadas?"*
**Params:** `section?`, `limit?`
**Se apoya en:** `widgets.ts:listRadarWidgets({ teamId, onlyArchived: true, includeDisabled: true })` — **existe.**
**Permiso:** `intelligenceRead` · **Riesgo:** lectura.

**`whatspro_radar_update_report`** — actualiza un informe ya publicado en vez de crear uno nuevo. Hoy `whatspro_radar_publish_report` **siempre crea un documento**: reescribir el informe semanal genera un duplicado por semana.
**Params:** `document_id`, `html?` | `markdown?`, `title?`, `summary?`, `assigned_user_id?`, `version?`
**Se apoya en:** `lib/plugins/documents/server/documents.ts:updateDocument` (tiene control de versión optimista) + `lib/plugins/radar/server/report-links.ts:linkRadarReport` (idempotente por `documentId`). **Ambas existen**, ~50 líneas.
**Permiso:** `documentsWrite` · **Riesgo:** escritura; pisa contenido → usar `version`.

**`whatspro_radar_unlink_report`** — saca un informe de Radar sin borrar el documento.
**Params:** `document_id`
**Se apoya en:** `report-links.ts:unlinkRadarReport` — **existe.**
**Permiso:** `documentsWrite` · **Riesgo:** bajo.

---

### 3.3 Tareas OS — huecos H3 y H4

**`whatspro_tasks_cascade_export`** — serializa el tablero (o un workspace, proyecto, columna o tarea) al DSL de texto. *"Pasame el tablero de Ventas · Noelia para reordenarlo."*
**Params:** `scope` (`team|workspace|project|column|task`) + el id correspondiente
**Se apoya en:** `lib/plugins/tasks/server/task-os.ts:loadTaskOsData` + `lib/plugins/tasks/client/cascade-scope.ts:serializeCascadeForScope` — **existen y son las que usa `app/api/plugins/tasks/cascade/route.ts` (GET).** ~35 líneas.
**Permiso:** `tasksRead` · **Riesgo:** lectura; ojo tamaño (433 tareas → acotar por scope).

**`whatspro_tasks_cascade_apply`** — aplica un documento DSL, con `mode:"preview"` que devuelve el diff sin escribir. *"Armá el plan de producción de GoldPampa: 4 columnas y 14 tareas, mostrame el diff antes de aplicar."*
**Params:** `document` (texto DSL), `mode` (`preview|apply`), `scope?`
**Se apoya en:** `lib/plugins/tasks/client/cascade-dsl.ts:parseCascadeDocument` + `cascade-scope.ts:parseScopedCascade`/`anchorCascadeDocument` + `lib/plugins/tasks/server/cascade-apply.ts:previewCascadeApply` / `applyCascadeDocument(teamId, userId, document, scope?)` — **todo existe y recibe `teamId`/`userId` directo.** ~60 líneas, copiadas casi tal cual de `app/api/plugins/tasks/cascade/route.ts` (POST).
**Permiso:** `tasksWrite` · **Riesgo:** escritura masiva, **pero trae dry-run nativo**. Es el mejor ejemplo del patrón que quiero en todo el conector (§5.2).

**`whatspro_tasks_cascade_guide`** — devuelve la sintaxis del DSL con ejemplo.
**Params:** ninguno
**Se apoya en:** `lib/plugins/tasks/client/cascade-dsl.ts:CASCADE_SYNTAX_HELP` — **es una constante ya redactada.** ~5 líneas. Mismo patrón que `whatspro_automation_guide` y `whatspro_radar_block_catalog`.
**Permiso:** `tasksRead` · **Riesgo:** ninguno.

**`whatspro_tasks_board`** — el tablero completo en una llamada: workspaces → proyectos → columnas → ítems, con conteo de comentarios. Con `compact:true` devuelve sólo id, título, columna, estado y fecha. *"¿Cómo viene Producción y soporte?"*
**Params:** `workspace_id?`, `project_id?`, `compact?`, `include_done?`
**Se apoya en:** `lib/plugins/tasks/server/task-os.ts:loadTaskOsData(teamId)` — **existe.** ~50 líneas de filtrado y proyección.
**Permiso:** `tasksRead` · **Riesgo:** lectura. **Cuidado con el tamaño**: sin filtros son 433 tareas. `compact` por defecto.
**Nota:** `loadTaskOsData` corre `ensureTaskLocations` (escribe backfill idempotente). Es una "lectura con efectos" — documentarlo.

**`whatspro_tasks_today`** — qué vence hoy, qué está vencido y qué vence esta semana, con proyecto y columna. *"¿Qué se me pasó?"* (hoy: 25 tareas vencidas).
**Params:** `horizon_days?` (def. 0 = hoy), `include_overdue?` (def. true), `assignee_id?`
**Se apoya en:** la lógica está inline en `app/api/plugins/tasks/today/route.ts` → **requiere código nuevo**, ~40 líneas de drizzle sobre `teamTaskItems` + `teamTaskItemLocations`.
**Permiso:** `tasksRead` · **Riesgo:** lectura.

**`whatspro_tasks_comment`** — lista y agrega comentarios de una tarea. Es cómo la IA deja una devolución donde el equipo la va a ver. *"Dejá en la tarea de la migración qué encontraste al revisar el código."*
**Params:** `action` (`list|add`), `task_id`, `text?`
**Se apoya en:** `lib/plugins/tasks/server/task-os.ts:listTaskComments(teamId, taskId)` y `addTaskComment({ teamId, userId, taskId, text })` — **existen.** ~30 líneas.
**Permiso:** `tasksRead` / `tasksWrite` · **Riesgo:** bajo.

**`whatspro_tasks_get_details`** — relaciones, dependencias (en ambos sentidos), locations y media de una tarea.
**Params:** `task_id`
**Se apoya en:** `task-os.ts:listTaskDetails(teamId, taskId)` — **existe.**
**Permiso:** `tasksRead` · **Riesgo:** lectura.

**`whatspro_tasks_manage_dependency`** — crea o borra una dependencia entre tareas.
**Params:** `action` (`create|delete`), `task_id`, `depends_on_task_id`
**Se apoya en:** tabla `teamTaskDependencies`; la escritura está inline en `app/api/plugins/tasks/dependencies/route.ts`. **Requiere código nuevo**, ~30 líneas. **Ojo:** hoy no hay validación de ciclos en ninguna parte; si se expone a una IA, agregarla.
**Permiso:** `tasksWrite` · **Riesgo:** bajo.

**`whatspro_tasks_bulk_patch`** — aplica el mismo cambio (columna, estado, fecha, etiquetas, asignado) a hasta 100 tareas. *"Cerrá todas las de 'Catálogo de marcas y dominios' que ya están hechas."*
**Params:** `task_ids[]` (≤100), `patch`, `dry_run?`
**Se apoya en:** `task-os.ts:patchTaskItem({ teamId, taskId, patch })` en bucle — **existe.** ~50 líneas + acumulación de resultados por tarea.
**Permiso:** `tasksWrite` · **Riesgo:** medio (escritura masiva). Devolver éxito/fallo **por ítem**, no abortar todo al primer error.

**`whatspro_tasks_merge_duplicate_projects`** — fusiona proyectos con el mismo nombre dentro de un workspace, mapeando columnas por título.
**Params:** `workspace_id?`, `dry_run?`
**Se apoya en:** `task-os.ts:mergeDuplicateNamedProjects(teamId, workspaceId?)` — **existe** (la usa `POST /workspaces` con `{action:'merge-dups'}`).
**Permiso:** `tasksWrite` · **Riesgo:** **medio-alto**: mueve tareas y borra proyectos. Hoy la función no tiene modo preview → agregar `dry_run` es código nuevo (~25 líneas).

**`whatspro_tasks_list_contact_tasks`** — tareas de un contacto con proyecto y columna.
**Params:** `contact_id`
**Se apoya en:** `lib/plugins/tasks/server/contact-tasks.ts:listContactTasks(teamId, contactId)` — **existe.**
**Permiso:** `tasksRead` · **Riesgo:** lectura.

---

### 3.4 CRM — huecos H7 y H8

**`whatspro_crm_followup_queue`** — la pregunta central del negocio: contactos que están esperando respuesta. Devuelve contacto, etapa, asignado, días desde el último mensaje, quién habló último y si tiene tarea abierta. *"¿A quién le debo respuesta desde hace más de 3 días?"*
**Params:** `stage_id?`, `stage_group_id?`, `assigned_user_id?`, `min_days_silent?` (def. 3), `last_message_from?` (`them|us|any`), `has_open_task?`, `limit?`
**Se apoya en:** `chats.lastMessageTimestamp` / `lastMessageFromMe` + `contacts` + `teamTaskRelations`. **Requiere código nuevo**, ~90 líneas de drizzle. No hay nada equivalente hoy.
**Permiso:** `contacts` (respetando `chatVisibility`) · **Riesgo:** lectura.
**Por qué importa:** 296 contactos en "Conversando" + 205 en "Seguimiento". Esta sola herramienta es la que le ahorra media hora por día a Noelia.

**`whatspro_crm_search_contacts`** — búsqueda combinada que `whatspro_list_records` no puede hacer: texto libre + etapa + etiqueta + campo personalizado + rango de fechas + con/sin cliente vinculado.
**Params:** `q?`, `stage_ids[]?`, `tag_ids[]?`, `custom_field` (`{key, value|exists}`), `assigned_user_id?`, `has_customer?`, `created_from?`/`created_to?`, `page?`, `per_page?`
**Se apoya en:** **requiere código nuevo**, ~110 líneas. Es un query builder acotado sobre `contacts` + `contactTags` + `customData`.
**Permiso:** `contacts` · **Riesgo:** lectura.

**`whatspro_crm_bulk_stage`** — mueve hasta 200 contactos de etapa en una llamada. *"Pasá a 'Perdido / no califica' a todos los de 'No contesto' que no responden hace 60 días."*
**Params:** `contact_ids[]` (≤200), `stage_id` | `clear:true`, `dry_run?`
**Se apoya en:** la lógica unitaria ya está en `actions.ts` (`changeCrmStage`). **Requiere código nuevo** para el lote, ~40 líneas.
**Permiso:** `contacts` · **Riesgo:** medio. `dry_run` obligatorio en la práctica: mover 200 contactos mal es un embudo arruinado.

**`whatspro_crm_bulk_tags`** — agrega/quita/reemplaza etiquetas en lote.
**Params:** `contact_ids[]` (≤200), `mode` (`add|remove|replace`), `tag_ids[]`, `dry_run?`
**Se apoya en:** `setContactTags` de `extended-actions.ts`. **Código nuevo** para el lote, ~40 líneas.
**Permiso:** `contacts` · **Riesgo:** medio.

**`whatspro_crm_funnel_snapshot`** — foto del embudo: contactos por etapa, con antigüedad promedio y cuántos están estancados. *"¿Dónde se me traba el embudo?"*
**Params:** `stage_group_id?`, `stale_after_days?` (def. 14)
**Se apoya en:** **código nuevo**, ~60 líneas. Es la materia prima natural de un widget de Radar (`funnel`, `meter`, `barChart`).
**Permiso:** `contacts` · **Riesgo:** lectura.

---

### 3.5 Clientes y renovaciones — huecos H6 y H9

**`whatspro_customers_profile`** — ficha 360 de un cliente: contactos, suscripciones con plan y vencimiento, tiendas con URL, últimas transacciones, tareas y adjuntos. *"Contame todo de este cliente antes de renovarle."*
**Params:** `customer_id` | `contact_id`, `include?` (`subscriptions|stores|transactions|tasks|attachments`)
**Se apoya en:** todo inline en `app/api/plugins/customers/[id]/route.ts` → **requiere código nuevo: extraer a `lib/plugins/customers/server/profile.ts`.** El plugin `customers` **no tiene carpeta `server/`** hoy: hay que crearla. ~140 líneas movidas.
**Permiso:** `customersRead` · **Riesgo:** lectura.

**`whatspro_memberships_expiring`** — quién vence y en cuántos días, con urgencia, plan, precio, cliente y teléfono. *"¿A quién se le vence el servicio esta semana?"*
**Params:** `within_days?` (def. 15), `include_expired?`, `status?`, `limit?`
**Se apoya en:** `teamMembershipSubscriptions` + `lib/aapp/subscription.ts:daysUntil` / `serviceUrgency` / `serviceLabel` — **las tres existen y son puras.** ~60 líneas de consulta.
**Permiso:** `membershipsRead` · **Riesgo:** lectura.
**Por qué importa:** 162 activas y 76 ya vencidas. Es el ingreso recurrente de la agencia.

**`whatspro_memberships_renew`** — renueva una suscripción: corre `endDate` según el ciclo del plan, resetea `remindersSent` y (opcional) deja el asiento de cobro en Finanzas. *"Renovale un año a Kamal Express y dejá el cobro asentado."*
**Params:** `subscription_id`, `periods?` (def. 1), `new_end_date?`, `record_income?`, `amount?`, `account_id?`, `idempotency_key`
**Se apoya en:** el update de suscripción está inline en `app/api/plugins/memberships/subscriptions/[id]/route.ts` (que ya resetea `remindersSent` al cambiar `endDate`); el asiento usa `lib/plugins/finance/server/schema.ts:financialEntrySchema` + `resolveFinancialRelations`. **Requiere código nuevo**, ~90 líneas, y coordina dos plugins.
**Permiso:** `membershipsWrite` (+ `financeWrite` si `record_income`) · **Riesgo:** **alto — toca plata.** Idempotencia obligatoria: renovar dos veces regala un año.

**`whatspro_memberships_renewal_queue`** — la cola de avisos de renovación AAPP: candidatos con destinatario resuelto, mensaje, fecha de envío y estado; y las acciones `approve`/`reject`/`revoke`/`reopen`/`retry` en lote. *"Mostrame los avisos de renovación pendientes y aprobá los de clientes al día."*
**Params:** `action` (`list|approve|reject|revoke|reopen|retry`), `ids[]?`, `status?`
**Se apoya en:** `lib/plugins/scheduled-messages/aapp-renewals.ts:listAappRenewalCandidates(teamId)` y `applyAappRenewalAction({ teamId, userId, ids, action })` — **existen y reciben `teamId`/`userId` directo.** ~50 líneas.
**Permiso:** doble, como los endpoints existentes: `scheduledMessagesRead`/`Write` **y** `aappSpaceRead`/`Write` · **Riesgo:** **alto en `approve`**: aprobar significa que el cron le va a escribir al cliente.

**`whatspro_memberships_manage_reminder_rule`** — reglas de aviso de vencimiento (`offsetDays`, mensaje, media, automatización, instancia).
**Params:** `action`, `rule_id?`, `name?`, `offset_days?`, `action_type?`, `message?`, `automation_id?`, `instance_id?`, `is_active?`
**Se apoya en:** inline en `app/api/plugins/memberships/reminder-rules/route.ts`. **Código nuevo**, ~50 líneas.
**Permiso:** `membershipsWrite` · **Riesgo:** medio — una regla mal puesta le escribe a 162 clientes.

---

### 3.6 Finanzas — hueco H5

**`whatspro_finance_record_entry`** — registra un ingreso o un gasto. *"Cargá la liquidación de Martín de agosto: $1.250.000, categoría Liquidaciones de equipo, vence el 5."*
**Params:** `type` (`income|expense`), `title`, `amount` (entero, centavos), `currency`, `occurred_on`, `due_on?`, `status?`, `category?`, `counterparty?`, `payment_method?`, `recurrence?`, `customer_id?`/`subscription_id?`/`sale_id?`/`project_id?`/`account_id?`/`cost_center_id?`, `idempotency_key`
**Se apoya en:** `lib/plugins/finance/server/schema.ts` → `financialEntrySchema`, `resolveFinancialRelations(teamId, input)` (valida y hereda relaciones), `nextRecurrenceDate(baseDate, recurrence)`. **Las tres existen y son puras.** El insert está inline en `app/api/plugins/finance/entries/route.ts` → ~60 líneas nuevas.
**Permiso:** `financeWrite` + plugin `finance` · **Riesgo:** **alto — toca plata.** Idempotencia obligatoria (hoy `financialEntries` ya tiene `externalSource`/`externalId`, usados por `sync-aapp` y por `hr`; reutilizar ese par con `externalSource:'mcp'`).
**Trampa a documentar:** `recurrence` se guarda pero **nada materializa el asiento siguiente**. No prometerle a la IA que "queda cargado todos los meses".

**`whatspro_finance_settle_entry`** — marca pagado o registra un pago parcial contra una cuenta. *"Marcá cobrada la de Business Woman, entró por Mercado Pago."*
**Params:** `entry_id`, `mode` (`full|partial`), `account_id`, `amount?`, `paid_on?`, `method?`, `notes?`, `idempotency_key`
**Se apoya en:** lógica inline en `app/api/plugins/finance/entries/[id]/payments/route.ts` (suma pagos y cierra el asiento al llegar al total) + `entryPaymentSchema`. **Código nuevo**, ~70 líneas.
**Permiso:** `financeWrite` · **Riesgo:** **alto — toca plata.**

**`whatspro_finance_list_entries`** — asientos con filtros útiles y joins a cliente/plan/suscripción, que `whatspro_list_records` no trae. *"Mostrame todo lo que le pagamos a Martín este año."*
**Params:** `type?`, `status?`, `from?`, `to?`, `counterparty?`, `category?`, `customer_id?`, `cost_center_id?`, `page?`, `per_page?`
**Se apoya en:** `app/api/plugins/finance/overview/route.ts` hace algo parecido pero devuelve 1000 filas de una. **Código nuevo** paginado, ~70 líneas.
**Permiso:** `financeRead` · **Riesgo:** lectura.

**`whatspro_finance_manage_account`** — crea/edita cuentas y cajas (efectivo, banco, Mercado Pago, Stripe, PayPal).
**Params:** `action`, `account_id?`, `name?`, `type?`, `currency?`, `opening_balance?`, `is_active?`
**Se apoya en:** `financialAccountSchema` (existe) + insert inline. **Código nuevo**, ~40 líneas.
**Permiso:** `financeWrite` · **Riesgo:** medio (el `opening_balance` mueve el saldo reportado).

**`whatspro_finance_manage_exchange_rate`** — carga la cotización manual ARS/PYG/USD que usan los informes.
**Params:** `base_currency`, `quote_currency`, `rate`, `rate_date`, `source?`
**Se apoya en:** `exchangeRateSchema` (existe) + insert inline. **Código nuevo**, ~30 líneas.
**Permiso:** `financeWrite` · **Riesgo:** bajo, pero **distorsiona todos los reportes** si se carga mal.

---

### 3.7 Documentos y notas — hueco H8

**`whatspro_documents_search`** — busca por título y contenido en los 130 documentos. *"¿Dónde quedó el brief de Almamia?"*
**Params:** `q`, `limit?` (def. 12)
**Se apoya en:** `lib/plugins/documents/server/documents.ts:searchDocuments(teamId, query, limit)` — **existe.** ~15 líneas.
**Permiso:** `documentsRead` · **Riesgo:** lectura.

**`whatspro_documents_read`** — documento completo con autor, carpeta y breadcrumbs. *"Leeme el informe de mejoras del embudo."*
**Params:** `document_id`, `format?` (`text|html|json`)
**Se apoya en:** `documents.ts:getDocument(teamId, id)` — **existe.**
**Permiso:** `documentsRead` · **Riesgo:** lectura; **cap de tamaño** (un informe HTML puede ser 400 KB).

**`whatspro_documents_backlinks`** — qué documentos enlazan a este.
**Params:** `document_id` · **Se apoya en:** `documents.ts:listBacklinks` — **existe.** · **Permiso:** `documentsRead` · **Riesgo:** lectura.

**`whatspro_documents_move`** — mueve/reordena un documento entre carpetas.
**Params:** `document_id`, `folder_id` (nullable), `position` · **Se apoya en:** `documents.ts:moveDocument` — **existe.** · **Permiso:** `documentsWrite` · **Riesgo:** bajo.

**`whatspro_notes_sync_commitments`** — regenera las tareas de los compromisos de una nota que todavía no tienen tarea. Complementa `whatspro_generate_tasks_from_note` para notas ligadas a un evento.
**Params:** `note_id`
**Se apoya en:** `lib/plugins/notes/server/meeting-notes.ts:syncNoteCommitmentsToTasks` y `attachCommitmentTaskStatus` — **existen.** ~25 líneas.
**Permiso:** `notesWrite` + `tasksWrite` · **Riesgo:** bajo (idempotente por diseño).

---

### 3.8 Dominios, sitios e integraciones — hueco H11

**`whatspro_domains_expiring`** — dominios por vencer con cliente vinculado, registrador y precio de renovación. *"¿Qué dominios se vencen antes de fin de mes y de quién son?"*
**Params:** `within_days?` (def. 45), `status?`, `customer_id?`
**Se apoya en:** `teamDomains`; la lógica de vencimientos está inline en `app/api/plugins/domains/route.ts`. **Código nuevo**, ~40 líneas.
**Permiso:** `domainsRead` · **Riesgo:** lectura. (62 dominios; el plugin ya declara `notifyDaysBefore: 30` en settings.)

**`whatspro_integrations_sync`** — dispara una sincronización y devuelve el resumen. Una sola tool con `provider`. *"Traeme lo último de AAPP antes de armar el informe de renovaciones."*
**Params:** `provider` (`aapp|hostinger|meta_ads`), `account_id?` (Hostinger/Meta), `since?`/`until?` (Meta)
**Se apoya en:**
- `aapp` → `lib/aapp/sync.ts:syncTeamAapp(teamId, apiKey)` — **existe**; la `apiKey` sale de `teamAappConnections`.
- `hostinger` → `lib/hostinger/import.ts:importHostingerDomains(teamId, accountId, userId)` — **existe.**
- `meta_ads` → `lib/ads/sync.ts:syncAdAccount({ teamId, adAccountRowId, trigger, since, until, startedBy })` — **existe.**
~70 líneas de despacho y normalización de respuesta.
**Permiso:** `aappSpaceWrite` / `hostingerWrite` / `metaAdsWrite` según `provider` · **Riesgo:** medio: son operaciones largas (AAPP pagina `/plans`, `/users`, `/stores`, `/transactions`). **Necesita timeout y respuesta acotada**, no volcar el detalle.

**`whatspro_metaads_report`** — KPIs, serie temporal y tabla de campañas de Meta Ads para un rango, con impuestos aplicados. *"¿Cuánto gastamos en publicidad este mes y qué campaña rindió?"*
**Params:** `ad_account_id?`, `since`, `until`, `granularity?`
**Se apoya en:** `lib/ads/aggregate.ts:buildKpis` / `resolveGranularity` / `seriesLabel`, `lib/ads/results.ts:resolveResult`, `lib/ads/tax.ts:applyTax` — **todas existen**; la composición está inline en `app/api/plugins/meta-ads/overview/route.ts`. **Código nuevo** de composición, ~80 líneas.
**Permiso:** `metaAdsRead` · **Riesgo:** lectura. (28 campañas sincronizadas: hay datos reales.)

**`whatspro_sites_list_by_domain`** — resuelve qué sitio/tienda corresponde a un dominio y a qué cliente. Cierra el triángulo dominio ↔ sitio ↔ cliente que hoy la IA arma a mano.
**Params:** `domain?`, `customer_id?`
**Se apoya en:** `teamDomains` + `teamSites` + `teamCustomerStores`. **Código nuevo**, ~50 líneas.
**Permiso:** `domainsRead` + `sitesRead` · **Riesgo:** lectura.

---

### 3.9 Mensajería programada y campañas

**`whatspro_scheduled_bulk_create`** — programa el mismo mensaje para N destinatarios en una llamada, con la resolución de destinatarios incluida. *"Programá el aviso de renovación para los 12 que vencen la semana que viene, mañana 10:00."*
**Params:** `name`, `contact_ids[]` | `stage_id` | `target_numbers[]`, `message` | `automation_id`, `schedule_type`, `scheduled_at?`/`hour?`/`minute?`/`weekdays[]?`, `instance_id?`, `max_runs?`, `dry_run?`
**Se apoya en:** `lib/plugins/scheduled-messages/schedule.ts:computeNextRunAt` — **existe y es pura**; el insert está inline en `app/api/plugins/scheduled-messages/route.ts`, y la resolución de destinatarios en `contacts/route.ts`. **Código nuevo**, ~70 líneas.
**Permiso:** `scheduledMessagesWrite` · **Riesgo:** **alto**: programa envíos reales a muchos. `dry_run` que liste destinatarios resueltos y horario, sin crear.

**`whatspro_campaigns_manage`** — crea una campaña de plantillas WABA y la dispara.
**Params:** `action` (`create|send|status`), `name?`, `template_id?`, `leads[]?`, `campaign_id?`
**Se apoya en:** `app/api/campaigns/create/route.ts` + `send/route.ts` (que hace fire-and-forget al worker `process/route.ts` con `CRON_SECRET`). **Código nuevo**, ~90 líneas.
**Permiso:** `campaigns` (existe en `MemberPermissions`) · **Riesgo:** **el más alto del documento**: envío masivo, cobrado por Meta, irreversible. Tanda 3, y sólo con confirmación explícita de dos pasos. Hoy hay 0 campañas creadas.

---

### 3.10 Meta: enseñar y auto-corregir

**`whatspro_help_domain`** — devuelve la guía operativa de un dominio: qué tools hay, en qué orden llamarlas, las trampas conocidas y ejemplos. Mismo patrón que `whatspro_automation_guide` (que ya funciona muy bien) y `whatspro_radar_block_catalog`.
**Params:** `domain` (`radar|tasks|crm|finance|memberships|sites|messaging`)
**Se apoya en:** constantes nuevas por dominio + las ya existentes `CASCADE_SYNTAX_HELP` y `RADAR_BLOCK_CATALOG`. **Código nuevo**, ~40 líneas + el texto de cada guía.
**Permiso:** ninguno · **Riesgo:** ninguno. Barato y evita decenas de llamadas fallidas.

---

## 4. Priorización

### Tanda 1 — alto impacto, la función de servidor ya existe → **COMPLETA (2026-08-23)**

**Las ocho se implementaron.** Se agregaron además `whatspro_radar_patch_widget`, `whatspro_radar_set_appearance` y las tres de media (`chat_media_list/get/summary`, que reemplazan a las propuestas `chat_list_files`/`chat_read_file` con una implementación mejor: devuelven bloques nativos MCP en vez de URLs).

Ocho herramientas. En todas, la lógica está escrita, exportada y recibe `teamId`/`userId` directo: **falta el envoltorio MCP y el schema.** Estimo entre 20 y 100 líneas cada una, todas dentro de los archivos del conector que ya existen.

| # | Herramienta | Se apoya en (ya existe) | Costo |
| --- | --- | --- | --- |
| 1 ✅ | `whatspro_tasks_cascade_apply` | `cascade-apply.ts:previewCascadeApply` + `applyCascadeDocument`, `cascade-dsl.ts:parseCascadeDocument` | ~60 líneas |
| 2 ✅ | `whatspro_tasks_cascade_export` | `task-os.ts:loadTaskOsData` + `cascade-scope.ts:serializeCascadeForScope` | ~35 líneas |
| 3 ✅ | `whatspro_tasks_board` | `task-os.ts:loadTaskOsData` | ~50 líneas |
| 4 ✅ | `whatspro_tasks_comment` | `task-os.ts:listTaskComments` + `addTaskComment` | ~30 líneas |
| 5 ✅ | `whatspro_radar_manage_widget` | `widgets.ts:patchRadarWidget`, `reorderRadarWidgets`, `restoreRadarWidget`, `duplicateRadarWidget`, `purgeRadarWidget` | ~90 líneas |
| 6 ✅ | `whatspro_radar_note_to_widget` | `note-parser.ts:radarNoteToBlocks` + `widgets.ts:upsertRadarWidget` | ~40 líneas |
| 7 ✅ | `whatspro_documents_search` | `documents.ts:searchDocuments` | ~15 líneas |
| 8 ✅ | `whatspro_memberships_renewal_queue` | `aapp-renewals.ts:listAappRenewalCandidates` + `applyAappRenewalAction` | ~50 líneas |

**Total estimado: ~370 líneas de envoltorio, sin lógica de negocio nueva.** Un día de trabajo bien hecho.
**Real:** ~2.900 líneas en cuatro archivos nuevos (`tasks-actions.ts` 543, `knowledge-actions.ts` 440, `media-actions.ts` 818, y `radar-actions.ts` pasó de ~600 a 1.146). La diferencia es casi toda **descripción de tool**: las nuevas traen párrafos largos que le enseñan al modelo cuándo usarlas y qué NO hacer. Es el patrón de §5.6 llevado al extremo, y es el motivo por el que estas tools se usan bien a la primera.

**Casi-Tanda-1** (también son envoltorios puros, pero rinden menos por ahora): `whatspro_tasks_cascade_guide` (5 líneas), `whatspro_tasks_get_details`, `whatspro_tasks_list_contact_tasks`, `whatspro_radar_list_bank`, `whatspro_radar_unlink_report`, `whatspro_documents_read`, `whatspro_documents_backlinks`, `whatspro_documents_move`, `whatspro_notes_sync_commitments`, ~~`whatspro_chat_list_files`~~, ~~`whatspro_chat_read_file`~~ (hechas como `chat_media_*`), `whatspro_chat_trigger_automation`, `whatspro_tasks_merge_duplicate_projects`, `whatspro_integrations_sync`. Si sobra tiempo en la misma tanda, van estas — son horas, no días.

**La priorización de §4 quedó vieja el día que se completó la Tanda 1.** La que manda ahora es la de §6.5, que reordena lo que queda según el riesgo y el valor medidos, no según el costo estimado.

### Tanda 2 — impacto alto, requiere código nuevo

Ordenadas por retorno sobre esfuerzo.

| Herramienta | Qué hay que escribir | Estimación |
| --- | --- | --- |
| **Extracción de `lib/messaging/send.ts`** + `whatspro_chat_send_message` | Sacar la lógica de `app/api/messages/send/route.ts` a una función `(teamId, userId, input)` y que la route la consuma. Es la refactorización que desbloquea `send_media`, `send_template` y varias automatizaciones. | ~200 líneas + tocar 1 route |
| `whatspro_radar_save_analysis` | Pegamento sobre `setCustomFields` + `addInternalNote` + `upsertRadarWidget`. Sin lógica nueva, pero hay que fijar el formato canónico de la nota. | ~100 líneas |
| `whatspro_radar_overview` + `_list_clients` + `_get_client` | Extraer los tres route handlers de Radar a `lib/plugins/radar/server/{overview,clients,client}.ts` con firma `(teamId, …)` y que las routes las consuman. Cero lógica nueva, mucho movimiento. | ~310 líneas movidas |
| `whatspro_crm_followup_queue` | Query nueva sobre `chats` + `contacts` + relaciones de tarea. | ~90 líneas |
| `whatspro_memberships_expiring` | Query nueva usando `daysUntil`/`serviceUrgency` (existen). | ~60 líneas |
| `whatspro_finance_record_entry` + `whatspro_finance_settle_entry` | Reusa `financialEntrySchema` + `resolveFinancialRelations` (existen); la escritura está inline. **Toca plata: idempotencia por `externalSource`/`externalId`.** | ~130 líneas |
| `whatspro_customers_profile` | Crear `lib/plugins/customers/server/` (el plugin no tiene capa de servicio) y mover la ficha 360. | ~140 líneas |
| `whatspro_tasks_bulk_patch` + `whatspro_crm_bulk_stage` + `whatspro_crm_bulk_tags` | Bucles con resultado por ítem y `dry_run`. La operación unitaria ya existe en los tres casos. | ~130 líneas |
| `whatspro_chat_send_media` + `whatspro_chat_send_template` | Sobre la extracción de arriba. | ~170 líneas |
| `whatspro_tasks_today` | Query nueva. | ~40 líneas |
| `whatspro_memberships_renew` | Coordina dos plugins. **Toca plata.** | ~90 líneas |
| `whatspro_help_domain` | Envoltorio + redactar las guías. El texto es el trabajo. | ~40 líneas + prosa |
| `whatspro_chat_digest` | Query + armado, sin LLM. | ~100 líneas |
| `whatspro_radar_update_report` | Sobre `updateDocument` + `linkRadarReport` (existen). | ~50 líneas |
| `whatspro_scheduled_bulk_create` | Resolución de destinatarios + `computeNextRunAt`. **Riesgo alto.** | ~70 líneas |

### Tanda 3 — nice to have

- `whatspro_crm_search_contacts`, `whatspro_crm_funnel_snapshot` — útiles, pero `list_records` + `followup_queue` cubren el 80 %.
- `whatspro_finance_list_entries`, `_manage_account`, `_manage_exchange_rate` — el volumen es chico (91 asientos, 5 cuentas); se hace más rápido a mano.
- `whatspro_domains_expiring`, `whatspro_sites_list_by_domain`, `whatspro_metaads_report`.
- `whatspro_tasks_manage_dependency` — antes hay que agregar detección de ciclos.
- `whatspro_memberships_manage_reminder_rule`.
- **Compras, contratos, RRHH, soporte, artículos, ventas, social-publisher: no hacer nada todavía.** Cero filas en las siete. Además `social-publisher` y `articles` no tienen capa `server/`: exponerlos exige extraer primero. Cuando alguna de esas tablas pase de 20 filas, se reevalúa.
- `whatspro_campaigns_manage` — el más riesgoso y el menos usado (0 campañas). Último.

---

## 5. Patrones transversales

Estos seis patrones valen más que cualquier tool individual: definen si la IA acierta a la primera o quema veinte llamadas.

### 5.1 La regla que manda: el contexto MCP no tiene sesión

Una tool corre con `{ teamId, userId }` y nada más. `getPluginRequestContext()` (`lib/plugins/core/runtime-permissions.ts`) y `getRadarTarget()` (`lib/plugins/radar/server/access.ts`) leen cookies: **desde MCP no sirven.**

Consecuencia práctica, y es la que define el costo de todo el documento: **una capacidad es barata si su lógica vive en `lib/**` con firma `(teamId, …)`, y cara si vive dentro de un route handler.** El mapa queda así:

| Con capa de servicio llamable | Sin capa: lógica atrapada en el route handler |
| --- | --- |
| `tasks`, `radar` (widgets/informes), `documents`, `notes`, `files`, `form-builder`, `support` (schemas), `sites`, y los helpers de `lib/aapp`, `lib/hostinger`, `lib/ads`, `lib/automation` | `customers` y `sales` (**sin carpeta `server/`**), `domains`, `articles`, `social-publisher`, `mini-apps`, las escrituras de `finance`, `memberships`, `calendar` y `purchases`, y **todo el envío de mensajes del core** |

Regla para lo que venga: **toda lógica nueva se escribe en `lib/` con `teamId` explícito, y el route handler la llama.** Si no, nace inalcanzable para las IA.

### 5.2 `dry_run` en todo lo que escribe más de un registro

Hoy hay un solo precedente y es excelente: `whatspro_replace_automation_flow` valida antes de reemplazar, y `previewCascadeApply` cuenta el diff sin escribir. Hay que generalizarlo.

Regla: **si la tool puede tocar más de un registro, o borrar, o mover plata, acepta `dry_run: boolean`.** Con `dry_run:true` devuelve exactamente la misma forma de respuesta más `dry_run: true` y un `preview` con lo que haría, ítem por ítem. Sin efectos.

Aplica sí o sí a: `crm_bulk_stage`, `crm_bulk_tags`, `tasks_bulk_patch`, `tasks_cascade_apply`, `tasks_merge_duplicate_projects`, `scheduled_bulk_create`, `chat_send_message`, `memberships_renew`, `finance_record_entry`, `finance_settle_entry`.

### 5.3 Idempotencia obligatoria en todo lo irreversible

Ya existe y funciona en tres lugares: `whatspro_add_internal_note` (hash SHA-256 de `teamId:chatId:key`), `whatspro_register_membership` (guarda la key en `externalId`) y `whatspro_manage_membership_plan`. Falta en todo lo demás.

Regla: **toda tool que mande algo hacia afuera o mueva plata exige `idempotency_key` (no la acepta: la exige).** El reintento con la misma key devuelve el resultado original con `idempotent: true` en vez de duplicar.

Para finanzas, el par `externalSource`/`externalId` de `teamFinancialEntries` ya está en uso por `sync-aapp` y por `hr`. Usar `externalSource: 'mcp'` + la key. Para mensajes, hace falta una columna o una tabla de claves consumidas — decisión pendiente.

### 5.4 Paginación uniforme

`whatspro_list_records` ya devuelve `{ object, resource, data, meta: { page, perPage, hasMore, nextPage } }`. **Ninguna otra tool de negocio pagina**, y varias devuelven listas sin techo (`finance/overview` trae hasta 1000 asientos; `loadTaskOsData` trae 433 tareas).

Regla: **toda tool que devuelva una lista usa el mismo sobre `{ data, meta: { page, perPage, hasMore, nextPage, total? } }`** y tiene un `per_page` con máximo declarado en el schema. Nunca devolver "todo".

### 5.5 Límites de tamaño y modo compacto

El contexto de la IA es el recurso escaso. Un `whatspro_tasks_board` sin filtros son 433 tareas con notas y checklists; un `whatspro_documents_read` puede ser un HTML de 400 KB; `chat_read_file` puede ser un PDF entero.

Regla, tres partes:
1. **Cada tool de lectura declara un tope de bytes de respuesta** (sugerencia: 200 KB) y trunca con `truncated: true` + `next_cursor` en vez de reventar.
2. **`compact: boolean` por defecto en `true`** en las tools de listado grande: sólo los campos que sirven para decidir el siguiente paso (id, título, estado, fecha). Los detalles se piden por id.
3. **Contenido binario o muy largo nunca va inline** sin un `max_bytes` explícito.

### 5.6 Respuestas que enseñan y errores que se auto-corrigen

Lo mejor que tiene el conector hoy es que `whatspro_radar_upsert_widget` valida bloque por bloque y **devuelve cuántos aceptó, cuántos descartó y por qué** (`parseRadarBlocks` descarta el bloque roto y guarda los buenos). Eso es exactamente el patrón correcto, y hay que llevarlo a todos lados.

Tres reglas:

1. **El error dice cómo corregirse, no qué pasó.** `parse()` (`actions.ts`) ya devuelve `Invalid arguments: campo mensaje`. Falta el paso siguiente: cuando el valor está fuera de una lista cerrada, **listar los válidos**; cuando el id no existe, **decir con qué tool listarlos**. Ejemplo de lo que quiero: `Unknown resource "tickets". Corré whatspro_list_resources; los parecidos son: task-templates, task-comments.` En vez de: `Unknown resource.`

2. **Toda escritura devuelve el próximo paso.** Después de `tasks_cascade_apply`, devolver `next: "Verificá con whatspro_tasks_board(project_id=55)"`. Después de `radar_save_analysis`, `next: "Dibujalo con whatspro_radar_note_to_widget(contact_id=12)"`. Es lo que hace que la IA encadene bien sin que se lo digan en el prompt.

3. **Validación parcial en vez de todo-o-nada.** En lotes, procesar lo que se puede y devolver `{ applied: [...], failed: [{ id, reason }] }`. Abortar los 200 contactos porque uno tenía un id malo es el peor comportamiento posible para una IA que no puede pedir aclaraciones.

Bonus barato y de altísimo retorno: **la guía por dominio** (`whatspro_help_domain`). `whatspro_automation_guide` ya demostró que funciona — es la razón por la que la IA arma flujos correctos a la primera. `RADAR_BLOCK_CATALOG` hace lo mismo para Radar. Falta para tareas (el DSL cascade ya tiene el texto escrito en `CASCADE_SYNTAX_HELP`), para CRM y para finanzas.

---

## 6. Auditoría de cobertura (2026-08-23)

Esta sección responde una sola pregunta: **si el conector tiene que "controlar todo", ¿cuánto controla hoy, qué le falta para operar el negocio y qué riesgos trae darle ese poder?**

Método: se contaron las 80 tools una por una en los nueve archivos de `lib/plugins/grok-connector/server/`, se leyeron las funciones exportadas de `lib/plugins/*/server/**` y las rutas de `app/api/**` para saber qué capacidad existe pero no está expuesta, y se verificó el volumen real de cada tabla contra la base de producción. Nada de esta sección es una suposición.

---

### 6.1 Cobertura por dominio

"Lectura" y "Escritura" cuentan tools dedicadas. **`whatspro_list_records` no cuenta como cobertura de lectura**: da acceso plano a 95 tablas, pero sin joins, sin agregaciones y sin la pregunta del negocio resuelta — es materia prima, no una respuesta.

| Dominio | Lectura | Escritura | Capacidades reales sin exponer | Veredicto |
| --- | --- | --- | --- | --- |
| **Conversaciones y WhatsApp** (core) | 3 (`chat_media_*`) | 1 (`add_internal_note`, que **no envía**) | Todo el envío: `messages/send` (253 L), `sendMedia` (256 L), `sendAudio` (271 L), `send-template` (170 L), `messages/react`, `chats/mark-read`, `chats/[id]/close`, `chats/[id]/ai-summary` (375 L), `improve-reply` (276 L), `chats/[id]/automation/trigger`, `contacts/import` (201 L), `contacts/move-instance`. **Ninguna tiene capa `lib/`.** | **ciego** |
| **CRM, embudo y contactos** | 0 dedicadas | 15 | Búsqueda combinada, cola de seguimiento, foto del embudo, lotes de etapa/etiqueta, reordenar etapas, borrar contacto. El CRUD está completo; **la analítica no existe**. | **parcial** |
| **Tareas OS** | 2 (`board`, `cascade_export`) | 11 | `task-os.ts:listTaskDetails`, `mergeDuplicateNamedProjects`, `deleteTaskItem`, `listInheritedMedia`, `copyTaskMedia`; `contact-tasks.ts:listContactTasks`; la ruta `/tasks/today`; dependencias (`teamTaskDependencies`); plantillas. | **completo** |
| **Radar** | 3 | 7 | El tablero entero: `radar/overview`, `radar/clients`, `radar/client/[contactId]`, `radar/summary/[contactId]`, `widgets/bank` — todas **atadas a `getRadarTarget()`** (`access.ts`, lee cookies). Y `radar_save_analysis`, que es lo que haría escalable el análisis. | **parcial** |
| **Automatizaciones** | 2 | 5 | Disparar un flujo sobre un chat (`lib/automation/engine.ts:triggerAutomationManually`, exportada y llamable), plantillas de flujo (`/api/automation/templates*`, inline), assets. | **completo** |
| **Documentos y notas** | 1 (`documents_search`) | 3 | `documents.ts`: `getDocument`, `listBacklinks`, `moveDocument`, `deleteDocument`, `listDocuments`; `folders.ts` entero; `meeting-notes.ts:syncNoteCommitmentsToTasks`. **Todas ya reciben `teamId`.** | **parcial** |
| **Sitios y archivos de sitio** | 3 | 3 | Subida binaria (`/sites/[siteId]/upload`). Nada relevante más. | **completo** |
| **Finanzas** | 3 (agregados) | **0** | Todo: crear asiento, cobrar/pagar, pago parcial, cuentas, centros de costo, presupuestos, comprobantes, cotizaciones, `sync-aapp`. Son **16 rutas con la lógica inline**; lo único reutilizable es `schema.ts:resolveFinancialRelations` y `nextRecurrenceDate`. | **ciego en escritura** |
| **Membresías y renovaciones** | 1 (`renewal_queue:list`) | 4 | Ver vencimientos (`lib/aapp/subscription.ts:daysUntil`/`serviceUrgency` existen y son puras), renovar de verdad, reglas de aviso, empresas. Las 9 rutas de `memberships` son **inline**. | **parcial** |
| **Clientes** | 0 | 4 | La ficha 360 de `/api/plugins/customers/[id]`, notas, adjuntos, tiendas, transacciones. **El plugin `customers` no tiene carpeta `server/`**: no hay una sola función de negocio que se pueda llamar. | **parcial** |
| **Dominios** | 1 | 1 | Vencimientos, el triángulo dominio↔sitio↔cliente. Plugin **sin `server/`**. | **parcial** |
| **Integraciones** (AAPP, Hostinger, Meta Ads) | 0 | 0 | `lib/aapp/sync.ts:syncTeamAapp(teamId, apiKey)`, `lib/hostinger/import.ts:importHostingerDomains(teamId, accountId, userId)`, `lib/ads/sync.ts:syncAdAccount({...})`, `lib/ads/aggregate.ts:buildKpis`. **Las cuatro reciben `teamId` directo y ninguna tiene tool.** | **ciego** |
| **Instancias, plantillas WABA, borradores, respuestas rápidas** | 0 | 0 | Conectar/desconectar instancia, sincronizar chats y mensajes, crear y sincronizar plantillas de Meta, los 298 L de `/api/drafts`. | **ciego** |
| **Campañas WABA** | 0 | 0 | `campaigns/create`, `/send`, `/process` (270 L, sin un solo import de `lib/`). **0 campañas creadas** — el hueco no duele. | **ciego (justificado)** |
| **Mini-apps** | 0 | 0 | 1.999 registros vivos y **cero escritura**. Las rutas están en el core (`/api/mini-apps/*`), inline. | **ciego** |
| **Formularios** | 0 | 0 | `form-builder/server/service.ts` tiene `listFormsForTeam(teamId)`, `getFormWithInstanceForTeam`, `validateFormDefinition`, `sendSubmissionConfirmation` — llamables y sin usar. | **ciego** |
| **Marketplace y pagos** | 0 | 0 | `marketplace/server/entitlements.ts` recibe `teamId`. Es administración de plataforma: **no debería exponerse**. | **ciego (deliberado)** |
| **Compras, soporte, contratos, RRHH, ventas, social** | 0 | 0 | Todo. **0 filas en las seis tablas, reverificado hoy.** | **ciego (justificado)** |
| **Administración del equipo** (miembros, permisos, plan, tokens) | vía `list_records` | 0 | Invitar, cambiar rol, editar permisos, revocar tokens. **Que siga siendo escritura cero es la decisión correcta** — pero la lectura sí está abierta, ver §6.4.2. | **ciego en escritura (correcto)** |

**Resumen honesto.** Lo que una IA controla bien hoy es el **trabajo interno**: tareas, automatizaciones, el CRM como fichero, los sitios, los documentos. Lo que no controla es **el negocio hacia afuera**: hablarle al cliente, cobrarle, renovarle y saber a quién le debe una respuesta. El conector es excelente administrando el escritorio y ciego administrando la facturación.

---

### 6.2 Los cinco agujeros que importan para el uso estratégico

No son CRUD faltantes. Son preguntas del usuario que hoy se quedan sin respuesta.

#### A1 — «Contestale vos» → no puede

Sigue siendo el agujero número uno, y **ahora hay evidencia dura de cuánto duele**: en `activity_logs` hay **321 `GROK_SCHEDULED_MESSAGE_CREATED`** y **119 `GROK_SCHEDULED_MESSAGE_DELETED`**, contra 210 filas vivas en `team_scheduled_messages`, **todas `once` y todas `completed`**. Es decir: la IA programa un mensaje para dentro de un minuto, el cron lo manda, y después alguien limpia el registro. Esa es hoy la forma normal de operar.

Lo que se paga por eso: latencia de hasta un minuto, ningún control de la ventana de 24 h de WhatsApp, ninguna forma de citar un mensaje, ninguna idempotencia, y un `activity_log` que dice "se creó un programado" cuando lo que pasó fue "le escribimos a un cliente".

**Qué haría falta:** extraer ~200 líneas de `app/api/messages/send/route.ts` a `lib/messaging/send.ts` con firma `(teamId, userId, input)` y que la route la consuma. Esa única refactorización desbloquea `chat_send_message`, `chat_send_media`, `chat_send_template` y arregla de paso el camino del cron. Es el ítem de mayor retorno de todo el documento y **no se hizo todavía**: `lib/messaging/` no existe.

#### A2 — «¿A quién le debo una respuesta?» → no puede

297 contactos en "Conversando" y 205 en "Seguimiento". La respuesta está en `chats.lastMessageTimestamp` + `chats.lastMessageFromMe` + `contacts.assignedTo` + `teamTaskRelations`, y **no hay ninguna tool que la calcule**. `whatspro_list_records` filtra por igualdad exacta sobre columnas: no sabe hacer "hace más de 3 días", ni "el último que habló fue él", ni "sin tarea abierta".

Es la pregunta que se hace todos los días y la que más tiempo ahorra. **Qué haría falta:** ~90 líneas de drizzle nuevas (`whatspro_crm_followup_queue`). No hay nada reutilizable — pero tampoco hay nada difícil.

#### A3 — Radar: la IA tiene el pincel y no tiene ni los ojos ni el lienzo

Se implementaron siete tools de escritura de Radar. **Hay 0 widgets y 0 informes en la base.** No es que no funcionen: es que la IA **no puede ver el tablero para saber qué dibujar**. `radar/overview`, `radar/clients` y `radar/client/[contactId]` calculan exactamente lo que hace falta (contadores por prioridad, contactos ordenados P1→P3, `reportCount`, `openTaskCount`, `lastNoteAt`) y están **atados a `getRadarTarget()`**, que lee cookies. Desde MCP son inalcanzables.

Y el ciclo de análisis sigue costando 10+ llamadas por contacto (nueve `set_custom_fields` + la nota `🎯 RADAR` + el widget). Con **71 contactos analizados de 897**, ese costo *es* el techo del feature.

**Qué haría falta:** mover ~310 líneas de tres route handlers a `lib/plugins/radar/server/{overview,clients,client}.ts` con firma `(teamId, …)`, más `whatspro_radar_save_analysis` (~100 líneas de pegamento sobre funciones que ya existen). Cero lógica nueva; mucho mover de lugar.

#### A4 — El ingreso recurrente se ve a medias y no se puede cerrar

**736 candidatos en la cola de renovación AAPP: 638 pendientes**, 48 cancelados, 25 rechazados, 14 fallidos, 6 aprobados, 5 enviados. Más 162 suscripciones activas y **76 ya vencidas**. Es el módulo con más volumen sin atender de toda la plataforma.

`whatspro_memberships_renewal_queue` ya deja listar y aprobar en lote — bien. Pero la IA **no puede responder "¿a quién se le vence esta semana y cuánto factura?"** (falta `memberships_expiring`, aunque `lib/aapp/subscription.ts:daysUntil`/`serviceUrgency`/`serviceLabel` ya existen y son puras), **ni renovar** (correr `endDate` + resetear `remindersSent`, hoy inline en `memberships/subscriptions/[id]/route.ts`), **ni asentar el cobro**. Aprobar el aviso es lo último de la cadena; los tres pasos anteriores no tienen puerta.

#### A5 — Finanzas: se puede preguntar, no se puede registrar

Tres tools de lectura que contestan bien, **cero de escritura**. No se puede cargar un gasto, marcar cobrada una factura, registrar un pago parcial ni crear una cuenta. Con 91 asientos y la liquidación mensual a Martín cargada a mano, el trabajo repetitivo sigue siendo humano.

Peor: como A4 y A5 están los dos abiertos, **el circuito "se vence → se avisa → se renueva → se cobra → queda asentado" no se puede cerrar por MCP en ningún punto**. La IA ve las dos puntas y no puede tocar el medio.

**Qué haría falta:** las 16 rutas de `finance` tienen la lógica inline; lo único reutilizable es `schema.ts:financialEntrySchema`, `resolveFinancialRelations(teamId, input)` y `nextRecurrenceDate`. Son ~130 líneas para `record_entry` + `settle_entry`. **Trampa a no olvidar:** `recurrence` se guarda, `nextDueOn` se calcula y **nadie materializa el asiento siguiente** — no hay cron de recurrencia en finanzas.

#### Menciones deshonrosas

- **Cero operaciones en lote en todo el conector.** Mover 30 contactos de etapa son 30 llamadas. La única excepción es `tasks_cascade_apply`, y es justamente la mejor tool que tiene el sistema.
- **Ficha 360 del cliente inalcanzable**, y el plugin `customers` **no tiene carpeta `server/`**: hay que crearla antes de exponer nada.
- **Las integraciones no se pueden disparar** aunque las tres funciones (`syncTeamAapp`, `importHostingerDomains`, `syncAdAccount`) reciban `teamId` directo. "Traeme lo último de AAPP antes de armar el informe" es una tool de 70 líneas que no está.

---

### 6.3 Estado real de los datos — dónde NO invertir

Verificado contra `pg_stat_user_tables` el 2026-08-23.

| Módulo | Filas | Qué hacer |
| --- | --- | --- |
| `team_sales`, `team_purchase_orders`, `team_support_tickets`, `team_contracts`, `social_posts` | **0 cada uno** | **Nada.** Igual que en el relevamiento anterior. Exponerlos por MCP es escribir código para nadie. |
| `team_articles` | 3 | Nada. |
| RRHH (comisiones, perfiles) | ~0 | Nada. |
| `mini_app_records` | **1.999** | Es el tercer volumen de la plataforma y **no tiene ni una tool de escritura**. Vale la pena mirarlo antes que cualquiera de los anteriores. |
| `team_aapp_renewal_candidates` | **736** | Ya tiene tool. Es el que más operación pendiente concentra. |
| `team_customer_transactions` | 360 | Sólo lectura por catálogo. Alimentaría la ficha 360. |
| `team_radar_widgets` / `team_radar_reports` | **0 / 0** | Las tools están; falta que la IA pueda *ver* Radar (A3). No agregar más tools de escritura de Radar hasta que haya widgets. |

Corolario para la hoja de ruta: **cualquier propuesta que empiece por "exponer el plugin X" donde X tiene 0 filas se descarta sin discutir.**

---

### 6.4 Control y seguridad

El pedido fue que los conectores "controlen todo". El riesgo simétrico es que **un modelo con 57 tools de escritura sobre la base de producción también puede romper todo**, y hoy hay menos frenos de los que parece.

#### 6.4.1 El chequeo de permisos es, en la práctica, decorativo

`assertPermission()` (`actions.ts:287`) se llama en casi todas las tools y hace lo correcto: busca el `teamMember` y evalúa `hasPermission(role, permissions, key)`. Pero:

1. El conector resuelve **un único usuario hardcodeado**: `GROK_TARGET_EMAIL = 'noelia@whatspro.uno'` (`oauth.ts:21`), y `resolveGrokTarget()` (`oauth.ts:89`) sólo devuelve esa fila. `authenticateMcp` (`oauth.ts:386`) rechaza cualquier credencial cuyo `teamId`/`userId` no coincida.
2. Ese usuario es **`owner` del equipo 2** (verificado en la base).
3. `hasPermission()` (`lib/permissions.ts`) arranca con `if (role === 'owner') return true;`.

**Conclusión: hoy los ~90 `assertPermission` del conector devuelven siempre `true`.** No están mal escritos — están inertes. Los únicos frenos que funcionan de verdad son tres: el scope `whatspro:write` del token, el chequeo de plugin activo (`resolveActivePluginsForTeam`, que sí filtra por manifest y estado) y el `confirm` de cada tool.

Esto no es un bug urgente mientras el conector sea de un solo dueño. **Es una bomba de tiempo el día que se abra a un segundo usuario**, porque va a parecer que hay control de permisos y no lo hubo nunca en producción.

#### 6.4.2 Las lecturas del catálogo no chequean ningún permiso

`whatspro_list_records` y `whatspro_get_record` se despachan en `app/api/plugins/grok-connector/mcp/route.ts` llamando directo a `listReadOnlyResource(resource, teamId, params)`. **No pasan por `assertPermission` ni por `resolveActivePluginsForTeam`.** El único aislamiento es `resource.scope(teamId)`.

Alcance: **95 recursos**, entre ellos `messages` (58.636 mensajes del equipo), `chats`, `financial-entries`, `financial-accounts`, `customer-transactions`, `membership-subscriptions`, `activity-logs`, `team-members` (con la **columna `permissions` completa**, sin excluir), `users`, `webhook-events`, `manual-payments`, `payment-audit-events`.

Lo que sí está bien: los secretos están excluidos uno por uno en el catálogo — `users.passwordHash`, `apiKeys.key`, `readOnlyApiTokens.tokenHash`, `evolutionInstances.accessToken`/`metaToken`, `aiConfigs.apiKey`, `hostingerAccounts.token`, `socialAccounts.accessToken`, `metaAdsTokens.token`, `teamAappConnections.apiKey`. Eso está prolijo.

Lo que falta: **un token de sólo lectura hoy lee toda la contabilidad y todas las conversaciones del equipo sin que ningún permiso lo autorice**. Si mañana el conector sirve a un `agent` (que tiene `financeRead: false` y `contacts: false`), lo va a seguir leyendo igual, porque este camino ni pregunta.

**Arreglo:** mapear cada recurso del catálogo a su permiso (`financial-*` → `financeRead`, `messages`/`chats` → el permiso nuevo de §6.4.3, `team-members`/`users`/`activity-logs` → `settings`) y chequearlo en `listReadOnlyResource`. Es una tabla de 95 entradas y un `assertPermission` — un día de trabajo, y arregla la superficie de lectura entera de una vez.

#### 6.4.3 No existe un permiso de "leer conversaciones"

`MemberPermissions` (`lib/permissions.ts`) tiene 54 claves. Hay `contacts`, `drafts`, `templates`, `campaigns`, `filesRead`… y **no hay ninguna que gobierne leer mensajes ni enviarlos**. La lectura de chats se gobierna sólo por `chatVisibility` (que es un enum de alcance, no un permiso de sí/no), y el envío no se gobierna por nada: quien entra al inbox, escribe.

Consecuencia en el conector, dos formas distintas del mismo problema:

- **`whatspro_chat_media_list` / `_get` / `_summary` chequean `contacts`** (`media-actions.ts:419, 549, 719`). `contacts` es el permiso de **escritura del CRM** — el que habilita `save_contact`, `change_crm_stage` y `set_contact_tags`. O sea: *ver las fotos, los comprobantes y escuchar los audios que mandó un cliente* está gobernado por *poder etiquetarlo*. Y al revés: alguien que sólo debería leer conversaciones necesita permiso de escritura del CRM para hacerlo.
- **`whatspro_list_records` sobre `messages` no chequea nada** (§6.4.2). El mismo dato, por otra puerta, sin ningún permiso.

Lo mismo pasa del otro lado: `whatspro_radar_upsert_widget`, `patch_widget`, `manage_widget`, `note_to_widget` y `set_appearance` también usan `contacts` (`radar-actions.ts:694, 751, 794, 832, 848, 985`) para pintar un tablero de inteligencia. `intelligenceRead` existe y se usa para leer Radar, pero **no hay `intelligenceWrite`**, así que la escritura se colgó de `contacts`.

**Arreglo:** agregar tres claves a `MemberPermissions` — `messagesRead`, `messagesSend`, `intelligenceWrite` — con default `false` en el preset `agent` y `true` en `owner`/`admin`. Es una migración de un campo JSON y tocar los tres presets. **Hacerlo antes de implementar A1**, porque si `chat_send_message` nace usando `contacts`, quien puede etiquetar va a poder escribirle al cliente, y eso ya no se saca sin romper a alguien.

#### 6.4.4 `chatVisibility` existe, la UI lo respeta y el conector lo ignora

`chatVisibility` tiene tres valores (`all` / `assigned` / `department`) y **el preset `agent` es `assigned`**: un agente sólo ve los chats que tiene asignados. La app lo cumple en al menos once lugares — `app/api/chats/route.ts`, `chats/kanban-metadata`, `chats/[id]/ai-summary`, `chats/[id]/improve-reply`, `chats/[id]/radar-suggest`, `chats/[id]/tasks`, `contacts/[id]/documents`, `dashboard/tasks`, `dashboard/bookmarks`, `plugins/radar/reports`, `lib/desktop/service.ts` — y `lib/plugins/radar/server/access.ts:userCanAccessContact` está escrita justamente para eso.

**En todo `lib/plugins/grok-connector/` y en todo `lib/readonly-api/` la palabra `chatVisibility` no aparece ni una vez**, salvo como parte del tipo `keyof Omit<MemberPermissions, 'chatVisibility'>` en `actions.ts:285`. `userCanAccessContact` no se llama nunca desde el conector.

Alcance real de la brecha, con nombre y apellido:

| Puerta | Qué expone sin filtrar |
| --- | --- |
| `whatspro_list_records` sobre `chats` | los 1.047 chats del equipo |
| `whatspro_list_records` sobre `messages` | los **58.636 mensajes**, con `search` sobre `text` y `mediaCaption` |
| `whatspro_chat_media_list` / `_get` / `_summary` | fotos, audios y documentos de **cualquier** chat del equipo |
| `whatspro_add_internal_note`, `save_contact`, `change_crm_stage`, `set_contact_tags`, `assign_to_agenda` | escriben sobre cualquier contacto |
| Radar (`upsert_widget`, `note_to_widget`) | dibujan sobre la ficha de cualquier contacto |

Hoy el impacto práctico es **cero**, porque el único usuario del conector es `owner` y `owner` tiene `chatVisibility: 'all'` por definición. Pero el diseño ya está mal: la regla de negocio "cada agente ve lo suyo" está implementada once veces en la app y **cero veces en el conector**. El día que un agente conecte su propio Grok, va a leer las conversaciones de todo el equipo — incluidas las de sus compañeros — sin que nada lo frene y sin dejar rastro (§6.4.6).

**Arreglo:** una función `visibleChatScope(teamId, userId): SQL` en el conector, aplicada como condición extra en `resolveChatTarget` (media), en `ownedContact` (`actions.ts`) y en el `scope()` de los recursos `chats`, `messages`, `contacts` del catálogo. ~60 líneas, y reutiliza la lógica que ya está escrita en `access.ts`.

#### 6.4.5 Tools que deberían exigir `confirm` y no lo exigen

Hoy exigen `confirm:true`: `whatspro_delete_record` (con `const: true` en el schema, lo más estricto del conector), los cuatro `delete` de automatizaciones (flujo, carpeta, nodo, conexión), `manage_site:delete`, `manage_site_file:delete`, `manage_domain:delete`, `manage_customer:delete`, `radar_manage_widget:purge` y `memberships_renewal_queue:apply`. Diez puntos de confirmación, todos bien puestos.

El criterio que siguieron fue **"borrar exige confirmar"**. Ese criterio se queda corto: lo que hay que confirmar no es lo que borra una fila, es **lo que sale del sistema y llega a un cliente, o mueve plata**.

Las que faltan, ordenadas por lo que pueden romper:

| Tool | Qué puede hacer hoy sin confirmar nada | Qué debería exigir |
| --- | --- | --- |
| **`whatspro_manage_scheduled_message`** | `action:"create"` acepta **`target_numbers` con hasta 10.000 números** (`extended-actions.ts:469` en el schema y `:875` en el zod), `status:"active"`, `schedule_type:"once"` y `scheduled_at` en un minuto. **Una sola llamada, sin `confirm`, sin `dry_run` y sin `idempotency_key`, es un envío masivo de WhatsApp a diez mil personas** que el cron `send-scheduled` ejecuta sin volver a preguntar. Y ya sabemos que ésta es la puerta que la IA usa para mandar mensajes (321 creaciones en el log). | `confirm:true` cuando `status:"active"`; `dry_run` que devuelva destinatarios resueltos y horario; `idempotency_key`; y un tope muy por debajo de 10.000 desde MCP. **Es el riesgo más grande del conector, por lejos.** |
| **`whatspro_manage_automation`** con `is_active:true` | Activar un flujo lo pone a mandarle mensajes a clientes reales ante cada disparo. El `confirm` del schema **sólo gobierna `delete`** (`automation-actions.ts:133`). | `confirm:true` para pasar `is_active` de `false` a `true`. |
| **`whatspro_replace_automation_flow`** con `mode:"save"` | Reemplaza el grafo entero de un flujo **que puede estar activo**. Tiene `mode:"validate"` (muy bien) y `expected_updated_at` (mejor todavía), pero nada le pregunta al modelo si sabe que el flujo está vivo. | `confirm:true` si `is_active` del flujo es `true`. Idem `manage_automation_node`/`_edge` para acciones distintas de `delete`. |
| **`whatspro_manage_membership_plan`** | Cambiar el precio de un plan que tiene suscripciones colgadas. Hay 30 planes y 162 suscripciones activas. | `confirm:true` para cambios de `price`/`currency`/`billing_type` cuando el plan tiene suscripciones activas, con el conteo en el mensaje de error. |
| **`whatspro_update_membership`** | Mueve `end_date`, `status` y `payment_status` de una suscripción. Es plata y además **alimenta la cola de renovación**: mover una fecha cambia a quién se le va a escribir. No pide `confirm` ni `idempotency_key` (a diferencia de `register_membership`, que sí exige la key). | `idempotency_key` obligatoria y `confirm:true` para `payment_status` y para correr `end_date`. |
| **`whatspro_set_contact_tags`** con `mode:"replace"` | Borra todas las etiquetas del contacto y pone las nuevas. Irreversible y silencioso. | `dry_run` que muestre qué se saca; o exigir `confirm` sólo en `replace`. |
| **`whatspro_manage_site`** con `action:"update"` | Publicar un sitio, cambiarle el slug, el subdominio o el dominio propio. **Publicar es exponer contenido a internet** y cambiar el slug rompe todos los links existentes. El `confirm` sólo cubre `delete`. | `confirm:true` para `publish` y para cambios de slug / subdominio / `custom_domain`. |
| **`whatspro_manage_site_file`** con `action:"update"` y **`whatspro_patch_site_file`** | Sobreescriben archivos de un sitio publicado. Mitigado por `expected_updated_at` (evita pisar cambios concurrentes) pero no por confirmación. | Suficiente con `expected_updated_at` si el sitio no está publicado; `confirm` si lo está. |
| **`whatspro_tasks_cascade_apply`** con `mode:"apply"` | Escritura masiva sobre el tablero (433 tareas, 23 proyectos). **Bien mitigado**: `mode` es `preview` por defecto y el preview devuelve el diff sin escribir. | Sólo falta `confirm:true` cuando el diff supera N ítems. Prioridad baja: el default seguro ya hace el 90 % del trabajo. |
| **`whatspro_create_task_project`** | Crea espacio + etiquetas + columnas + tareas + subtareas de un saque. Ruidoso, no peligroso. | Nada. Se documenta y listo. |
| **`whatspro_delete_record`** | Sí exige `confirm`, pero es **un solo booleano plano para 17 tipos distintos**, entre ellos `membership` (un registro de ingreso) y `document`. Confirmar borrar una etiqueta y confirmar borrar una suscripción no pueden costar lo mismo. | Escalonarlo: para `membership`, `document` y `task_project`, pedir además el nombre exacto del registro. |

Y una regla que no está escrita en ningún lado y debería: **el conector no tiene ninguna tool que envíe dinero ni que emita un cobro, y eso es correcto.** Cuando se implemente `finance_settle_entry` va a ser la primera que registre plata; que nazca con `confirm` + `idempotency_key`, no que se los agreguen después.

#### 6.4.6 Trazabilidad: se ve qué se escribió, no se ve quién ni qué se leyó

Lo bueno: el conector **sí audita**. `audit(context, action, entityId)` (`actions.ts:301`) se llama **84 veces** en los nueve archivos, y `oauth.ts` registra `GROK_LINK_CODE_CREATED`, `GROK_CONNECTION_GRANTED` y `GROK_CONNECTION_REVOKED`. El resultado se ve en la base: **3.312 de los 4.198 registros de `activity_logs` del equipo (79 %) son del conector**. Es el principal escritor del sistema y queda registrado.

Lo que no queda registrado, en orden de gravedad:

1. **Ninguna lectura.** Un token puede listar los 58.636 mensajes, la contabilidad entera, los 290 clientes y los 131 documentos **sin dejar una sola fila**. La única excepción son las tres tools de media, que sí escriben `GROK_CHAT_MEDIA_READ` (`media-actions.ts:660, 681, 700`). Combinado con §6.4.2 y §6.4.4: la superficie de lectura no tiene ni permiso ni auditoría.
2. **No se registra qué tool se llamó.** El despachador de `tools/call` (`mcp/route.ts`) extrae `name` y `args` y **no loguea nada**, ni éxito ni error. En `activity_logs` queda la acción de dominio (`GROK_TASK_UPDATED`), nunca la tool (`whatspro_manage_task`) ni los argumentos. Reconstruir "qué le pedí a Grok el martes" es imposible.
3. **No se registra qué token ni qué cliente OAuth actuó.** `audit()` usa sólo `teamId`/`userId`. Como todos los tokens resuelven al mismo usuario, **no se puede distinguir una acción hecha desde el dashboard de una hecha por Grok, ni por ChatGPT, ni por Claude Code.** Y sin embargo el dato está: `authenticateMcp` devuelve `tokenId` (`oauth.ts:400`) y el route lo **descarta**. Agregarlo al contexto de la acción son diez líneas.
4. **No hay before/after.** La tabla `activity_logs` (`lib/db/schema.ts:298`) tiene sólo `id`, `teamId`, `userId`, `action`, `timestamp`, `ipAddress`. **No tiene `metadata`.** Por eso todo el código usa `ipAddress` como campo de payload — `audit()` mete ahí el id de la entidad recortado a 45 caracteres (`actions.ts:306`). O sea: **la columna de IP no contiene IPs** y no queda ni un diff de lo que cambió. Contraste incómodo: `reseller_audit_events` y `payment_audit_events` sí tienen `metadata jsonb`, `previousStatus`/`nextStatus` y actor. El conector, que escribe cuatro veces más, tiene menos.
5. **Los rechazos son invisibles.** `authenticateMcp` devuelve `invalid_token`, `connector_disabled` y `rate_limit_exceeded` **sin insertar nada**. Un token robado probando llamadas no deja rastro.
6. **La convención de `action` está rota.** `action` es `text` libre y conviven cuatro estilos: el enum `ActivityType` (19 valores), `SCREAMING_SNAKE` ad-hoc de los plugins REST, ~70 `GROK_*`, y `dot.case` (`connector.automation.created`, `connector.site_file.patched`) que usan `platform-admin-actions.ts` y `automation-actions.ts`. Peor: algunos **interpolan datos dentro del `action`** (`readonly_api.token_created:${name}`, `aapp_space.sync_completed:${JSON.stringify(summary)}`), lo que hace la columna imposible de agrupar por SQL. Y la UI de `/settings/activity` sólo sabe mostrar los 19 del enum: **los 3.312 registros del conector caen en el fallback y no se leen.**

**Arreglo mínimo, por orden de costo/beneficio:** (a) agregar `metadata jsonb` + `entityType` + `entityId` + `source` a `activity_logs` y dejar de usar `ipAddress` como payload; (b) pasar `tokenId` al contexto de la acción; (c) loguear un registro por `tools/call` con nombre de tool y resultado; (d) unificar el prefijo en `connector.*` para lo nuevo y dejar los `GROK_*` viejos como están.

#### 6.4.7 Dos cosas más que conviene saber

- **El rate limit no sobrevive a un restart ni a dos instancias.** `consumeRateLimit` (`oauth.ts:357`) usa un `Map` en memoria del proceso: 120 llamadas por ventana, contadas por token, en RAM. Con más de un contenedor, el límite real se multiplica por la cantidad de réplicas; con un deploy, se reinicia. Nada llega a la base.
- **`lastUsedAt` está *throttled* a 5 minutos** (`oauth.ts:394`) y es fire-and-forget. No es un contador: mil llamadas en una hora dejan como mucho doce escrituras. **No existe ninguna tabla de uso del conector.** Hoy hay **494 credenciales, 286 ya expiradas, 157 usadas alguna vez y 0 revocadas** — nadie limpió nunca, y no hay forma de saber cuál de las vivas está haciendo qué.

---

### 6.5 Hoja de ruta priorizada

Reemplaza a la de §4, que quedó vieja al completarse la Tanda 1. El costo real depende de una sola cosa: **si la lógica ya vive en `lib/**` con firma `(teamId, …)` o si hay que sacarla de un route handler.**

#### Estado de la Tanda A al 2026-08-25

| # | Qué | Estado |
| --- | --- | --- |
| A0 | `confirm` + tope en `manage_scheduled_message` | ✅ hecho (`MASS_SEND_THRESHOLD = 10`). Falta `dry_run` e `idempotency_key`. |
| A1 | Permisos `messagesRead`, `messagesSend`, `intelligenceWrite` | ✅ hecho. `messagesSend` nace en `true` para el preset `agent` — no en `false` como proponía este documento: un agente del inbox ya le escribe a clientes todos los días, ponerlo en `false` habría hecho que el permiso mintiera sobre lo que el sistema permite. Se revoca desde Ajustes → Miembros. Además `getPermissions` ahora completa las claves faltantes con el preset del rol, así una clave nueva no nace denegada para todo el que tenga permisos personalizados. |
| A2 | `lib/messaging/send.ts` + `whatspro_chat_send_message` | ✅ hecho. La extracción cubrió texto **y** media: `sendTeamTextMessage` y `sendTeamMediaMessage`, ambas `(teamId, input)`. `messages/send` y `messages/sendMedia` las consumen. Se agregó la tabla `team_message_send_keys` para la idempotencia, que este documento dejaba como "decisión pendiente". |
| A3 | `visibleChatScope` | ❌ pendiente. Sigue siendo la brecha del día que el conector sirva a un segundo usuario. |
| A4 | Permisos en `listReadOnlyResource` | ❌ pendiente. |
| A5 | `whatspro_crm_followup_queue` | ✅ hecho, con `mode` (`awaiting_reply` / `going_cold`). |
| A6 | Radar: extraer overview/clients/client | ❌ pendiente. |
| A7 | `activity_logs`: `metadata jsonb` + `tokenId` + registro por `tools/call` | ❌ pendiente. |

También se adelantaron de la Tanda B: `whatspro_chat_send_media`, `whatspro_tasks_today`, `whatspro_memberships_expiring` y `whatspro_integrations_sync` (+ `whatspro_integrations_status`), y de la Tanda C `whatspro_chat_trigger_automation`.

**Y se arregló el motivo por el que la IA usaba los programados como puerta de envío y le fallaban:** `manage_scheduled_message` creaba la fila con `instance_id: null` cuando el conector no mandaba el campo — que es casi siempre — y el cron la marcaba `failed` sin registrar por qué. Ahora la instancia se resuelve al crear (o al reactivar), y `team_scheduled_messages.last_error` guarda el motivo, que el tablero muestra debajo del badge.

#### Tanda A — cerrar el circuito del negocio y el riesgo que ya está abierto

Esto es lo que hay que hacer ahora. Mezcla las dos cosas a propósito: **el freno y el acelerador van juntos**, porque el freno más urgente (`manage_scheduled_message` sin `confirm`) existe justamente porque falta el acelerador (`chat_send_message`).

| # | Qué | Costo real | Por qué ahora |
| --- | --- | --- | --- |
| A0 | **`confirm` + tope + `dry_run` en `whatspro_manage_scheduled_message`**, y `confirm` para activar una automatización | ~40 líneas, ninguna extracción | Es un envío masivo a 10.000 números a una llamada de distancia. No espera a nada. |
| A1 | **Tres permisos nuevos**: `messagesRead`, `messagesSend`, `intelligenceWrite` | migración de un JSON + tres presets, ~30 líneas | Tiene que existir **antes** de A2, o el envío nace colgado de `contacts` y ya no se saca. |
| A2 | **Extraer `lib/messaging/send.ts`** `(teamId, userId, input)` desde `messages/send/route.ts` (253 L) y que la route la consuma → `whatspro_chat_send_message` | ~200 líneas movidas + 1 route tocada | Desbloquea `send_media`, `send_template` y le saca el disfraz a los 321 mensajes programados. **Es el ítem de mayor retorno del documento.** `lib/messaging/` no existe todavía. |
| A3 | **`visibleChatScope(teamId, userId)`** aplicado a media, contactos y a los recursos `chats`/`messages`/`contacts` del catálogo | ~60 líneas, reusa `radar/server/access.ts` | Es la regla de negocio que la app cumple once veces y el conector cero. |
| A4 | **Permisos en `listReadOnlyResource`**: tabla recurso→permiso para los 95 recursos | ~1 día | Hoy la lectura entera —contabilidad, conversaciones, permisos del equipo— no chequea nada. |
| A5 | **`whatspro_crm_followup_queue`** | ~90 líneas nuevas de drizzle, nada reutilizable | La pregunta que se hace todos los días sobre 502 contactos. |
| A6 | **Radar: extraer `overview` / `clients` / `client` a `lib/plugins/radar/server/`** + `whatspro_radar_save_analysis` | ~310 líneas movidas + ~100 de pegamento | Sin esto, las siete tools de escritura de Radar siguen sin usarse (0 widgets). |
| A7 | **`activity_logs`: `metadata jsonb` + `entityType`/`entityId`/`source`, `tokenId` en el contexto, y un registro por `tools/call`** | migración + ~50 líneas | El conector es el 79 % de la escritura del sistema y no se puede auditar. |

#### Tanda B — el dinero

| Qué | Costo real |
| --- | --- |
| `whatspro_memberships_expiring` — `daysUntil` / `serviceUrgency` / `serviceLabel` ya existen y son puras | ~60 líneas |
| `whatspro_memberships_renew` — el update está inline en `memberships/subscriptions/[id]/route.ts`; coordina dos plugins. **`confirm` + `idempotency_key` desde el día uno** | ~90 líneas |
| `whatspro_finance_record_entry` + `_settle_entry` — reusan `financialEntrySchema` + `resolveFinancialRelations(teamId, input)`; la escritura está inline en 16 rutas. Idempotencia por `externalSource:'mcp'`/`externalId`, que ya usan `sync-aapp` y `hr` | ~130 líneas |
| `whatspro_chat_send_media` + `_send_template` — sobre la extracción de A2 | ~170 líneas |
| `whatspro_customers_profile` — **hay que crear `lib/plugins/customers/server/` primero**: el plugin no tiene una sola función de negocio | ~140 líneas |
| Lotes: `tasks_bulk_patch`, `crm_bulk_stage`, `crm_bulk_tags`, todos con `dry_run` y resultado por ítem | ~130 líneas |
| `whatspro_tasks_today` — 51 tareas vencidas y ninguna tool las junta | ~40 líneas |
| `whatspro_integrations_sync` — `syncTeamAapp`, `importHostingerDomains`, `syncAdAccount` **ya reciben `teamId`**; sólo falta despacho y acotar la respuesta | ~70 líneas |
| `whatspro_help_domain` — el patrón que mejor funciona del conector (`automation_guide`, `radar_block_catalog`). `CASCADE_SYNTAX_HELP` ya está escrito | ~40 líneas + prosa |

#### Tanda C — cuando haya datos o cuando sobre tiempo

Envoltorios puros que rinden poco hoy: `tasks_cascade_guide` (5 líneas), `tasks_get_details`, `tasks_list_contact_tasks`, `radar_list_bank`, `radar_update_report`, `radar_unlink_report`, `documents_read`, `documents_backlinks`, `documents_move`, `notes_sync_commitments`, `chat_trigger_automation` (`triggerAutomationManually` ya es llamable), `tasks_merge_duplicate_projects` (agregarle `dry_run` primero).

Consultas nuevas de valor medio: `crm_search_contacts`, `crm_funnel_snapshot`, `chat_digest`, `finance_list_entries`, `domains_expiring`, `sites_list_by_domain`, `metaads_report`.

Higiene: `tasks_manage_dependency` **sólo después de agregar detección de ciclos** (hoy no la valida nadie); limpiar las 286 credenciales expiradas; mover el rate limit a la base o a un store compartido.

**Y lo que sigue sin hacerse:** compras, soporte, contratos, RRHH, ventas, artículos y social-publisher — **0 filas, reverificado hoy**. `whatspro_campaigns_manage` último de todo: es lo más riesgoso (envío masivo cobrado por Meta) y lo menos usado (0 campañas). Mini-apps es la única de este grupo que merece una segunda mirada, porque tiene 1.999 registros vivos y ninguna tool de escritura.

---

## 5. Agosto 2026 — notas privadas, campos personalizados, tareas individuales y Radar por cliente

Auditoría puntual de cuatro capacidades que se daban por existentes. Tres estaban a medias y una faltaba entera. Todo lo de abajo ya está implementado y probado contra la base del equipo 2.

### Qué había y qué faltaba

| Capacidad | Antes | Ahora |
| --- | --- | --- |
| **Notas privadas** | Se podían **escribir** (`add_internal_note`, `add_contact_note`, `customer_notes`, `create_note`) pero las notas internas del chat **no se podían leer**: viven en `messages.is_internal` y `messages` no está en el catálogo de solo lectura. Una IA no podía releer lo que ella misma había dejado escrito. | `whatspro_private_notes` junta los cuatro orígenes. `customer-notes` se agregó al catálogo de solo lectura. `contact_graph` sección `notes` ahora devuelve los tres orígenes en vez de sólo `contacts.notes`. |
| **Campos personalizados** | Definiciones (`manage_custom_field`) y escritura de valores (`set_custom_fields`) sí; borrar la definición ya estaba en `delete_record`. Faltaba **leerlos resueltos**: había que cruzar a mano el catálogo con el jsonb `contacts.custom_data`, y los valores huérfanos quedaban invisibles. | `whatspro_custom_fields`: catálogo + cobertura por campo, o los valores de un contacto con `filled`/`missing`/`orphan_values`. `set_custom_fields` acepta `chat_id` y borra la clave cuando el valor es `null`. |
| **Tareas individuales** | `tasks_board`, `tasks_search`, `tasks_today` devuelven listas resumidas; `get_record` devuelve la fila pelada. **Ninguna** traía checklist + comentarios + adjuntos + subtareas + dependencias juntos. | `whatspro_tasks_get`: la ficha completa de una tarea con nombres resueltos y los campos de IA. |
| **Radar vinculado al cliente** | Existía, pero **sólo por `contact_id`**: `team_radar_widgets.contact_id` y `team_radar_reports.contact_id` apuntan a `contacts`, que exige un chat. Con un `customer_id` en la mano había que resolver el contacto a mano. | Las cinco tools de Radar que trabajan sobre un cliente (`list_widgets`, `list_reports`, `upsert_widget`, `note_to_widget`, `publish_report`) aceptan `customer_id` y lo resuelven al contacto vinculado. |

### La trampa de Radar: cliente ≠ contacto

Radar cuelga todo del **contacto**. `team_customers` puede tener varios contactos o ninguno — los clientes importados de AAPP SPACE normalmente no tienen conversación de WhatsApp, y `contacts.chat_id` es `NOT NULL`, así que **no se puede fabricar un contacto sin chat**.

`resolveContactFromCustomer` no adivina: con cero contactos vinculados falla y manda a `whatspro_link_customer_contact` (o a dejar el análisis en la bitácora con `whatspro_customer_notes`); con más de uno, falla listando los candidatos y pide `contact_id`. Un widget colgado del contacto equivocado **no da error en ningún lado**: simplemente aparece en la ficha de otra persona.

Darle ficha de Radar propia a un cliente sin contacto exigiría `customer_id` en las dos tablas más una superficie de UI nueva (`RadarClientPanel` necesita `remoteJid` e `instanceId` para el enlace al chat). Queda pendiente y es una feature aparte, no un ajuste del conector.

### Detalles que importan

- Las notas internas son **contenido privado del equipo**: `whatspro_private_notes` respeta la visibilidad de chats del usuario del conector con el mismo criterio que `media-actions`. Sin ese chequeo el conector sería una puerta lateral para saltarse la visibilidad de la app.
- Cada origen y cada sección informan `total` y `omitted`, y lo que se saltea por permiso o por plugin apagado aparece en `skipped` con el motivo. Nada se trunca en silencio.
- La cobertura de `whatspro_custom_fields` usa `jsonb_exists(...)` y **no** el operador `?`: `?` choca con el marcador de parámetros del driver y rompe la consulta en runtime.

---

## 7. Agosto 2026 (28) — cierre de la auditoría de cobertura: 22 tools nuevas + 15 recursos read-only

Tanda ejecutada de una sola vez sobre `feat/tareas-rediseno`. Criterio: **cerrar todo lo que la §6.5 dejó pendiente y era capacidad** (leer, escribir, buscar, editar quirúrgicamente), y dejar explícito lo que sigue abierto. Todo verificado con `scripts/verify-connector-tools.mts` (187 tools, schemas válidos), `tsc --noEmit` limpio y build de producción.

### 7.1 Radar — el hueco A3/A6 cerrado

Extracción a `lib/plugins/radar/server/board.ts` con firma `(teamId, …)`; las tres routes (`overview`, `clients`, `client/[contactId]`) ahora la consumen. Tools nuevas:

| Tool | Qué resuelve |
| --- | --- |
| `whatspro_radar_overview` | El tablero: contadores por prioridad + contactos ordenados. La IA por fin VE Radar. |
| `whatspro_radar_list_clients` | Panel filtrable con reportCount, openTaskCount, lastNoteAt. |
| `whatspro_radar_get_client` | Ficha completa: campos radar_*, notas, tareas, informes, widgets. |
| `whatspro_radar_save_analysis` | **El análisis completo en UNA llamada** (9 campos + nota 🎯 RADAR canónica + widget opcional). Era el techo del feature: 10+ llamadas por contacto → 1. |
| `whatspro_radar_list_bank` | El banco de widgets archivados como biblioteca de plantillas. |
| `whatspro_radar_update_report` | Actualiza un informe publicado (con `version`) en vez de duplicarlo. |
| `whatspro_radar_unlink_report` | Saca un informe de Radar sin borrar el documento. |

### 7.2 Mensajería — `whatspro_chat_send_template`

Extraída la lógica de `send-template/route.ts` a `lib/messaging/send.ts:sendTeamTemplateMessage` (la route la consume). La única forma de reabrir fuera de la ventana de 24 h, con `idempotency_key` obligatoria, `dry_run` que resuelve las variables sin pagar, resolución automática de la instancia WABA y la advertencia de facturación de Meta en la descripción.

### 7.3 Documentos y notas

`whatspro_documents_read` (text/html/json con tope de bytes y `version` para editar después), `whatspro_documents_backlinks`, `whatspro_documents_move`, `whatspro_notes_sync_commitments`.

### 7.4 CRM — búsqueda combinada

`whatspro_crm_search_contacts`: texto + etapas + etiquetas + campo personalizado (valor/existencia, con `jsonb_exists`) + responsable + con/sin cliente + fechas, paginada, con etiquetas y cliente resueltos por página. Es la pregunta H8 respondida.

### 7.5 Finanzas — gestión completa

`whatspro_finance_list_entries` (filtros + cliente + pagado/pendiente por asiento), `whatspro_finance_manage_account` (con `confirm` para cambiar `opening_balance`), `whatspro_finance_manage_exchange_rate` (upsert por par+fecha, `confirm` obligatorio).

### 7.6 Dominios, sitios y Meta Ads

`whatspro_domains_expiring` (vencimientos con cliente y días restantes), `whatspro_sites_list_by_domain` (el triángulo dominio↔sitio/tienda↔cliente, incluyendo tiendas AAPP con dominio propio no cargado en `teamDomains`), `whatspro_metaads_report` (sobre la extracción nueva `lib/ads/overview.ts:buildAdsOverview`, que la route de overview también consume).

### 7.7 Tareas

`whatspro_tasks_manage_dependency` — **con la detección de ciclos que el sistema no tenía en ninguna parte** (BFS sobre las dependencias del equipo; el error muestra la cadena). `whatspro_tasks_merge_duplicate_projects` — con el `dry_run` que la función de servidor no tenía (la detección corre aparte de la fusión) y `confirm` para aplicar.

### 7.8 Meta — `whatspro_help_domain`

12 guías operativas (crm, chat, tasks con el DSL cascade completo, radar, finance, memberships, customers, documents, sites, automation, integrations, deals) en `help-actions.ts`. Priorizada en `tools/list` justo después de las genéricas.

### 7.9 Catálogo read-only: 116 → 131 recursos

Se registraron las tablas de equipo que no se podían ni leer: `chat-ai-summaries`, `support-tickets`, `support-ticket-comments`, `contracts`, `vendors`, `purchase-orders`, `purchase-order-items`, `employee-profiles`, `commission-rules`, `sale-commissions`, `radar-widgets`, `radar-reports`, `radar-insights`, `task-ai-runs`, `menu-items`. Regla intacta: `direct()`/`through()` (aislamiento por construcción), secretos excluidos por columna. **Nota:** registrar en el catálogo NO es lo mismo que construir tools — los plugins con 0 filas (soporte, compras, contratos, RRHH) ahora se pueden LEER, pero siguen sin tools dedicadas a propósito (§6.3).

### 7.10 Trazabilidad (A7) — cada tools/call queda registrado

El route ahora inserta un `activity_logs` con `action='connector.tool_call'` y `metadata: { tool, connector, tokenId, argKeys, ok, ms, error? }` por **cada** llamada, lecturas incluidas, fire-and-forget. El `tokenId` que `authenticateMcp` devolvía y el route descartaba ahora viaja en el contexto: se puede distinguir Grok de ChatGPT de Claude Code. Se loguean sólo las CLAVES de los argumentos, nunca los valores.

### 7.11 Lo que sigue abierto, y por qué

| Pendiente | Por qué no entró en esta tanda |
| --- | --- |
| **A3 `visibleChatScope`** | Sigue siendo la brecha del día que el conector sirva a un segundo usuario. Hoy es inerte (el único usuario es owner con `chatVisibility: all`). Es trabajo de restricción, no de capacidad, y merece su propia tanda con tests. |
| **A4 permisos en `listReadOnlyResource`** | Ídem: mapear 131 recursos a permisos exige decidir si el chequeo incluye "plugin activo" (hoy `assertPermission` lo acopla) — hacerlo mal rompería lecturas que hoy funcionan. |
| `whatspro_scheduled_bulk_create` | Riesgo alto; `manage_scheduled_message` ya tiene `confirm` + tope. Falta todavía `dry_run` e `idempotency_key` ahí (resto de A0). |
| `whatspro_chat_digest` | Bajó de prioridad: `chat-ai-summaries` ahora es un recurso legible y `private_notes`/`contact_graph` cubren el contexto. |
| `whatspro_campaigns_manage` | 0 campañas creadas. Último de la fila, como siempre. |
| Compras/soporte/contratos/RRHH/social: tools dedicadas | 0 filas (§6.3). Ya son legibles por catálogo; tools cuando haya datos. |
| Mini-apps (1.999 filas) | La escritura existe vía App Maker (`whatspro_appmaker_*`) para las apps nuevas; los registros legacy de `mini_app_records` siguen sólo-lectura. |

---

## 8. Septiembre 2026 (02) — Escritorio, Centro de Comandos y el cierre de A3/A4

Tanda ejecutada sobre `feat/tareas-rediseno`. Criterio: **cerrar lo que quedaba con nombre propio y lo que quedaba abierto por seguridad**. El catálogo pasó de 213 a **221 tools verificadas**, y los 131 recursos de sólo lectura pasaron a tener permiso declarado.

### 8.1 El habilitador: `buildPermissionContext(teamId, userId)`

`lib/auth/permissions-guard.ts`. Es la pieza que faltaba y por la que las cuatro tools del Escritorio venían postergándose desde `escritorio-pulze/05-CONECTORES-MCP.md`.

Todo `lib/desktop/**` —`getDesktopOverview`, `getCommandCenter`, `getSuggestionsForItems`, `executeCommandBatch`, `chatScope`— ya estaba escrito con firma `(ctx: PermissionContext, …)`, es decir extraído y puro. Pero el **único** constructor de `PermissionContext` era `getUserPermissionContext()`, que llama a `getUser()` y depende de las cookies. El conector, que corre con `{ teamId, userId }` y sin sesión, no tenía cómo fabricarlo: la lógica estaba lista y era inalcanzable.

A diferencia de `getUserPermissionContext`, la membresía se busca por `(teamId, userId)` y no por `userId` solo. Es la misma trampa que `10-CENTRO-DE-COMANDOS.md` anota como riesgo abierto: un usuario en dos equipos puede resolver al equipo equivocado. Acá no.

### 8.2 Escritorio y Centro de Comandos — 7 tools nuevas

`lib/plugins/grok-connector/server/desktop-actions.ts`. Ninguna duplica una regla de negocio: todas construyen el contexto y delegan.

| Tool | R/W | Qué resuelve |
| --- | --- | --- |
| `whatspro_desktop_overview` | R | El Escritorio entero: apps, bloque "ahora", KPIs, tendencia, embudo, actividad, próximos. Cada bloque se apaga por permiso y devuelve su forma vacía, nunca un 403. |
| `whatspro_desktop_kpis` | R | Sólo los cuatro KPIs con su período anterior. Barato cuando lo único que se quiere son los números. |
| `whatspro_desktop_layout_get` | R | Layout del usuario + catálogo de widgets. |
| `whatspro_desktop_layout_set` | W | Reordena / muestra / oculta widgets, encabezado y período. Reemplazo parcial. |
| `whatspro_command_center_inbox` | R | La bandeja priorizada, con las acciones ejecutables por ítem. **El teléfono no viaja: alcanza el `chatId`.** |
| `whatspro_command_center_suggest` | R | Borradores de respuesta por ítem. Consume cuota de IA; lo dice en la descripción. |
| `whatspro_command_center_execute` | W | Ejecuta el lote. Reusa `executeBodySchema` **de la pantalla**, con sus invariantes intactas: un envío por llamada, `confirm:"EJECUTAR"` literal, destinatario resuelto por el servidor dentro del scope. `dry_run` es el modo por defecto y la clave idempotente se deriva del `batch_id`. |

El Centro de Comandos no tenía ninguna puerta MCP, ni de lectura: era la bandeja del día accesible sólo por pantalla.

### 8.3 A3 y A4, cerrados para el conector — y el mapa de permisos, unificado

Los dos pendientes que este documento arrastraba desde el 2026-08-25 y que la §7.11 volvió a dejar abiertos.

**Lo que apareció al hacerlo:** el repo YA tenía un mapa recurso→permiso completo y fail-closed —`lib/plugins/app-maker/server/resource-permissions.ts`—, y el conector no lo consultaba. Escribir un segundo mapa para el conector habría dejado dos respuestas distintas a la misma pregunta, que es exactamente cómo nace un agujero de permisos que después nadie encuentra. Así que el mapa se promovió a `lib/readonly-api/resource-policies.ts` y ahora lo comparten App Maker y el conector.

Al promoverlo aparecieron **21 recursos sin política**: los que se agregaron al catálogo en la tanda de la §7.9 (soporte, contratos, compras, RRHH, Radar, `task-ai-runs`, `menu-items`, `chat-ai-summaries`, `audio-insights`, `customer-notes`) más los cuatro de App Maker. El olvido se manifestaba en los dos extremos a la vez: **invisibles para App Maker** (que es fail-closed) y **legibles sin ningún permiso desde el conector**. Ya están los 131.

- **A4** — `lib/readonly-api/actor-guard.ts`: `whatspro_list_records` y `whatspro_get_record` chequean permiso + plugin activo antes de servir. Fail-closed. El error dice qué permiso falta, para que el modelo deje de reintentar.
- **A3** — `chatVisibilityCondition` recorta `chats`, `messages`, `contacts`, `message-reactions`, `audio-insights` y `chat-ai-summaries` por `chatVisibility`, reusando `chatScope` de `lib/desktop/scope.ts` (la definición permisiva y canónica, no una cuarta copia). Se resuelve como subconsulta y no como join: meterle un join a `listReadOnlyResource` cambiaría la forma de las filas de los 131 recursos para arreglar seis.
- `listReadOnlyResource` / `getReadOnlyResource` reciben un parámetro `extra: SQL[]` **opcional**. Sin él, el comportamiento es idéntico al de siempre: **la API de sólo lectura por token no cambió**. Cambiarle las reglas a un token que ya está en producción rompe integraciones que hoy funcionan, y eso merece su propia tanda.

> **Cambio de comportamiento a tener en cuenta.** Un recurso cuyo plugin está apagado deja de leerse por el conector. En el equipo 2 son 10 recursos (Artículos y Ventas, apagados a propósito). Es la misma regla que App Maker ya aplicaba; ahora la puerta del conector no es más floja que la de al lado.

### 8.4 A0, completo

`whatspro_manage_scheduled_message` ya tenía `confirm` + tope. Le faltaban las dos que este documento venía anotando:

- **`dry_run`** en create y update: devuelve destinatarios, instancia resuelta, próxima corrida calculada y `confirm_required`, sin escribir ni exigir confirmación. Es el paso previo obligado de cualquier envío masivo.
- **`idempotency_key`** en create: la reserva se toma **antes** de insertar —el reintento que hay que atajar es el del timeout, cuando el primer intento ya está escribiendo— y se apoya en `team_message_send_keys`, que ya existe con el unique por `(teamId, keyHash)`. Sin tabla nueva.

### 8.5 Capacidad y ficha comercial

| Cambio | Qué destraba |
| --- | --- |
| `whatspro_documents_attach_media` (nueva) | El hueco de la skill 36: un informe con capturas no se podía armar entero desde un conector. Se extrajo `uploadDocumentMedia` a `lib/plugins/documents/server/media.ts` y la route la consume. El contenido viaja en base64 y se le recorta el prefijo `data:`, que es el error más frecuente de un modelo. |
| `whatspro_save_contact` extendida | `company`, `job_title`, `department`, `linkedin_url`, `email`, `phone`, `lead_score`, `temperature`, `is_vip`. Las columnas existían y no había forma de escribirlas. |
| `whatspro_manage_customer` extendida | `industry`, `website`, `employees`, `annual_revenue`, `location`, `customer_since`. Ídem. |
| `whatspro_crm_followup_queue` | Suma `stalled_deals`: las oportunidades abiertas sin movimiento en el mismo plazo. Un chat callado y una oportunidad parada son la misma pregunta. |
| `whatspro_crm_funnel_snapshot` | Suma `deals_by_stage`, **por etapa y por moneda**: dos montos en monedas distintas no se suman nunca. |
| `whatspro_delete_record` | Acepta `resource:"deal"` con permiso `dealsWrite`. Cerrar como perdida sigue siendo `whatspro_deals_close`, que conserva el historial. |

Las dos secciones de oportunidades **degradan, no fallan**: si el plugin está apagado o falta el permiso, vienen vacías con el motivo en `*_skipped`. Un snapshot del CRM no puede romperse porque el equipo no use Oportunidades.

### 8.6 Verificación

- `scripts/verify-connector-tools.mts` — 221 tools, schemas válidos, **y ahora también** falla si un recurso del catálogo no tiene política declarada. El olvido se rompe de entrada en vez de quedar legible sin permiso.
- `scripts/smoke-connector-tools.mts` (nuevo) — ejecuta las tools nuevas **contra la base**. `tsc` y el verificador no ven un `Date` dentro de un `FILTER` ni un `GROUP BY` con parámetro: eso compila y explota en runtime. Este script las corre de verdad, sin escribir nada.
- `tsc --noEmit` limpio.

### 8.7 Lo que sigue abierto

| Pendiente | Por qué no entró |
| --- | --- |
| A3/A4 en la **API de sólo lectura por token** | Hecho a propósito: hay tokens en producción. El mecanismo ya está (`extra: SQL[]` + el mapa compartido); falta decidir el actor de cada token y migrar. |
| `whatspro_files_upload` | No hay dónde: los "archivos" del equipo son media de chats. Un archivo que no cuelga de un chat es una feature de storage, no un envoltorio de conector. Los adjuntos de Documentos (§8.5) cubren el caso real que dolía. |
| Tool de merge de contactos | Toca contactos, chats, etiquetas, campos, tareas, oportunidades, clientes y widgets de Radar. Es una feature con su propio `dry_run` y sus propios tests, no un envoltorio. |
| `whatspro_chat_panel_layout_*` | Espera la migración 0095 de `seguimiento/04`: la tabla `team_chat_panel_preferences` no existe. |
| El catálogo semántico de `business-platform/90-ia-conectores.md` (≈100 tools, gateway, action plans, bus de eventos) | Es una arquitectura nueva completa con 4 tablas y su propio Gate 0 de seguridad. No es una tanda de conector. |
| `whatspro_scheduled_bulk_create`, `whatspro_chat_digest`, `whatspro_campaigns_manage` | Sin cambios desde la §7.11. |

---

## 9. Septiembre 2026 (02) — una sola cola de trabajo y once acciones en el Centro de comandos

Pedido: *"centralizá todo lo mismo, ampliá el abanico de opciones que pueden controlarse vía Command Center y los conectores."*

### 9.1 El problema: tres colas con el mismo nombre y distinta forma

Había tres listas de "lo que falta hacer", cada una con su tool, su forma y su vocabulario:

| Fuente | Tool | Qué contesta |
| --- | --- | --- |
| sales-ops | `whatspro_sales_work_queue` | Qué NO puede hacer el servidor solo y espera a una IA con conector |
| Tareas OS | `whatspro_tasks_ai_worklist` | Qué prompts anotados entregó una persona a la cola |
| Escritorio | `whatspro_command_center_inbox` | Qué tiene que atender una PERSONA hoy |

Una IA que abría sesión no tenía forma de saber cuál pedir, y pedir las tres significaba entender tres formatos distintos.

### 9.2 `whatspro_work_queue` — el sobre común

`lib/work-queue/{types,service}.ts`. Federa las tres en una lista ordenada por prioridad. Los motores **no** se fusionaron: cada uno sigue viviendo en su plugin con sus permisos y sus tablas. Lo único que se unificó es la forma de contar qué hay para hacer.

```
{ source, kind, key, priority, approval, title, detail, chatId, tools[], steps[], payload }
```

**`approval` es la pieza que hace que centralizar no afloje nada.** La distinción entre "esto ya lo aprobó una persona" y "esto necesita criterio" la garantizaba, hasta ahora, el hecho de que fueran tools separadas. Al compartir cola, esa línea viaja como dato en cada ítem:

- `ready` — la IA lo ejecuta siguiendo `steps`.
- `needs_human` — la IA propone y espera confirmación explícita.

Todo lo que viene de la bandeja sale `needs_human` por construcción.

Detalles que costaron pensar:

- **`key` sin fingerprint.** Tareas OS identifica un ítem por `(target_type, target_id, phase, fingerprint)`, donde el fingerprint es un hash del contenido del prompt. Como clave de deduplicación no sirve: cambia con cada edición. La `key` federada es `{target_type}:{target_id}:{phase}` y el fingerprint viaja aparte en `payload`, que es donde le sirve a `whatspro_tasks_ai_report` como token de concurrencia.
- **Prioridad sintetizada.** La worklist de Tareas no tiene campo de prioridad —su orden es implícito por estado y fase—, así que se sintetiza en la escala de sales-ops (900–2500). Las bandas están documentadas en `WORK_PRIORITY`. La bandeja va abajo a propósito: una IA que trabaja de arriba hacia abajo agota primero lo que puede resolver sola.
- **`tools`/`steps` derivados.** sales-ops los emite por ítem; Tareas OS sólo tiene una `strategy` global. Para los ítems de Tareas se derivan de la fase y el estado.
- **Ninguna fuente puede tumbar a las otras.** Permiso faltante, plugin apagado o consulta rota devuelven esa fuente vacía con el motivo en `sources[].skipped`.
- **`limit` no achica la cuenta.** La ventana de consulta es más ancha que la página (`min(200, max(limit, 60))`). Con el mismo número para las dos cosas, pedir 5 ítems hacía que `total` dijera 5 y una IA planificaba creyendo que eso era todo lo que había. Se agregaron `returned` y `truncated`.

Las dos tools viejas siguen funcionando y ahora se encadenan: sus descripciones remiten a `whatspro_work_queue` para ver todo junto.

### 9.3 De 6 a 11 acciones en el Centro de comandos

Las cinco nuevas valen para la pantalla **y** para el conector, porque las dos pasan por `executeCommandBatch`:

| Acción | Se apoya en |
| --- | --- |
| `set-crm-stage` | `updateCrm` de sales-ops, que ya valida que la etapa sea del equipo |
| `change-contact-tags` | **nueva** `changeContactTags` en `lib/contacts/quick-actions.ts` |
| `assign-contact` | **nueva** `assignContact`, ídem |
| `add-internal-note` | `writeInternalNote`, que ya recibía `{teamId, userId}` |
| `create-task` | `createContactTask` de Tareas |

Se escribieron exactamente **dos** funciones nuevas, las únicas que no existían a nivel `lib`:

- **Etiquetar era reemplazo de conjunto.** `updateCrm({ tagIds })` borra todas e inserta la lista final — correcto para el editor de la ficha, donde la persona ve todo antes de guardar; incorrecto para "agregale Urgente", que no puede significar "dejale sólo Urgente". La nueva es incremental y valida que las etiquetas sean del equipo (`contact_tags` no tiene por dónde saberlo: aceptaría una ajena sin chistar).
- **Asignar no existía completo en ninguna parte.** La ruta de "asignar agente" sólo sabe de usuarios; la del editor mezcla la asignación con nombre, etapa y etiquetas en la misma transacción. Ninguna cubría usuario + sector.

Invariantes que se mantuvieron:

- **Todas llevan `chatId`, no `contactId`.** El contacto lo resuelve el servidor. Aceptar un `contactId` del cliente sería la puerta lateral para tocar la ficha de alguien que no está en la bandeja de esa persona.
- **El filtro de visibilidad se aplica a todas.** El array de chats a validar pasó de enumerar dos tipos de acción a derivarse de `'chatId' in action`: una acción nueva que se olvide de la lista es una acción que se salta el scope.
- **`IRREVERSIBLE_ACTIONS` sigue teniendo un solo miembro.** Lo único que no se deshace es lo que sale del equipo. Una etiqueta, una etapa o una asignación se revierten con otra acción.
- El ícono por acción pasó a `Record<CommandActionType, LucideIcon>`: agregar una acción sin ícono ahora falla el typecheck en vez de reventar al indexar en runtime.

### 9.4 Lo que NO entró, y por qué

- **Renovar membresía** y **registrar un cobro**: la lógica está atrapada en dos funciones privadas del conector de 87 y 83 líneas, con idempotencia propia y encadenamiento a Finanzas. Extraerlas bien es una tanda con sus tests; meterlas a medias en el ejecutor habría creado la tercera copia.
- **Programar un mensaje** desde la bandeja: el creador genérico vive dentro de `manageScheduledMessage` (146 líneas, create+update). La versión extraída que existe (`scheduleActionMessage`) está cableada a la cola comercial.

### 9.5 Verificación

`scripts/smoke-work-queue.mts` (nuevo) corre la cola y las cinco acciones **contra la base**, todo en `dry_run`. En el equipo 2: 56 ítems federados (17 sales / 14 tasks / 25 inbox), 31 `ready` y 25 `needs_human`, y las cinco acciones validando. Más `verify-connector-tools.mts` (222 tools) y `tsc --noEmit` limpio.

---

## 10. Septiembre 2026 (02) — la plata entra al Centro de comandos

Pedido: *"que permita renovar membresía, registrar cobros, pagos y todo lo financiero."*

### 10.1 Primero: extraer, no copiar

Las tres operaciones vivían dentro de handlers **privados** del conector. Copiarlas al ejecutor del Centro de comandos habría dejado dos reglas distintas para "cuándo un movimiento queda saldado" — y esa divergencia se manifiesta como plata que figura cobrada en una pantalla y pendiente en la otra.

| Antes | Ahora |
| --- | --- |
| `registrarAsiento` (finance-actions, privada) | `lib/plugins/finance/server/entries.ts:recordFinancialEntry(teamId, userId, input)` |
| `saldarAsiento` (finance-actions, privada, 83 L) | `…/entries.ts:settleFinancialEntry(teamId, userId, input)` |
| `renovar` (bulk-actions, privada, 87 L) | `lib/plugins/memberships/server/renew.ts:renewSubscription(teamId, userId, input)` |

Los tres handlers del conector ahora **delegan**: conservan su `assertPermission` y su auditoría, y el cuerpo es una llamada. También se unificó `asientoIdempotente`, que tenía un segundo llamador en `registrarVenta`, y la constante `FUENTE`, que ahora sale de `FINANCE_EXTERNAL_SOURCE`.

Las funciones extraídas **no chequean permisos**: eso lo decide quien llama, que es el que sabe si viene de un token, de una sesión o de un lote. Lo que sí validan siempre es que todo lo referenciado sea del equipo.

### 10.2 La bandeja gana un sexto tipo: `finance`

Registrar un cobro no tenía dónde colgarse: la bandeja no tenía ítems de plata. Ahora `getCommandCenter` trae los movimientos por cobrar y por pagar sin saldar, con el pendiente real —restando los pagos parciales— y con la acción `settle-entry` propuesta por el saldo completo.

> **La trampa que casi lo deja muerto al nacer.** El filtro natural es `due_on <= hoy+30`. En la base del equipo 2 hay **92 asientos y ninguno tiene `due_on` cargado**: la lista habría dado vacía siempre, y el typecheck y el verificador de tools lo dejaban pasar sin decir nada. La fecha de referencia es `coalesce(due_on, occurred_on)`, y cuando sale de `occurred_on` el texto lo dice ("sin cobrar hace 103 días" en vez de "vencido hace 103 días"), para que nadie lea un vencimiento que nadie cargó.

Los ítems de membresía, que tenían `actions: []`, ahora proponen `renew-membership` con la fecha del período siguiente calculada según `billing_type` (mensual, trimestral, anual o semanal).

### 10.3 Dos acciones nuevas — 13 en total

| Acción | Permiso | Nota |
| --- | --- | --- |
| `renew-membership` | `membershipsWrite` + plugin `memberships` | Con `recordPayment:true` exige **además** `financeWrite` + plugin `finance`: renovar y facturar son dos autorizaciones distintas |
| `settle-entry` | `financeWrite` + plugin `finance` | Acepta pago parcial; al cubrir el total, el asiento pasa a `paid` |

Invariantes:

- **La clave idempotente la deriva el servidor** del `batchId` + el ítem. `idempotencyKey(batchId, target)` pasó a aceptar `number | string`; el camino de los envíos no cambió (sigue recibiendo el `chatId`).
- **`amount` acepta 0 pero no negativos**: una renovación bonificada es un caso real.
- **`record-entry` NO entró al lote** a propósito. `whatspro_finance_record_entry` ya lo hace, con más campos y mejor validación; una versión recortada adentro del lote habría sido un segundo camino peor para lo mismo.

### 10.4 Verificación

`scripts/smoke-money-actions.mts` (nuevo), contra la base:

- La bandeja trae el tipo `finance` y propone la acción correcta en cobros y en membresías.
- El lote valida las dos acciones en `dry_run`.
- **Las protecciones disparan**: rechaza una fecha que no extiende, una suscripción de otro equipo, un asiento inexistente y una cuenta de otro equipo.

Y una prueba de idempotencia **de punta a punta**, con un asiento propio creado y borrado en el mismo script: el asiento repetido con la misma clave no se duplica, el cobro repetido no cobra dos veces, y al cubrir el total el asiento queda en `paid`. La base quedó sin filas de prueba.

Más `verify-connector-tools.mts` (222 tools), `check-i18n` y `tsc --noEmit` limpios.

---

## 11. Septiembre 2026 (03) — 50 tools: el sistema entero gobernable desde un conector

Pedido: *"analizá todo el ecosistema de acciones para los conectores, hacé una lista de hasta 50 herramientas que falten, evaluálas y crealas."* La lista evaluada, con el criterio de cada decisión y lo que se dejó afuera, está en **`BRECHAS-2026-09-03.md`**. Esta sección es el resultado de ejecutarla.

**222 → 272 tools.** Verificador en verde (272 nombres únicos, todos los schemas serializables, 131 recursos con política), typecheck limpio, y smoke test contra la base del equipo 2.

### 11.1 Cómo se encontraron

Tres inventarios cruzados contra el código: las 284 rutas API que escriben, las 408 funciones de `lib/**` con `teamId` en el primer parámetro (35 de escritura sin ninguna tool), y las 246 tools registradas. Lo que la app o `lib/` sabían hacer y una IA no, era el hueco.

**El hallazgo principal:** el flujo comercial estaba cortado en el último paso. La IA podía proponer, aprobar, editar y rechazar lotes, pero `executeApprovedBatch` —la función que efectivamente envía— no tenía tool. Aprobar sólo cambiaba un estado. Es `whatspro_sales_execute_batch`, y era la más barata de todas: la función existía y ya la usaba la pantalla.

### 11.2 Cómo se construyeron

Cuatro frentes en paralelo, cada uno con las mismas reglas: `inputSchema` como JSON Schema puro, `assertPermission` + plugin activo en cada handler, `audit` en cada escritura, `confirm` en lo destructivo, `dry_run` en lo que toca varios registros, y **extraer en vez de copiar**: cuando la lógica vivía dentro de un route handler, se movió a `lib/**` con firma `(teamId, userId, input)` y la route pasó a consumirla.

**19 funciones extraídas de routes a `lib/`** en esta tanda — la app y el conector ahora comparten la regla en todos estos casos:

| Extraída a | Desde |
| --- | --- |
| `lib/chats/close.ts`, `ai-status.ts`, `ai-summary.ts` | `app/api/chats/[id]/{close,ai-status,ai-summary}` |
| `lib/quick-replies/service.ts` | `app/api/quick-replies` |
| `lib/plugins/core/service.ts:setPluginEnabledByMember` | `app/api/plugins/catalog` PATCH (217 líneas inline) |
| `lib/plugins/ai-chat/config.ts` | nuevo, con `apiKey` excluida por construcción |
| `lib/instances/live-status.ts` | `app/api/instance/details` |
| `lib/plugins/finance/server/{entries,budgets,cost-centers}.ts` | `app/api/plugins/finance/{entries/[id],budgets,cost-centers}` |
| `lib/plugins/memberships/server/{reminder-rules,companies,renew}.ts` | `app/api/plugins/memberships/{reminder-rules,companies,subscriptions}` |
| `lib/plugins/tasks/server/{duplicate,convert,checklist,templates}.ts` | `app/api/plugins/tasks/{items,projects,templates}/…` |
| `lib/drafts/{service,generate}.ts` | `app/api/drafts/*` |
| `lib/plugins/form-builder/server/service.ts` (create/update/delete/status) | `app/api/plugins/form-builder/*` |

### 11.3 Las 50, por frente

**Comercial (14)** — `lib/plugins/sales-ops/tools/manage-tools.ts`: `sales_execute_batch`, `sales_overview`, `sales_metrics`, `sales_settings`, `sales_signal_mark`, `sales_radar_mute`, `sales_classification_override`, `sales_lead_manage`, `sales_visibility_set`, `sales_audio_exclude`, `sales_experiment_manage`, `sales_exclusions`, `sales_work_skip`, `sales_batch_delete`.

**Conversaciones (5)** — `chat-actions.ts`: `chat_mark_read`, `chat_close`, `chat_ai_status`, `chat_summarize`, `chat_set_automation`.

**Equipo y ajustes (8)** — `settings-actions.ts`: `manage_quick_reply`, `quick_replies_list`, `plugins_manage`, `ai_builtin_tools`, `ai_config`, `notification_prefs`, `menu_manage`, `instances_status`.

**Finanzas (5)** — en `finance-actions.ts`: `finance_update_entry`, `manage_budget`, `manage_cost_center`, `finance_os_resumen`, `finance_budgets_list`.

**Membresías (3)** — `memberships-actions.ts`: `manage_membership_reminder_rule`, `manage_membership_company`, `membership_cancel`.

**Calendario (1)** — `calendar-actions.ts`: `calendar_close_meeting`.

**Tareas (5)** — en `tasks-actions.ts`: `tasks_duplicate`, `tasks_convert`, `tasks_checklist_to_tasks`, `tasks_embed`, `manage_task_template`.

**Escritorio (5)** — en `desktop-actions.ts`: `desktop_search`, `desktop_activity`, `revenue_trend`, `crm_stats`, `operations_ai_send`.

**Contenido (4)** — `content-actions.ts`: `manage_draft`, `drafts_generate`, `manage_form`, `form_submission_status`.

### 11.4 Decisiones que se tomaron en el camino

- **`ai_config` nunca devuelve ni acepta la API key.** Sólo `hasApiKey`. La pantalla de Ajustes → IA sigue siendo el único lugar que la carga.
- **`instances_status` enmascara el número** (últimos 4) y no expone tokens de Evolution. Si Evolution no responde, `live_status: null`, no un error.
- **`notification_prefs` no acepta el teléfono de avisos** en `set` y en `get` lo devuelve enmascarado: es un número completo.
- **`sales_settings` bloquea `workQueueSkips`** y las listas internas: acepta sólo `cashGoalUsd`, `missionSince`, `fx`, `sendCooldownHours`.
- **`membership_cancel` es no destructiva**: estado → `cancelled` con motivo fechado. El DELETE físico de la ruta no se expone.
- **La ejecución de presupuestos ahora filtra por moneda y excluye cancelados.** El GET viejo sumaba ARS con USD contra un tope en ARS. Se corrigió en la extracción y la pantalla de Finanzas lo hereda.
- **`chat_close` ahora verifica que el chat sea del equipo** antes de tocar sesiones de automatización; la route original no lo hacía.
- **Las reglas de aviso validan que `automation_id` e `instance_id` sean del equipo**; la route original tampoco.

### 11.5 Lo que el smoke test mostró

20 tools probadas contra la base. Todas las lecturas devolvieron datos reales (`desktop_search` encontró 24 resultados para "martin"; `sales_overview` trajo la meta de caja; `instances_status` listó las 3 instancias). Las escrituras en `dry_run` previsualizaron sin escribir. Los "errores" fueron cuatro validaciones haciendo su trabajo y un caso esperado:

- `ai_config` y `ai_builtin_tools` responden **"Plugin is not enabled: ai-chat"** en el equipo 2. Es el chequeo de plugin activo: para usarlas hay que activar la app del agente IA.

### 11.6 Lo que sigue abierto

`BRECHAS-2026-09-03.md` lista lo que se dejó afuera con motivo: plugins con 0 filas, infraestructura destructiva, secretos, invitaciones y permisos de miembros, campañas masivas, importación CSV, borrado de histórico, fusión de contactos.
