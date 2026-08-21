# Estado del rediseño de Tareas

Rama: `feat/tareas-rediseno` (creada desde `feat/task-os-embed`, que traía 562 archivos sin commitear ajenos a esto — no se tocaron).

## Hecho

- **Fase 0 — Reconocimiento: completa.** Informe abajo.
- Los 9 documentos del paquete (Documentos → 🎨 Rediseño plugin Tareas, carpeta 37) exportados desde la base a `docs/tareas-rediseno/`.
- `lib/plugins/tasks/ui-nueva/i18n/es.ts` — todos los literales del documento 03.

## Pendiente

Fases 1 a 5 del `01-PROMPT-MAESTRO.md`. El andamiaje (`data/`, `hooks/`, `layout/`, `views/`, `components/`) está sin escribir.

---

# Informe de Fase 0

## 1. El plugin de Tareas

Todo vive en `lib/plugins/tasks/`. Manifiesto en `manifest.ts`: `id: 'tasks'`, `displayName: 'Tareas'`,
ruta única `/plugins/tasks`, ítem de menú rotulado **"Tareas OS"** (`navItems[0].label`), permiso `tasks.read`.

Punto de entrada: `lib/plugins/core/page-registry.tsx:186` mapea `tasks` → `TasksOSDashboard`.
**Ese es el punto de bifurcación de la bandera.**

Componentes de interfaz a reemplazar:

| Archivo | Rol |
| `ui/TasksOSDashboard.tsx` (406 líneas) | orquestador: estado, modales, vistas kanban/calendar/gantt |
| `ui/project/TaskOsShell.tsx` | contenedor + sidebar de sistema en overlay |
| `ui/project/KanbanBoard.tsx`, `board/KanbanColumn.tsx`, `board/TaskCard.tsx` | tablero |
| `ui/project/ProjectSidebar.tsx`, `ProjectHeader.tsx`, `TaskNavigator.tsx`, `AddColumnBar.tsx` | navegación |
| `ui/task/TaskModal.tsx`, `NewTaskModal.tsx`, `TaskNotesEditor.tsx`, `TaskOsWindow.tsx` | detalle de tarea |
| `ui/project/LabelManagerModal.tsx`, `ProjectAppearanceModal.tsx`, `workspace/WorkspaceModal.tsx` | modales |
| `ui/shared/*` | modal, confirm, input, empty state, tema (`task-os-theme.ts`) |
| `ui/embed/*`, `ui/cascade/*`, `ui/picker/*`, `ui/media/*` | superficies satélite, fuera de alcance |

## 2. Capa de datos

`lib/plugins/tasks/client/api.ts` (292 líneas) envuelve todos los endpoints. Hooks en `hooks/`:
`useTaskOsBoard` (SWR), `useTaskMutations`, `useTaskDragDrop`.

**Hallazgo que cambia la estrategia del documento 04:** `GET /api/plugins/tasks/workspaces`
devuelve el **universo entero anidado** en una sola llamada — `loadTaskOsData(teamId)` arma
workspaces → projects → columns → items, con `commentCount` y portadas resueltas. No hace falta
paginar de a 100 ni listar tareas por separado: **`useUniverso` debe reusar la misma clave SWR
(`TASK_OS_API.workspaces`) que el tablero clásico**, así comparten caché e invalidación.

Escrituras disponibles (todas con `getPluginRequestContext('tasksWrite')`, filtro por `teamId` en el servidor):

| Recurso | Ruta | Notas |
| tareas | `POST /items` | exige `columnId` + `title`; acepta `labelIds`, `checklist`, `dueDate`, `status` |
| tareas | `PATCH /items/[id]` | ver trampas abajo |
| tareas | `DELETE /items/[id]` | |
| columnas | `POST /columns`, `PATCH|DELETE /columns/[id]` | |
| proyectos | `POST /api/plugins/tasks`, `PATCH|DELETE /projects/[id]` | `labels` se reemplaza entero |
| workspaces | `POST|PATCH /workspaces[/id]` | |

El proyecto de una tarea **pasa por `task-locations`**: `patchTaskItem` con `columnId` (+`makePrimary`)
crea/mueve la location y recién ahí actualiza `tasks.projectId`. Usar `moveTaskToLocation(id, projectId, columnId)`
de `client/api.ts`, nunca escribir `projectId` a mano.

### Tres trampas del servidor

