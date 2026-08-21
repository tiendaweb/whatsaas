# 02 — Especificación visual del rediseño de Tareas

Referencia visual: https://todos-app-green.vercel.app/ — el sitio se llama "ToDoS", pero **el plugin se sigue llamando Tareas**: esa palabra es la que va en la marca del menú, en el título de la pestaña y en los textos.

Todas las clases de Tailwind de este documento fueron **extraídas del DOM del sitio de referencia**, no inventadas. Si la config de Tailwind del repo difiere, traducí manteniendo los valores computados idénticos.

---

## 1. Tokens de diseño

**Tipografía:** Inter (400/500/600/700/800/900), `font-family: Inter, sans-serif`. Si WhatsPro ya carga otra fuente, el rediseño impone Inter **solo dentro de su shell** (`.tareas-ui { font-family: Inter, sans-serif }`), sin tocar el resto de la app.

**Acento:** variable CSS `--accent`, expuesta en Tailwind como `bg-accent`, `text-accent`, `border-accent`, `ring-accent`, `shadow-accent/20`, más `accent-700` para hover. Valor por defecto **`#6366f1`** (indigo-500), configurable desde Ajustes.

**Paleta base:** escala `neutral` de Tailwind.

| Rol | Claro | Oscuro |
| Fondo de la app | `bg-neutral-50` `#fafafa` | `dark:bg-neutral-900` `#171717` |
| Superficies | `bg-white` | `dark:bg-neutral-800` |
| Texto principal | `text-neutral-900` `#171717` | `dark:text-white` |
| Texto secundario | `text-neutral-500` | `dark:text-neutral-400` |
| Bordes | `border-neutral-100` | `dark:border-neutral-700` / `dark:border-neutral-800` |

**Semánticos:** prioridad Alta `rose-500 #f43f5e` · Media `amber-500 #f59e0b` · Baja `emerald-500 #10b981`. Fechas vencidas en `text-rose-500`.

**Radios:** filas y botones `rounded-xl` (12px) · tarjetas y buscador `rounded-3xl` (24px) · botones de ícono `rounded-2xl` (16px) · modales y tarjetas grandes `rounded-[2rem]` (32px) · badges `rounded-md` (6px).

**Sombras:** `shadow-sm` en inputs · `shadow-xl shadow-accent/20` en el logo y el botón de acción · `shadow-2xl shadow-accent/10` en la barra de captura · `shadow-2xl` en modales. En modo oscuro todas las sombras de acento se anulan con `dark:shadow-none`.

**Transiciones:** `transition-all duration-200` en ítems de navegación y botones · `transition-all duration-300 ease-in-out` en el drawer del sidebar · `transition-colors` en cambios de tema. Nada de animaciones llamativas.

**Rótulos de sección** (patrón tipográfico clave, se repite en toda la app): `text-[10px] uppercase font-black text-neutral-400 dark:text-neutral-500 tracking-[0.2em]`

---

## 2. Estructura general

```
<div class="flex h-screen w-full bg-neutral-50 dark:bg-neutral-900 overflow-hidden
            text-neutral-900 dark:text-neutral-100 transition-colors">
  <!-- SIDEBAR w-64 -->
  <!-- MAIN flex-1 h-full overflow-y-auto relative w-full -->
</div>
```

- **Sidebar** `w-64` (256px) · `aside` con `border-r border-neutral-100 dark:border-neutral-800 flex flex-col h-full bg-white dark:bg-neutral-900`. Cuerpo con `p-6 overflow-y-auto flex-1` — ojo: **la lista de etiquetas queda debajo del pliegue y se ve con scroll**, así es el original.
- En `<lg` el sidebar es un drawer: `fixed inset-y-0 left-0 z-30 h-full transition-all duration-300 ease-in-out` con `translate-x-0` / `-translate-x-full`, y overlay `fixed inset-0 z-20 bg-black/20 backdrop-blur-sm lg:hidden`.
- **Main** con el contenido en `max-w-3xl mx-auto px-6 py-12`.
- **Dock de captura** `fixed bottom-6 left-0 lg:left-64 right-0 z-20 pointer-events-none`, contenido en `pointer-events-auto` dentro de `max-w-3xl mx-auto px-6 relative`. La lista lleva `pb-32` para no quedar tapada.

