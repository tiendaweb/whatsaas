# Especificación de pantalla — Seguimiento

Principio: **una pantalla, cero navegación**. Todo lo que el usuario necesita para decidir qué hacer con un contacto está a un clic, y la acción se ejecuta en el mismo lugar. Menos es más: sin sombras, sin gradientes, sin iconos decorativos. La jerarquía la dan el tamaño de la tipografía, el color del texto y el espacio.

## 1. Estructura general (escritorio ≥ 1024 px)

```
┌──────────────────────────────────────────────────────────┬──────────────────┐
│ Seguimiento                          [Todos|Leads|Clientes]│  ◂  Nombre       │
│ 🔍 Buscar…   Grupo: Ventas ▾   Etiquetas: (chips)  ⋯      │  Chat·Info·Prog. │
├──────────────────────────────────────────────────────────┤                  │
│ 🆕 Nuevo lead ·································· 41  ▾     │   (burbujas)     │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐  │                  │
│ │ ◯ Juan │ │ ◯ Ana  │ │ ◯ Luis │ │ ◯ Sofi │ │ ◯ Pedro│  │                  │
│ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘  │                  │
│                                    Ver las 36 restantes  │                  │
│ 💬 Conversando ····································· 120 ▾ │ ┌──────────────┐ │
│ ┌────────┐ ┌────────┐ …                                  │ │ Escribí…   ➤ │ │
│                                                          │ └──────────────┘ │
└──────────────────────────────────────────────────────────┴──────────────────┘
```

- Contenedor de página: `flex h-[calc(100dvh-var(--header-h))] bg-background`.
- Columna principal: `flex-1 min-w-0 overflow-y-auto`.
- Panel lateral: `w-[420px] shrink-0 border-l border-border bg-background` cuando está abierto; `w-0` con transición `transition-[width] duration-200` cuando está cerrado. Nunca desplaza el scroll de la columna principal.

## 2. Cabecera y toolbar

Una sola fila fija arriba (`sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border`), con altura 56 px.

| Elemento | Componente | Clases / notas |
|---|---|---|
| Título | `h1` | `text-lg font-semibold tracking-tight`. Sin subtítulo. |
| Segmento global | `Tabs` de shadcn en modo "pills" | `Todos · Leads · Clientes`. Cada pill muestra el conteo en `text-muted-foreground` (`Leads 512`). |
| Búsqueda | `Input` con icono `Search` | `h-9 w-64 rounded-lg`, placeholder "Buscar nombre o teléfono". Filtra en cliente por `name`, `pushName`, `phone`. Atajo `/`. |
| Grupo de etapas | `Select` | Lista de `funnelStageGroups` + "Sin grupo" + "Todas las etapas". Se recuerda en `localStorage['seguimiento.grupo']`. |
| Etiquetas | Fila de chips | `TagPill` de `ContactTagsEditor.tsx`, con `aria-pressed`; las seleccionadas con `ring-1 ring-foreground/40`. Si hay más de 8, un popover "Más etiquetas" con buscador. |
| Densidad | Toggle icono `LayoutGrid` / `List` | Grilla (default) o lista compacta de una línea por contacto. `localStorage['seguimiento.densidad']`. |
| Orden | `DropdownMenu` bajo `⋯` | Último mensaje (default) · Nombre · Sin contestar primero · Temperatura. |

Estado en la URL: `?grupo=1&seg=leads&tags=3,7&q=juan`. Compartir la URL reproduce la vista.

## 3. Secciones por etapa

Una sección por etapa del grupo elegido, en el `order` de la etapa. Al final, siempre, **Sin etapa** (contactos con `funnelStageId = null`), salvo que el segmento sea Clientes y esté vacía.

Cabecera de sección (`sticky top-14 z-[5] bg-background`):

```
{emoji} {nombre de la etapa}  ·  {conteo}                              [▾]
```

