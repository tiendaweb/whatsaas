# Seguimiento — agenda de contactos por etapa

Objetivo: **una sola pantalla para organizar todos los contactos del equipo sin navegar**. Los contactos se ven en miniatura, agrupados por etapa del embudo como una agenda, y desde cada tarjeta se puede abrir el chat en un panel lateral, cambiar la etapa arrastrando, editar etiquetas y programar mensajes. Todo sin salir de `/seguimiento`.

No es un plugin nuevo ni reemplaza al Embudo (kanban) ni a las Agendas. Es una vista nueva del core que **reutiliza** las tablas, endpoints y componentes que ya existen.

## Decisiones tomadas

| Decisión | Valor |
|---|---|
| Nombre visible | **Seguimiento** |
| Ruta | `/seguimiento` (ruta propia del dashboard, con entrada en el menú). No es `?view=` del dashboard porque necesita ancho completo y estado en la URL propio. |
| Fuente de datos | `GET /api/chats?scope=kanban` + `GET /api/chats/kanban-metadata`, las mismas del Embudo. **Cero endpoints nuevos para leer** en la Fase 1. |
| Base de datos | **Una sola migración** (0095): preferencias del panel de información por usuario. Nada más. |
| Agrupación | Por **etapa del embudo**, con selector de grupo de etapas (Ventas · Producción · Clientes · Sin contestar…). "Sin etapa" es siempre la última sección. |
| Filtro global | Segmento **Todos · Leads · Clientes**. Lead = contacto con etapa y sin cliente vinculado. Cliente = contacto vinculado a `team_customers`. Todos = todos los contactos con chat. |
| Filtro por etiqueta | Chips multi-selección, lógica OR entre etiquetas. |
| Drag & drop | `@hello-pangea/dnd` (la librería que ya usa el Embudo). Soltar una tarjeta sobre otra sección = cambiar etapa. |
| Chat lateral | Panel derecho acoplado, colapsable, con pestañas **Chat · Info · Programados**. Se chatea ahí mismo. |
| Panel de información | Configurable por usuario: orden y visibilidad de secciones. **La misma configuración aplica al sidebar del chat en `/dashboard/chat/[jid]`**. |
| Programar mensajes | Reusa el formulario del plugin `scheduled-messages`, prellenado con el contacto. |
| Idioma | Español primero; claves en `messages/{es,en,pt}.json`, namespace `Seguimiento`. |
| Estilo | Ultra minimalista: tokens del sistema (`bg-background`, `border-border`, `text-muted-foreground`), sin sombras fuertes, sin gradientes, una sola tipografía. Ver documento 02. |
| Permisos | Ver la pantalla: `contacts` + `messagesRead`. Enviar: `messagesSend`. Programar: `scheduledMessagesWrite`. Cambiar etapa/etiquetas: `contacts`. Lo que no se puede, no se muestra (no se deshabilita). |

## Lo que ya existe y se reutiliza (medido en el código)

- **Embudo** `app/[locale]/(dashboard)/dashboard/KanbanBoard.tsx`: columnas por etapa, drag & drop, filtros, Pusher `kanban-stage-update`. Seguimiento copia su modelo de datos y su `onDragEnd`.
- **Agendas** `dashboard/BookmarksBoard.tsx`: cambio de etapa inline con optimismo + rollback. Se copia `updateChatStage`.
- **Chat embebido** `lib/plugins/tasks/ui-nueva/views/ChatCliente.tsx`: 185 líneas, ya funciona con Pusher y `POST /api/messages/send`. Se extrae a `components/chat/ChatEmbebido.tsx` con tokens del core.
- **Etiquetas** `components/chat/ContactTagsEditor.tsx` + `TagPill`: se usan tal cual.
- **Formulario de programados** `lib/plugins/scheduled-messages/ui/ScheduledMessagesDashboard.tsx`: `MessageFormDialog` y `RecipientPicker` son privados; se exportan.
- **Sidebar del chat** `components/chat/ChatSidebar.tsx` (1264 líneas): tiene 12 secciones sin ninguna configuración. Se envuelve cada una en un registro de secciones; no se reescribe.
- **Patrón de preferencias** del Escritorio: `teamDesktopPreferences` + `lib/desktop/preferences.ts` + `components/escritorio/CustomizeDialog.tsx`. Se clona para el panel de información.

## Lo que hay en la base hoy (equipo 2, 2026-08-29)

- 920 contactos, 895 con etapa, 25 sin etapa.
- 32 etapas en 5 grupos: 🟦 Ventas · Noelia (10), 🟨 Producción · Martín (5), 🟩 Clientes y renovaciones · Noelia (10), 🗓️ Sin contestar por mes · Noelia (7), Carlos · Administración (0).
- 310 clientes en `team_customers`, 136 contactos vinculados a alguno.
- 27 etiquetas. 214 mensajes programados.

Consecuencias de diseño: **una sección por etapa con 32 etapas es demasiado para una sola pantalla**, por eso el selector de grupo es obligatorio y arranca en el grupo del usuario (recordado en `localStorage`). Y con 920 tarjetas, cada sección muestra las primeras 12 y un botón "Ver las N restantes".

## Documentos de esta carpeta

| Documento | Para qué |
|---|---|
| 01 — Prompt maestro | Lo que se pega en Claude Code para ejecutar. Fases, reglas, criterios de aceptación. |
| 02 — Especificación de pantalla | Layout, tarjeta, toolbar, panel lateral, estados, atajos, móvil. Con clases literales. |
| 03 — Mapeo de datos | Cada concepto de la pantalla → tabla, endpoint y componente existente. **El más importante.** |
| 04 — Chat lateral y panel configurable | Extracción del chat embebido y registro de secciones del panel de información con preferencias por usuario. |
| 05 — Mensajes programados | Cómo se programa desde la tarjeta y cómo se listan los programados del contacto. |
| 06 — Textos en español | Todos los literales, con su clave i18n. |
| 07 — Checklist de QA | Verificación final punto por punto. |
| ESTADO | Informe de reconocimiento (Fase 0) y preguntas abiertas. |

## Cómo lanzarlo

1. Abrí Claude Code en la raíz del repo.
2. Los documentos ya están en `docs/seguimiento/`.
3. Pegá el documento 01 como primer mensaje. La Fase 0 ya está hecha (ver ESTADO); Claude arranca directo en la Fase 1.
4. Cada fase termina con `pnpm typecheck` + `pnpm build` verdes y un smoke test contra la base antes de pasar a la siguiente.
5. Desplegar siempre con `pnpm run deploy:saasfy` (nunca `pnpm build` + `docker restart`).
