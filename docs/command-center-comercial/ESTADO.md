# ESTADO — Command Center Comercial

## Fase 0 — Descubrimiento (hecha el 2026-08-29)

Se relevaron el código de WhatsPro (rama `feat/tareas-rediseno`) y la base del equipo 2 antes de diseñar. Todo lo que dicen los documentos 01–04 está verificado contra archivos, líneas y consultas reales de esa fecha. **No se escribió una línea de código del Command Center ni se tocó el CRM.**

### Cinco hallazgos que cambiaron el diseño

1. **Ya existe un motor de ejecución con aprobación** (`lib/desktop/command-center/`, `/escritorio/bandeja`): un envío por request, `confirm: 'EJECUTAR'`, idempotencia derivada por el servidor, auditoría. La "cola de ejecución" pedida no se construye: se enchufa (Fase 6).
2. **Radar ya clasifica contactos con IA** (`whatspro_radar_save_analysis`, 81 contactos con `radar_prioridad/intencion/objecion/recuperabilidad/estrategia`). La taxonomía G0–GX es una evolución de eso; los 81 análisis se importan como hipótesis previa con fecha.
3. **La infraestructura de IA del servidor tiene un techo real:** el banco de keys Gemini gratuito rinde ~140 llamadas/día. Clasificar 1.057 chats sólo en servidor llevaría más de una semana. Por eso el motor es doble (conector + servidor) y el MVP-0 corre con conectores desde el día 1.
4. **No existe atribución al anuncio, ni historial de etapas, ni registro de envíos por destinatario, ni Prompt Studio.** Los cuatro están en el plan; los dos primeros se infieren del chat mientras tanto.
5. **"Cliente" tiene tres definiciones distintas en la base** (136 vinculados, 101 con `customData.cliente`, 274 con etiqueta de producto) que no coinciden entre sí. El motor las reconcilia por fuerza de evidencia (04 §4) y el chat manda.

### Datos que condicionan (equipo 2)

1.057 chats · 60.843 mensajes (27.197 del cliente; 3.658 de automatización; 452 de IA; 666 notas) · 13.773 audios (80 con ficha, 874 en cola) · 255 chats con un solo mensaje del cliente y 81 con ninguno · 566 chats arrancan con "¡Hola! Quiero más información" · 618 chats con >30 días de silencio · 205 sesiones de automatización activas · 1 venta registrada · 0 deals consultables · 0 campañas · 0 entradas financieras.

### Decisiones tomadas en el diseño (cambiarlas = editar 00-LEEME)

Plugin `sales-ops` en `/plugins/sales-ops` · 5 tablas propias + 2 de Prompt Studio · motor doble con un contrato JSON · reglas determinísticas antes de la IA · prioridad P × valor × velocidad con tablas base · Frente 1 primero con prefiltro determinístico · meta de caja desde `team_sales` (Carlos registra) · escritura al CRM sólo en Fase 6 y sólo tres acciones.

### Preguntas para el equipo (no bloquean el MVP-0)

1. **Notas internas en el chat durante la auditoría, ¿sí o no?** Son mensajes `isInternal` (el cliente no las ve) y no cambian el CRM, pero dejan rastro en el chat. El MVP-0 asume **sólo documentos** salvo que se pida lo contrario.
2. **Tipo de cambio provisorio** ARS 1.000 = USD 1 y Gs 7.500 = USD 1 para la meta de caja. Confirmar o corregir en el setting del plugin.
3. **Tabla de valor por servicio** (04 §8): salió de los nombres de las automatizaciones. Confirmar precios vigentes AR y PY.
4. **Set de control:** ¿Noelia puede etiquetar 50 chats a mano (gate + una línea) antes de habilitar lotes grandes? Es la única forma de medir el clasificador.
5. **Transcripciones:** ¿se encolan primero los ~300 audios de los chats del prefiltro de dinero (2–3 días con el banco actual) o se carga una key paga de Gemini (< USD 2 para todo)?

## Construcción en paralelo — 2026-08-29 (Fases 1–5 hechas, sin desplegar)

Se construyeron las Fases 1 a 5 el mismo día, en paralelo por cuatro equipos con archivos asignados sin solapamiento, sobre un contrato compartido (`lib/plugins/sales-ops/shared/{taxonomy,contract,api-types}.ts`). Resultado verificado contra la base del equipo 2 con smokes que borran lo que escriben:

- **Fundaciones (integrador):** migración `0095_sales_ops.sql` **aplicada** (8 tablas: análisis + versiones, señales, acciones, experimentos + miembros, prompts + runs; índice parcial "un envío aprobado por chat"; plugin `sales-ops` activado sólo para el equipo 2), permisos `salesOpsRead/Write`, manifest, page-registry, lanzador de apps, agregador MCP `sales-ops-actions.ts` + `PRIORITY_TOOLS`. `/plugins/sales-ops` es **aplicación aparte** (takeover a pantalla completa como Tareas OS, decidido por el usuario).
- **Motor (Fases 1–2):** `server/{fingerprint,rules,dossier,priority,prompts,classifier}.ts`; prompts `sales-ops.classify` y `sales-ops.radar` sembrados en `team_prompts` v1; **81 análisis Radar importados** como versión 0 (`reason: import`); tools `whatspro_sales_pending/_dossier/_classification_write/_classify_server`; cron `sales-ops-classify`. Hallazgo: `generateStructuredObjectForTeam` no sirve con Gemini 2.5 (descarta el rol system y 1.000 tokens se los come el razonamiento) → el clasificador llama a `@google/genai` directo con `systemInstruction`, JSON mode y `thinkingBudget`. Clasificación real de prueba: G6, confianza 90, 13,6 s. Prefiltro de dinero real: **414 chats** (312 con datos de pago nuestros, 217 con etiqueta de producto, 24 radar P1).
- **UI (Fase 3):** shell propio (rail izquierdo, móvil con drawer y barra propia), Hoy, listas (Dinero/Oportunidades/Barrido/Limpieza/Todos), ficha con Timeline/Versiones/Acciones/Señales, Métricas, override manual de gate. Rutas `overview/contacts/contacts/[chatId]/metrics`.
- **Cola (Fase 4):** `server/{queue,experiments,housekeeping}.ts`, rutas `queue/*`, `experiments/*`, tools `whatspro_sales_queue_list/get/propose/approve/result`, vistas Cola y Experimentos, cron `sales-ops-housekeeping`. Aprobar no envía.
- **Radar (Fase 5):** `server/radar.ts` (reglas antes de IA, auto-reply, urgencia, cancelación de propuestas al responder, Pusher `sales-ops:signal`), rutas `signals/*`, tools `whatspro_sales_signals_list/_signal_write/_radar_scan`, vista Respuestas, cron `sales-ops-radar`. Barrido real de 3 días: 450 respuestas → 351 interesado · 80 pide info · 6 precio · 4 llamada · 1 pago · 2 rechazo.
- **Cola de trabajo para conectores (pedido del usuario):** `server/work-queue.ts` + tool `whatspro_sales_work_queue` + ruta `work` + contador "pendientes de conectores" en Hoy + prompt **P9** en el doc 07. Todo lo que el servidor no puede hacer con tokens (clasificar, clasificar respuestas, transcribir) y los envíos aprobados quedan encolados y los ejecuta el conector, que devuelve el resultado por las tools de escritura.

**Desviaciones respecto al plan:** una sola migración para las Fases 1–5 (en vez de una por fase) para permitir el paralelismo; UI en español hardcodeado (sin namespace i18n `SalesOps`) por la misma razón; `priority = P × valor × velocidad` sin el ×100 (los ejemplos del doc 04 ya estaban en esa escala); el conector se identifica por input (`GrokActionContext` no lo trae).

**Desplegado el 2026-08-29** (`pnpm run deploy:saasfy`, commits 70a5cff y a9688d6) y crons registrados en PM2: `sales-ops-classify` (*/15), `sales-ops-radar` (*/2), `sales-ops-housekeeping` (04:15). Disponible para los tres conectores (Claude, ChatGPT, Grok comparten el handler MCP); las instrucciones del servidor MCP mencionan `whatspro_sales_work_queue`. En la UI: vista Cola → bloque "Cola de conectores" con conteos y botón "Copiar prompt P9"; ficha → "Clasificar ahora" que, sin cuota de IA, avisa que el chat quedó en la cola de conectores.