---

## 3. Sidebar

**Marca** (`flex items-center gap-3 mb-10`): cuadrado `w-10 h-10 bg-accent rounded-xl flex items-center justify-center text-white shadow-xl shadow-accent/20 dark:shadow-none` con ícono `LayoutGrid` blanco, y al lado el nombre **Tareas** en `font-bold text-xl tracking-tight text-neutral-800 dark:text-white`.

**Navegación** (`nav.space-y-1.5`), precedida por el rótulo `SISTEMA`. Cada ítem:

```
<button class="w-full group flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm
  transition-all duration-200 text-neutral-500 dark:text-neutral-400
  hover:bg-neutral-50 dark:hover:bg-neutral-800/50 hover:text-neutral-900 dark:hover:text-white font-medium">
```

Estado activo: `bg-accent/10 text-accent font-semibold` (el ícono también toma el acento).

| Ítem | Ícono | Badge |
| Bandeja | `Inbox` | sí |
| Hoy | `Calendar` | no |
| Próximas | `Clock` | no |
| Vencidas | `AlertCircle` (en `text-rose-500`) | sí |
| Completadas | `CheckCircle` | no |

Badge: `text-[10px] px-2 py-0.5 rounded-md font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-500 group-hover:bg-neutral-200 dark:group-hover:bg-neutral-700`. **Solo se muestra si el contador es mayor que cero.**

**Espacios**, precedidos por el rótulo `ESPACIOS`. Sección **nueva respecto del original**, necesaria porque los datos vienen de 7 workspaces y ~170 proyectos: sin ella la bandeja global es incomprensible. Usa **exactamente el mismo componente de fila que las etiquetas** (punto de color + nombre), así que no rompe la fidelidad visual. Cada fila es un workspace, plegable a sus proyectos con `ChevronRight` que rota al abrir, y actúa como filtro. Los proyectos con nombre repetido dentro del mismo workspace se agrupan en una sola fila con contador al final, en el mismo estilo de badge de la navegación:

```
<span class="text-[10px] px-2 py-0.5 rounded-md font-bold bg-neutral-100 dark:bg-neutral-800
             text-neutral-500">168</span>
```

**Etiquetas**, precedidas por el rótulo `ETIQUETAS`. Cada fila es `w-full group flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium` con un punto `span.w-2.5.h-2.5.rounded-full.shadow-sm.transition-transform.group-hover:scale-110` del color de la etiqueta. La lista es la **unión de las etiquetas de todos los proyectos, deduplicada por nombre** (ver sección 4 del documento 04) — no una lista fija. Las etiquetas reservadas `prio-*` y `rec-*` **no aparecen acá**. Debajo, botón `Nueva etiqueta` con ícono `Plus` en `text-neutral-400 hover:text-accent ... mt-2`.

**Pie** (`mt-auto p-6 space-y-1.5 border-t border-neutral-100 dark:border-neutral-800`): **Modo Enfoque** (`Target`), **Métricas** (`BarChart`), **Ajustes** (`Settings`), con el mismo estilo de ítem.

---

## 4. Cabecera del área principal

`header.mb-12.flex.flex-col.gap-6`

- `h1` — `text-4xl font-black text-neutral-900 dark:text-white tracking-tight capitalize` con el nombre de la vista.
- Subtítulo — `text-neutral-500 dark:text-neutral-400 mt-1`: **"N tareas activas."**
- Botones a la derecha (`flex items-center gap-2`), cada uno `p-3 rounded-xl transition-all text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800`, activos en `bg-accent text-white`:

- `LayoutList` — vista **Lista** (la del sitio de referencia).
- `CalendarDays` — vista **Calendario**.
- `Columns3` — vista **Tablero**: el kanban actual del plugin, re-estilado con este lenguaje visual. **Agregado respecto de la referencia**, para no destruir el flujo de trabajo que el equipo ya usa. Solo está disponible con la vista filtrada a un proyecto, que es donde un tablero tiene sentido.
- `ListChecks` — activa la selección múltiple.

> Si decidís que el kanban desaparezca del todo, quitá el botón 3 y la sección 9-bis. Es una decisión de producto, no técnica: tomala a propósito.

