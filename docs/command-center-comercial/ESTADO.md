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

## Focus: bloques de trabajo de 25 minutos (2026-09-05)

Pantalla propia (`?vista=focus`, botón **Focus** en la barra del Command Center) para procesar clientes de a uno contra reloj, sin volver a una lista. Tres columnas: resumen con el radar y las señales a la izquierda, programados editables y el hilo con la IA en el centro, chat del contacto a la derecha; abajo un prompt con dos botones — **Ejecutar ahora** (la IA del equipo redacta en el servidor y la pantalla se queda, con el texto bajado al editor de programados) y **Listo para conector** (encola el pedido y pasa al siguiente). Bloques de 25 minutos con el vencimiento guardado en `localStorage`, barra de progreso por etapa, contadores de sesión, filtros multiselect por tipo y grado, órdenes nuevos `oldest` y `gate`, y confeti al vaciar una etapa antes de saltar a la siguiente.

Lo que **no** hace, a propósito: "Ejecutar ahora" nunca envía un WhatsApp (redacta y programa; el envío sigue pasando por proponer → aprobar → ejecutar con clave idempotente) y Focus no escribe en el CRM. El motor (`server/focus.ts`) devuelve `{modo:"texto"}` o `{modo:"conector", motivo}`: el servidor no tiene herramientas y lo dice, en vez de contestar un texto que promete haber hecho algo.

Sin tablas nuevas ni migraciones: todo lo que muestra ya existía. El detalle es el que ya usaba la ficha (`GET /contacts/{chatId}`), los programados son los del plugin `scheduled-messages` (`ProgramadosContacto` con `soloSiHay`, así que no ocupa espacio si el contacto no tiene ninguno) y el hilo con la IA es la cola del Prompt Studio filtrada por chat, con `HumanDecisionCard` para lo bloqueado. Plan completo en `08-FOCUS.md`; smoke contra la base en `scripts/smoke-focus.mts` y contra Gemini en `scripts/smoke-focus-ia.mts`.

## El CRM: la IA pasa de anotar a corregir (2026-09-05)

Hasta acá la primera regla de la cola de conectores era *"No tocar el CRM"*, y el clasificador tenía prohibido escribir etapas, etiquetas y campos: cuando detectaba que el CRM contradecía el chat lo anotaba en `crm_to_fix`, texto libre, y esperaba a que una persona lo leyera y repitiera el cambio a mano. Casi nunca pasaba: el texto quedaba en la ficha como un párrafo más.

**Cambian dos cosas.**

**1. La corrección se aplica de un botón.** El clasificador ahora emite, además del texto, la misma corrección estructurada en `crm_fix` (columna `jsonb` nueva, migración `0104`): `{stage?, addTags?, removeTags?, fields?, reason?}`, **por nombre y no por id** —lo escribe un conector que leyó el expediente, no la base—. La ficha muestra el bloque «CRM a corregir» con qué va a cambiar exactamente y un botón **Aplicar** (`POST /contacts/{chatId}/crm/apply` → `applyCrmFix` en `server/crm.ts`). El aplicador traduce nombres contra el catálogo del equipo ignorando mayúsculas y acentos, arma UN patch y lo pasa por `updateCrm` —el mismo camino que el editor a mano, con sus mismas validaciones y su misma auditoría—, saltea sin fallar lo que no existe (una etiqueta inventada no puede tirar abajo una corrección que además arreglaba la etapa) y borra la propuesta al aplicarla. Las clasificaciones viejas no tienen `crm_fix`: muestran el texto y un atajo a la pestaña CRM.

Para que la propuesta sea aplicable, el expediente ahora lleva `crmCatalog` (los nombres de etapas, etiquetas y campos que EXISTEN en el equipo): sin eso quien propone sólo veía lo que el contacto ya tiene y terminaba inventando nombres.

**2. Los conectores pueden escribir el CRM.** La regla nueva de `work-queue.ts` los habilita a corregir etapa, etiquetas, campos y notas del contacto que están trabajando, con `whatspro_change_crm_stage`, `whatspro_set_contact_tags` y `whatspro_set_custom_fields`. Se conserva el límite que importaba de verdad: **de a un contacto por vez y sólo lo que contradice ese chat, nunca en lote** (`crm_bulk_*` sigue necesitando que lo pida una persona), y automatizaciones y registro de clientes siguen siendo humanos.

El contrato de `crm_fix` se agrega al prompt activo en tiempo de composición (`composeClassifySystem`) y no sólo a la constante: el equipo puede tener su propio `sales-ops.classify` guardado, y si la instrucción viviera únicamente en el default la función no existiría para nadie que haya editado su prompt. Si el prompt activo ya menciona `crm_fix`, no se le agrega nada.

Smoke contra la base en `scripts/smoke-crm-fix.mts`: verifica que los nombres inexistentes no escriban y dejen la propuesta en pie, que resuelva sin mayúsculas ni acentos, y que aplicar borre la propuesta — todo sin cambiarle el CRM a nadie (propone la etapa que el contacto ya tiene).

## Focus de supervisión en la Cola (2026-09-05)

