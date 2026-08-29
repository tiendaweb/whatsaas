# A · Diagnóstico de la infraestructura actual

Relevado el 2026-08-29 sobre el código de WhatsPro (rama `feat/tareas-rediseno`) y la base del equipo 2. Cada fila dice si sirve **tal cual**, **con adaptación** o **no sirve** para el Command Center.

## 1. Lo que ya existe y se reutiliza

### 1.1 Motor de ejecución con aprobación — Centro de Comandos del Escritorio

`lib/desktop/command-center/` (1.511 líneas). Es **exactamente** la "cola de ejecución" pedida, ya construida y endurecida:

| Pieza | Dónde | Qué da |
|---|---|---|
| `executeCommandBatch(ctx, {batchId, actions, validation})` | `execute.ts:43` | Valida o ejecuta un lote. Separa acciones reversibles de envíos. **Un envío por request**, `confirm: 'EJECUTAR'` literal, idempotencia derivada por el servidor (`'cc:' + sha256(batchId:chatId)`), distingue `send_failed` de `send_unknown` (timeout: no reintenta, enlaza al chat). Audita en `activity_logs` con `action = 'DESKTOP_COMMAND_BATCH'`. |
| Rutas `/api/escritorio/bandeja/{validar,ejecutar,sugerencias}` | `app/api/escritorio/bandeja/*` | `/validar` y `/ejecutar` son rutas físicas distintas (fail-closed). |
| `getSuggestionsForItems()` | `suggestions.ts:95` | Caché por `fingerprint` en `team_command_suggestions`, reserva `pending` con TTL 30 min, concurrencia 3, caída a plantillas sin IA, **prompt anti-inyección** (mensajes del cliente entre marcadores como datos), `detectUnverifiedClaims` (importes/fechas que no están en el contexto → aviso rojo), `needsEdit` por variables sin resolver. |
| `chatScope(ctx)` / `resolveScopedChats(ctx, ids)` | `lib/desktop/scope.ts:21,43` | Visibilidad canónica de chats. El destinatario **nunca** viene del cliente. |
| UI `components/escritorio/command/*` | `CommandCenter.tsx`, `ReviewDialog.tsx`, `useCommandPlan.ts` | Selección → plan derivado → revisión con destinatario enmascarado y checkbox "revisado" por envío → resultado. Barra de acción sticky abajo, pensada para móvil. |

**Veredicto: tal cual** para la Fase 6 (ejecución). Sólo hay que sumar un `kind` nuevo (`commercial`) al contrato `types.ts:3` y a la regex `schema.ts:38`, y una acción `create-task-with-date`.

### 1.2 Lo que hace falta para leer un chat entero

| Pieza | Dónde | Sirve |
|---|---|---|
| `messages` (`fromMe`, `isAi`, `isAutomation`, `isInternal`, `messageType`, `status`, `timestamp`, índice `(chatId, timestamp)`) | `lib/db/schema.ts:368-407` | **Tal cual.** Matriz: `fromMe=false` cliente · `fromMe && isAi` IA · `fromMe && isAutomation` flujo · `fromMe` y nada más = humano · `isInternal` nota que el cliente nunca vio. |
| `chats.lastCustomerInteraction`, `lastMessageFromMe`, `unreadCount`, `automationDisabled` | `schema.ts:329-366` | **Tal cual** para silencio y "quién habló último" sin escanear mensajes. |
| `message_audio_insights` (`transcript`, `intent`, `urgency`, `sentiment`, `entities`, `actionItems`) | `schema.ts:450-501` | **Tal cual** cuando existe la ficha; 874 en cola. |
| `conversation_ai_summaries` (un resumen por chat) | `schema.ts:409-432` | Con adaptación: caché del contexto que va al clasificador. |
| `automation_sessions.status = 'active'` + `chats.automationDisabled` | `schema.ts:1058-1079` | **Tal cual** para el flag "flujo vivo, no ofrecer acción". |
| `lib/contacts/graph.ts` → `getContactCommercialSnapshot(teamId, scope, sections)` | `graph.ts:521` | **Tal cual**: deal abierto, plata pendiente/cobrada por moneda, próxima cita, suscripciones, contactos hermanos del mismo cliente. |
| `readOnlyResources` (`chats`, `messages`, `audio-insights`, `automation-sessions`, `contacts`, `tags`, `funnel-stages`…) | `lib/readonly-api/catalog.ts:244` | **Tal cual** desde el conector (`whatspro_list_records` / `get_record`). Exponer una tabla nueva es una línea. |

### 1.3 Clasificación IA de contactos — Radar ya lo hace

`whatspro_radar_save_analysis` (`lib/plugins/grok-connector/server/radar-actions.ts:530`, impl. `saveAnalysis` L1727) guarda en una llamada `score`, `prioridad` (P1/P2/P3/descartado/Revisar), `intencion`, `objecion`, `recuperabilidad`, `confianza`, `estrategia`, `oportunidad_2`, `fecha_analisis` en `contacts.customData.radar_*` + nota interna `🎯 RADAR` + widget opcional. Hay **81 contactos analizados** así.