- **Buscador**, dentro de `div.relative.group`:

```
<input class="w-full bg-white dark:bg-neutral-800/80 border border-neutral-100 dark:border-neutral-700
  rounded-3xl py-5 pl-14 pr-4 outline-none focus:ring-4 focus:ring-accent/10 focus:border-accent
  transition-all text-sm font-bold shadow-sm">
```

con el ícono `Search` posicionado absoluto a la izquierda.

---

## 5. Lista de tareas

Contenedor `div.space-y-8.pb-32` → grupos `div.space-y-4` → `ul.space-y-4`.

Con cientos de tareas, la Bandeja se agrupa por fecha con encabezados en el rótulo estándar de mayúsculas (`VENCIDAS`, `HOY`, `MAÑANA`, `ESTA SEMANA`, `MÁS ADELANTE`, `SIN FECHA`). Las listas de más de 200 filas van virtualizadas.

Cada fila, de izquierda a derecha:

- **Manija** `GripVertical` en `text-neutral-300`, visible al hover. **Solo aparece cuando la vista está filtrada a un único proyecto**: `tasks.order` es relativo a la columna, así que en vistas mezcladas no hay un orden persistible y el arrastre se deshabilita (ver sección 7 del documento 04). En vistas mezcladas, en su lugar va un espaciador del mismo ancho para que las filas no se desalineen.
- **Casilla circular** `w-6 h-6 rounded-full border-2 border-neutral-300 hover:border-accent transition-all`. Al completar: se llena de acento con un `Check` blanco, y el título pasa a `line-through text-neutral-400`.
- **Título** `font-bold text-[15px]`. Al hacer clic se abre el modal de edición.
- **Metadatos**, fila `text-xs font-bold` con separación `gap-3`:

- `CalendarDays` + fecha con formato **`28 ene 2026`** — en `text-rose-500` si está vencida, `text-neutral-400` si no.
- `ListTree` + progreso de subtareas **`0/3`** (solo si hay subtareas).
- Punto de color + nombre, por cada etiqueta.
- `Repeat` si es recurrente.
- `Flag` en rose si la prioridad es Alta.
- **Chip de proyecto de origen**, al final de la fila — agregado respecto del original:

```
<span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800
             text-neutral-400 truncate max-w-[140px]">Clientes · Mi Proyecto OS</span>
```

Se oculta cuando la vista ya está filtrada a ese proyecto, para no repetir información.

- **Hover de fila**: `hover:bg-white dark:hover:bg-neutral-800/50 rounded-2xl` con transición suave.

**Selección múltiple:** las casillas circulares pasan a cuadradas (`rounded-md`); la fila seleccionada queda `bg-accent/5 ring-1 ring-accent/30`. Aparece una barra flotante centrada abajo:

```
<div class="bg-neutral-900 text-white rounded-2xl shadow-2xl px-6 py-4 flex items-center gap-6">
```

con el rótulo `SELECCIONADAS` + **"N tareas"**, botón **COMPLETAR** en `text-emerald-400` con ícono `CheckCircle`, botón **ELIMINAR** en `text-rose-400` con ícono `Trash` — **abre confirmación** indicando cuántas tareas y de qué proyectos, nunca borra directo — y una `X` circular sobre `bg-white/10` para salir.

**Estado vacío** (`div.py-24.text-center`):

```
<div class="w-20 h-20 bg-neutral-100 dark:bg-neutral-800 text-neutral-300 dark:text-neutral-600
            rounded-[2rem] flex items-center justify-center mx-auto mb-6">  <!-- ícono Filter -->
<h3 class="text-lg font-bold text-neutral-800 dark:text-neutral-100">
<p  class="text-neutral-400 mt-2 max-w-xs mx-auto">
```

---

## 6. Barra de captura rápida

```
<div class="bg-white dark:bg-neutral-800 rounded-3xl border border-neutral-200 dark:border-neutral-700
            shadow-2xl shadow-accent/10 dark:shadow-none p-3.5 flex flex-col gap-3">
```

**Fila 1** (`flex items-center gap-2`):

