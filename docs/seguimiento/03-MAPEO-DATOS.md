# Mapeo de datos — Seguimiento

Cada cosa que la pantalla muestra o hace, con la tabla, el endpoint y el componente que ya existen. Si algo de acá resulta falso al implementar, se corrige acá y se anota en ESTADO.

## 1. Lectura: una sola carga

| Necesidad | Endpoint existente | Archivo | Qué devuelve |
|---|---|---|---|
| Contactos con chat, etapa, etiquetas, no leídos, último mensaje | `GET /api/chats?scope=kanban` | `app/api/chats/route.ts:26` | Chats del equipo (también sin mensajes) con `contact { funnelStage, assignedUser, assignedDepartment, tags[] }`, `unreadCount`, `lastMessageText`, `lastMessageTimestamp`, `lastMessageFromMe`, `profilePicUrl`, `remoteJid`, `instanceId`. Respeta `chatVisibility`. |
| Es cliente / a qué clientes pertenece | `GET /api/chats/kanban-metadata` | `app/api/chats/kanban-metadata/route.ts` | `metadata[contactId].customerIds[]` (más empresa/proyecto). Tipo `KanbanMetadata` en `KanbanBoard.tsx:97-107`. |
| Etapas | `GET /api/funnel-stages` | `app/api/funnel-stages/route.ts` | `{ id, name, emoji, order, groupId }[]`. **Ojo:** si el equipo no tiene etapas, el GET crea 4 por defecto. |
| Grupos de etapas | `GET /api/funnel-stage-groups` | `app/api/funnel-stage-groups/route.ts` | `{ id, name, description, order }[]`. |
| Etiquetas del equipo | `GET /api/tags` | `app/api/tags/route.ts:19` | `{ id, name, color }[]`. |
| Equipo, usuario, permisos | `GET /api/team`, `GET /api/user`, `GET /api/team/membership` | ya usados por el layout | `teamId` para Pusher; permisos para decidir qué se dibuja. |

Con 920 contactos el `scope=kanban` pesa unos cientos de KB. Se mide en la Fase 1; si supera 1,5 s se propone `GET /api/seguimiento` con proyección mínima, **antes de escribirlo**.

## 2. Modelo de la vista

`ContactoCard`, derivado en `useMemo` a partir de la respuesta de `/api/chats`:

```
type ContactoCard = {
  contactId: number            // contacts.id — clave del drag y de las mutaciones
  chatId: number               // chats.id — mark-read, ChatSidebar
  remoteJid: string            // chats.remoteJid — chat embebido
  instanceId: number | null
  numero: string               // remoteJid sin @s.whatsapp.net ni sufijo :N
  nombre: string               // contact.name ?? chat.pushName ?? numero formateado
  avatarUrl: string | null     // chats.profilePicUrl
  etapaId: number | null       // contact.funnelStageId
  etiquetas: { id, name, color }[]
  unread: number               // chats.unreadCount
  ultimoTexto: string | null   // chats.lastMessageText
  ultimoTs: number | null      // chats.lastMessageTimestamp
  ultimoEsMio: boolean         // chats.lastMessageFromMe
  temperatura: 'hot'|'warm'|'cold'   // contacts.temperature
  esVip: boolean               // contacts.isVip
  esCliente: boolean           // metadata[contactId].customerIds.length > 0
  esGrupo: boolean             // remoteJid termina en @g.us → se excluye de la vista
}
```

Se excluyen los grupos de WhatsApp (`@g.us`).

Los chats **sin fila en `contacts`** no se excluyen: van a la sección "Sin ficha" al final de la agenda (`contactId: null`, `etapaId: null`, `etiquetas: []`). Se puede abrir el chat; no se arrastran ni se etiquetan. "Mover a etapa" desde el menú crea la ficha (`POST /api/contacts` con `chatId` y `name`) y después llama al endpoint de etapa.

## 3. Segmento global

| Segmento | Regla |
|---|---|
| Todos | Todos los `ContactoCard`. |
| Leads | `etapaId !== null && !esCliente`. Misma definición que `listLeads(..., { onlyStaged })` en `lib/desktop/crm.ts:58-64`. |
| Clientes | `esCliente` (vinculado en `team_customer_contacts`). |

No existe una columna "tipo" en `contacts`; si algún día se agrega, este es el único lugar que cambia.

## 4. Agrupación por etapa

- Grupo elegido → `funnelStages.filter(s => s.groupId === grupoId)` ordenadas por `order`. "Todas las etapas" → todas. "Sin grupo" → `groupId === null`.
- Sección "Sin etapa" → contactos con ficha y `etapaId === null`. Al final del grupo.
- Sección "Sin ficha" → chats sin `contact`. **Siempre la última**, plegada por defecto, con su propio control de orden (último mensaje · nombre · no leídos) independiente del orden global. Sólo en el segmento Todos.
- Si el grupo tiene etapas duplicadas en `order` (pasa: Ventas tiene tres con `order = 3`), se desempata por `id`.
- **No se usa `funnelStageGroupMembers`** (membresía N:M) en la v1: el Embudo agrupa por `funnelStages.groupId`, Seguimiento hace lo mismo para que las dos pantallas coincidan.

## 5. Filtros

| Filtro | Regla |
|---|---|
| Búsqueda | `nombre`, `pushName` y `numero` con `includes` sin acentos ni mayúsculas (`normalize('NFD')`). |
| Etiquetas | OR: la tarjeta pasa si tiene alguna de las seleccionadas. |
| Orden | Último mensaje desc (default) · Nombre asc · Sin contestar primero (`!ultimoEsMio && unread > 0` primero, después el resto por último mensaje) · Temperatura (`hot > warm > cold`). |

Todo en cliente. Los conteos de las pills del segmento y de las cabeceras se calculan sobre el resultado del filtro, así el usuario ve "cuántos quedan".

