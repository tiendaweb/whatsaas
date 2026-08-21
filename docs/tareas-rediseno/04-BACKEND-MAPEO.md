# 04 — Mapeo de datos del rediseño de Tareas

El rediseño **no crea tablas ni módulos nuevos**. Es la **interfaz nueva del propio plugin de Tareas** (`pluginId: tasks`): lee y escribe exactamente las mismas tablas `task-*` que usa el tablero de hoy, con la misma capa de datos.

> **Alcance: todas las tareas del equipo.** La vista Lista agrega en una sola bandeja las tareas de **todos** los workspaces y proyectos existentes. Editar una tarea desde la lista **modifica la tarea real del tablero**: es el mismo registro. Esto es potente y también riesgoso; buena parte de este documento son las salvaguardas que lo hacen seguro.

## Escala real (medida en producción)

| Recurso | Cantidad aproximada |
| Tareas | entre 500 y 1000 |
| Proyectos | menos de 175 — **la enorme mayoría son duplicados de "Mi Proyecto OS"** |
| Workspaces | 7 (Principal, Membresias, Clientes, EMPRESA, Distribuidora, Escritorio, LOOPPY) |
| Columnas | menos de 400 |

Números chicos: la carga completa en memoria es viable. Pero el diseño tiene que soportar crecimiento, así que la paginación y el virtualizado no son opcionales.

## Esquema disponible (verificado en producción)

```
task-workspaces  id, teamId, name, order, color, icon, embedEnabled, embedAccess, createdBy, createdAt, updatedAt
task-projects    id, teamId, workspaceId, name, backgroundUrl, labels[], order, color, icon,
                 embedEnabled, embedAccess, createdBy, createdAt, updatedAt
task-columns     id, projectId, teamId, title, order, color, icon, createdAt, updatedAt
tasks            id, columnId, projectId, teamId, title, notes, labelIds[], checklist[], status,
                 completedAt, parentTaskId, order, dueDate, startDate, endDate, color, icon,
                 coverMediaId, createdBy, createdAt, updatedAt
task-locations   id, taskId, teamId, projectId, columnId, order, isPrimary
task-comments    id, taskId, teamId, text, createdBy, createdAt
task-media, task-relations, task-dependencies, task-templates
```

Formas reales confirmadas:

```
// tasks.checklist
[ { "id": "c1", "text": "Revisar clientes activos", "completed": false } ]

// task-projects.labels  — OJO: las etiquetas son POR PROYECTO, no globales
[ { "id": "tag-client", "name": "Cliente", "color": "#f59e0b" } ]

// tasks.labelIds
[ "tag-client" ]
```

`status` acepta `open` · `in_progress` · `done`. `dueDate` es date-time ISO.

---

## 1. El universo de tareas

El rediseño **no crea** workspace, proyecto ni columna por su cuenta. Al arrancar, descubre lo que ya existe:

```
// data/universo.ts
const workspaces = await listarWorkspaces(teamId)
const proyectos  = await listarProyectos(teamId)          // paginar de a 100
const tareas     = await listarTareas(teamId)             // paginar de a 100, sin filtro de proyecto
```

`tasks` en modo lectura admite listar **sin filtro de proyecto**, así que la bandeja global es una sola secuencia paginada. Indexá los proyectos por id en un `Map` para resolver el nombre de cada tarea sin recorrer arrays.

**Reglas de carga:** paginar de a 100 y mostrar la interfaz con la primera página ya renderizada, completando en segundo plano · cachear en memoria por sesión e invalidar solo lo que cambió tras una escritura, nunca recargar todo · listas de más de 200 filas van virtualizadas · los contadores del menú se calculan sobre el conjunto completo, no sobre la página visible.

### Proyectos duplicados: mostrarlos, no crearlos

Los ~170 proyectos "Mi Proyecto OS" duplicados van a aparecer en el selector y van a ensuciar la vista. Dos cosas, en este orden:

- **La interfaz nueva jamás crea proyectos automáticamente.** Ni en el render, ni en un `useEffect`, ni al guardar la primera tarea. La única creación posible es explícita, con el usuario apretando un botón. Si esa creación existe, va con *get-or-create* por nombre exacto, promesa compartida y caché de ids.
- **Agrupá los duplicados en la interfaz.** Si N proyectos comparten nombre exacto dentro del mismo workspace, mostralos como una sola entrada con el contador (`Mi Proyecto OS · 168`). Es cosmético y no borra nada. **No propongas limpiar ni borrar esos proyectos sin preguntarme.**

