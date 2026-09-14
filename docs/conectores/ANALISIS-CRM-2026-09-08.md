# CRM, relaciones, permisos y conectores — análisis 2026-09-08

> Todo lo que sigue está medido contra la base del equipo 2 y leído del código.
> Donde hay un número, hay una consulta detrás.

---

## 1. Las entidades y cómo se conectan

El CRM no es una tabla: son **cuatro capas** que se cruzan por el contacto.

| Capa | Tablas | Filas (equipo 2) |
|---|---|---|
| Conversación | `chats`, `messages`, `ai_sessions` | 1.067 · 63.788 |
| Ficha | `contacts` + `funnel_stages` + `tags` + `custom_fields` (en `custom_data`) | 927 · 32 etapas · 27 etiquetas · 74 campos |
| Análisis | `team_commercial_analysis` (gate G0-GX, intención, objeción, `crm_fix`) | **1.062 — el 99,5 % de los chats** |
| Negocio | `team_customers`, `team_membership_subscriptions`, `team_sales`, `team_deals`, `team_financial_entries` | 311 · 251 · **1** · **0** · 95 |

**El vínculo entre capas.** `contacts.chatId` ata ficha y conversación; `team_customer_contacts`
(153 filas) ata ficha y cliente; el resto pasa por **`team_task_relations`**, que a pesar del nombre
es la tabla de vínculos libres del sistema: 343 filas conectando cualquier par de
`task · project · workspace · document · contact · customer · sale · transaction · subscription · company`
(`lib/links/resolver.ts`). La lectura resuelve además el cliente **heredado** —el del proyecto que
contiene la tarea, el de la carpeta que contiene el documento— y siempre dice de dónde salió.

**Lo que el modelo de datos está diciendo:** el negocio se registra como **cliente + suscripción**,
no como venta ni oportunidad. `team_sales` tiene 1 fila y `team_deals` cero. Las 6 tools de
Oportunidades y las 3 de Ventas operan sobre tablas vacías; la plata real se ve en Finanzas (95
asientos) y en las 251 suscripciones.

## 2. Salud del CRM — dónde está la grasa

| Medición | Resultado | Qué significa |
|---|---|---|
| Campos personalizados | 74 definidos: **6** con 100+ contactos, 33 con 10-99, **33 con menos de 10**, 2 con cero | Casi la mitad del formulario no se completa nunca. Los 6 que sí: Origen del lead, Rubro, Tipo de servicio, Ciclo de cobro, Cliente, Moneda |
| Etapas del embudo | 32, de las cuales **7 están vacías** (las seis "Sin Contestar {mes}" + "Campaña Publicitaria") | Etapas de una campaña vieja que siguen ensuciando el tablero |
| Contactos sin agente | **228 de 927** (25 %) | Sin `assignedUserId` ni `assignedDepartmentId` (230), `leTocaElChat` no le suena a nadie en particular |
| Contactos sin etapa | 27 | Fuera del embudo |
| Análisis vencidos (`stale`) | 32 | Hubo mensajes nuevos después de analizar |
| **Correcciones de CRM sin aplicar** | **126** (`crm_fix`) + 386 con `crm_to_fix` en texto | Trabajo ya pensado por la IA esperando que alguien abra 126 pantallas |

Distribución por gate: G0 285 · **sin gate 155** · G11 (cliente) 145 · G9 103 · G8 74 · GX 74 · G5 68.

## 3. Permisos: cómo se decide qué puede hacer un conector

Tres capas, todas obligatorias y en este orden:

1. **Token** — el scope `whatspro:write` (`GROK_WRITE_SCOPE`). Sin él, el conector ni ve las tools de escritura.
2. **Permiso del miembro** — `assertPermission(context, permiso, pluginId)`: el conector actúa **como el usuario dueño del token**, con las ~60 claves de `MemberPermissions` (`salesOpsWrite`, `financeWrite`, `contacts`…). No hay identidad de máquina: no hay permisos que un humano del equipo no tenga.
3. **App activa** — el `pluginId` tiene que estar encendido para el equipo (o para ese usuario, en las apps de activación por usuario).

Para **lectura** hay un cuarto control que conviene conocer, porque es el que evita el agujero clásico:

- El mapa recurso→permiso es **uno solo** (`lib/readonly-api/resource-policies.ts`), compartido con App Maker, y es **fail-closed**: un recurso sin política no se sirve. `scripts/verify-connector-tools.mts` falla si alguien agrega un recurso y se olvida del mapa — hoy: **131 recursos, todos con política**.
- `actor-guard.ts` aplica además la **visibilidad de chats** del miembro (`chatVisibility`) sobre `chats`, `messages`, `contacts`, reacciones, audios y resúmenes: un agente con visibilidad "asignados" ya no ve los 63.788 mensajes del equipo por el conector.

> Los dos pendientes que arrastraba este ecosistema desde agosto (**A3** visibilidad y **A4** permisos
> en lectura) **están cerrados**. Lo que queda abierto es más chico y está en §6.

## 4. Automatizaciones

7 herramientas cubren el ciclo entero: `automation_guide` (catálogo de nodos) → `inspect_automation`
→ `manage_automation_folder` / `manage_automation` / `manage_automation_node` / `manage_automation_edge`,
más `replace_automation_flow` con modo `validate` antes de `save`. Se dispara con
`chat_trigger_automation` y se silencia por chat con `chat_set_automation`.