Segundo Focus, **violeta**, al que se entra con un botón propio en la Cola. El primero recorre clientes para ejecutarles algo; éste recorre lo que espera una decisión —prompts sin aprobar, corridas fallidas, lo bloqueado pidiendo criterio, lotes propuestos, programados detenidos— y en cada uno deja lo único que hace falta: leerlo entero, corregirlo y aprobarlo o descartarlo. El color tiñe la pantalla entera y no sólo el botón: los dos se ven y se recorren igual, y confundirlos es aprobar algo creyendo que se trabajaba un cliente.

Lo que cambia respecto de la Cola: el texto de un prompt se ve **completo y editable** en vez de recortado a dos renglones, y "Aprobar" con cambios sin guardar guarda primero. La lista se congela al entrar (resolver un ítem lo saca del servidor; recalcular movería el siguiente justo cuando se va a apretar) y la Cola se refresca al salir.

En la misma tanda: el pedido del Focus de trabajo **se limpia al encolarlo** —la pantalla pasa al siguiente cliente y un texto heredado se manda sin querer al que viene—; repetirlo es un toque porque queda primero entre las fichas de atajos.

## La cuota de Gemini no era de Gemini (2026-09-05)

Durante días el Command Center informó "se acabó la cuota de IA": 570 clasificaciones caídas, "Ejecutar ahora" siempre en 422 y las 13 keys del banco en 20/20. **Google no tenía nada que ver.** Al preguntarle a la API (`scripts/diag-gemini-banco.mts`) las keys respondían OK a la primera.

Dos causas nuestras, encadenadas:

1. **Cualquier 429 apagaba la key hasta el día siguiente.** `esErrorDeCuota` no distinguía el 429 de "se acabó el día" del de "vas muy rápido" (RPM), y los dos llamaban a `marcarAgotada`. Con `limit_rpm: 10` y trece keys, un pico de clasificación tiraba las trece de una. Ahora `alcanceDelLimite` los separa y el de minuto usa `marcarSaturadaPorMinuto`, que rellena la ventana del minuto en curso y deja la key volver sola. **Ante la duda se elige "minuto"**: una key enfriada de más un minuto no cuesta nada; apagada de más un día cuesta la cola entera.
2. **El tope diario propio era 20.** Un default conservador que con 13 keys dejaba el banco en 260 pedidos/día. Google es la autoridad —un 429 por día saca la key solo—, así que subió a 200 (migración `0105`, sólo las que seguían en el default viejo). El banco pasó de 260 a **2.600 por día**.

Verificado con `scripts/smoke-banco-gemini.mts` (el banco contesta y `runJsonWithApi` resuelve por él) y, por primera vez desde que se escribió, `scripts/smoke-focus-ia.mts` pasa entero: los cinco pedidos del motor de "Ejecutar ahora" devuelven el modo correcto contra Gemini real.

## Acciones preestablecidas y supervisión con contexto (2026-09-05)

Los pedidos dejan de ser "un prompt" a secas: se elige **qué tiene que producir** entre Mensaje, Programar, Tarea, Documento, Planificar, CRM y Libre (`ui/focus/acciones.ts`). Elegir escribe la instrucción con su cadena de tools y titula la corrida —en la Cola se lee "Programar · Juan" en vez de "Focus · Juan"—. El texto sigue editable después: la plantilla es un punto de partida, no un formulario. Las corridas viejas no la tienen guardada, así que se deduce del texto (`deducirAccion`) y se puede corregir; **el orden de esa deducción no es alfabético**: planificar usa la tool de tareas, así que lo específico se evalúa primero.

El Focus de supervisión suma el panel del contacto a la derecha —**Chat · Resumen · CRM**, las tres cosas que se miran para decidir si un prompt está bien— y un botón **Supervisado, siguiente** que cuenta como revisado sin cambiar nada (saltear no cuenta: saltear es no haberlo mirado). Desde ahí también se manda **otro pedido** al mismo contacto sin salir. En el celular, ítem y contacto son pestañas con barra abajo.

## Aprobar es hacer, Audios es la cola de Gemini (2026-09-05)

Tres cosas que salieron de mirar la base: 24 filas `approved` (18 pre-descartes, 6 responsables) llevaban semanas esperando a que "alguien" las ejecutara, porque el servidor no sabía; la vista Audios arrancaba en "Sin transcribir" —los audios que NO estaban en la cola— mientras la cola real de Gemini (660 `queued`) vivía en una pestaña; y "quitar de la cola" borraba la ficha, así que el cron de la noche volvía a encolar el audio.

**1. Aprobar ejecuta.** `SERVER_EXECUTABLE_KINDS` (`shared/taxonomy.ts`) dice qué se hace solo: envío, programado, tarea, demo, pre-descarte, descarte, responsable y llamada. `POST /queue/{batchId}/approve` acepta `execute` (default true en la UI) y corre `executeApprovedBatch` en el mismo request sobre las filas recién aprobadas; devuelve `execution` fila por fila. `execute.ts` suma `mark_pre_descarte` / `mark_descarte` (→ `setManualOverride`, versión `manual_override` firmada por quien aprobó; descarte fuerza GX), `assign_owner` (→ `transferLead`) y `schedule_call` (→ evento `call` del Calendario, mañana a las 10 si no hay hora, vinculado al contacto). **Queda afuera `register_sale`**: es plata y el importe lo confirma una persona en Finanzas. El botón de la Cola dice lo que va a pasar ("Aprobar y programar 7", "Aprobar y enviar 3"); el envío directo es el único que pide confirmación. "Ejecutar" sigue para lo que quedó `approved` sin salir (los 24 viejos, fallas). La tool `whatspro_sales_queue_approve` tiene el mismo `execute`, apagado por defecto.

