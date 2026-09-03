# Agente IA de WhatsApp · Funciones integradas por app

> Estado al 2026-09-01. Rama `feat/tareas-rediseno`. Migración `0099_ai_builtin_tools` aplicada.

## 1. Qué había y qué faltaba

El agente IA que contesta en WhatsApp (`lib/plugins/ai-chat/`) resuelve *function calling* con dos fuentes:

| Fuente | Dónde | Quién la define |
|---|---|---|
| `handover_to_human` | `tools.ts` → `baseTools` | Código, siempre |
| Herramientas del equipo | tabla `ai_tools` → `getDynamicTools()` | Cada equipo, a mano en **Ajustes → IA → Function Calling** (enviar archivo, mover de etapa, asignar agente, campo personalizado, nota, etiqueta, disparar automatización) |

Nada de eso miraba las **apps** del equipo. Con Calendario, Clientes, Membresías, Financiero, Documentos, Tareas, Soporte, etc. activos, el bot seguía sin poder consultar un turno libre, decir cuánto debe un cliente, buscar una FAQ o dejar registrado un pago. Toda esa lógica existía sólo para el conector MCP (Claude/Grok/ChatGPT) que opera *desde adentro* del equipo, no para el bot que habla *con el cliente*.

## 2. Diseño

### 2.1 Regla de activación

Una función integrada está disponible para el agente cuando se cumplen las dos:

1. **El plugin que la respalda está activo para el equipo** (`resolveActivePluginsForTeam`, la misma resolución que usa la barra lateral y el conector). `pluginId: null` = núcleo, siempre.
2. **Nadie la apagó a mano.** Tabla `ai_builtin_tools (team_id, tool_name, enabled)`: guarda sólo excepciones. Sin fila = activa.

Si un equipo definió a mano una herramienta con el mismo nombre, gana la del equipo (no se pisa lo que ya configuró).

Si el módulo de funciones integradas falla al cargar, el agente sigue funcionando con las manuales (`catch` en `getDynamicTools`).

### 2.2 Archivos

```
lib/plugins/ai-chat/builtin/
  types.ts            BuiltinToolDefinition { name, pluginId, label, summary, risk, description, parameters, execute }
  context.ts          resolveChatContact (chat → contacto, lo crea si falta), resolveActorUserId, logBotAction, toCents/fromCents
  index.ts            BUILTIN_TOOLS, getBuiltinToolsForTeam(teamId), listBuiltinToolCatalog(teamId), setBuiltinToolEnabled()
  crm.ts knowledge.ts calendar.ts customers.ts memberships.ts sales.ts deals.ts finance.ts tasks.ts scheduled-messages.ts support.ts sites.ts
lib/plugins/ai-chat/tools.ts                       getDynamicTools() mezcla base + integradas + manuales
app/[locale]/(dashboard)/settings/ai/builtin-tools-actions.ts   server actions (catálogo + toggle)
components/ai/BuiltinToolsManager.tsx              tarjeta con toggles agrupados por app (arriba del gestor manual)
lib/db/migrations/0099_ai_builtin_tools.sql        tabla de excepciones
messages/{es,en,pt}.json → AiBuiltinTools           textos de la tarjeta
```

### 2.3 Invariantes de seguridad (no se aflojan)

- **El bot sólo opera sobre la persona que escribe.** Todo parte de `chatId` → contacto. Nunca recibe `contact_id`, `customer_id` ni teléfonos de terceros como parámetro. Cancelar turno / recordatorio / ver ticket verifican que el registro pertenezca a ese contacto.
- **Nada queda "cobrado" por decisión del bot.** `report_payment` crea el ingreso en estado `pending`; `register_sale` deja la venta `confirmed` con pago pendiente; `register_membership` deja `paymentStatus = pending`. Un humano confirma.
- **Importes en centavos en la base, en unidades hacia el modelo.** `toCents`/`fromCents` en todos los bordes. El cliente dice "1500", se guarda 150000.
- **Actor:** las tablas exigen `createdBy`. Se usa el agente asignado al contacto y, si no hay, el dueño del equipo (`resolveActorUserId`). Queda trazado en el chat con un mensaje de sistema (`logBotAction`).
- **Cliente auto-creado sólo cuando hace falta.** Venta, membresía y aviso de pago registran al contacto como cliente vía `convertContactToCustomer` (deduplica por vínculo → email → teléfono, mismo orden que el conector).
- **Textos recortados** antes de volver al modelo (`clip`) para no quemar tokens ni filtrar documentos enteros.