Estado real: **66 flujos, 3 activos.** Y una regla que conviene tener presente porque explica
silencios: en el webhook, **si un flujo procesó el mensaje, el agente IA no se entera**
(`app/api/webhook/evolution/route.ts:597`). Automatización y agente no conviven en el mismo mensaje.

## 5. Command Center

El circuito comercial está **cerrado de punta a punta** desde la tanda de septiembre:
clasificar (`sales_classify_server`) → proponer (`queue_propose`) → editar/aprobar (`queue_edit`,
`queue_approve`) → **ejecutar** (`sales_execute_batch`) → cerrar (`queue_result`), con la cola
unificada `whatspro_work_queue` federando todos los momentos.

Cola hoy: **174 propuestas · 83 ejecutadas · 97 rechazadas · 12 fallidas · 6 vencidas.**
El rechazo (97 sobre 372) no es ruido: es la revisión humana funcionando.

## 6. Lo que faltaba y ahora se puede — 5 herramientas nuevas

El hueco no estaba en la conversación ni en la plata: estaba en **la ficha**. Un conector podía
clasificar un chat, escribir el diagnóstico y hasta cobrar, pero no podía **arreglar el CRM que él
mismo marcó como mal**. Las 126 correcciones pendientes son exactamente eso.

| Tool | Qué destraba |
|---|---|
| `whatspro_crm_fix_list` | Ver las fichas que la clasificación marcó mal, con la corrección ya propuesta y el motivo |
| `whatspro_crm_fix_apply` | Aplicarla: etapa, etiquetas y campos en una escritura validada. Con `dry_run` |
| `whatspro_crm_fix_dismiss` | Descartarla cuando la ficha ya estaba bien (`confirm`) |
| `whatspro_crm_commercial_get` | La ficha editable completa: etapas y etiquetas disponibles, campos con definición y **los huérfanos** |
| `whatspro_crm_commercial_update` | Editar notas + etapa + etiquetas + campos en UNA llamada, y **borrar** claves huérfanas — hoy había que encadenar tres tools y ninguna limpiaba |

Dos límites que se mantienen a propósito:

1. **De a un contacto. No hay lote.** Una corrección mal razonada aplicada de a una se arregla;
   aplicada sobre 126 fichas, no. Es la misma invariante que ya regía en la pantalla.
2. **`updateCrm` sigue siendo el único camino de escritura**, también para las correcciones: misma
   validación de pertenencia al equipo, mismo reemplazo de etiquetas por conjunto, misma auditoría
   que cuando lo edita una persona. Las tools traducen **nombres** a ids y lo que no existe se
   informa en `desconocidos` en vez de inventarse.

Total: **288 herramientas**, verificadas con `scripts/verify-connector-tools.mts`.

## 7. Lo que se evaluó y se dejó afuera, con motivo

| Candidato | Por qué no |
|---|---|
| `ejecutarPedidoFocus` (el "Ejecutar ahora" del Focus) | Es un modelo redactando para que una persona apruebe. Exponerlo por conector es una IA llamando a otra IA para pedirle un borrador: ya existen `sales_prompt_launch` y `drafts_generate` |
| Aplicar `crm_fix` en lote | Rompe la invariante de arriba. Es la diferencia entre un error y 126 |
| Bloques de la cola de audio (`createAudioBlock`, `assignAudioBlock`…) | Coherente, pero es gestión de la cola de Gemini, no CRM. Merece su propia tanda junto con la reserva del banco |
| Oportunidades y Ventas | 0 y 1 fila. Las tools ya existen y operan sobre tablas vacías; no hace falta más superficie |
| Fusionar contactos, borrar histórico, importar CSV | Sin cambios respecto de la tanda anterior: ocho tablas, irreversible y multipart |

## 8. Optimizaciones recomendadas (no aplicadas: son decisiones del negocio)

Todas se pueden ejecutar hoy con tools que ya existen, sin código nuevo:

1. **Archivar las 7 etapas vacías** (`whatspro_manage_crm_stage`). El embudo pasa de 32 a 25 y el tablero vuelve a leerse.
2. **Podar los 33 campos casi muertos** (`whatspro_manage_custom_field`), o dejar de pedirlos: hoy el formulario tiene 74 casilleros y se completan 6.
3. **Asignar sector a los 230 contactos sin dueño** (`whatspro_manage_department_member` + `save_contact`): mientras no lo tengan, sus mensajes no le suenan a nadie en particular.
4. **Aplicar las 126 correcciones pendientes**, de a una, con las tools nuevas — es la deuda más grande y ya está toda pensada.
5. **Re-analizar los 32 chats vencidos** (`sales_radar_scan`).

## 9. Una inconsistencia técnica que conviene arreglar

`audit()` del conector (`grok-connector/server/actions.ts:344`) guarda el id de la entidad **en la
columna `ipAddress`**, mientras que la auditoría de sales-ops (`server/crm.ts:45`) usa `metadata`,
que es la columna correcta y ya existe. Son dos auditorías distintas para el mismo sistema: la
consulta que quiera reconstruir qué tocó un conector tiene que saber cuál de las dos convenciones
usó cada tool. No lo cambié acá porque toca las 3.312 filas ya escritas con la convención vieja y
merece su propia migración de lectura.
