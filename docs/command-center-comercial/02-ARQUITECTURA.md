# B · Arquitectura propuesta

Principio: **integrar, no duplicar.** Todo lo que se agrega vive en un plugin (`sales-ops`), habla con las tablas de WhatsPro sólo para leer, y escribe únicamente en su propia capa. La ejecución (Fase 6) se delega al motor del Centro de Comandos que ya existe.

## 1. Vista general

```
                 ┌──────────────────────────────────────────────────────┐
  Evolution ───► │ WhatsPro (fuente de verdad)                          │
  webhook        │ chats · messages · contacts · tags · funnel · deals  │
                 │ customers · sales · finance · audio_insights         │
                 │ automation_sessions · activity_logs                  │
                 └──────────────┬───────────────────────────────────────┘
                                │ sólo lectura (durante la misión)
                 ┌──────────────▼───────────────────────────────────────┐
                 │ Plugin sales-ops (capa comercial derivada)            │
                 │                                                       │
                 │  AUDITOR    → arma el expediente de un chat           │
                 │  CLASIFICADOR (reglas + IA) → G0..G11/GX + atributos  │
                 │  PRIORIZADOR → P(rec) × valor × velocidad             │
                 │  RADAR      → clasifica cada respuesta nueva          │
                 │  COLA       → acciones PENDIENTE→APROBADO→EJECUTADO   │
                 │  EXPERIMENTOS → elegibles→enviados→…→caja             │
                 │                                                       │
                 │  tablas: team_commercial_analysis (+versions)         │
                 │          team_commercial_signals, _actions,           │
                 │          _experiments, team_prompts, team_prompt_runs │
                 └───┬───────────────┬──────────────────┬───────────────┘
                     │               │                  │
        UI móvil     │      Tools MCP│ whatspro_sales_* │  Worker cron
   /plugins/sales-ops│   (conectores │ leen + escriben  │  /api/cron/sales-ops
                     │    Claude/GPT)│ SÓLO en la capa  │  (clasificación en lote,
                     │               │                  │   radar, expiraciones)
                     ▼               ▼                  ▼
                           Fase 6: ejecución aprobada
                           → executeCommandBatch (Centro de Comandos)
                           → whatspro_register_sale / manage_task
```

## 2. Frontend

- **Ruta**: `/plugins/sales-ops` (page registry del core de plugins, como Radar y Documentos). Takeover **no**: usa el layout del dashboard con `DesktopPage` y la barra de píldoras `DesktopNav`-style para las vistas (Hoy · Dinero · Oportunidades · Barrido · Limpieza · Respuestas · Todos · Experimentos · Métricas).
- **Móvil primero**: una columna, KPIs en `StatRow`, listas como filas de 2 líneas con acción principal a la derecha, ficha como pantalla completa con pestañas (Resumen · Timeline · Chat · Acciones), cola con barra de acción sticky abajo (patrón `CommandCenter.tsx:279`). En escritorio, la ficha se abre en panel lateral (reusar `PanelLateral` de Seguimiento cuando exista).
- **Estado**: SWR contra `/api/plugins/sales-ops/*`; filtros en la URL (`?vista=dinero&gate=G9&owner=carlos`).
- **Chat embebido**: `components/chat/ChatEmbebido.tsx` (sale de la Fase 2 de Seguimiento). Hasta que exista, link a `/dashboard/chat/[numero]`.
- **i18n**: namespace `SalesOps` en `messages/{es,en,pt}.json`.

## 3. Backend

Todo en `lib/plugins/sales-ops/server/` con firma `(teamId, …)` para que las rutas HTTP, las tools MCP y el cron consuman la misma lógica (regla de la memoria del catálogo MCP: exponer es barato sólo si la lógica vive en `lib/**`).