**2. Correcciones de CRM en la Cola.** `GET /crm-fixes` (`listCrmFixes`) lista los `crm_fix` sin aplicar; la Cola los muestra en "En revisión" como tipo **CRM** (`ui/cola/CrmFixItem.tsx`, también en el Focus violeta) con exactamente qué va a cambiar, **Aplicar al CRM** (misma ruta que la ficha) y **Descartar** (`DELETE …/crm/apply` → `dismissCrmFix`). De a un contacto, nunca en lote.

**3. "Ejecutar ahora" programa y corrige CRM sin conector.** El motor (`server/focus.ts`) pasó de dos a cuatro salidas: `texto`, `programar` (texto + `cuando` en hora local `YYYY-MM-DDTHH:mm`, que baja al editor de programados con la fecha puesta), `crm` (propuesta validada contra el catálogo del equipo con `validarFix`; la barra la muestra y **Aplicar al CRM** la manda a `POST …/crm/apply` con `{fix}` en el body, mismo aplicador) y `conector`. La IA propone; aplicar es de la persona. `scripts/smoke-focus-directo.mts` prueba la fecha y el catálogo sin gastar cuota; `smoke-focus-ia.mts` tiene los casos nuevos pero el 2026-09-05 no se pudo correr: key del equipo y banco en 429.

**4. Audios = cola de Gemini.** `estado=en_cola` (default) es EXACTAMENTE lo que `proximosDeLaCola` va a tomar —`queued` más `failed` con intentos— y viene en su mismo ORDER BY (prioridad → frente comercial → antigüedad): la posición en pantalla es la posición real. Arriba, `resumenAudios`: cuántos esperan, minutos, cuota restante del banco y conteos por pestaña. **Sacar deja la ficha en `status = 'skipped'`** en vez de borrarla: `encolarAudios` no re-inserta filas existentes y el worker sólo toma queued/failed, así que el cron ya no lo repone; pestaña "Quitados" para revertir. `POST /audios {action:'dequeue_chat'|'queue_chat', chatId}` actúa sobre todos los del contacto; `reencolar` reabre una ficha quitada/fallida en vez de saltearla.

## Cola de audios repartida en el tiempo, reserva de cuota y hora argentina (2026-09-05, tarde)

Lo que mostraron los datos: 173 audios con prioridad 10 en la cola eran de **clientes ya cerrados** (G11), puestos ahí por el clasificador (`classifyChat` encolaba con `priority: 10`); el rendimiento real es ~50 audios/día porque el banco lo comparten el worker, el clasificador y lo manual, y el 2026-09-05 el clasificador consumió los 2.600 pedidos antes de que nadie pudiera transcribir a mano; y los programados diarios/semanales se calculaban con `setHours` en hora del **servidor (UTC)**: "todos los días a las 10" salía a las 7 de Argentina.

1. **Prioridad.** Migración `0107` puso en 0 los 185 audios con prioridad automática (se conserva la de `requested_by = 'ui'`); el clasificador encola con 0. La prioridad queda como palanca manual: **Primero (10) · Adelante (5) · Normal (0) · Al final (−1)**, por contacto (`POST /audios {action:'priority_chat'}`) o por audio.
2. **Bloques de trabajo** (migración `0106`: tabla `team_audio_blocks` + `message_audio_insights.block_id`). Un bloque tiene estado (activo/pausa), posición, `not_before` (día desde el que se drena) y `daily_cap` (tope de hechos por día). La regla "se drena hoy" vive en `condicionDeBloqueActivo()` (lib/audio-insights.ts) y la comparten el worker y la vista; el orden único es `ORDEN_DE_LA_COLA`: prioridad → posición del bloque (sin bloque primero: es lo recién encolado) → frente comercial → antigüedad. `sugerirBloques` arma cinco por frente comercial y reparte lo que no tiene bloque: **Dinero abierto** (activo, sin tope), **Oportunidades** (activo, 40/día), **Sin clasificar** (activo, 30/día), **Clientes G11** (pausa, 20/día al activar), **Perdidos y descartados** (pausa). Aplicado al equipo 2 el 2026-09-05. CRUD en `server/audio-blocks.ts` y `/api/plugins/sales-ops/audios/blocks`.
3. **Reserva del banco.** Setting `reservaDiariaPct` del plugin Gemini (default 30 %). `cuotaAutomatica()` en `lib/gemini/key-bank.ts` resta la reserva del total diario; `elegirKey(..., { automatico: true })` devuelve `null` cuando lo que queda es la reserva. Lo respetan el worker de audios (`runAudioInsightsBatch` → `keysConCuota(automatico)` y `transcribirAudio(automatico)`) y el clasificador por cron (`runServerAi` con `automatico: userId == null`, y el gate del cron). Lo manual (Transcribir ahora, Ejecutar ahora, análisis puntual) usa el banco hasta el final. Editable desde la cabecera de Audios.
4. **Pedir a una persona.** `pedirAHumano` (`server/audios.ts`): los audios salen de la cola (`skipped` con "Pedido a Noelia"), se crea una tarea vinculada al contacto y **asignada** (`audioHumanoUserId` en settings; default Noelia por nombre, si no el primer owner) con los enlaces de los audios y el atajo `?vista=audios&estado=quitados&contacto=`, y se despacha un aviso (`notify`, in-app + push). La ficha se escribe a mano en la tarjeta del audio.
5. **Hora del negocio.** Módulo nuevo `lib/time/zona.ts` (`ZONA_NEGOCIO`, `desdeZona`, `partesEnZona`, `parsearLocal`, `aLocal`, `proximoHorarioFuturo`). `computeNextRunAt` calcula diarios y semanales en esa zona y tiene `afterRun` para el cron, que perdió su copia en UTC. Las rutas de programados rechazan un "una vez" con hora pasada (`422 past_schedule` + `sugerencia`): saldría en la próxima corrida del cron. El editor de programados ofrece el horario sugerido de un botón; el motor del Focus corre una fecha pasada al próximo horario con sentido y lo dice (`cuandoValido` devuelve `{when, ajustado, aviso}`); `schedule_call` y los defaults "mañana a las 10" usan la zona. Verificado en `scripts/smoke-focus-directo.mts` (16 chequeos).