### 2.4 Esquemas de parámetros

Planos, JSON Schema básico (string/number/integer/boolean/enum/array de objetos). Gemini recibe `properties` tal cual (`providers/gemini.ts → mapToolsToGemini`), OpenAI también. Sin `oneOf`, sin `default`, sin `additionalProperties`. Nombres de parámetro en `snake_case`, descripciones en español con la *regla de uso* ("llamala antes de…").

## 3. Las 30 funciones

Riesgo: 🔎 consulta · ✍️ modifica datos. **Reutiliza** = lógica existente en `lib/**` que se llama en vez de duplicar.

### Núcleo CRM (`pluginId: null`, siempre activas)

| # | Función | Riesgo | Parámetros | Qué hace | Reutiliza |
|---|---|---|---|---|---|
| 1 | `get_contact_profile` | 🔎 | — | Nombre, teléfono, email, empresa, cargo, etapa, etiquetas, campos personalizados, agente asignado, VIP, temperatura, últimas notas | `contacts`, `funnelStages`, `contactTags`, `users` |
| 2 | `update_contact_details` | ✍️ | `name, email, company, job_title` (todos opcionales, sólo lo que dijo) | Guarda datos que el cliente da en la charla | `contacts` |
| 3 | `move_contact_to_stage` | ✍️ | `stage_name` (vacío = listar) | Mueve de etapa **por nombre**, con coincidencia exacta o parcial. Sin `stage_name` devuelve las etapas del equipo | `funnelStages`, syslog `ai_moved_to_stage` |
| 4 | `tag_contact` | ✍️ | `tag_name` | Etiqueta por nombre; la crea si no existe | `tags`, `contactTags` |

### Documentos (`documents`) — base de conocimiento

| # | Función | Riesgo | Parámetros | Qué hace | Reutiliza |
|---|---|---|---|---|---|
| 5 | `search_knowledge_base` | 🔎 | `query`, `limit≤8` | Busca en título+contenido de Documentos; devuelve extractos | `searchDocuments()` |
| 6 | `read_knowledge_document` | 🔎 | `document_id` | Texto plano del documento (≤4.000 chars) | `teamDocuments.contentText` |

### Calendario (`calendar`)

| # | Función | Riesgo | Parámetros | Qué hace | Reutiliza |
|---|---|---|---|---|---|
| 7 | `check_availability` | 🔎 | `date`, `duration_minutes=60`, `from_hour=9`, `to_hour=18` | Huecos libres de un día (máx. 12) contra `team_events` no cancelados, en la zona horaria del negocio; omite el pasado | `zonedDateTimeToUtc()` (no existía lógica de disponibilidad) |
| 8 | `book_appointment` | ✍️ | `starts_at`, `duration_minutes`, `title`, `kind∈{meeting,call}`, `notes` | Crea el evento vinculado al contacto y al cliente, rechaza superposiciones, agrega participante | `teamEvents`, `teamEventParticipants`, `customerForContact()` |
| 9 | `list_contact_appointments` | 🔎 | `include_past` | Próximos turnos del contacto (+5 pasados opcional) | `teamEvents` |
| 10 | `cancel_appointment` | ✍️ | `event_id`, `reason` | `status=cancelled` sólo si el evento es de este contacto | `teamEvents` |

### Clientes (`customers`)

| # | Función | Riesgo | Parámetros | Qué hace | Reutiliza |
|---|---|---|---|---|---|
| 11 | `get_customer_account` | 🔎 | — | 360: es cliente?, pendiente/pagado por moneda, membresías, oportunidades abiertas, próxima cita | `getContactCommercialSnapshot()` |
| 12 | `register_customer` | ✍️ | `name`, `email`, `notes` | Contacto → cliente con deduplicación | `convertContactToCustomer()` |
| 13 | `get_pending_payments` | 🔎 | — | Ventas impagas/vencidas con número, total, vencimiento | snapshot `money.sales` |