1. **`PATCH` de `checklist` con todos los ítems completados fuerza `status='done'`**
   (`server/task-os.ts`, `nextStatus`). Al guardar subtareas hay que mandar `status` explícito.
2. `status` en el patch siempre reescribe `completedAt` (`done` → ahora, cualquier otro → `null`).
3. `GET /workspaces` ejecuta `ensureDefaultTaskWorkspace` + `assignUnscopedProjects` en **cada** lectura:
   crea el workspace "Principal" si no hay ninguno y reasigna proyectos huérfanos. Es idempotente,
   pero significa que una lectura escribe.

## 3. Pantalla completa

**Ya está resuelto y hay que conservarlo.** `app/[locale]/(dashboard)/layout.tsx` calcula
`isTasksOS = pathWithoutLocale.startsWith('/plugins/tasks')` y con eso: no renderiza `<Sidebar />`,
pasa `w-full` al `<main>` y oculta `<MobileBottomNav />`. Es una bandera de layout por ruta —
exactamente el mecanismo "real" que pide el documento 05, no un overlay.

Mismo patrón para `isBusinessWoman` (`/plugins/mini-apps/business-woman-planner`) y `isAutomationEditor`.
**No hay que tocar ese archivo**: la ruta ya está cubierta por el prefijo.

Lo que falta y hay que agregar en la interfaz nueva: bloqueo del scroll del `body`, `document.title`
= "Tareas — WhatsPro" mientras está montada, y la salida única "Volver a WhatsPro" al pie del menú
(hoy `TaskOsShell` abre el sidebar de WhatsPro en un overlay con `showSystemMenu`, que es otra cosa).

## 4. Nomenclatura

- **"Tareas"** es el `displayName` del manifiesto y el título de la ruta.
- **"Tareas OS"** es el rótulo del ítem de menú del **mismo plugin** (`manifest.ts`, `navItems[0].label`).
  No es otra superficie: es el mismo plugin con dos nombres visibles. Conviene unificarlo en "Tareas".
- Los ids `tag-...-tasks-os-project-N` **no** vienen de otra superficie: los genera el mini-app
  `business-woman-planner` al sembrar sus etiquetas por defecto.

**Superficies que escriben sobre `task-*` además del plugin:**
`mini-apps/business-woman-planner`, `plugins/calendar` (`TaskOsScheduleBoard`, `CalendarTaskInspector`,
`TaskGanttView`), `components/chat/ContactTaskPanel`, `app/[locale]/task-embed/[token]` (embed público),
`app/api/dashboard/tasks`, `app/api/chats/[id]/tasks`, `app/api/plugins/customers/[id]/tasks`,
`app/api/plugins/notes/[id]/generate-tasks`.

## 5. El origen de los proyectos duplicados (reportado, NO arreglado)

`lib/plugins/mini-apps/apps/business-woman-planner/index.tsx:413` — `DEFAULT_PROJECTS` contiene
un proyecto literal **"Mi Proyecto OS"** con `DEFAULT_TAGS` (Pendiente / Importante / Cliente / Personal)
y `DEFAULT_COLUMNS` (Tareas / Haciendo / Hecho). Se siembra por montaje del mini-app.

Eso explica los ids de etiqueta `tag-priority-tasks-os-project-N` repartidos por toda la base.
**No lo toqué**, como pide la regla 5.

## 6. Banderas y preferencias

No existe un sistema de feature flags. Lo que sí existe y sirve, **sin migración**:

- `team_plugins.settings` (jsonb, `lib/db/schema.ts:2187`) — un objeto libre por equipo y plugin,
  validado por `manifest.settingsSchema`. Hoy el de tasks es `z.object({})` vacío.
- `AppPluginManifest.featureFlags: string[]` existe en el tipo pero **no lo consume nadie**.

**Propuesta para la regla 4:** extender el schema del manifiesto a
`z.object({ tasksUi: z.enum(['clasico','nuevo']).default('clasico') })`, resolver así en el cliente:
`?ui=` de la URL > `localStorage['tareas-ui:{teamId}:{userId}:flag']` > ajuste del equipo > `'clasico'`;
y montar la bifurcación en un `TasksPluginSurface.tsx` registrado en `page-registry.tsx`.
El toggle vive en Ajustes de la interfaz nueva, así volver atrás no requiere despliegue.

## 7. Stack