## Hora del negocio también en las pantallas, y "Lo hice a mano" (2026-09-05, noche)

Las pantallas seguían dependiendo del reloj del **navegador**: `fmtDateTime` sin `timeZone`, `datetime-local` convertido con `new Date(local)`/`getTimezoneOffset`, el calendario de Programados agrupando por `getDate()`. Con una persona en Argentina no se notaba; con una IA que maneja Chrome (corre en UTC) todo salía tres horas corrido, y la app de Programados mostraba la hora UTC al editar (`toISOString().slice(0,16)`). Ahora `lib/time/zona.ts` también se usa del lado del cliente: `fmtDate*` y `formatDate` llevan `timeZone: ZONA_NEGOCIO`; los `datetime-local` se llenan con `aLocal()` y se leen con `parsearLocal()` (editor de programados de la ficha, tarjeta de Programados, Nuevo lote, Proponer acción, app Programados); `claveDia` es el día del negocio y `diasOcupados` recorre días como strings; las fechas construidas para recorrer días van a mediodía.

**Lo hice a mano** (`ui/cola/HechoAMano.tsx`): una corrida que espera conector (o falló, o pide criterio) se cierra desde la Cola o el Focus violeta con una línea de qué se hizo → `PATCH /prompts/queue/{id} {status:'completed', summary, manual:true}` → `connector: 'manual'` + `metadata.hechoAMano`. Es para quien está mirando el chat y los programados al lado —persona o IA que usa el navegador— y resuelve el pedido sin conector: sale de `whatspro_sales_work_queue` al instante y queda en Hechos. Las filas de lote ya tenían "Lo mandé a mano"; CRM y programados se aplican directo.

## Producción OS — 2026-09-06

Al entrar a **Producción dentro del Command Center** aparece la vista histórica como antes y un selector permite alternar, sin salir de la aplicación, a **Producción OS**. La nueva vista reúne demos, producción vendida y cambios en una cola priorizada con Focus, responsables, checklist, vencimientos, bloqueo por espera del cliente y enlace obligatorio para entregar. Tareas sigue siendo la fuente de datos y el tablero detallado, pero Producción OS no aparece como sección propia en su navegación.

El botón **Focus de producción** abre una estación de pantalla completa sobre todos los trabajos abiertos, aunque la lista anterior estuviera filtrada. Permite alternar Todos / Demos / Clientes, recorrer proyectos con flechas y trabajar en bloques persistentes de 25 minutos con pausa y descanso de 5. En el mismo lugar se actualizan responsable, checklist y estado; el panel contextual precarga **Chat, Audios, Archivos, Links y CRM**, admite varios contactos vinculados y combina documentos de la conversación con adjuntos del cliente. El chat completo y el tablero siguen a un clic cuando hace falta más espacio.

La migración `0108_produccion_os.sql` agrega a la tarea `work_kind`, `work_status`, `requested_by`, `delivery_url` y `blocked_reason`, y clasifica el trabajo existente sin crear una segunda tabla. El estado operativo se sincroniza con el estado genérico de Tareas. En el equipo 2 se repararon **206 divergencias** detectadas y la comprobación posterior quedó en **0**.