| Módulo | Responsabilidad |
|---|---|
| `dossier.ts` | `buildChatDossier(teamId, chatId)`: expediente normalizado de un chat (documento 04 §1). Sin IA. |
| `rules.ts` | Reglas determinísticas: cliente existente, G0, GX, pago pendiente, automatización viva, auto-reply, silencio, impactos. Devuelve `RuleFacts`. |
| `classifier.ts` | `classifyChat(teamId, chatId, {engine: 'server' \| 'connector'})`. Con `server` llama a `generateStructuredObjectForTeam` (o `analizarTextoConBanco`) con el prompt de `team_prompts`; con `connector` sólo valida y guarda lo que la tool trae. Siempre versiona. |
| `priority.ts` | `computePriority(analysis)`: fórmula y tablas del documento 04 §6. Pura. |
| `queue.ts` | Genera propuestas de acción por gate (`proposeActions(teamId, filters)`) y maneja estados `pending → approved → executed → resulted`. |
| `radar.ts` | `classifyIncomingMessage(teamId, messageId)`: señal por respuesta nueva; enlaza con la acción que la provocó si hubo una en las últimas 72 h. |
| `experiments.ts` | Alta de experimento, membresía por contacto, embudo elegibles → caja. |
| `metrics.ts` | KPIs del dashboard y métricas del documento 05 §9. Agregaciones **en JS** sobre conjuntos filtrados por SQL (regla: nada con fechas se agrega en SQL con parámetros). |
| `access.ts` | `getSalesOpsContext(permission)` → `getPluginRequestContext('sales-ops.read' \| 'sales-ops.write')`. |

Rutas HTTP (`app/api/plugins/sales-ops/`): `overview`, `contacts` (lista filtrable y paginada por cursor), `contacts/[chatId]` (ficha + timeline), `queue`, `queue/approve`, `queue/execute` (Fase 6), `signals`, `experiments`, `metrics`, `prompts`.

## 4. Persistencia

Postgres, Drizzle, **una migración por fase** aplicada con `psql` en el contenedor y registrada en `_journal.json` en el mismo commit. Detalle en el documento 03. Índices pensados para las consultas de las vistas: `(teamId, currentGate, priorityScore desc)`, `(teamId, status)`, `(teamId, chatId)` único en la tabla vigente.

## 5. Sincronización

No hay sincronización: las tablas de WhatsPro **son** la fuente y están en la misma base. Lo único que se "sincroniza" es el **expediente derivado** (`team_commercial_analysis`) cuando cambia el chat:

- `analysis.fingerprint = sha256(chatId | lastMessageId | lastMessageTimestamp | audioInsightsDone)`. Si el fingerprint del chat difiere del guardado, el análisis está **desactualizado** (`stale = true`) y entra a la cola de re-clasificación con prioridad según gate (G7–G10 primero).
- El radar corre por evento (mensaje entrante) y no espera a la re-clasificación completa.

## 6. Workers

Patrón existente: ruta `/api/cron/*` con `Authorization: Bearer CRON_SECRET`, `maxDuration = 300`, wrapper `scripts/<nombre>.js` registrado en PM2 con `--cron-restart` y `--node-args="--env-file=/root/whatsaas/.env"` (trampa conocida: PM2 no hereda el `.env`).

| Cron | Frecuencia | Qué drena |
|---|---|---|
| `sales-ops-classify` | cada 10 min | Hasta N chats con `analysis` inexistente o `stale`, por prioridad; motor `server`. Respeta `capacidadDelBanco`. Si no hay capacidad, no falla: deja la cola para los conectores. |
| `sales-ops-radar` | cada 2 min (o por evento) | Mensajes entrantes desde el último corte sin señal. |
| `sales-ops-housekeeping` | diario | Expira acciones `pending` viejas, marca `pre_descarte` a los que no respondieron al último intento tras X días, recalcula prioridades por antigüedad. **Nunca** descarta definitivamente solo. |

## 7. IA