- `flex items-center gap-2 px-4 py-2 text-sm font-medium`; conteo en `text-muted-foreground tabular-nums`; línea divisoria `border-b border-border/60`.
- Clic en la cabecera pliega/despliega. Estado de pliegue en `localStorage['seguimiento.plegadas']` (set de ids).
- Cuando una tarjeta se arrastra por encima, la cabecera y el área de la sección toman `bg-muted/60` y un `outline outline-1 outline-dashed outline-foreground/30`. Es el único feedback de drop: sin colores.
- Sección vacía dentro del grupo: se muestra igual con conteo 0 y una línea de altura mínima `min-h-14` para poder soltar ahí.
- Más de 12 tarjetas: se muestran 12 y un botón `variant="ghost" size="sm"` "Ver las N restantes"; al expandir, se muestran todas y el botón pasa a "Mostrar menos". El estado no persiste.

Grilla: `grid gap-2 px-4 pb-4 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]`.

Sección **Sin ficha** (chats sin fila en `contacts`), siempre la última y sólo en el segmento Todos: plegada por defecto, cabecera "Sin ficha · N" con un `Select` chico a la derecha (Último mensaje · Nombre · No leídos) que ordena sólo esa sección. Sus tarjetas no son arrastrables, no muestran etiquetas ni temperatura, y el menú `⋯` sólo ofrece Abrir chat, Mover a etapa (crea la ficha) y Abrir chat completo.

## 4. Tarjeta de contacto (miniatura)

```
┌─────────────────────────────────┐
│ ◯  Juan Pérez            🔴 3   │   ← avatar 32 px, nombre, unread
│    Hola, quería saber si…       │   ← último mensaje, 1 línea, truncado
│    ● hace 2 h   [vip] [web]     │   ← temperatura, tiempo, etiquetas
│                        [Chat] ⋯ │   ← acciones (aparecen en hover/focus)
└─────────────────────────────────┘
```

| Parte | Regla |
|---|---|
| Contenedor | `group relative rounded-xl border border-border bg-card p-3 hover:border-foreground/25 focus-within:border-foreground/40 transition-colors`. Sin sombra. Seleccionada (chat abierto): `border-foreground/60`. |
| Avatar | `Avatar` 32 px con `profilePicUrl`; fallback iniciales en `bg-muted text-xs`. |
| Nombre | `text-sm font-medium truncate`. Orden de preferencia: `contact.name` → `chat.pushName` → teléfono formateado. |
| No leídos | Badge `h-5 min-w-5 rounded-full bg-foreground text-background text-[11px] tabular-nums` sólo si `unreadCount > 0`. |
| Último mensaje | `text-xs text-muted-foreground truncate`. Si `lastMessageFromMe`, prefijo "Vos: ". Sin mensaje: "Sin mensajes". |
| Temperatura | Punto de 6 px: `hot` → `bg-red-500`, `warm` → `bg-amber-400`, `cold` → `bg-sky-400`. Mapa literal cerrado; `title` con la palabra. |
| Tiempo | `hace 2 h` con `formatDistanceToNow` de `date-fns` (locale `es`) sobre `lastMessageTimestamp`; envuelto en try/catch. |
| Etiquetas | Máximo 2 `TagPill` + "+N". Clic en "+N" abre el editor. |
| Cliente | Si tiene `customerIds`, un icono `BadgeCheck` de 14 px al lado del nombre, `text-muted-foreground`. Sin texto. |
| VIP | Icono `Star` 14 px relleno, `text-amber-500`. |
| Acciones | Fila inferior `opacity-0 group-hover:opacity-100 group-focus-within:opacity-100`: botón **Chat** (`size="sm" variant="secondary" h-7`) y `⋯` (`DropdownMenu`). En pantallas táctiles siempre visibles. |
| Drag handle | Toda la tarjeta es arrastrable (`Draggable`); el cursor pasa a `grab`. Los botones frenan la propagación. |

Menú `⋯`: Abrir chat · Mover a etapa ▸ · Etiquetas… · Programar mensaje · Convertir a cliente (sólo si no lo es) · Abrir chat completo (nueva pestaña).

Modo lista (densidad compacta): una fila `h-11 grid grid-cols-[32px_1fr_auto_auto] items-center gap-3 px-3 rounded-lg hover:bg-muted/60` con avatar, nombre + snippet en la misma línea (`nombre · snippet`), etiquetas, tiempo y unread. Mismas acciones.

## 5. Panel lateral

Cabecera (`h-14 flex items-center gap-2 px-3 border-b border-border`):