Next 16.1.1 (App Router) · React 19.2.3 · **Tailwind v4.1.7 sin archivo de config** (todo en
`app/globals.css` con `@import "tailwindcss" source(none)` + `@source`, y `@custom-variant dark (&:is(.dark *))`)
· lucide-react 0.511 · SWR 2.3.8 · next-intl 4.7 · `@tanstack/react-virtual` 3.13 (ya instalado,
sirve para el virtualizado sin dependencia nueva) · `sonner` para toasts · sin ESLint configurado ·
commits en español con prefijo `feat(...)`/`fix(...)`.

---

# Divergencias con la spec

1. **`bg-accent` ya está tomado.** `app/globals.css` define `--color-accent: hsl(var(--accent))`,
   el token *muted* de shadcn. Usar las clases literales del documento 02 pintaría el gris de shadcn,
   no el índigo. **Traducción:** definir `--tareas-accent` en el shell y usar `bg-[var(--tareas-accent)]`,
   `text-[var(--tareas-accent)]`, `ring-[var(--tareas-accent)]/10`, etc. Valores computados idénticos.

2. **El modo oscuro es global y por clase.** La variante es `&:is(.dark *)`, controlada por el
   `ThemeProvider` de toda la app. El switch claro/oscuro propio de Ajustes tiene que poner la clase
   `dark` en un contenedor externo del shell (los `dark:` de los descendientes funcionan; el nodo
   que lleva la clase, no) — o aceptar que manda el tema de WhatsPro. **Decisión pendiente del usuario.**

3. **Inter no está cargada en ningún lado** (no hay `next/font` en el repo ni fuentes en `public/`).
   Opciones: inyectar el `<link>` de Google Fonts al montar el shell (scoped, degrada solo), o
   `next/font/google` en el layout raíz (ruta compartida — requiere permiso). Mientras tanto,
   `font-family: Inter, ui-sans-serif, system-ui, sans-serif`.

4. **La paginación de a 100 del documento 04 no aplica**: el endpoint devuelve el árbol completo
   de una. La interfaz se usa desde la primera respuesta; el virtualizado (>200 filas) sí es necesario.

5. **Los números reales son bastante menores que los medidos el 21/08.** Contados en la base hoy:
   **708 tareas · 53 proyectos · 223 columnas · 7 workspaces · 717 locations.**
   Los duplicados de "Mi Proyecto OS" son **15**, no ~170 — alguien ya corrió el
   `POST /workspaces {action:'merge-dups'}` que existe en el repo. La agrupación visual con contador
   sigue teniendo sentido, pero es un detalle, no el problema central que describe la spec.

6. **`status` en producción es solo `open` (605) y `done` (103).** Ningún `in_progress`.
   La salvaguarda de "descompletar restaura el estado anterior" sigue siendo correcta, pero hoy no
   hay ninguna tarea que la ejerza.

7. **Las etiquetas ya están unificadas de hecho:** 50 de los 53 proyectos tienen exactamente las
   mismas 4 (Pendiente `#3b82f6` / Importante `#ef4444` / Cliente `#f59e0b` / Personal `#10b981`),
   con ids distintos por proyecto. La deduplicación por nombre del documento 04 va a colapsar
   ~200 etiquetas en 4. **"Importante" es el label de prioridad preexistente** que menciona la
   sección 5 del documento 04 — la detección por nombre es la que va a resolver casi todos los casos.

8. **No hay endpoint de IA reutilizable** para desglosar una tarea en subtareas. Lo más cercano es
   `POST /api/plugins/notes/[id]/generate-tasks`, atado a notas de reunión y con permiso `notesWrite`.
   Como manda el documento 02: **"DESGLOSAR CON IA" queda oculto tras bandera, apagado.**

9. **El ítem de menú dice "Tareas OS", no "Tareas"** (`manifest.ts`). El documento 02 pide "Tareas"
   en la marca. Cambiar el `navItems[0].label` es una línea, pero toca el menú de todos los equipos:
   **decisión del usuario.**

---

# Preguntas abiertas antes de la Fase 1

1. Modo oscuro: ¿propio de Tareas (clase `dark` en su contenedor) o hereda el de WhatsPro?
2. Inter: ¿se acepta el `<link>` a Google Fonts inyectado al montar, o se queda en la fuente del sistema?
3. ¿Renombrar el ítem de menú "Tareas OS" → "Tareas"?
4. Los 15 duplicados de "Mi Proyecto OS": ¿solo agrupación visual (lo planificado), o querés que
   proponga el arreglo en `business-woman-planner` que los genera?