- **Dos motores, un contrato.** El contrato es el JSON de salida del clasificador (documento 04 §7) validado con Zod en `classifier.ts`; da igual si lo produjo Gemini en el servidor o Claude vía conector.
- **Servidor**: `generateStructuredObjectForTeam` con el provider de `ai_configs` (hoy Gemini) o `analizarTextoConBanco` (banco de keys). Modelo y provider quedan en la fila (`provider`, `model`).
- **Conector**: tools de lectura entregan el expediente ya normalizado (no el chat crudo: menos tokens y el prompt es idéntico al del servidor) y **una** tool de escritura acepta el contrato. El conector se identifica en `connector` (`claude|chatgpt|grok`).
- **Prompt Studio**: el `systemPrompt` del clasificador, del radar y de la siguiente acción se leen de `team_prompts` por `key` y versión. `team_prompt_runs` guarda `promptFingerprint` + `promptSnapshot` de cada corrida (patrón `team_task_ai_runs`). Un cambio de prompt = versión nueva; los análisis viejos conservan la suya.
- **Presupuesto**: mediana 3,6 k caracteres por chat → ~1,2 k tokens de entrada + 600 de salida. 1.057 chats ≈ 2 M tokens. Con Gemini Flash pago es < USD 2; con el banco gratuito son ~8 días. Con conectores es el tiempo de quien opere.
- **Anti-inyección**: mismo patrón que `suggestions.ts:464-479`: los mensajes del cliente van dentro de marcadores como datos; el prompt del equipo entra como contexto de marca, no como rol.

## 8. Eventos

- **Entrada**: `new-message` (Pusher, ya emitido por el webhook) → el radar puede colgarse de un hook en `app/api/webhook/evolution/route.ts` justo después de insertar el mensaje (llamada asíncrona `after()` de Next, sin bloquear el webhook) o del cron de 2 min. **MVP: cron.** Evento en Fase 5.
- **Salida**: el plugin emite `sales-ops:signal` en `team-{teamId}` cuando detecta intención fuerte (`pago`, `intención de compra`, `quiere llamada`) para que la UI muestre el aviso sin recargar. También crea una **notificación** con el mecanismo existente si lo hay para el owner asignado.

## 9. Colas

Tabla `team_commercial_actions` con `status` + `scheduledFor` + índice `(teamId, status, scheduledFor)`. Estados: `proposed → pending_approval → approved → executing → executed → resulted | rejected | expired`. La aprobación es por **lote** (`batchId`) pero la fila es por contacto: se ve a quién le llega antes de aprobar, y el resultado (`messageId`, `error`, `respondedAt`) queda por contacto.

Ejecución (Fase 6): el lote aprobado se transforma en `PlannedAction[]` del Centro de Comandos y se manda a `executeCommandBatch` con `batchId = action.batchId`. La idempotencia la deriva ese motor; la capa comercial **no** genera claves propias.

## 10. Permisos

- Permisos nuevos en `lib/permissions.ts`: `salesOpsRead`, `salesOpsWrite` (owner/admin `true`, agent `false` por defecto). Manifest del plugin: `sales-ops.read` → `salesOpsRead`, `sales-ops.write` → `salesOpsWrite`. Activación **global** por equipo; visibilidad por rol:
  - **Noelia** (ventas): vistas Respuestas, Oportunidades, Barrido; aprueba lotes de barrido.
  - **Carlos** (cierre): vista Dinero (G8–G10), cola de cobro; registra ventas.
  - **Producción**: sólo ficha cuando una acción lo pide (`recommendedOwner = 'produccion'`).
  - La asignación es por `recommendedOwner` y por un filtro `owner=` en la URL; no por `chatVisibility` (los tres son owners).
- Escritura al CRM (Fase 6) hereda los permisos de cada acción: `messagesSend` para enviar, `tasksWrite` para tareas, `salesWrite` para ventas. El plugin no inventa atajos.
- Tools MCP: cada una valida `teamId` del contexto y que el `chatId` pertenezca al equipo; no confían en `assertPermission` (decorativo para owners).

## 11. Qué se descartó y por qué

| Alternativa | Por qué no |
|---|---|
| Hacerlo dentro de Radar (widgets IA) | Radar es un tablero declarativo; no tiene lista paginada de 1.000 filas, ficha con timeline ni cola con estados. Sí se usa Radar para los gráficos de Métricas. |
| App Maker con entidades propias | jsonb sin índices, sin agregaciones; y las reglas determinísticas necesitan joins con `messages`. |
| Extender `/escritorio/bandeja` | Su modelo es "lo pendiente de hoy" con cuotas por kind; no es un mapa del funnel. Se reutiliza su motor, no su pantalla. |
| Servicio externo / base auxiliar | Duplicar 60 k mensajes fuera de la base para leerlos con IA no aporta nada y rompe el aislamiento por equipo. |
| BullMQ/Redis | No hay Redis en el stack y el patrón cron + tabla ya sostiene 18 k audios. |
