# Prompt maestro — vista Seguimiento

Pegar esto como primer mensaje en Claude Code, en la raíz del repo de WhatsPro. Los documentos de referencia están en `docs/seguimiento/`; leelos cuando cada fase los necesite, no todos de entrada.

## Encargo

Construí la vista **Seguimiento** en `/seguimiento`: agenda de contactos en miniatura agrupados por etapa del embudo, filtrable por etiqueta y por segmento (Todos · Leads · Clientes), con drag & drop para cambiar de etapa, chat en un panel lateral colapsable, panel de información del contacto configurable (que también aplica al chat principal) y programación de mensajes desde la tarjeta. Diseño ultra minimalista siguiendo `STYLE.md` y `docs/seguimiento/02-SPEC-PANTALLA.md`.

La Fase 0 (reconocimiento) ya está hecha: `docs/seguimiento/ESTADO.md`. No la repitas; verificá con `git status` que el árbol de trabajo sigue como dice ahí y empezá por la Fase 1.

## Reglas de producción (no negociables)

1. **No se crea ningún endpoint de lectura nuevo mientras uno existente sirva.** La lista sale de `/api/chats?scope=kanban` y `/api/chats/kanban-metadata`. Si medís que la carga supera 1,5 s con los 920 contactos del equipo 2, recién ahí se propone un endpoint dedicado, y se propone antes de escribirlo.
2. **Una sola migración** (`0095_chat_panel_preferences.sql`) y sólo en la Fase 4. Se aplica con `psql` dentro del contenedor y se registra en `lib/db/migrations/meta/_journal.json` en el mismo commit — un desfasaje ahí rompe los Server Components (ver memoria `project_drizzle_journal_desync`).
3. **Cambiar la etapa se hace únicamente con `PUT /api/contacts/[id]/funnel-stage`.** Ya registra la actividad, escribe el mensaje de sistema y emite `kanban-stage-update`. No se escribe `contacts.funnel_stage_id` desde ningún otro lado.
4. **El chat embebido no reusa `MessageBubble`.** Se extrae `ChatCliente` a `components/chat/ChatEmbebido.tsx` y se parametrizan los tokens. Enviar = `POST /api/messages/send`. Nada de lógica de envío nueva.
5. **`ChatSidebar.tsx` no se reescribe.** Se envuelve cada sección existente en `<PanelSection id="...">` y se aplica orden/visibilidad desde las preferencias. El JSX interno de cada sección queda igual.
6. **Tailwind v4: clases literales.** Nunca `bg-${color}-500`. Si un color depende de datos (etiqueta, temperatura), va un mapa cerrado como `TAG_STYLES` en `ContactTagsEditor.tsx`.
7. **Nada con fechas se agrega en SQL** ni se pasa un `Date` a `FILTER`/`date_trunc` con parámetro. Los conteos por sección se hacen en el cliente.
8. **`Intl.*` siempre dentro de try/catch** cuando el dato viene de la base (teléfonos, monedas). Un `RangeError` tumba la pantalla entera.
9. **Un mensaje por request.** El panel envía exactamente un mensaje por clic y deshabilita el botón hasta la respuesta.
10. **Los permisos deciden qué se dibuja**, no qué se deshabilita. Sin `messagesSend` no hay caja de texto; sin `scheduledMessagesWrite` no hay "Programar".
11. **Todo literal pasa por i18n** (namespace `Seguimiento` en `messages/es.json`, `en.json`, `pt.json`) y `npm run i18n:check` queda verde.
12. **Cada fase cierra con** `pnpm typecheck`, `pnpm build`, smoke test navegando la pantalla contra la base real con puppeteer capturando `window.onerror`, y un commit propio. No se mezclan fases en un commit.
13. **Deploy** sólo con `pnpm run deploy:saasfy`.

## Fases

### Fase 1 — Cimientos: ruta, datos, agenda por etapa, filtros

Entrega una pantalla navegable sin chat ni drag & drop.

- `app/[locale]/(dashboard)/seguimiento/page.tsx` (server, 5 líneas) → `components/seguimiento/SeguimientoApp.tsx` (cliente).
- Entrada en el menú en los tres lugares: `components/interface/use-navigation.ts` (`coreDefs` + `NAV_PERMISSION_MAP`), `components/interface/Sidebar.tsx` (`allNavItems`) y `lib/menu/core-nav-items.ts` (`CORE_NAV_ITEMS`). Icono `Target` de lucide. Permiso `contacts`.
- Hook `useSeguimientoData()` en `components/seguimiento/use-seguimiento-data.ts`: SWR de `/api/funnel-stages`, `/api/funnel-stage-groups`, `/api/chats?scope=kanban`, `/api/chats/kanban-metadata`, `/api/tags`, `/api/team`. Deriva `ContactoCard[]` (documento 03 §2) y `secciones: { etapa, contactos }[]` en un `useMemo`.
- Estado de la vista en la URL (`useSearchParams`): `?grupo=`, `?seg=todos|leads|clientes`, `?tags=1,2`, `?q=`. Último grupo elegido en `localStorage['seguimiento.grupo']`.
- Toolbar, secciones plegables con conteo, tarjetas, "Ver las N restantes", estados vacío y cargando (documento 02).
- Cada tarjeta: botón **Abrir chat** que por ahora navega a `/dashboard/chat/[numero]` (se cambia en la Fase 2).