- input `flex-1 px-4 py-1.5 text-sm outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500 bg-transparent text-neutral-900 dark:text-white`
- botón `p-3 bg-accent text-white rounded-2xl hover:bg-accent-700 disabled:opacity-30 transition-all shadow-lg shadow-accent/20 dark:shadow-none` con ícono `Plus`. Deshabilitado mientras el input está vacío.

**Estado sin proyecto destino:** mientras no haya un proyecto destino elegido en Ajustes, la barra entera va deshabilitada y el placeholder pasa a **"Elegí un proyecto destino en Ajustes"**, con la palabra "Ajustes" como enlace en `text-accent underline`. Si la vista está filtrada a un proyecto, la tarea se crea **en ese proyecto** y la barra funciona aunque no haya destino por defecto; en ese caso el placeholder aclara el destino: **"Nueva tarea en Clientes · Seguimiento"**.

**Fila 2** (`flex items-center flex-wrap gap-2 border-t border-neutral-100 dark:border-neutral-700 pt-3 px-1`), tres chips:

```
<button class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all text-xs font-bold
  border-neutral-100 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900
  text-neutral-500 dark:text-neutral-400 hover:border-neutral-300">
```

- `CalendarDays` + fecha elegida (ej. **`19 ago`**) → abre selector de fecha.
- `Repeat` + recurrencia (**Única** / Diaria / Semanal / Mensual).
- `Flag` + prioridad, **con el texto coloreado**: Media en `text-amber-500`, Alta en `text-rose-500`, Baja en `text-emerald-500`.

A la derecha (`flex items-center gap-1.5 ml-auto`): un botón por etiqueta, `w-6 h-6 rounded-lg flex items-center justify-center transition-all border`, apagado en `opacity-40 grayscale`, encendido en `opacity-100` con su color; separador `w-px h-4 bg-neutral-200 dark:bg-neutral-700 mx-1`; y botón **Cómo usar** (`HelpCircle`) en `text-[10px] font-bold text-neutral-400 hover:text-accent`.

**Parser de lenguaje natural** — actualiza los chips en vivo y elimina los tokens del título al guardar:

| Token | Acepta | Resultado |
| `@` | `@hoy` `@mañana` `@manana` `@proxima semana` `@dd/mm` | fecha de vencimiento |
| `!` | `!alta` `!media` `!baja` | prioridad |
| `#` | `#trabajo` `#personal` `#fitness` y cualquier otra | etiqueta (se crea si no existe) |
| `*` | `*diario` `*semanal` `*mensual` | recurrencia |

Aceptá **también los tokens en inglés** (`@tomorrow`, `!high`, `*daily`) como alias, para que el ejemplo del sitio de referencia siga funcionando. `Enter` crea la tarea.

---

## 7. Modal de edición

Overlay `fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4`, tarjeta `bg-white dark:bg-neutral-800 rounded-[2rem] max-w-xl w-full max-h-[85vh] overflow-y-auto p-8 shadow-2xl`, entrada con fade + scale suave.

De arriba abajo:

- Píldora `bg-accent/10 text-accent text-xs font-bold tracking-[0.2em] uppercase px-4 py-1.5 rounded-full` con el texto **EDITAR TAREA**, y a la derecha un botón `X` en `text-neutral-400 hover:text-neutral-900`.
- **Título** editable en línea, `text-3xl font-black tracking-tight`, sin borde hasta el foco.
- **Descripción**: `textarea` con `bg-neutral-50 dark:bg-neutral-900 rounded-2xl p-5 text-sm leading-relaxed w-full outline-none`.
- Rótulo **SUBTAREAS** y, a la derecha, botón **DESGLOSAR CON IA** (`Sparkles`, `bg-accent/10 text-accent text-xs font-bold px-4 py-2 rounded-xl`). Ver nota al pie.
- Lista de subtareas: cada una `bg-neutral-50 dark:bg-neutral-900 rounded-2xl px-5 py-4 flex items-center gap-4` con casilla circular + texto editable.
- Botón **+ AGREGAR PASO**: `w-full border-2 border-dashed border-accent/40 text-accent text-xs font-bold tracking-widest rounded-2xl py-4 hover:bg-accent/5`.
- Grilla de 3 columnas con rótulos **FECHA**, **RECURRENCIA**, **PRIORIDAD**, cada control en `bg-neutral-50 dark:bg-neutral-900 rounded-2xl px-4 py-3 text-sm font-bold`:

- fecha → `input type="date"` con ícono `CalendarDays`
- recurrencia → `select`: Única · Diaria · Semanal · Mensual
- prioridad → `select`: Baja · Media · Alta

- **Fila extra respecto del original**, en el mismo estilo de control y ancho completo: rótulo **PROYECTO** con ícono `FolderOpen` y un `select` con workspaces y proyectos, que permite mover la tarea. Mover cambia `projectId` y `columnId` a la primera columna del destino y reindexa el `order`.
- Si la prioridad no se puede escribir en el proyecto de esa tarea (modo conservador, ver sección 5 del documento 04), el selector de prioridad va deshabilitado con un tooltip que explica el motivo. Nunca simules que se guardó.
- Botón final ancho completo **Guardar cambios** con ícono `Save`: `bg-accent text-white rounded-2xl py-4 font-bold shadow-lg shadow-accent/20 hover:bg-accent-700`.

Se cierra con `Esc` o clic en el overlay. En el original, la ficha larga hace scroll interno y el botón de guardar queda al final del scroll, no fijo.

> **Nota sobre "DESGLOSAR CON IA":** el original genera subtareas automáticamente. En WhatsPro ya existe infraestructura de IA (`ai-config`, `ai-tools`, `ai-sessions`). Si en la Fase 0 encontrás un endpoint reutilizable, conectalo. Si no, **dejá el botón oculto tras una bandera** en lugar de simularlo. No inventes un endpoint nuevo.

---

## 8. Modo Enfoque

Pantalla completa `fixed inset-0 bg-neutral-50 dark:bg-neutral-900 z-50`, sin sidebar. Botón `X` arriba a la derecha en `w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-400`.

**Izquierda — temporizador:** anillo SVG circular de ~290px de diámetro, `stroke-width` 8, pista en `neutral-200` (`dark:neutral-800`), progreso en el color de acento, `stroke-linecap: round`, arranca a las 12 en punto y se vacía a medida que corre. Dentro: rótulo con ícono `Target` + **TRABAJO PROFUNDO** en acento `text-xs font-bold tracking-[0.2em]`, y el tiempo **25:00** en `text-7xl font-black tracking-tight`. El tiempo es clicable para editar la duración.

Debajo (`flex items-center gap-6`): botón circular `w-20 h-20 rounded-full bg-neutral-100 dark:bg-neutral-800` con `RotateCcw`, y botón grande `w-32 h-20 rounded-[2rem] bg-accent text-white shadow-xl shadow-accent/20` con `Play` / `Pause`.

**Derecha — misión:** tarjeta `bg-neutral-100/60 dark:bg-neutral-800/60 rounded-[2rem] p-8 max-h-[70vh] overflow-y-auto` con: rótulo **TAREA PRINCIPAL** y a la derecha botón **Finalizar** (`CheckCircle`, en acento); el título de la tarea activa en `text-3xl font-black leading-tight`; rótulo **SUBTAREAS** con ícono `ListTree`; y las subtareas como filas `bg-white dark:bg-neutral-900 rounded-2xl px-5 py-4` con casilla circular y texto en `font-bold text-sm`.

La tarea fijada es automáticamente la primera activa según el orden vigente.

---

## 9. Vista Calendario

Reemplaza la lista por `bg-white dark:bg-neutral-800 rounded-3xl border border-neutral-100 dark:border-neutral-700 p-6`.

- Encabezado: mes y año en `text-2xl font-black` (ej. **agosto 2026**); a la derecha `ChevronLeft`, botón **Hoy** (`px-4 py-2 rounded-xl text-sm font-bold hover:bg-neutral-100`) y `ChevronRight`.
- Fila de días: **DOM LUN MAR MIÉ JUE VIE SÁB** en `text-[10px] font-black tracking-widest text-neutral-400 text-center`. *(La semana del original arranca en domingo — respetalo.)*
- Grilla `grid grid-cols-7 gap-1.5`; cada celda `min-h-[110px] rounded-2xl bg-neutral-50 dark:bg-neutral-900 p-2`, número arriba a la izquierda en `text-sm font-bold`. Días de otro mes en `text-neutral-300` con fondo transparente. **El día de hoy** lleva `ring-2 ring-accent bg-white` y el número dentro de un círculo de acento con texto blanco.
- Dentro de cada celda, las tareas del día como píldoras diminutas coloreadas por prioridad.