Las rutas `/api/plugins/tasks/production` usan `tasksRead/tasksWrite`, validan que proyecto, columna, responsable, contacto y cliente pertenezcan al equipo, controlan transiciones y auditan altas/cambios. La vista de Producción del Command Center exige además permiso de Tareas; los permisos efectivos ahora pasan por `hasPermission`, por lo que roles antiguos conservan el preset aunque su JSON no tenga claves nuevas. Los conectores suman `whatspro_production_list`, `_create` y `_update`, con idempotencia al crear.

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
| 6 Ejecución aprobada desde el servidor | ✅ 2026-09-05 (aprobar ejecuta; `register_sale` sigue manual) |
| 7 Leads nuevos | ⏳ |
| 8 Focus (bloques de 25 min) | ✅ 2026-09-05 · doc `08-FOCUS.md` |
| 9 CRM corregible por la IA (`crm_fix`, migración 0104) | ✅ 2026-09-05 |
| 10 Focus de supervisión en la Cola | ✅ 2026-09-05 |
| 11 Banco de keys arreglado (migración 0105) | ✅ 2026-09-05 |
| 12 Acciones preestablecidas + panel de contacto | ✅ 2026-09-05 |
| 13 Aprobar ejecuta (kinds nuevos en el servidor) + CRM en la Cola | ✅ 2026-09-05 |
| 14 Motor Focus: programar y CRM sin conector | ✅ 2026-09-05 (IA sin probar: 429) |
| 15 Audios = cola de Gemini, quitar persistente | ✅ 2026-09-05 |
| 16 Bloques de audios + reserva del banco + pedir a una persona (migraciones 0106/0107) | ✅ 2026-09-05 |
| 17 Hora del negocio en programados (`lib/time/zona.ts`) + horario pasado → sugerencia | ✅ 2026-09-05 |
| 18 Hora del negocio en las pantallas + "Lo hice a mano" para corridas | ✅ 2026-09-05 |
| 19 Producción OS (migración 0108, cola + Focus + API + conectores) | ✅ 2026-09-06 |

## Relación con otros trabajos en curso

- **Seguimiento** (`docs/seguimiento/`): comparte el chat embebido (`ChatEmbebido`) y el panel lateral; la ficha del Command Center en escritorio reutiliza ese panel. Numeración de migraciones: la que se aplique primero toma `0095`.
- **Centro de Comandos del Escritorio** (`docs/escritorio-pulze/10-CENTRO-DE-COMANDOS.md`): motor de ejecución reutilizado en Fase 6; no se modifica su pantalla.
- **Radar** (`docs/radar/`): fuente de los 81 análisis previos y de los gráficos de Métricas.
- **Conectores** (`docs/conectores/ACCIONES-MCP.md`, `SKILLS-OPERATIVAS.md`): las tools `whatspro_sales_*` se registran con el patrón de `radar-actions.ts` y entran en `PRIORITY_TOOLS`.

## Auditoría integral y cobros desde la Cola (2026-09-06)

Cinco auditorías de sólo lectura (flujo Cola/Focus, definición de cliente, contradicciones en instrucciones, finanzas por MCP, salud operativa) y una tanda de correcciones. Los informes completos quedaron en `docs/command-center-comercial/AUDITORIA-2026-09-06.md`. Lo hecho, verificado con `tsc` en verde, `verify-connector-tools` (277 tools) y `scripts/smoke-cobros.mts`:

**1. Cobros = un solo camino (`server/cobros.ts`, `registrarCobro`).** Venta pagada (`team_sales` con contacto + cliente) o cobro contra venta/asiento pendiente, asiento de ingreso + pago en Finanzas (centavos; el importe entra en UNIDADES y se parsea con `parsearImporte`: "50.000", "45,5", "$ 200.000"), contacto vinculado como cliente (`convertContactToCustomer`), análisis a G11 · cliente (`setManualOverride` firmado), propuestas abiertas del chat canceladas, comprobante del chat colgado del asiento (`team_financial_receipts`), auditoría `SALES_OPS_COBRO_REGISTRADO` (familia **cobro** en historial y Muro). Idempotente por clave. Entradas: `register_sale` aprobado en la Cola (**ahora en `SERVER_EXECUTABLE_KINDS`**: aprobar registra; payload `extra {amount, currency, method, paidOn, concept, saleId|entryId, receiptMessageId}`), `POST /contacts/{chatId}/cobros` (GET = deuda), tools MCP `whatspro_sales_register_payment` y `whatspro_sales_contact_money` (`tools/cobros-tools.ts`, exigen `financeWrite`), acción **Cobro** del Focus (`acciones.ts`). El radar detecta avisos de pago ("ya transferí", "pagué", "listo el pago", comprobante) y **propone sola** la fila `register_sale` con el precio cotizado del análisis; una persona confirma el importe al aprobar.

**2. Bugs de flujo corregidos:** `payload.extra` no existía (proposeBatch lo aplanaba; execute.ts lo leía anidado → llamada sin hora, pre-descarte sin motivo): ahora va de las dos formas y `extraDe()` lee ambas. "Ejecutar N" ejecutaba 25 (ruta `execute` → 200). `countConnectorPending` contaba corridas sin aprobar. `whatspro_register_sale` sin `create_entry` no era idempotente y no seteaba `customer_id`/`paid_at`; su descripción decía "200.000 ARS son 200000" (son 20000000: Finanzas es en centavos — **los asientos 185/186/187 del equipo 2 están en pesos, 100× menos: corregirlos a mano**). `whatspro_sales_queue_approve` ahora ejecuta por defecto (`execute:false` para dejarlo al conector). Reglas de `work-queue.ts`: cobros, `blocked`+`human_request`, `customer_replied` como `failed` (la tool no acepta `skipped`), ids del `crmCatalog`. Textos obsoletos ("aprobar no envía", "no tocar el CRM", "cuatro tipos") corregidos en queue-tools, manage-tools, work-tools, instrucciones del servidor MCP, seed de skills `qa.*` (REGLAS nuevas; **falta re-sembrar**: `npx tsx scripts/seed-sales-ops-quick-actions.ts`).