Criterio de aceptación: con el equipo 2 la pantalla carga en menos de 1,5 s, muestra 895 contactos repartidos en las secciones correctas del grupo Ventas y el filtro por etiqueta reduce las secciones sin recargar.

### Fase 2 — Chat lateral

- Extraer `lib/plugins/tasks/ui-nueva/views/ChatCliente.tsx` → `components/chat/ChatEmbebido.tsx` con props `{ remoteJid, instanceId, nombre, teamId, chatId, className }` y tokens del core. `ChatCliente` pasa a ser un wrapper de una línea que le pasa sus tokens (no se rompe Tareas).
- `components/seguimiento/PanelLateral.tsx`: panel derecho de 420 px (documento 02 §5), pestañas Chat · Info · Programados, botón colapsar, `Esc` cierra. En móvil es un `Sheet` a pantalla completa.
- Abrir chat desde la tarjeta marca leído (`POST /api/chats/mark-read`) y baja el contador de la tarjeta.
- Pusher: `new-message` actualiza snippet/unread de la tarjeta y el panel; `chat-list-update` idem.
- Pestaña **Info** en esta fase = `ChatSidebar` tal cual, con `chatDetails` y `chatId` del contacto abierto.
- Pestaña **Programados** vacía con placeholder (se llena en la Fase 5).

Criterio: se puede leer y contestar a un contacto sin salir de `/seguimiento`; el mensaje enviado aparece en el panel y en `/dashboard/chat/[jid]` al abrirlo.

### Fase 3 — Drag & drop y acciones rápidas

- `DragDropContext` + un `Droppable` por sección (`droppableId = stage.id | 'unassigned'`) + `Draggable` por tarjeta. Copiar `onDragEnd` del Kanban (`KanbanBoard.tsx:381-406`) y el optimismo con rollback de `BookmarksBoard.tsx:379-404`.
- Menú `⋯` de la tarjeta: **Mover a etapa** (select, y es la única forma en móvil), **Etiquetas** (`ContactTagsEditor` en popover), **Programar mensaje** (stub hasta la Fase 5), **Convertir a cliente** (`ConvertLeadActions`), **Abrir chat completo** (link).
- Suscripción a `kanban-stage-update` para reflejar cambios hechos desde otra pantalla.

Criterio: arrastrar una tarjeta de "Conversando" a "Seguimiento" escribe el mensaje de sistema en el chat y el Embudo lo muestra movido sin recargar.

### Fase 4 — Panel de información configurable

Documento 04 completo. Resumen:

- `lib/chat-panel/types.ts`: catálogo cerrado de ids de sección, categorías, `DEFAULT_LAYOUT`.
- `lib/chat-panel/preferences.ts`: `normalizeChatPanelLayout()` tolerante (descarta ids desconocidos, agrega los nuevos al final).
- Migración `0095_chat_panel_preferences.sql` + tabla `teamChatPanelPreferences` en `lib/db/schema.ts`.
- `GET/PATCH /api/chat-panel/preferences`.
- `components/chat/PanelSection.tsx` y envoltura de las 12 secciones de `ChatSidebar.tsx`.
- `components/chat/ChatPanelCustomizeDialog.tsx` clonado de `components/escritorio/CustomizeDialog.tsx`.
- Botón "Personalizar" (icono `SlidersHorizontal`) en la cabecera del panel, tanto en Seguimiento como en `/dashboard/chat`.

Criterio: ocultar "Media" y subir "Etapa" arriba de todo en Seguimiento se ve igual al abrir cualquier chat en `/dashboard/chat`, y al revés.

### Fase 5 — Mensajes programados

Documento 05. Exportar `MessageFormDialog`, `RecipientPicker`, `FormState`, `defaultForm` desde `lib/plugins/scheduled-messages/ui/`; "Programar mensaje" abre el diálogo con `targetNumbers: [telefono]` y `name: "Seguimiento · {nombre}"`; la pestaña Programados lista los del contacto (filtrado en cliente sobre `GET /api/plugins/scheduled-messages`) con pausar/reanudar/borrar.

Criterio: programar desde la tarjeta aparece en `/plugins/scheduled-messages` con el `nextRunAt` correcto y el cron lo envía.

### Fase 6 — Pulido, móvil, QA, deploy

- Móvil: una columna, sin drag & drop, panel como Sheet, barra inferior intacta.
- Atajos: `/` enfoca la búsqueda, `Esc` cierra el panel, `j`/`k` opcional.
- `docs/seguimiento/07-CHECKLIST-QA.md` completo y marcado.
- `pnpm run deploy:saasfy`.

## Formato de cierre de cada fase

Un mensaje corto con: qué archivos se crearon/tocaron, qué se verificó y cómo (comando + resultado), qué quedó fuera y por qué, y el hash del commit. Si algo del documento 03 resultó falso en el código, decirlo ahí y actualizar `ESTADO.md`.
