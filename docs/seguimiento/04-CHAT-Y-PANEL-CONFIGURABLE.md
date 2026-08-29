# Chat lateral y panel de información configurable

## 1. Chat embebido (`components/chat/ChatEmbebido.tsx`)

Origen: `lib/plugins/tasks/ui-nueva/views/ChatCliente.tsx` (185 líneas). Ya hace lo esencial: lee `/api/messages?jid=…&limit=60`, se suscribe a `team-{teamId}` / `new-message`, envía por `POST /api/messages/send`. Deliberadamente **no** usa `MessageBubble` (arrastra el tema del chat principal y una decena de callbacks).

Props:

```
type ChatEmbebidoProps = {
  remoteJid: string
  instanceId?: number | null
  chatId?: number | null          // para mark-read al montar y al recibir
  nombre: string
  teamId: number | null
  puedeEnviar: boolean            // permiso messagesSend + instancia conectada
  tokens?: 'core' | 'tareas'      // 'core' = bg-muted/bg-primary/10; 'tareas' = var(--t-*)
  className?: string
}
```

Reglas:

- `key={remoteJid}` en el padre: se remonta al cambiar de contacto.
- Al montar y con cada `new-message` del mismo JID: `POST /api/chats/mark-read`.
- Scroll al final al montar y cuando llega un mensaje propio; si el usuario está leyendo arriba y llega un ajeno, aparece un botón "↓ Nuevos mensajes" en vez de saltar.
- "Cargar anteriores" arriba de la lista, con `before=` si `/api/messages` lo soporta; si no, sube `limit` a 200 y listo.
- Envío: `Enter` envía, `Shift+Enter` salto, botón deshabilitado mientras `enviando`; error → `toast.error` y el texto vuelve a la caja.
- Nota interna: switch pequeño "Nota" al lado del botón enviar; manda `isInternal: true`.
- Tipos de mensaje: texto, imagen (miniatura), audio (`CustomAudioPlayer` de `components/ui/custom-audio-player`), documento (nombre + link), ubicación (link a maps), sistema (`@@syslog_*` renderizado como línea centrada gris con el texto del evento). Todo lo demás: "[{tipo}]" en cursiva.
- `ChatCliente.tsx` queda así: `export function ChatCliente(p) { return <ChatEmbebido {...p} tokens="tareas" /> }`. Tareas no cambia de aspecto.

## 2. Panel de información configurable

### Problema

`components/chat/ChatSidebar.tsx` (1264 líneas) dibuja 12 secciones en un orden fijo sin ninguna configuración. En Seguimiento hace falta que el usuario decida qué ve y en qué orden, y el pedido es explícito: **la misma configuración tiene que aplicar al sidebar del chat en `/dashboard/chat/[jid]`**.

### Patrón a clonar

El Escritorio ya resolvió esto: `teamDesktopPreferences` (`lib/db/schema.ts:5196-5224`) + `lib/desktop/types.ts` + `lib/desktop/preferences.ts` (`normalizeDesktopLayout`) + `GET/PATCH /api/escritorio/preferences` + `components/escritorio/CustomizeDialog.tsx`.

### Catálogo de secciones (`lib/chat-panel/types.ts`)

Ids cerrados, en el orden actual del sidebar:

| id | Sección actual en `ChatSidebar.tsx` | Categoría | Depende de |
|---|---|---|---|
| `perfil` | Cabecera avatar + nombre + teléfono (848-860) | Contacto | — (fija: siempre primera, no se oculta) |
| `agenda` | `ChatAgendaPicker` (877) | Organización | — |
| `planner` | Acción Business Woman (879) | Apps | mini-app activa |
| `comercial` | `CommercialPanel` (881) | Comercial | plugins deals/finance/customers |
| `aapp` | Bloque AAPP SPACE (883-975) | Apps | plugin aapp-space |
| `etiquetas` | `ContactTagsEditor` (978-982) | Contacto | — |
| `agente` | Select agente (984-994) | Organización | — |
| `departamento` | Select departamento (996-1006) | Organización | — |
| `etapa` | Select etapa (1008-1022) | Organización | — |
| `notas` | Notas (1024-1035) | Contacto | — |
| `tareas` | `ContactTaskPanel` | Apps | plugin tasks |
| `radar` | `RadarPanel` | Apps | plugin radar |
| `media` | Tabs imágenes/videos/audio/docs/ubicación/contactos/links | Archivos | — |

