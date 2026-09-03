# Radar · Personalización por IA (iconos, secciones, tamaños y bloques)

> Actualizado: 2026-08-23 · rama `feat/tareas-rediseno`
> Contrato: `lib/plugins/radar/shared/blocks.ts` · Tools MCP: `lib/plugins/grok-connector/server/radar-actions.ts`

Radar es una app construible: las IA (Grok / ChatGPT / Claude, vía el conector MCP `whatspro_*`)
pueden crear y modificar el menú, los widgets, sus iconos y sus tamaños sin tocar código.
Este documento es el mapa de **qué se puede cambiar, con qué herramienta y dónde queda guardado**.

## 1. Los tres niveles de icono

Hay tres lugares con icono, y cada uno tiene SU herramienta. Confundirlos es el error más común:

| Nivel | Qué es | Herramienta | Dónde se guarda |
| --- | --- | --- | --- |
| **Sección** (card del menú lateral) | La entrada del menú que agrupa widgets. En el menú colapsado el icono es lo único visible. | `whatspro_radar_set_appearance` (builtins) o `whatspro_radar_manage_section action="update"` (cualquiera) | `team_plugins.settings.appearance` |
| **Widget** (encabezado de la tarjeta) | La tarjeta del tablero o del panel del chat. | `whatspro_radar_patch_widget` (sin reenviar bloques) | `team_radar_widgets.icon/tone` |
| **Bloque** (elemento interno) | Cards, KPIs, ítems de lista, tiles… dentro de un widget. | `whatspro_radar_upsert_widget` (reescribe los bloques) | `team_radar_widgets.blocks` (jsonb) |

Reglas que el catálogo (`whatspro_radar_block_catalog`) explica a las IA:

- `icon` y `tone` son **listas cerradas** (`RADAR_ICONS`, ~103 iconos de lucide; `RADAR_TONES`, 10 tonos).
  Un nombre inventado se descarta (el renderer cae a `Sparkles`). Motivo: Tailwind v4 no genera
  clases concatenadas y los imports dinámicos de iconos arbitrarios rompen el bundle.
- El catálogo devuelve `iconGuide` (iconos agrupados por familia con su "para qué"),
  `sectionIcons` (el icono **efectivo** de cada sección, para no repetirlo en un widget de esa
  sección) y `blockDefaultIcons` (el icono que hereda un widget creado sin `icon`: el de su
  primer bloque).

## 2. El menú es editable: secciones dinámicas

`whatspro_radar_manage_section` — seis acciones:

| Acción | Qué hace |
| --- | --- |
| `create` | Sección personalizada nueva (`id` slug, `label`, `icon`, `tone`, `hint`). Aparece al final del menú, vacía. Máximo 12 por equipo. |
| `update` | Cambia `label`/`icon`/`tone`/`hint` de cualquier sección (builtin o personalizada). |
| `reorder` | Reordena el menú entero con `order=[ids]`. Lista parcial vale: lo que falta queda después en su orden actual. |
| `hide` / `show` | Saca/devuelve una sección del menú **sin tocar** widgets ni personalización. No deja ocultar la última visible. |
| `delete` | Sólo personalizadas. Muda sus widgets a `move_widgets_to` (default `resumen`) y borra la entrada. Las builtin se ocultan, no se borran. |

- Una sección personalizada **no tiene vista fija**: su contenido son los widgets que se le
  asignen (`whatspro_radar_upsert_widget` con `section: "<id>"`). UI: `ui/sections/CustomSection.tsx`.
- Todo vive en `team_plugins.settings.appearance` (`sections` overrides de builtins,
  `custom` array de personalizadas, `order` lista de ids). Sin migración: es jsonb.
  El `settingsSchema` del manifiesto declara `appearance` — si se le agregan claves nuevas hay
  que extender `radarAppearanceSchema`, o un guardado desde Admin las borra.
- El campo `section` de un widget ya **no es enum**: acepta el slug de una personalizada.
  La forma la valida zod (`isValidRadarSectionId`); la **existencia** la valida la capa MCP
  (`assertSectionExists`), que en el error devuelve la lista real de ids del equipo.

## 3. Tamaños de widget: componer en 1–4 columnas

`size` del widget, sobre la grilla de 12 columnas (`RADAR_WIDGET_SPAN` = `SPAN_CLASS` de `WidgetGrid.tsx`):

| size | col-span | Por fila en escritorio |
| --- | --- | --- |
| `xs` | 3 | 4 |
| `sm` | 4 | 3 |
| `md` (default) | 6 | 2 |
| `lg` | 8 | 1 (⅔, convive con un `sm` al lado) |
| `full` | 12 | 1 |