**3. Focus alineados (parcial, agente cortado por límite de sesión):** `RevisarLote` distingue `onDecidido` (aprobar/rechazar) de `onChanged`; estado `supervisado` en `ColaLateral`; `relaunchRun` guarda `metadata.relaunchedAs`; `BarraPrompt` recibe `onEjecutado`; `ChipsAtajos.tsx` y `useAtajosTeclado.ts` extraídos. Pendiente: verificar en pantalla (ver AUDITORIA §A3/A4/B1) y usar `ChipsAtajos`/`tituloDePedido` desde `BarraPrompt`.

**4. Cliente canónico (parcial):** `lib/customers/es-cliente.ts` (`resolverCliente`/`resolverClientes`, precedencia vínculo → suscripción activa → venta pagada → teléfono; `custom_data`/etiqueta/etapa = evidencia débil) usado por `dossier.ts`, `rules.ts`, `classifier.ts`, `fingerprint.ts` y `cliente-hook.ts`. Pendiente: `queries.ts` (ícono de listas), `by-contact` route, UI (`ContactRow`/`FichaView`/`PanelResumen`/`ClienteYMembresia`), smoke `scripts/smoke-es-cliente.mts` y `vincularSiCoincide` sobre los 3 contactos por teléfono.

**5. Salud:** banco Gemini con día de Google (`diaDeGoogle`, `America/Los_Angeles`), `limit_rpd` 20 (13 keys) y contadores liberados; check **"Usar Gemini para transcribir audios"** (`transcribirAudios` en settings del plugin Gemini; el worker devuelve `skipped: transcripcion_desactivada`; falta el check en la cabecera de la vista Audios); motor de automatizaciones cierra sesiones de flujos desactivados o con más de 14 días sin movimiento (`SESSION_MAX_IDLE_DAYS`; 212 sesiones cerradas en la base, quedó 1 activa); línea muerta del crontab (`/api/cron?secret`, 404 cada 5 min) eliminada (backup en `/root/crontab.backup-2026-09-06`). Pendiente: `meta-ads-sync` sin env + token de Meta vencido; `docker builder prune`; `pm2-logrotate`; corridas `queued` de más de 72 h en housekeeping; v2 de `sales-ops.classify` en `team_prompts` (la v1 activa no tiene `crm_fix` en el contrato; el server lo compensa con `composeClassifySystem`, el conector no).

**6. Producción OS (hecho con ChatGPT en paralelo, verificado):** migración `0108_produccion_os` aplicada y en el journal (`work_kind`, `work_status`, `requested_by`, `delivery_url`, `blocked_reason` sobre `team_task_items`, con relleno desde los títulos: 379 tareas tipadas), `lib/plugins/tasks/shared/produccion.ts` (12 tipos de trabajo, 7 estados con transiciones), `server/production-os.ts`, rutas `api/plugins/tasks/production[/id][/execute]`, vistas `ProduccionOS.tsx` y `ProductionFocusView.tsx` en `tasks/ui-nueva/views`, enganchadas desde el Command Center (Producción › vista "os" + botón **Focus de producción**). Plan y pendientes en `docs/produccion/00-PLAN.md`. Backup del diseño de Tareas OS: tag `tareas-os-diseno-2026-09-06` + `/root/backups/tareas-os-ui-nueva-2026-09-06.tar.gz`.

| Fase | Estado |
|---|---|
| 19 Cobros desde la Cola/Focus/MCP + radar de pagos | ✅ 2026-09-06 |
| 20 Auditoría de flujo, instrucciones y salud (correcciones) | ✅ parcial 2026-09-06 (pendientes arriba) |
| 21 Cliente canónico `resolverCliente` | ⏳ motor hecho; listas/UI/smoke pendientes |
| 22 Producción OS | ⏳ base hecha; plan en `docs/produccion/` |

**Tanda 2 del 2026-09-06 (desplegada):** skills `qa.*` re-sembradas (v2, REGLAS nuevas) y `sales-ops.classify` v2 con `crm_fix` (`scripts/upgrade-sales-ops-classify-prompt.mts`); `crmCatalog` en prompts y acciones; housekeeping cancela corridas `queued` sin conector a las 72 h (`expirarCorridasSinConector`); Producción OS enganchado en Tareas OS (nav `produccion`, ícono fábrica en el pie del sidebar, abre la tarea desde la ficha); `pm2-logrotate` instalado. **Plan de ejecución detallado para la próxima sesión: `docs/produccion/01-PLAN-PARA-OPUS.md`.**

## Tanda 3 del 2026-09-06: la cola de producción y los pendientes de la auditoría