## 6. Escritura

| Acción | Endpoint | Archivo | Notas |
|---|---|---|---|
| Cambiar etapa (drag o menú) | `PUT /api/contacts/[id]/funnel-stage` `{ stageId: number \| null }` | `app/api/contacts/[id]/funnel-stage/route.ts:10-72` | Valida la etapa, registra actividad, crea mensaje de sistema `@@syslog_moved_to_stage`, emite Pusher `kanban-stage-update`. |
| Agregar etiqueta | `POST /api/contacts/[id]/tags` `{ tagId }` | `app/api/contacts/[id]/tags/route.ts` | Lo hace `ContactTagsEditor` solo. |
| Quitar etiqueta | `DELETE /api/contacts/[id]/tags/[tagId]` | ídem `[tagId]/route.ts` | ídem. |
| Crear etiqueta | `POST /api/tags` | `app/api/tags/route.ts:40` | ídem. |
| Marcar leído | `POST /api/chats/mark-read` `{ chatId }` | `app/api/chats/mark-read/route.ts` | Emite `chat-list-update`. |
| Enviar texto | `POST /api/messages/send` `{ recipientJid, text, instanceId, isInternal? }` | `app/api/messages/send/route.ts` | Un mensaje por request. `isInternal: true` = nota interna, no sale a WhatsApp. |
| Convertir a cliente | `POST /api/plugins/deals/convert` | vía `ConvertLeadActions` | `{ contactId, target: 'customer' }`. |
| Programar mensaje | `POST /api/plugins/scheduled-messages` | documento 05 | |

## 7. Realtime (canal `team-{teamId}`)

| Evento | Payload | Qué hace Seguimiento |
|---|---|---|
| `new-message` | `{ ...message, remoteJid, instanceId, timestamp }` | Actualiza `ultimoTexto/ultimoTs/ultimoEsMio` de la tarjeta; si el chat no está abierto en el panel, `unread + 1`; si está abierto, el panel agrega la burbuja y hace mark-read. |
| `chat-list-update` | `{ id, lastMessageTimestamp, remoteJid, unreadCount }` | Sobrescribe `unread` y `ultimoTs` de la tarjeta. |
| `kanban-stage-update` | `{ contactId, funnelStageId }` | Mueve la tarjeta de sección (si el cambio vino de otra pantalla). |
| `contact-update` | `{ remoteJid, chatId }` | `mutate` de `/api/chats?scope=kanban` con debounce de 1 s. |

Suscripción con `usePusher()` de `providers/pusher-provider.tsx`, patrón de `KanbanBoard.tsx:317-331`. Normalizar JID con `jid.split(':')[0]`.

## 8. Componentes reutilizados tal cual

| Componente | Archivo | Uso |
|---|---|---|
| `ContactTagsEditor`, `TagPill`, `TAG_STYLES` | `components/chat/ContactTagsEditor.tsx` | Chips de filtro y editor en la tarjeta. |
| `ConvertLeadActions` | `components/chat/ConvertLeadActions.tsx:26-35` | Menú "Convertir a cliente". |
| `ChatSidebar` | `components/chat/ChatSidebar.tsx:586` | Pestaña Info. |
| `CommercialPanel` | dentro de `ChatSidebar` | Se hereda. |
| `Avatar`, `Badge`, `Button`, `DropdownMenu`, `Popover`, `Select`, `Sheet`, `Skeleton`, `Tabs`, `Tooltip` | `components/ui/` | shadcn. |
| `usePusher` | `providers/pusher-provider.tsx:37` | Realtime. |

## 9. Componentes que se extraen o exportan (cambios fuera de `components/seguimiento/`)

| Hoy | Cambio |
|---|---|
| `lib/plugins/tasks/ui-nueva/views/ChatCliente.tsx` | Se mueve la lógica a `components/chat/ChatEmbebido.tsx`; `ChatCliente` queda como wrapper con sus tokens. |
| `MessageFormDialog`, `RecipientPicker`, `FormState`, `defaultForm` en `lib/plugins/scheduled-messages/ui/ScheduledMessagesDashboard.tsx` | Se mueven a `lib/plugins/scheduled-messages/ui/MessageFormDialog.tsx` y `RecipientPicker.tsx` y se exportan. El dashboard los importa de ahí. |
| Secciones de `ChatSidebar.tsx` | Se envuelven en `PanelSection` (documento 04). |
| Menú: `use-navigation.ts`, `Sidebar.tsx`, `core-nav-items.ts` | Entrada "Seguimiento". |

## 10. Archivos nuevos

```
app/[locale]/(dashboard)/seguimiento/page.tsx
components/seguimiento/SeguimientoApp.tsx          // orquesta estado de URL, panel, DnD
components/seguimiento/use-seguimiento-data.ts     // SWR + derivación de ContactoCard y secciones
components/seguimiento/Toolbar.tsx
components/seguimiento/SeccionEtapa.tsx            // cabecera plegable + Droppable + grilla
components/seguimiento/TarjetaContacto.tsx         // miniatura + menú ⋯
components/seguimiento/FilaContacto.tsx            // modo lista
components/seguimiento/PanelLateral.tsx            // Chat · Info · Programados
components/seguimiento/ProgramadosContacto.tsx     // Fase 5
components/seguimiento/tipos.ts
components/chat/ChatEmbebido.tsx                   // Fase 2
components/chat/PanelSection.tsx                   // Fase 4
components/chat/ChatPanelCustomizeDialog.tsx       // Fase 4
lib/chat-panel/types.ts, preferences.ts            // Fase 4
app/api/chat-panel/preferences/route.ts            // Fase 4
lib/db/migrations/0095_chat_panel_preferences.sql  // Fase 4
```