- Botón `ChevronRight` (colapsar) a la izquierda.
- Avatar 28 px + nombre (`text-sm font-medium truncate`) + teléfono (`text-xs text-muted-foreground`).
- A la derecha: `SlidersHorizontal` (personalizar panel de Info; sólo visible en la pestaña Info) y `ExternalLink` (abrir `/dashboard/chat/[numero]`).

Pestañas (`Tabs` shadcn, `variant` de línea, no de caja): **Chat · Info · Programados**. La última pestaña usada se recuerda en `localStorage['seguimiento.pestana']`.

- **Chat**: `ChatEmbebido` ocupando `flex-1 min-h-0`. Burbujas propias `bg-primary/10`, ajenas `bg-muted`; `rounded-2xl`; `text-sm`; hora `text-[10px] text-muted-foreground`. Notas internas con borde punteado y prefijo "Nota". Caja de texto abajo: `Textarea` autosize de 1 a 4 líneas, `Enter` envía, `Shift+Enter` salto de línea, botón `Send` icono. Sin adjuntos en la v1 (el link "Abrir chat completo" cubre eso).
- **Info**: `ChatSidebar` en modo panel (documento 04). Scroll propio.
- **Programados**: lista de programados del contacto + botón "Programar" (documento 05).

Cerrado: el panel colapsa a 0 px y en la esquina superior derecha de la columna principal queda un botón flotante `MessageSquare` con el nombre del último contacto abierto, para volver a abrirlo. `Esc` cierra; clic en otra tarjeta cambia de contacto sin cerrar.

Cambio de contacto: `ChatEmbebido` se remonta con `key={remoteJid}` para que no queden mensajes del anterior.

## 6. Drag & drop

- `DragDropContext` envuelve la columna principal. Un `Droppable` por sección (`droppableId = String(stage.id)` o `'unassigned'`, `type="CARD"`). `Draggable` por tarjeta con `draggableId = String(contactId)`.
- Soltar en otra sección: se mueve al instante en el estado local, `PUT /api/contacts/[id]/funnel-stage`, y si falla vuelve atrás con `toast.error`.
- Soltar en la misma sección: no hace nada (no hay orden dentro de la etapa).
- Con filtro de texto o de etiquetas activo el drag sigue habilitado: se mueve el contacto, y si deja de cumplir el filtro desaparece con `toast` "Movido a {etapa}".
- Móvil (`pointer: coarse`): drag deshabilitado (`isDragDisabled`), se usa **Mover a etapa** del menú.

## 7. Estados

| Estado | Qué se ve |
|---|---|
| Cargando | Esqueleto: 3 cabeceras de sección y 10 tarjetas `Skeleton` de 84 px. Nunca un spinner central. |
| Sin contactos en el equipo | Centro: icono `Users` gris, "Todavía no hay contactos", texto "Cuando lleguen mensajes van a aparecer acá", botón "Ir al inbox". |
| Filtro sin resultados | Bajo la toolbar: "Nada coincide con estos filtros" + botón "Limpiar filtros". Las secciones no se dibujan. |
| Error de carga | Banner fino `border-destructive/40 text-destructive` arriba con "Reintentar". |
| Sin permiso | El servidor redirige a `/dashboard` (no se dibuja nada). |
| Sin instancia conectada | El panel de chat muestra la conversación pero la caja de texto se reemplaza por "Conectá WhatsApp para responder" con link a ajustes. |

## 8. Móvil (< 768 px)

- Toolbar en dos filas: fila 1 título + segmento; fila 2 búsqueda + grupo (los chips de etiquetas pasan a un botón "Etiquetas" que abre un `Sheet` inferior).
- Grilla de una columna en modo lista (densidad compacta forzada).
- Panel lateral = `Sheet` lateral a pantalla completa con las mismas pestañas; botón atrás en la cabecera.
- Sin drag & drop.
- La barra inferior de navegación se mantiene; el panel abierto la tapa.

## 9. Accesibilidad y atajos

- Toda tarjeta es `role="article"` con `aria-label="{nombre}, etapa {etapa}, {n} sin leer"`.
- Botones con `aria-label`; chips de etiqueta con `aria-pressed`.
- `/` enfoca búsqueda; `Esc` cierra panel o limpia la búsqueda si está enfocada.
- Contraste mínimo AA con los tokens actuales (no introducir grises propios).