---

## 9-bis. Vista Tablero (el kanban actual, re-estilado)

**No existe en el sitio de referencia.** Se conserva porque es el flujo de trabajo que el equipo usa hoy; eliminarlo sería una pérdida de funcionalidad disfrazada de rediseño. Lo que cambia es su piel, no su lógica: columnas, arrastre, agrupación y contratos de datos se mantienen.

Solo está disponible con la vista **filtrada a un único proyecto** — un tablero de 170 proyectos mezclados no significa nada. Sin proyecto seleccionado, el botón queda deshabilitado con el tooltip "Elegí un proyecto para ver su tablero".

Traducción del estilo actual al lenguaje visual nuevo:

- **Contenedor**: scroll horizontal, `flex gap-4 overflow-x-auto pb-32`, sin ancho máximo (rompe el `max-w-3xl` del resto, a propósito).
- **Columna**: `w-80 shrink-0 bg-white dark:bg-neutral-800 rounded-3xl border border-neutral-100 dark:border-neutral-700 p-4 flex flex-col gap-3 max-h-full`.
- **Cabecera de columna**: título en el rótulo estándar de mayúsculas (`text-[10px] uppercase font-black tracking-[0.2em] text-neutral-400`) + badge con la cantidad, en el mismo estilo que los badges del menú. A la derecha, `MoreHorizontal` en `text-neutral-300` con el menú de acciones que ya existe.
- **Tarjeta**: `bg-neutral-50 dark:bg-neutral-900 rounded-2xl p-4 space-y-2 hover:shadow-sm transition-all cursor-pointer`, con el título en `font-bold text-sm` y la misma fila de metadatos que la vista Lista (fecha, progreso de subtareas, etiquetas, `Repeat`, bandera de prioridad). **Sin el chip de proyecto**: acá es redundante.
- **Arrastre**: se conserva el mecanismo actual. Acá sí tiene sentido persistir `order`, porque hay columna.
- **Agregar tarjeta**: al pie de cada columna, botón punteado `border-2 border-dashed border-neutral-200 dark:border-neutral-700 rounded-2xl py-3 text-xs font-black tracking-widest text-neutral-400 hover:border-accent hover:text-accent` con el texto **+ AGREGAR**.
- **Agregar columna**: al final del carril, `w-80 shrink-0` con el mismo botón punteado a altura completa y el texto **+ NUEVA COLUMNA**.
- Al hacer clic en una tarjeta se abre **el mismo modal** de la vista Lista. Un solo componente de edición para toda la aplicación.

---

## 10. Métricas

Título **Métricas de productividad** + bajada **"Análisis de tus patrones de enfoque y velocidad."** A la derecha del título, un `select` discreto **por workspace** (`Todos los espacios` por defecto) en el estilo de chip de la barra de captura: con datos de 7 espacios distintos, el promedio global no dice nada.

**Cuatro tarjetas KPI** en `grid md:grid-cols-4 gap-4`, cada una `bg-white dark:bg-neutral-800 rounded-3xl border border-neutral-100 dark:border-neutral-700 p-6 flex items-center gap-4`, con un cuadrado `w-12 h-12 rounded-2xl` de fondo tintado e ícono, el rótulo en el patrón de mayúsculas y el valor en `text-3xl font-black`:

| Rótulo | Ícono | Fondo | Valor |
| RACHA ACTIVA | `Zap` | `bg-amber-100 text-amber-500` | días seguidos completando |
| COMPLETADAS | `CheckCircle` | `bg-indigo-100 text-indigo-500` | total |
| EFICIENCIA | `TrendingUp` | `bg-emerald-100 text-emerald-500` | porcentaje |
| VENCIDAS | `AlertTriangle` | `bg-rose-100 text-rose-500` | total |