**Prompt Studio v2 — gestor de skills (2026-09-01):** el Studio pasó de lista de botones a **gestor de skills**. Migración `0097_sales_ops_skills`: `team_prompts` suma `description`, `category`, `icon`, `recurrence`, `execution`, `scope`, `variables`, `recommend_for`, `pinned`, `usage_count`, `last_used_at`; `team_prompt_runs` suma `variables`, `mode`, `output` y `completed_at` (antes en `metadata`).

- **Separación rutinas / puntuales:** `recurrence` distingue lo que un conector corre de forma recurrente (`daily`/`weekly`/`monthly`) de lo puntual (`on_demand`). La vista y `whatspro_sales_prompts_list` los devuelven en secciones distintas (`routines` / `on_demand`).
- **API o cola:** `execution` decide quién ejecuta. `api` corre en el servidor con la IA del equipo (`server/skill-runner.ts`, mismo camino que el clasificador: proveedor del equipo → banco de keys) y devuelve texto; ese motor **no tiene tools y no escribe fuera de la corrida**. `connector` deja la corrida en la cola. `both` se elige al lanzar.
- **Datos dinámicos:** `variables` es un formulario ({name, label, type, required, options, default}). Al lanzar se completa y se ve el **prompt final en vivo, copiable**, armado con `renderSkillText` — la misma función del servidor, así lo que se copia es lo que se ejecuta. Faltando una obligatoria no se lanza.
- **Siguiente acción en el chat:** `recommend_for` (gates / estados / señales) hace que la skill aparezca sola en el panel derecho de la ficha, con el motivo. `GET /prompts/recommended?chatId=`.
- **Conectores, gestión completa:** `whatspro_sales_prompt_get`, `_render`, `_manage` (create/update/duplicate/pin/retire) y `_launch` (mode api|queue), más `_list` con `routines`/`on_demand`/`recommended` y `_result` con `output`. 210 tools, `verify-connector-tools.mts` en verde.
- **Conectores, edición de la cola (2026-09-01):** `whatspro_sales_queue_edit` (texto/título de una fila propuesta), `whatspro_sales_queue_remove` (quitar contactos de un lote, incluso aprobado sin ejecutar; `confirm=true`), `whatspro_sales_queue_reject` (rechazar el lote entero) y `whatspro_sales_run_manage` (cancel / edit / retry de corridas del Prompt Studio; `retry` con `mode api|queue`). Misma lógica que la interfaz: `editAction`, `removeFromBatch`, `rejectBatch` en `server/queue.ts` y `editQueuedRun`, `relaunchRun` en `server/prompt-queue.ts`.
- **Tipos de acción nuevos (2026-09-01):** `schedule_message` (al ejecutar crea un programado por contacto, `payload.sendAt`, `server/scheduled.ts`) y `request_demo` (al ejecutar, tarea "Demo web — {nombre}" en el workspace **Demos** de Tareas OS con la investigación del chat en notes y el prompt para AAPP SPACE en `ai_prompt`; `server/demos.ts`, IA del equipo con prompt base de respaldo). La columna `kind` es varchar: sin migración.
- **Programados con prompt → cola (2026-09-01):** `convertirProgramadoEnPedido` (`server/programados.ts`, `POST /programados/{id}/a-cola`) arma una indicación en la cola con lo que tenía el programado y lo borra (audit `SALES_OPS_PROGRAMADO_A_COLA`). Las tres UIs que guardaban `aiPrompt` (TarjetaProgramado, ProgramadosContacto) ahora llaman a `pasarACola`. El conector decide el resultado: mensaje, demo o proyecto.
- **Tool `whatspro_sales_tareas_from_chat`** (`tools/tareas-tools.ts`, 211 tools): `demo` → `createDemoTask`; `project` → `createClientProject` (`server/client-projects.ts`: workspace **Clientes**, proyecto por cliente con Por hacer/En curso/Hecho, vinculado al contacto, idempotente por nombre).
- **Ciclo único de la Cola (2026-09-01):** corridas con aprobación como los lotes. `metadata.approvedAt/approvedBy` (sin migración): lanzada a mano desde la interfaz (`/prompts/launch`, `/prompts/queue`, requeue) nace aprobada; nacida de un programado o lanzada por un conector (`whatspro_sales_prompt_launch mode=queue`) espera en **En revisión**, donde se edita el texto ahí mismo (`PATCH {text,title}` → `editQueuedRun`) y se aprueba (`PATCH {approved:true}` → `approveRun`, o `whatspro_sales_run_manage action=approve`). `listWorkQueue` sólo entrega `queued` aprobadas. Completada por el conector → **Hechos**; fallida → En revisión; cancelada → **Descartados** (`DELETE /prompts/queue/{id}` la elimina; `DELETE /queue/{batchId}` elimina un lote sin filas vivas ni envíos que hayan salido; "Limpiar descartados" hace ambas en lote). Los programados en la Cola abren la ficha por teléfono (`resolverChats`) y se descartan borrándolos.
- **Vistas nuevas (2026-09-01):** **Audios** (`ui/views/AudiosView.tsx`, `GET /audios`, `POST /audios/{messageId}` con `transcribe|analyze|queue|write|ask_connector`; reproductor `CustomAudioPlayer` sobre `/api/media?path=`; "sólo chats en cola" = acción viva o prompt en cola), **Producción** (`server/produccion.ts` lee Tareas OS: workspaces Demos, Clientes y **Command Center** (se crea solo, proyecto Bitácora); avance = checklist/columna Hecho; estado IA con `leerEstadoPrompt`; edita con `PATCH /api/plugins/tasks/items/{id}`; `POST /produccion {action:'documentar'}`), **Ayuda** (`AyudaView` con pestañas Flujo · Funciones · Curso práctico de IA · Reglas; contenido en `ui/ayuda/contenido.ts`: `TEMAS` una landing por vista, `CURSO` lecciones; oculta del rail, vive en el pie). Pie del Sidebar = tres atajos verticales (Plegar · WhatsPro → `/apps` · Ayuda), como Tareas OS. **Respuestas**: en cada tarjeta, Chat flotante (`radar/ChatFlotante.tsx` con `FichaChat`), Prompt (encola con `approved`), Flujo (`/api/plugins/sales-ops/automations` GET/POST → `triggerAutomationManually`, único atajo que llega al cliente sin cola, auditado) y contador de pedidos en cola por chat.
- **Cola unificada (2026-09-01):** `ColaView` muestra lotes, indicaciones (`promptKey = manual`), prompts (skills) y programados por momento —En revisión / En cola / Hechos / Descartados— con filtro por tipo. `GET /prompts/queue?engine=exclude&limit=200` deja afuera las corridas del motor (`sales-ops.*`), que tapaban todo.
- **UI:** `lib/plugins/sales-ops/ui/skills/` (vista, tarjeta, lanzador, editor, recomendadas, `ResponsiveModal` = diálogo en escritorio / hoja desde abajo en el teléfono). `views/PromptStudioView.tsx` quedó como re-export.
- **Seed:** `scripts/seed-sales-ops-quick-actions.ts` siembra 12 skills con metadata, 3 de ellas con formulario (`qa.mensaje-a-medida`, `qa.propuesta-con-precio`, `qa.barrido-por-criterio`).
- Los prompts del motor (`sales-ops.classify`, `sales-ops.radar`) quedan fuera del catálogo de skills (`purpose != 'custom'`) y guardarlos con esas keys se rechaza.