**Veredicto: con adaptación.** La taxonomía cambia (P1–P3 → G0–GX con etapa máxima, etapa de caída y motivo), y **el destino cambia**: durante la misión no se escribe en `customData` del contacto (regla "no tocar CRM"); se escribe en la tabla propia. Los 81 análisis existentes se importan como hipótesis previa con fecha.

También reutilizable de Radar: `team_radar_insights` (`schema.ts:5449`: hallazgo con `severity`, `confidence`, `evidence`, `recommendedAction`, ciclo `new→seen→accepted→dismissed→resolved`) como **modelo** de las señales del radar de respuestas, y el motor de datos read-only `lib/plugins/radar/server/engine/data.ts` (whitelist de campos, sin SQL libre) para dashboards: agregar la tabla nueva como *source* son ~40 líneas.

### 1.4 IA del servidor

| Pieza | Dónde | Sirve |
|---|---|---|
| `generateStructuredObjectForTeam<T>({teamId, schema (zod), systemPrompt, userPrompt, temperature})` | `lib/plugins/ai-chat/server/structured-output.ts:24` | **Tal cual** para que el clasificador devuelva JSON tipado. Usa `ai_configs` del equipo (hoy: Gemini, `is_active = false` — la bandera sólo apaga el agente del chat, no bloquea esto). |
| Banco de keys Gemini: `elegirKey`, `analizarTextoConBanco({teamId, prompt})`, `capacidadDelBanco` | `lib/gemini/key-bank.ts:196, 401, 219` | **Tal cual** para lotes; rota keys, respeta 20 req/día/key, detecta modelo retirado. **Techo: ~140 llamadas/día.** |
| Patrón cron + cola en tabla (`status`, `priority`, `queuedAt`) drenada por `/api/cron/audio-insights` (`maxDuration 300`, `?limit`, `?team`) + wrapper `scripts/audio-insights.js` en PM2 | `lib/audio-insights.ts:692`, `app/api/cron/audio-insights/route.ts` | **Tal cual** como patrón del worker de clasificación (no hay BullMQ/Redis y no hace falta). |
| `team_operations_ai_messages` (`surface`) + `lib/operations-ai/service.ts` | `schema.ts:5625` | **Tal cual** como bitácora del Command Center (`surface: 'sales-ops'`). |
| `team_task_ai_runs` (`promptFingerprint`, `promptSnapshot`, `summary`, `connector`) | `schema.ts:5647-5681` | **Patrón** a generalizar para `team_prompt_runs` (Prompt Studio). |

### 1.5 Conector MCP (Claude / ChatGPT / Grok)

- Registro de tools: arrays `xxxReadTools` / `xxxActionTools` + `executeXxxTool` por módulo en `lib/plugins/grok-connector/server/`, concatenados en `app/api/plugins/grok-connector/mcp/route.ts:155-235`. **`PRIORITY_TOOLS` (L250-296)**: ChatGPT sólo carga las primeras N tools; toda tool nueva del Command Center tiene que entrar ahí o el modelo no la ve.
- Ya existen y sirven tal cual: `whatspro_crm_followup_queue` (deuda de respuesta / se enfría, `operations-actions.ts:223`), `whatspro_contact_graph`, `whatspro_customer_360`, `whatspro_customers_pending_payment`, `whatspro_chat_media_list` (con fichas de audio), `whatspro_transcribe_media`, `whatspro_audio_queue_add`, `whatspro_deals_*`, `whatspro_register_sale`, `whatspro_manage_document`, `whatspro_add_internal_note`.
- `docs/conectores/SKILLS-OPERATIVAS.md`: 56 "skills" = cadenas de tools con criterio. La #1 (barrer deuda de respuesta) y la #5 (reactivar a los que se enfrían, *nunca en lote sin aprobación*) son antecedentes directos.
- Tres cosas del conector que no son lo que parecen (memoria del catálogo MCP): los `assertPermission` son decorativos porque el conector está atado a un owner; `whatspro_list_records` no chequea permisos; `chatVisibility` casi no existe en el conector. **Consecuencia:** las tools nuevas del Command Center deben validar `teamId` y scope por su cuenta, no confiar en el resto.

### 1.6 Shell móvil

`components/escritorio/DesktopPage.tsx` (padding inferior para la barra móvil), `DesktopNav.tsx` (píldoras horizontales scrolleables, no un segundo sidebar), `MobileBottomNav.tsx` (ya cubre `/plugins/`), `tokens.ts` (clases literales, Tailwind v4), barra de acción sticky del Centro de Comandos. **Tal cual.**

### 1.7 Datos comerciales existentes

- `team_customer_contacts` (cliente ↔ contacto), `team_sales` (`status`, `paidAt`, `total` en centavos, `idempotencyKey`), `team_deals` (`stage` en `qualified|proposal|negotiation|closed_won|closed_lost`, `value`, `probability`), `team_financial_entries` (`status pending|paid|overdue`, `dueOn`), `team_membership_subscriptions` (`paymentStatus`, `endDate`). Todos con firma `(teamId, …)` en `lib/contacts/graph.ts`.
- `contacts.customData` con claves ya cargadas: `radar_*` (81), `origen_lead` (394), `rubro` (379), `tipo_servicio` (364), `cliente` (212), `monto`, `plan_contratado`, `ciclo_cobro`, `crmReorganization` (675: etapa previa a la reorganización del 27/07 — **es la única memoria de la etapa anterior**).
- `activity_logs` con `action = 'CHANGE_FUNNEL_STAGE'`: rastro parcial de movimientos de etapa.