**Velocidad de productividad** — tarjeta de 2/3 de ancho, título `text-xl font-bold` con ícono `BarChart` en acento; arriba a la derecha el rótulo `PROMEDIO DIARIO` y el valor **"N tareas"** en acento. Gráfico de barras en SVG de los últimos 7 días: eje Y con marcas 0 a 4, **líneas de guía punteadas** en `neutral-200`, etiquetas del eje X con formato **`14 ago`** en `text-xs font-bold text-neutral-400`, barras en acento con `rounded-t-lg`.

**Mezcla de prioridades** — tarjeta lateral con ícono `PieChart`: dona SVG de radio ~80 y grosor ~28, extremos redondeados, segmentada por prioridad (rose/amber/emerald); en el centro el total en `text-4xl font-black` y debajo el rótulo **TOTAL**. Leyenda con punto de color + nombre a la izquierda y porcentaje en `font-bold` a la derecha.

**Pico de enfoque** — bloque sólido de acento `bg-accent text-white rounded-3xl p-8`: rótulo `PICO DE ENFOQUE`, cuadrado `bg-white/20 rounded-2xl` con ícono `Target`, valor grande (**N/D** si no hay datos) y el texto **"Tu día más activo de la semana."** en `text-sm font-bold opacity-90`.

---

## 11. Ajustes

Título **Ajustes** + bajada **"Configurá tu motor de productividad."** Cada bloque es `bg-white dark:bg-neutral-800 rounded-3xl border border-neutral-100 dark:border-neutral-700 p-8 space-y-4` con su rótulo en mayúsculas.

**1. INTERFAZ Y TEMA**

- **Modo de apariencia** / "Alterná entre claro y oscuro." — ícono en cuadrado `w-11 h-11 rounded-2xl`; **en claro es `Sun` sobre `bg-amber-100` en ámbar, y en oscuro cambia a `Moon` sobre fondo índigo tenue.** A la derecha un switch `w-14 h-8 rounded-full bg-neutral-200` con knob blanco `w-6 h-6`; encendido `bg-accent` con el knob desplazado.
- **Acento del sistema** — ícono `Palette`; siete muestras `w-11 h-11 rounded-2xl`, la elegida con `ring-2 ring-offset-2 ring-accent`. Colores exactos: `#6366f1` · `#34d399` · `#fbbf24` · `#f472b6` · `#60a5fa` · `#c084fc` · `#f87171`.

**2. DESTINO Y ESCRITURA** — bloque **nuevo respecto del original**, con el mismo estilo de tarjeta:

- Fila **Proyecto destino** con ícono `FolderOpen` en cuadrado tintado y un `select` de workspaces → proyectos. Es donde caen las tareas creadas desde la barra de captura.
- Fila **Escritura de etiquetas** con dos opciones tipo radio: **Conservadora** ("Solo escribe prioridad y recurrencia en proyectos que ya las tienen") y **Completa** ("Agrega las etiquetas reservadas a cualquier proyecto, pidiendo confirmación"). Arranca en Conservadora.

**3. META DIARIA** — fila **Objetivo diario** con badge `5 TAREAS` (`bg-accent/10 text-accent text-[10px] font-bold px-3 py-1 rounded-lg`) y un `input type="range"` de 1 a 20 con la pista rellena en acento.

**4. GESTIÓN DE ETIQUETAS** — una fila por etiqueta (`bg-neutral-50 dark:bg-neutral-900 rounded-2xl px-4 py-4 flex items-center gap-4`) con cuadrado de color `w-7 h-7 rounded-lg`, nombre editable en `font-bold` e ícono `Trash` que aparece al hover. Abajo, botón punteado **+ AGREGAR ETIQUETA** (`border-2 border-dashed rounded-2xl py-4 text-xs font-black tracking-widest text-neutral-400`).

> Las etiquetas viven **por proyecto**. Esta pantalla muestra la lista unificada por nombre; al costado de cada una, en `text-[10px] text-neutral-400`, la cantidad de proyectos en los que existe (`en 4 proyectos`). Renombrar o borrar afecta a todos esos proyectos y **pide confirmación mostrando la lista**. Las reservadas `prio-*` y `rec-*` no aparecen acá.