**Prompt Studio y chat en la ficha (2026-08-29, tarde):** vista **Prompt Studio** en la app (acciones rápidas P1–P9 sembradas en `team_prompts` como `qa.*`; botones **Encolar** → corrida `queued` en `team_prompt_runs` que el conector toma por `whatspro_sales_work_queue` (kind `run_prompt`) y cierra con `whatspro_sales_prompt_result`; **Copiar**; editor con versionado). En la ficha: pestaña **Chat** con `components/chat/ChatEmbebido.tsx` (extraído del plugin Tareas, tokens del core; Tareas usa el mismo componente con `tokens="tareas"`), bloque **"Dejar un prompt al conector"** en Siguiente acción (entra a la misma cola con el contexto del chat), y secciones **Campos del contacto** (customData + etiquetas) y **Notas internas** (mensajes `isInternal` + `contacts.notes`); pestañas que ya no se rompen en el panel angosto. Las reglas de las acciones rápidas explican que el dossier trae notas internas y campos personalizados y cómo ampliarlos (`whatspro_private_notes`, `whatspro_custom_fields`, `whatspro_add_internal_note`).

**Falta (en orden):** cargar keys con cuota en el banco Gemini del equipo 2 o una key paga; set de control de 50 chats (P8) antes de lotes grandes; Fase 6 (ejecución desde el servidor vía `executeCommandBatch`) y Fase 7 (leads nuevos, atribución al anuncio).