---

## 2. Proyecto destino para tareas nuevas

La barra de captura rápida necesita saber dónde crear. Como no inventamos un proyecto propio, el destino es **explícito y configurable**:

- En Ajustes hay un selector **Proyecto destino** con la lista de workspaces → proyectos.
- La elección se guarda en `localStorage` (`tareas-ui:{teamId}:{userId}:destino`).
- **Mientras no haya destino elegido, la barra de captura está deshabilitada** y muestra el texto "Elegí un proyecto destino en Ajustes" con un enlace directo. Nada de elegir uno por adivinanza.
- Dentro del proyecto destino, la tarea nueva va a **su primera columna por `order`**.
- Si estás filtrando por un proyecto concreto, la tarea nueva se crea **en ese proyecto**, no en el destino por defecto. Es lo que el usuario espera.

---

## 3. Mapeo campo por campo

| Concepto en la interfaz | Dónde vive | Detalle |
| Título | `tasks.title` | máx. 500 |
| Descripción | `tasks.notes` | máx. 20 000 |
| Fecha de vencimiento | `tasks.dueDate` | ISO date-time; guardar mediodía UTC para evitar corrimientos de zona |
| Activa | `status` `open` **o** `in_progress` | ambos cuentan como activa |
| Completada | `status = 'done'` + `completedAt` | ver abajo |
| Subtareas | `tasks.checklist[]` | `{ id, text, completed }` — calce exacto con el modal |
| Progreso `0/3` | derivado de `checklist` | completadas / total |
| Etiquetas | `tasks.labelIds[]` ← `task-projects.labels[]` | ver sección 4 |
| Prioridad | labels reservados `prio-*` | ver sección 5 |
| Recurrencia | labels reservados `rec-*` | ver sección 5 |
| **Proyecto de origen** | `tasks.projectId` | **se muestra en la interfaz** — ver sección 6 |
| Orden manual | `tasks.order` | el orden es **por columna**; ver sección 7 |
| Comentarios / adjuntos | `task-comments` / `task-media` | fuera de alcance, no lo implementes |

**Completar y descompletar.** Al completar: `status = 'done'` y `completedAt = ahora`. Al descompletar hay que **restaurar el estado anterior**, no asumir `open`: guardá el `status` previo en memoria durante la sesión y, si no lo tenés (por ejemplo tras recargar), volvé a `open`. Descompletar una tarea que estaba `in_progress` y dejarla en `open` le cambia la columna de facto a quien la mire desde el tablero.

---

## 4. Etiquetas: son por proyecto, la interfaz las muestra unificadas

Esta es la fricción principal entre el diseño de referencia y este backend. En la referencia el menú tiene **una** lista de etiquetas; acá cada proyecto tiene la suya.

**Solución de lectura:** el menú muestra la **unión de todas las etiquetas de todos los proyectos, deduplicadas por nombre normalizado** (minúsculas, sin acentos). Si dos proyectos tienen "Cliente" con colores distintos, gana el color del proyecto con más tareas que la usan, y se deja una nota en consola. Filtrar por una etiqueta filtra por **todos** los ids que colapsaron en ese nombre.

**Solución de escritura:** asignar una etiqueta a una tarea del proyecto X requiere que X tenga esa etiqueta en su `labels[]`. Si no la tiene, se agrega **de forma aditiva** — nunca reemplazando ni reordenando el array existente — con id `tag-` + slug sin acentos.

> **Efecto colateral que tenés que conocer:** esa etiqueta pasa a existir también en el tablero de ese proyecto. Es reversible a mano, pero es una escritura sobre datos reales. Por eso, la primera vez que hace falta agregar una etiqueta a un proyecto, **se pide confirmación una vez por proyecto** y se recuerda la respuesta.

---

## 5. Prioridad y recurrencia

`tasks` no tiene esos campos y **no vamos a migrar la base**. Se modelan como labels con prefijo reservado:

| id | name | color |
| `prio-low` | Baja | `#10b981` |
| `prio-medium` | Media | `#f59e0b` |
| `prio-high` | Alta | `#f43f5e` |
| `rec-daily` | Diaria | `#6366f1` |
| `rec-weekly` | Semanal | `#6366f1` |
| `rec-monthly` | Mensual | `#6366f1` |