`perfil` es fija (siempre primera, no se oculta). El resto se ordena y oculta libremente. Las secciones que dependen de un plugin no activo no se listan en el diálogo (igual que hoy no se dibujan).

```
type ChatPanelLayout = { version: 1; order: ChatPanelSectionId[]; hidden: ChatPanelSectionId[] }
DEFAULT_LAYOUT = { version: 1, order: [orden de la tabla], hidden: [] }
```

Sugerencia de default para Seguimiento vs. chat: **el mismo**. Un solo layout por usuario. Si más adelante hace falta uno por contexto, se agrega `scope: 'chat' | 'seguimiento'` a la tabla; no ahora.

### Base de datos (migración 0095)

```
CREATE TABLE team_chat_panel_preferences (
  id serial PRIMARY KEY,
  team_id integer NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  layout jsonb NOT NULL DEFAULT '{"version":1,"order":[],"hidden":[]}',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);
```

Mismo commit: tabla `teamChatPanelPreferences` en `lib/db/schema.ts`, entrada en `_journal.json`, aplicación con `psql` en el contenedor.

### API

`GET /api/chat-panel/preferences` → `{ layout }` normalizado (`normalizeChatPanelLayout`: descarta ids desconocidos, agrega al final los que falten, dedup).
`PATCH /api/chat-panel/preferences` → body zod `{ version: 1, order: string[], hidden: string[] }`, upsert por `(teamId, userId)`.

Guardia: `getUserPermissionContext()`; sin sesión 401. No hace falta permiso especial: es preferencia propia.

### Aplicación en `ChatSidebar.tsx` sin reescribirlo

1. Hook `useChatPanelLayout()` (`components/chat/use-chat-panel-layout.ts`): SWR de `GET`, `save()` con optimismo, fallback a `DEFAULT_LAYOUT`.
2. Componente `PanelSection`:

```
<PanelSection id="etiquetas" layout={layout}>
  {…el JSX que ya existe…}
</PanelSection>
```

`PanelSection` devuelve `null` si `hidden.includes(id)` y setea `style={{ order: layout.order.indexOf(id) }}`. El contenedor de secciones pasa a `flex flex-col` para que `order` funcione. **El JSX interno de cada sección no se toca.** Las pestañas de media son una sección (`media`) que envuelve las tabs enteras.

3. Botón `SlidersHorizontal` en la cabecera del sidebar → `ChatPanelCustomizeDialog`.
4. Prop nueva opcional `modo?: 'chat' | 'panel'` en `ChatSidebar`: en `'panel'` no dibuja el botón de colapsar propio (lo maneja `PanelLateral`) y usa `h-full` en vez de la altura del chat principal. Nada más cambia.

### Diálogo de personalización

Clon de `components/escritorio/CustomizeDialog.tsx:42` con `labels` en español: pestañas por categoría (Contacto · Organización · Comercial · Apps · Archivos), flechas arriba/abajo, ojo para ocultar, botón "Restablecer". Guarda al cerrar con `PATCH`; mientras está abierto los cambios se ven en vivo en el panel de al lado.

### Qué NO se hace

- No se persisten "colapsados" por sección: la sección o se ve o no se ve.
- No hay layouts por equipo ni por rol; es por usuario.
- No se tocan las secciones internamente (qué muestra "Comercial" lo decide `commercial-snapshot`, no este layout).