### Membresías (`memberships`)

| # | Función | Riesgo | Parámetros | Qué hace | Reutiliza |
|---|---|---|---|---|---|
| 14 | `list_membership_plans` | 🔎 | — | Planes `active` + `public` con precio, alta, frecuencia, beneficios | `teamMembershipPlans` |
| 15 | `get_membership_status` | 🔎 | — | Activas, impagas, última vencida, próxima renovación, último pago | snapshot `subscriptions` |
| 16 | `register_membership` | ✍️ | `plan_id`, `start_date`, `notes` | Alta con `paymentStatus=pending`, número `M-0001…`, fin calculado según frecuencia, idempotente por `chat+plan+fecha` | `convertContactToCustomer()`, `teamMembershipSubscriptions` |

### Ventas (`sales`) y Artículos (`articles`)

| # | Función | Riesgo | Parámetros | Qué hace | Reutiliza |
|---|---|---|---|---|---|
| 17 | `search_catalog` (`articles`) | 🔎 | `query`, `limit≤15` | Artículos activos por nombre/SKU/categoría/descripción con precio, unidad, stock | `teamArticles` |
| 18 | `register_sale` (`sales`) | ✍️ | `items[{name, quantity, unit_price, article_id}]`, `currency`, `notes`, `due_date` | Venta `confirmed` + pago pendiente, número `V-0001…`, toma precio del catálogo si hay `article_id`; si Financiero está activo crea el ingreso a cobrar | patrón de `registrarVenta` del conector, `convertContactToCustomer()` |
| 19 | `list_contact_purchases` (`sales`) | 🔎 | `limit≤10` | Últimas ventas del contacto/cliente con ítems | `teamSales` |

### Oportunidades (`deals`)

| # | Función | Riesgo | Parámetros | Qué hace | Reutiliza |
|---|---|---|---|---|---|
| 20 | `create_opportunity` | ✍️ | `title`, `value`, `currency`, `notes` | Deal en `qualified`, `source=whatsapp-ai`, dueño = agente asignado | `createDeal()` |
| 21 | `get_open_opportunities` | 🔎 | — | Abiertas del contacto con etapa, valor, probabilidad, cierre esperado | `listDeals()` |

### Financiero (`finance`)

| # | Función | Riesgo | Parámetros | Qué hace | Reutiliza |
|---|---|---|---|---|---|
| 22 | `report_payment` | ✍️ | `amount`, `currency`, `method`, `reference`, `sale_id` | Ingreso `pending` categoría Cobranzas, vinculado al cliente (y a la venta si es suya). Instruye al modelo a decir "quedó registrado, lo verificamos" | `teamFinancialEntries`, `convertContactToCustomer()` |
| 23 | `get_account_balance` | 🔎 | — | Pendiente/vencido/pagado por moneda, próximo vencimiento | snapshot `money` |

### Tareas (`tasks`)

| # | Función | Riesgo | Parámetros | Qué hace | Reutiliza |
|---|---|---|---|---|---|
| 24 | `create_followup_task` | ✍️ | `title`, `notes`, `due_date` | Tarea en el proyecto de contactos, relación tarea↔contacto, mensaje interno en el chat | `createContactTask()` |
| 25 | `list_contact_tasks` | 🔎 | `include_done` | Tareas abiertas ligadas al contacto (proyecto, columna, vencimiento) | `listContactTasks()` |

### Mensajes programados (`scheduled-messages`)

| # | Función | Riesgo | Parámetros | Qué hace | Reutiliza |
|---|---|---|---|---|---|
| 26 | `schedule_message` | ✍️ | `message`, `send_at` | Programa un envío único a **este mismo número** por la instancia del chat (`maxRuns=1`) | `teamScheduledMessages`, `computeNextRunAt()` |
| 27 | `cancel_scheduled_message` | ✍️ | `scheduled_message_id` (vacío = listar pendientes) | Pausa un programado cuyo destinatario es este número | `teamScheduledMessages` |

### Soporte (`support`)