Invariantes: máximo **un** `prio-*` y **un** `rec-*` por tarea · sin `prio-*`, la prioridad es Media · los ids reservados **no se muestran como etiquetas** en la interfaz, se leen como propiedades · no aparecen en Gestión de etiquetas y no se pueden borrar ni renombrar desde ahí.

**Modo de escritura, configurable en Ajustes:**

- **Conservador (por defecto).** Solo se escriben labels reservados en proyectos que ya los tienen. En el resto, la prioridad se muestra como Media y el selector aparece deshabilitado con un tooltip que explica por qué. Cero contaminación de tableros ajenos.
- **Completo.** Se agregan los labels reservados a cualquier proyecto cuando hace falta, con la confirmación por proyecto de la sección 4.

Arrancá en conservador. Que sea el usuario quien decida ensuciar sus tableros.

**Detección de prioridad preexistente:** antes de dar Media por defecto, mirá si la tarea ya tiene una etiqueta del proyecto cuyo nombre normalizado sea `alta`/`importante`/`urgente`, `media`/`normal` o `baja`. Si la hay, usala para mostrar la prioridad (solo lectura). Muchos tableros ya codifican prioridad así — por ejemplo el label "Importante" `#ef4444` que existe en los proyectos "Mi Proyecto OS".

**Recurrencia.** Al completar una tarea con `rec-*`, del lado del cliente y como una operación atómica lógica:

- marcar la actual como `done` con `completedAt`;
- crear una nueva en **el mismo proyecto y la misma columna**, con igual título, notas, `labelIds` y `checklist` reseteado a `completed: false`;
- `dueDate` nueva = anterior + 1 día / 7 días / 1 mes; si no tenía fecha, base = hoy;
- si el paso 2 falla, **revertir el paso 1** y mostrar el error. Nunca una tarea completada sin sucesora.

---

## 6. El proyecto se ve en la interfaz

La referencia no tiene proyectos, pero acá los datos vienen de ~170. Ocultar el origen haría la bandeja incomprensible: dos tareas iguales de clientes distintos serían indistinguibles. Extensión mínima, respetando la gramática visual del original:

**En la fila de tarea**, al final de los metadatos, un chip discreto con el nombre del proyecto:

```
<span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800
             text-neutral-400 truncate max-w-[140px]">Clientes · Mi Proyecto OS</span>
```

**En el menú lateral**, una sección nueva **ESPACIOS** encima de ETIQUETAS, con el mismo rótulo en mayúsculas y las mismas filas con punto de color que las etiquetas — es literalmente el mismo componente, así que no rompe la fidelidad visual. Cada fila es un workspace, plegable a sus proyectos, y actúa como filtro. Los duplicados de igual nombre se agrupan con contador.

**En el modal de edición**, un selector **Proyecto** que permite mover la tarea. Mover implica cambiar `projectId` **y** `columnId` a la primera columna del destino, y reindexar el `order`. Si el repo maneja `task-locations`, respetá ese mecanismo en vez de escribir `projectId` a mano.

---

## 7. Orden

`tasks.order` es relativo **a la columna**, no global. Consecuencias:

- Arrastrar dentro de una vista que mezcla proyectos **no** tiene un orden persistible sensato. En vistas mezcladas, el arrastre se **deshabilita** y el orden es por `dueDate` ascendente, luego prioridad, luego `createdAt`.
- El arrastre se **habilita** solo cuando la vista está filtrada a un único proyecto, y dentro de la vista Tablero. Ahí sí se reindexa `order` dentro de la columna afectada.
- Dejá esto explícito en la interfaz: la manija de arrastre no aparece en vistas mezcladas.

---

## 8. Vistas

Todas se derivan de `dueDate` y `status` sobre el universo completo. **No son columnas.**

| Vista | Filtro |
| Bandeja | `status != 'done'` |
| Hoy | activa y `dueDate` es hoy |
| Próximas | activa y `dueDate > hoy` |
| Vencidas | activa y `dueDate < hoy` |
| Completadas | `status = 'done'`, orden por `completedAt` descendente, **limitada a las últimas 200** |

Con cientos de tareas, Bandeja va a ser larga. Agrupá por fecha con encabezados (`Vencidas`, `Hoy`, `Mañana`, `Esta semana`, `Más adelante`, `Sin fecha`) usando el mismo rótulo en mayúsculas del sistema de diseño.

---

## 9. Preferencias