## 2. Lo que NO existe (y hay que construir o inferir)

| Falta | Consecuencia | Qué se hace |
|---|---|---|
| **Atribución al anuncio** (`externalAdReply`, `referral`, CTWA): el webhook de Evolution no lo lee y no hay columna. | No se puede cerrar anuncio → chat → cobro. | Fase 7: capturar `contextInfo.externalAdReply` en el webhook y guardarlo en la tabla de análisis (`source_ad`). Para el histórico: **inferir** origen por el primer mensaje ("¡Hola! Quiero más información" = anuncio Meta; "Hola! quiero crear mi tienda online profesional" = CTA de sitio) y por `customData.origen_lead`. |
| **Historial de etapas** (cuándo entró/salió de cada etapa). Confesado en `whatspro_crm_funnel_snapshot`: usa `contacts.updated_at`. | "Dónde se detuvo" no sale de datos; sale del chat. | Es la razón de ser del clasificador forense. Se guarda la etapa **máxima alcanzada** y la **de caída** como resultado del análisis, con evidencia (ids de mensajes). |
| **Taxonomía G0–G11/GX** y tabla de clasificación. | — | Documento 03 y 04. |
| **Registro de envíos por destinatario** en `team_scheduled_messages` (sólo `runCount`/`lastError` agregados) y en campañas (`campaign_leads` sin `deliveredAt`/`respondedAt`). | No se puede medir enviados → entregados → respondieron por lote. | Cola propia `team_commercial_actions` con una fila por contacto y `message_id` del envío; el "respondió" se detecta por `messages` posteriores al envío (radar). |
| **Prompt Studio** (biblioteca de prompts versionada). Los prompts viven hardcodeados o dispersos (`ai_configs.systemPrompt`, `teamTask*.aiPrompt`, `messageDrafts.aiMetadata.prompt`). | Cada conector improvisa. | Documento 07: v0 como carpeta de Documentos leíble por `whatspro_documents_search`; v1 tablas `team_prompts` + `team_prompt_runs`. |
| **Cola de trabajos** (BullMQ/Redis). | — | No hace falta: patrón cron + `status/priority/queuedAt` ya probado con audios. |
| **Detección de respuestas automáticas del cliente** (auto-reply de negocios, "Gracias por comunicarte"). | Un auto-reply parece "respondió". | Regla determinística (documento 04 §3). |

## 3. Lo que no sirve para esto

- **`intelligence` plugin**: agregados SQL de stock por etapa y ventas; sin IA, sin historial. Se deja como está.
- **App Maker / mini-apps** para hospedar la capa: jsonb sin índices; con 1.000 chats y filtros por prioridad/gate no rinde. Sirve para prototipar una vista, no para la capa de datos.
- **Campañas (WABA)**: exige plantillas aprobadas y una instancia Cloud API; el equipo opera con Evolution. Los envíos en lote del Command Center van por el motor del Centro de Comandos (uno por request, aprobado) o por `team_scheduled_messages` con `assertMassSendConfirmed`.
- **Automatizaciones** como motor de seguimiento: no hay nodo de follow-up temporal (sólo `delay`), y 205 sesiones activas ya generan ruido. No se activa ninguna en esta fase.
- **Etiquetas `RADAR · P1/P2/P3`** y `radar_*` como verdad: tienen fecha (21/08) y ya se movieron contactos después. Entran como hipótesis.

## J · Qué NO se construye (porque ya existe)

1. Envío de mensajes con idempotencia, scope y auditoría → `executeCommandBatch` + `sendTeamTextMessage`.
2. Sugerencias de respuesta con caché y anti-inyección → `suggestions.ts`.
3. Snapshot comercial de un contacto (deal, plata, cita, suscripción) → `lib/contacts/graph.ts`.
4. Transcripción y análisis de audios → `lib/audio-insights.ts` + banco Gemini + tools `whatspro_transcribe_media` / `audio_queue_add`.
5. Lectura de cualquier tabla desde el conector → `readOnlyResources`.
6. Dashboards de widgets por IA → Radar (`whatspro_radar_upsert_widget`, `radar_query`).
7. Registro de cobros → `whatspro_register_sale` / plugin Ventas; deals → `whatspro_manage_deal`.
8. Tareas con fecha y responsable → plugin Tareas (`whatspro_manage_task`, `whatspro_create_contact_task`).
9. Documentos y carpetas para la planificación y para el Prompt Studio v0 → app Documentos.
10. Bitácora IA compartida entre UI y conectores → `team_operations_ai_messages`.
11. Shell móvil, barra inferior, tokens → Escritorio.
12. Permisos (`messagesRead`, `messagesSend`, `intelligenceRead/Write`, `contacts`) → `lib/permissions.ts`.