**5. AYUDA** — fila clicable **Ayuda y documentación** / "Aprendé a usar las funciones y los atajos." con ícono `HelpCircle` en acento y `ChevronRight` a la derecha.

**6. DATOS** — dos botones lado a lado, **EXPORTAR DATOS** (`Download`) e **IMPORTAR DATOS** (`Upload`), ambos `bg-neutral-50 dark:bg-neutral-900 rounded-2xl py-4 text-xs font-black tracking-widest`.

> **El botón "BORRAR TODOS LOS DATOS" del original NO se implementa.** Ahí vaciaba el LocalStorage del navegador; acá borraría los tableros de trabajo del equipo. En su lugar, si hace falta algo equivalente, va **Limpiar completadas** con selector de proyecto, confirmación y la cantidad exacta a la vista.

>

> "Exportar" vuelca en JSON las tareas de la vista actual, incluyendo su proyecto de origen. "Importar" **crea tareas nuevas** en el proyecto destino: nunca sobrescribe ni hace *match* por id contra tareas existentes.

---

## 12. Página "Cómo usar"

Título **Cómo usar Tareas** con ícono `HelpCircle` en acento y bajada **"Dominá tu flujo de trabajo paso a paso."** Secciones con encabezado en acento, ícono y `text-xl font-black tracking-widest`:

- **INICIO RÁPIDO** → tarjeta **Creación inteligente de tareas** con el texto "La barra de captura está pensada para la velocidad. Usá símbolos para definir propiedades al instante." y un bloque de código `bg-neutral-900 rounded-2xl px-6 py-4 font-mono text-sm` con **resaltado de sintaxis**: texto en blanco, `@mañana` en verde, `!alta` en rojo, `#trabajo` en rosa, `*diario` en ámbar. Debajo, grilla 2×2 con ícono en cuadrado pastel:
- **Fechas (@)** — "@hoy, @mañana, @próxima semana"
- **Prioridad (!)** — "!alta, !media, !baja"
- **Etiquetas (#)** — "#personal, #trabajo, #fitness"
- **Recurrencia (\*)** — "\*diario, \*semanal, \*mensual"
- **MODO ENFOQUE** → tres pasos numerados en círculo de acento:

- **Entrar en enfoque** — "Hacé clic en el ícono de diana del menú lateral o presioná f."
- **Iniciar el temporizador** — "Sesiones de 25 minutos por defecto. Hacé clic en el tiempo para editar la duración."
- **Trabajar** — "Tu tarea activa principal se fija automáticamente. Enfocate en una sola cosa."

- **ATAJOS** → tabla con encabezados **TECLA / ACCIÓN**, tecla en `<kbd class="bg-neutral-100 dark:bg-neutral-800 rounded-lg px-3 py-1.5 font-mono text-xs font-bold">`, filas separadas por `border-b border-neutral-100`.
- **PREGUNTAS FRECUENTES** → tarjetas con pregunta en `font-bold` y respuesta en `text-neutral-500`. Adaptá la respuesta sobre almacenamiento: los datos **no** van a LocalStorage sino a los tableros de WhatsPro.

---

## 13. Atajos de teclado

Globales, **deshabilitados mientras el foco está en un input, textarea o select**:

| Tecla | Acción |
| `/` | enfocar el buscador |
| `i` | ir a Bandeja |
| `t` | ir a Hoy |
| `f` | abrir Modo Enfoque |
| `s` | abrir Ajustes |
| `b` | plegar/desplegar el menú lateral |
| `Esc` | cerrar modales y overlays |

Cuidado con un detalle: en el sitio de referencia estos atajos disparan **aun cuando el usuario cree estar escribiendo**, si el input todavía no tomó el foco. Acá implementalo bien: si el `document.activeElement` es un campo editable, el atajo no corre.

---

## 14. Comportamiento responsive

- **≥1024px** — sidebar fijo visible; contenido en `max-w-3xl` centrado; dock alineado con `lg:left-64`.
- **<1024px** — sidebar como drawer con overlay difuminado; botón hamburguesa en la cabecera; dock a ancho completo (`left-0`); las grillas de Métricas y Ajustes colapsan a una columna; el Modo Enfoque apila el temporizador arriba y la misión abajo.