En móvil todos ocupan el ancho completo. El usuario puede cambiarlos a mano ("Editar widgets");
las IA con `patch_widget` (uno) o `manage_widget action="reorder"` (varios: `position` + `size` +
`section` en lote — la forma correcta de recomponer una pantalla entera).

## 4. Bloques: 35 tipos, 9 nuevos

Al catálogo original se sumaron:

- **`image`** — imagen con caption y enlace. Sólo `https://` o rutas internas `/...`.
- **`tiles`** — grilla de mini-cards con icono/título/descripción/valor/badge/href, el mismo
  estilo de card que el menú lateral. `columns: 2|3|4`. Es el bloque para "menús" y launchers.
- **`columns`** — **layout**: parte el widget en 2–4 columnas con bloques adentro (cualquier
  bloque menos otro `columns`; un solo nivel de anidado, a propósito). En móvil se apilan.
  El renderer vive dentro de `RadarBlockView.tsx` para no armar un import circular con el barrel.

Y los bloques **vinculados al sistema** (datos embebidos, mismo criterio que `contacts`):

- **`tasks`** — tareas con estado (pending/in_progress/done/blocked/overdue), vencimiento,
  responsable, proyecto y barra de avance (`showProgress`).
- **`checklist`** — hecho/pendiente REAL por ítem (a diferencia de `list` variant checklist,
  que dibuja todo tildado), con avance.
- **`resources`** — documentos/tareas/proyectos/workspaces/personas/archivos/links mezclados;
  cada `kind` trae icono y destino por defecto (documento con id → visor de Radar).
- **`tags`** — nube de etiquetas con tono y conteo.
- **`replies`** — respuestas recomendadas con botón **Copiar** (clipboard).
- **`form`** — el plano de un formulario/brief a relevar: campos, tipos, obligatorios, opciones.

**Receta "ficha de cliente por IA"** (está en el `howTo` del catálogo): widget con
`contact_id` + `surface: "chat"|"both"` combinando `score` + `stat` (datos personalizados) +
`tags` + `tasks` + `timeline` (últimos movimientos) + `replies` + `form` (brief) + `resources`.

## 4.b Política anti-Sparkles

`Sparkles` era el fallback universal de `resolveIcon` y aparecía en todos lados (ítems de
lista, puntos de timeline, headers sin icono, cards de notas con sección desconocida,
secciones custom). Ahora `resolveIcon(name, fallback)` recibe un fallback POR CONTEXTO:
lista → `ArrowRight`, timeline → `Clock`, tiles → `Boxes`, header de widget → `Layers`,
sección de nota desconocida → `Notebook`, sección personalizada sin icono → `Compass`.
`Sparkles` queda solo como último recurso de lo verdaderamente desconocido. Todos esos
iconos son editables por IA (campo `icon` de cada ítem/bloque/widget/sección).
La lista cerrada `RADAR_ICONS` sumó 16 iconos de "elementos del sistema": Tag, Tags,
ListChecks, ListTodo, Paperclip, Reply, Briefcase, FolderKanban, Kanban, ClipboardCheck,
FormInput, UserPlus, IdCard, CalendarCheck, SquarePen, Inbox.

Regla de tres pasos al agregar un tipo (sigue igual): schema en `shared/blocks.ts` →
renderer en `ui/blocks/` + registro en `RadarBlockView.tsx` → entrada en `RADAR_BLOCK_CATALOG`.

## 5. Informes: siempre a la sección Informes

Si la IA produce un **informe** (documento largo con formato), NO va en un widget:
`whatspro_radar_publish_report` lo publica en Documentos, lo archiva en la carpeta correcta de
"Radar · Informes" según su categoría (`clientes` exige `contact_id` / `equipo` / `generales` /
`mejoras` / `trabajos`) y lo vincula para que aparezca en la sección Informes de Radar.
Después se puede referenciar desde un widget con un bloque `documents`. Esta regla está en el
`howTo` del catálogo para que las IA la sigan solas.

## 6. Trampas conocidas

- **Validación asimétrica**: al escribir, un bloque inválido se reporta (y el resto se guarda);
  al leer, los rotos se descartan y el widget se dibuja igual (`parseRadarBlocks`).
- **`RADAR_WIDGET_SPAN` y `SPAN_CLASS` tienen que coincidir**: el primero es lo que se les dice a
  las IA, el segundo lo que dibuja Tailwind. Estuvieron desincronizados (sm=3 vs col-span-4) hasta 2026-08-23.
- **Secciones huérfanas**: un widget cuyo `section` ya no existe no aparece en ninguna pantalla
  (no se pierde: sigue en la tabla). `delete` de sección los muda solo; borrar la apariencia a
  mano, no.
- La apariencia la puede escribir una IA mientras el tablero está abierto: la UI revalida
  (`refreshInterval` en el SWR de `/api/plugins/radar/appearance`).