**Producción OS deja de ser sólo una pantalla.** `lib/plugins/tasks/server/production-work-queue.ts` es la cola de producción para conectores, hermana de `sales-ops/server/work-queue.ts`: devuelve lo que espera a producción (`pedido`, `aceptado`, `cambios`, y lo `en_curso` de quien pregunta), ordenado demos → cambios → producción, y cada pedido viene con **la cadena exacta de tools de su tipo** — `CADENA_POR_TIPO` en `tasks/shared/produccion.ts`, porque los productos de AAPP SPACE no se convierten entre sí y elegir mal obliga a rehacer el trabajo entero. Tools nuevas `whatspro_production_work_queue` y `whatspro_production_get` (`tasks/tools/production-tools.ts`, agregador `grok-connector/server/production-actions.ts`, en `PRIORITY_TOOLS`); las de escritura (`whatspro_production_list/_create/_update`) ya vivían en `sales-ops/tools/tareas-tools.ts` y **no se duplicaron**. Federada en `whatspro_work_queue` como cuarta fuente (`production`), con sus nueve reglas propias. 279 tools MCP sin duplicados. Smoke: `scripts/smoke-production-queue.mts` — 51 pedidos reales del equipo 2 (10 demos, 38 de producción, 3 cambios), con los dos frenos probados contra la base (no se entrega sin enlace, no se salta de `pedido` a `entregado`).

**Y del Bloque B de la auditoría:** Nuevo lote pide responsable y fecha para `assign_owner` y `schedule_call` (sin eso, aprobar fallaba fila por fila); un solo mapa de etiquetas (`components/format.ts`, con `verboEjecutado(kind)`, y `cola/api.ts` lo re-exporta); el Focus tiene **quinta salida `cobro`** en "Ejecutar ahora" (`validarCobro` en `server/focus.ts`, tarjeta verde con el importe formateado y botón "Registrar cobro" → `POST /contacts/{chatId}/cobros`; la IA propone, la persona confirma); `BarraPrompt` usa `ChipsAtajos` y `tituloDePedido`, los mismos que el Focus de supervisión; eventos de Pusher recortados antes de mandarlos (un mensaje largo daba 413 y no llegaba nunca: ahora llega recortado con `truncated: true` y la base tiene el texto completo); `meta-ads-sync` re-registrado en PM2 con `CRON_SECRET` y `APP_URL` (el token de Meta sigue vencido: hay que renovarlo con un System User); docs 05 y 07 sin los textos de "aprobar no envía" y del `idempotency_key` viejo.

| Fase | Estado |
|---|---|
| 23 Cola de producción para conectores + federación | ✅ 2026-09-06 |
| 24 Focus comercial: modo cobro | ✅ 2026-09-06 |
| 25 Pendientes B1–B7, B12–B14 de la auditoría | ✅ 2026-09-06 |

## Tanda 4 del 2026-09-07: cobranzas que no esconden nada y el seed que dejó de versionar al pedo

**Tres asientos del equipo 2 estaban cargados en pesos y no en centavos** (185 Sur Bohemio, 186 y 187 Raul Maurel / Mauben Travel): se veían 100 veces más chicos que el resto. Confirmados con el usuario contra los comprobantes —Sur Bohemio $40.000, Mauben $200.000 = seña $100.000 + saldo $100.000, todo cobrado— y corregidos con `UPDATE … SET amount = amount * 100 WHERE team_id = 2 AND id IN (185,186,187)`. La mínima de los ingresos pagos del equipo pasó de 40.000 a un número sano.

**Las suscripciones canceladas e impagas dejaron de desaparecer.** `listCustomersPendingPayment` las excluía a propósito —un servicio dado de baja y nunca cobrado no es plata que vaya a entrar— pero el efecto era que nadie las veía nunca. Ahora son un **cuarto grupo aparte**: `sources.subscriptionsCancelled`, `cancelledCount` y `cancelledByCurrency`, **fuera de `totalsByCurrency`** (no inflan lo que el equipo cree que va a cobrar) y sin fecha de vencimiento (una baja no vence, se procesa). En `ListaClientes.tsx` aparecen en gris y tachadas, con el rótulo «N canceladas pendientes de proceso». Hoy el equipo 2 tiene 0, así que la pantalla no cambia todavía. `whatspro_customers_pending_payment` avisa la diferencia en su `note`.

**Y el rótulo que mentía:** la lista decía «N ventas sin cobrar» sobre un número que desde la tanda anterior suma ventas + asientos de Finanzas + suscripciones. Ahora dice «N pendientes de cobro» y el detalle por fuente va en el tooltip.

**`scripts/seed-sales-ops-quick-actions.ts` ya es idempotente.** Comparaba la huella con `JSON.stringify` a secas contra columnas `jsonb` que Postgres reordena, así que cada corrida retiraba las 12 skills `qa.*` y creaba 12 versiones nuevas aunque no hubiera cambiado una coma. Se copió `estable()` de `seed-production-skills.ts` (claves ordenadas, round-trip primero). Verificado: **0 versiones nuevas, 12 sin cambios**.

Sin tocar, con motivo: el reloj doble de `Enfoque.tsx` (es un rediseño, no un arreglo) y la doble aprobación de la acción «Mensaje» del Focus (B15: un mensaje a un cliente es lo único que conviene mirar dos veces). El token de Meta sigue vencido por pedido del usuario.