| # | Función | Riesgo | Parámetros | Qué hace | Reutiliza |
|---|---|---|---|---|---|
| 28 | `open_support_ticket` | ✍️ | `subject`, `description`, `priority∈{low,normal,high,urgent}`, `category` | Ticket `open` con contacto, cliente y chat; asignado al agente del contacto | `teamSupportTickets` |
| 29 | `get_support_ticket_status` | 🔎 | `ticket_id` (opcional) | Tickets del contacto con estado, resolución y última respuesta **pública** | `teamSupportTickets`, `teamSupportTicketComments` |

### Sitios (`sites`)

| # | Función | Riesgo | Parámetros | Qué hace | Reutiliza |
|---|---|---|---|---|---|
| 30 | `get_business_links` | 🔎 | — | URLs públicas de sitios publicados (dominio propio → subdominio → `/s/slug`) | `listSites()` |

## 4. Pantalla de administración

**Ajustes → IA → pestaña Function Calling.** Arriba está el **creador de herramientas** (las llamadas que arma el equipo); abajo, el listado de "Funciones integradas por app" con una sección por app, badge *App activa / App inactiva* y un switch por función (apagarlo escribe la excepción en `ai_builtin_tools`).

### Acciones de apps en las herramientas del equipo (2026-09-01, 2ª tanda)

El creador de herramientas suma acciones que reusan las funciones integradas (`getBuiltinToolDefinition(...).execute`), además de las 6 clásicas del CRM:

| Acción | App requerida | Config fija | Lo completa la IA |
|---|---|---|---|
| Disparar Automatización | — (núcleo) | automatización | — |
| Crear Tarea | `tasks` | título fijo opcional | `task_title` (si no hay fijo), `task_notes` |
| Crear Oportunidad | `deals` | moneda | `deal_title`, `deal_value` |
| Abrir Ticket de Soporte | `support` | prioridad, categoría | `ticket_subject`, `ticket_description` |
| Programar Recordatorio | `scheduled-messages` | horas de demora, mensaje fijo opcional | `reminder_message` (si no hay fijo) |

Las opciones de apps sólo aparecen en el menú si la app está activa (se reusa el catálogo de `getBuiltinAiTools`). Ejecutan la definición integrada directamente aunque el switch individual esté apagado: la configuración explícita del equipo manda.

## 5. Cómo agregar una función nueva

1. Elegir el módulo por app (o crear `builtin/<app>.ts`) y agregar un `BuiltinToolDefinition` al array exportado.
2. `pluginId` = id del manifest del plugin (`lib/plugins/<id>/manifest.ts`). `null` sólo para el núcleo.
3. `execute(args, { chatId, teamId })`: empezar por `resolveChatContact(context)`; nunca aceptar ids de otras personas.
4. Si escribe: `risk: 'write'`, pasar por `resolveActorUserId`, terminar con `logBotAction`. Dinero: `toCents`.
5. Si el módulo es nuevo, sumarlo a `BUILTIN_TOOLS` en `index.ts`.
6. Descripción: qué hace + **cuándo llamarla** + qué confirmar antes con el cliente.

## 6. Pendientes / próximos pasos

- **Zona horaria por equipo.** Las horas "sin zona" que dice el cliente (turnos, recordatorios) se interpretan en `CHAT_TIMEZONE` (`context.ts`): env `AI_CHAT_TIMEZONE` → `TZ` → `America/Argentina/Buenos_Aires`, reutilizando `zonedDateTimeToUtc` de mensajes programados. Cuando exista TZ por equipo en `teams`, leerla ahí.
- **Horario de atención por equipo.** Hoy el modelo pasa `from_hour/to_hour`; conviene un ajuste en Calendario para que sea el default.
- **Prompt del sistema.** Vale agregar en Ajustes → IA una línea sugerida: "Antes de responder sobre precios o políticas usá `search_knowledge_base`; nunca confirmes pagos, sólo registralos con `report_payment`".
- **Métricas.** Contar invocaciones por función (hoy sólo queda el syslog en el chat) para ver cuáles usa el bot de verdad.
- **Membresías: renovar.** `register_membership` no renueva una activa; falta `renew_membership` que extienda `endDate` de la vigente (la lógica vive en `bulk-actions.ts → memberships_renew` del conector).