Tema, acento, objetivo diario, duración del temporizador, proyecto destino, modo de escritura de labels, vista activa y filtros van a `localStorage`, clave `tareas-ui:{teamId}:{userId}:prefs`. No inventes tablas ni endpoints para esto.

---

## 10. Métricas

Se calculan en el cliente sobre el universo cargado. Cero endpoints nuevos.

| KPI | Cálculo |
| Racha activa | días consecutivos hacia atrás desde hoy con al menos una tarea `done`; se corta en el primer día vacío |
| Completadas | cantidad con `status = 'done'` |
| Eficiencia | `done / total` × 100, redondeado; `0%` sin tareas |
| Vencidas | activa y `dueDate < hoy` |
| Velocidad | completadas por día en los últimos 7 días, agrupadas por `completedAt` |
| Promedio diario | media de esos 7 valores, un decimal |
| Mezcla de prioridades | reparto de las **activas** por `prio-*`, en porcentaje |
| Pico de enfoque | día de la semana con más completadas; `N/D` si no hay ninguna |

Sumá un filtro **por workspace**: con datos de 7 espacios distintos, el promedio global dice poco.

---

## 11. Contrato de la capa de datos

```
cargarUniverso(teamId): Promise<{ workspaces, proyectos, tareas }>
crearTarea(entrada: NuevaTarea, projectId, columnId): Promise<Tarea>
actualizarTarea(id, cambios: Partial<Tarea>): Promise<Tarea>
completarTarea(id, completada: boolean): Promise<Tarea>       // maneja la recurrencia
moverTarea(id, projectId, columnId): Promise<Tarea>
eliminarTarea(id): Promise<void>
reordenarTareas(columnId, ids: number[]): Promise<void>
etiquetasUnificadas(proyectos): Etiqueta[]
asegurarEtiquetaEnProyecto(projectId, etiqueta): Promise<void>  // aditivo, con confirmación
```

`Tarea` es el modelo de dominio de la interfaz nueva, con `prioridad`, `recurrencia`, `etiquetas`, `subtareas` y `proyecto` como campos de primera clase. La traducción desde y hacia la forma de `tasks` vive **solo** en `data/mapeo.ts`. Ningún componente conoce `labelIds` ni el prefijo `prio-`.

**Estas funciones se apoyan en el cliente de datos que el plugin ya tiene.** No dupliques la capa HTTP: envolvela.

Reglas: filtrar siempre por `teamId` · actualizaciones optimistas con rollback ante error · un solo reintento ante fallo de red, nunca en bucle · toast de error discreto que no rompa el layout.

---

## 12. Salvaguardas (estás reemplazando una interfaz en uso)

- **"BORRAR TODOS LOS DATOS" no se implementa.** En la referencia vaciaba el LocalStorage del navegador; acá borraría los tableros de trabajo del equipo. No existe. Si hace falta algo equivalente, es "Limpiar completadas de un proyecto", con confirmación y alcance visible.
- **Eliminar una tarea pide confirmación** con el nombre del proyecto a la vista. Sin borrado masivo silencioso: en la barra de selección múltiple, "ELIMINAR" pide confirmación listando cuántas tareas y de qué proyectos.
- **Importar nunca sobrescribe.** Crea tareas nuevas en el proyecto destino. Jamás hace *match* por id contra tareas existentes.
- **Exportar** vuelca las tareas de la vista actual con su proyecto de origen, en JSON.
- Toda escritura pasa por `data/`. Ningún componente llama a un endpoint directo.
- **La bandera `tasksUi` tiene que poder volver a `clasico` en cualquier momento** y devolver el tablero de hoy intacto. Probalo después de cada fase.
- Antes de la primera escritura real, probá contra **un solo proyecto de prueba** y verificá por MCP (`whatspro_list_records` con `resource: "tasks"` y `filters: { projectId }`) que el registro quedó como esperabas.

## 13. Verificación con MCP

Lectura: `whatspro_list_records` con `resource` en `tasks`, `task-projects`, `task-columns`, `task-workspaces`; y `whatspro_get_record` para una tarea puntual.

Escritura de referencia: `whatspro_manage_task`, `whatspro_manage_task_column`, `whatspro_manage_task_workspace`, `whatspro_create_task_project`. **Los esquemas de esas herramientas son la fuente de verdad sobre qué campos acepta el backend** — consultalos antes de inventar un payload.