## Bandeja de Respuestas agrupada por contacto (2026-08-31)

La vista Respuestas mostraba una fila por señal y el radar crea una señal por mensaje entrante: con 282 señales `new` del equipo 2 repartidas en **27 contactos** (una sola conversación aportaba 74), atender a alguien eran decenas de clics. Ahora la unidad es el contacto: una tarjeta con lo último que dijo, el resumen de tipos, los mensajes anteriores desplegables y un botón "Atendido (N)" que cierra todas sus señales en un solo request (`POST /api/plugins/sales-ops/signals` con `{action:'mark', signalIds, status}` → `markSignals` en `server/radar.ts`, un UPDATE con `inArray` y una sola auditoría). La vista pasó a pedir `limit=500` porque con el tope de 200 un contacto charlatán tapaba a los demás.

La ficha reordenada (2026-08-31): **Siguiente acción** subió arriba de todo en Resumen; la botonera suma **Mover a lista** (Dinero · Oportunidades · Barrido · Limpieza) que abre el override ya prellenado —la lista se deriva del gate y del estado, igual que `vistaWhere`, así que mover de lista es un preset del override y la persona confirma gate, destino y motivo—; **Dejar prompt** dejó de ser un diálogo y es una caja de chat con el hilo de lo enviado, su estado y lo que devolvió el conector, que arranca en la última clasificación (cada análisis limpia el pizarrón visible, sin borrar corridas de la cola); y hay una pestaña **Historial** al final que lee `activity_logs` con prefijo `SALES_OPS_` del chat (`server/history.ts` + `contacts/[chatId]/history`).

La ficha suma una pestaña **Radar** al lado de Acciones (las señales del contacto, que antes vivían apretadas al final de Acciones: ahora se ven con emoji, confianza, gate y botón "Atendida" / "Atender todas") y la fila de pestañas pasa por `ui/components/BarraPestanas.tsx`, un riel con degradado y flechas — en un panel de 440 px el `overflow-x-auto` pelado no daba ninguna pista de que hubiera más pestañas a la derecha.

En la pestaña **Chat** de la ficha se agregó el bloque **Programados** (`ui/components/ProgramadosContacto.tsx`): lista los mensajes programados apuntados al teléfono del contacto, deja editarlos, pausarlos, borrarlos y crear uno nuevo sin salir del Command Center. Usa la API del plugin `scheduled-messages`; si el usuario no tiene `scheduledMessagesRead` la sección no se dibuja.

## Fases

| Fase | Estado |
|---|---|
| 0 Descubrimiento | ✅ 2026-08-29 |
| MVP-0 Conectores (Prompt Studio v0, P1–P9) | ✅ prompts listos; subcarpetas Auditoría (75) · Cola (76) · Respuestas (77) creadas |
| 1 Modelo + auditor | ✅ 2026-08-29 (sin desplegar) |
| 2 Clasificador | ✅ 2026-08-29 (motor servidor + conector; sin desplegar) |
| 3 Dashboard sólo lectura | ✅ 2026-08-29 (sin desplegar) |
| 4 Cola operativa | ✅ 2026-08-29 (sin desplegar) |
| 5 Radar | ✅ 2026-08-29 (sin desplegar) |
| 6 Ejecución aprobada desde el servidor | ⏳ (hoy la ejecuta el conector vía P9) |
| 7 Leads nuevos | ⏳ |

## Relación con otros trabajos en curso

- **Seguimiento** (`docs/seguimiento/`): comparte el chat embebido (`ChatEmbebido`) y el panel lateral; la ficha del Command Center en escritorio reutiliza ese panel. Numeración de migraciones: la que se aplique primero toma `0095`.
- **Centro de Comandos del Escritorio** (`docs/escritorio-pulze/10-CENTRO-DE-COMANDOS.md`): motor de ejecución reutilizado en Fase 6; no se modifica su pantalla.
- **Radar** (`docs/radar/`): fuente de los 81 análisis previos y de los gráficos de Métricas.
- **Conectores** (`docs/conectores/ACCIONES-MCP.md`, `SKILLS-OPERATIVAS.md`): las tools `whatspro_sales_*` se registran con el patrón de `radar-actions.ts` y entran en `PRIORITY_TOOLS`.