| Fase | Estado |
|---|---|
| 26 Cobranzas: canceladas pendientes de proceso + rótulo real | ✅ 2026-09-07 |
| 27 Asientos 185/186/187 en centavos | ✅ 2026-09-07 |

## Tanda 5 del 2026-09-07: un solo reloj, los demos con su enlace y el plan AAPP BUSINESS

**Un solo reloj de 25 minutos en Tareas OS.** `Enfoque.tsx` tenía un `useState` que se perdía al cerrar la pantalla y Producción tenía `useBloqueProduccion` en localStorage: dos cronómetros que no se conocían. Ahora `Enfoque` usa el mismo hook con la misma clave (`sales-ops:focus:bloque-produccion`): arrancar en uno se ve en el otro, pausar pausa los dos, y el bloque sobrevive a cerrar el Enfoque o recargar. Los segundos se dibujan en la vista (el hook sólo agenda el vencimiento, como en Producción). La duración editable es la del PRÓXIMO bloque; el que corre no se toca. `data-testid="enfoque-reloj"` con `data-estado` para una IA con navegador.

**12 de 15 pedidos de demo estaban «PUBLICADA» en el título y con `delivery_url` vacío.** Los 12 demos HTML del 06/09 en aapp.space (ids 569–579) nunca se enlazaron al pedido. Se cruzaron por nombre (exacto e inequívoco) y se escribió el enlace, sin tocar el estado. Quedan 3 (Dr. Soto `entregado` sin URL, Psicopedagogía en AAPP PRO, M3 con el título cortado) y un HTML sin pedido (`clasicourbanodemo`, demo Brian).

**Plan `docs/produccion/02-PLAN-AAPP-BUSINESS.md`**, a partir de los cinco HTML operativos (Catálogo v1.2, Protocolo SPACE, Protocolo BUSINESS, Radiografía, Mapa Maestro). El dato clave que falta para gestionar la empresa según sus propios documentos: **horas reales por pedido y ticket → US$/h** (línea roja: >6 h con <US$250), que Producción OS no guarda en ninguna columna. Además: ficha de handoff estructurada, gate de pago antes de aceptar, rondas de revisión contadas, catálogo de productos en código con `catalog_key`, `qa` y `activado` como estados, CAZA/PILOTO/TORRE como tipos de trabajo. Y un dato sucio grande: **205 `desarrollo` en `en_curso`** (importación de proyectos de clientes) contra un WIP máximo de 3.

| Fase | Estado |
|---|---|
| 28 Reloj unificado Enfoque/Producción | ✅ 2026-09-07 |
| 29 Enlaces de los demos publicados | ✅ 12/15 · 2026-09-07 |
| 30 Horas + ticket + handoff + catálogo (plan 02) | ⏳ planificado, listo para ejecutar |

## Tanda 6 del 2026-09-07: horas, ticket y las tres reglas del protocolo (plan 02 ejecutado)

Se ejecutó `docs/produccion/02-PLAN-AAPP-BUSINESS.md` entero salvo la reparación de datos (§3), que es decisión del usuario. **Migración 0109**: ticket, estimado, rondas, estado del pago, ficha de handoff y `catalog_key` sobre la tarea; `team_task_work_sessions` para las horas reales. **Las tres reglas** (`shared/produccion.ts`, sólo sobre lo vendido): sin pago no hay cola (`pedido→aceptado`), sin handoff no arranca (`aceptado→en_curso`), QA antes de entregar (`en_curso→qa→entregado`); estados nuevos `qa` y `activado`; rondas contadas y «Extra = presupuesto». **Catálogo en código** con el Evaluador (US$/h, línea roja >6 h con <US$250, ARS 1.530 = US$1 al 04/09, vigente hasta el 04/10). CAZA/PILOTO/TORRE como tipos de trabajo con sus checklists. El reloj de 25 min escribe sesiones sobre el pedido abierto. Pantallas: KPI WIP n/3, chips de horas y US$/h, bloque Ticket y pago · Handoff · Tiempo. Tools `whatspro_catalog_list` y `whatspro_production_log_time` (281). Smoke de 22 chequeos en verde. Dry-run de `repair-produccion-desarrollo.mts`: 0 automáticos, **235 a decidir a mano**.

**Terminales del admin** (pedido del usuario, plan «Developer Command Center» de Documentos): Fase 1–3 implementadas, sólo `noelia@whatspro.uno`. Detalle y modelo de seguridad en `docs/developer-command-center/00-ESTADO.md`.

| Fase | Estado |
|---|---|
| 31 Horas reales por pedido + sesiones del reloj | ✅ 2026-09-07 |
| 32 Gates de pago/handoff/QA + estados `qa`/`activado` + rondas | ✅ 2026-09-07 |
| 33 Catálogo en código + CAZA/PILOTO/TORRE + Evaluador | ✅ 2026-09-07 |
| 34 Reparación de los 235 «desarrollo» en curso | ⏳ script listo, dry-run corrido, falta decisión |
| 35 Terminales del admin (Developer Command Center F1–F3) | ✅ 2026-09-07 · falta arrancar el gateway con PM2 (comando en el doc) |
