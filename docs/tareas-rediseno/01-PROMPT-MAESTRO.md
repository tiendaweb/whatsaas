# PROMPT MAESTRO — Rediseño total del plugin Tareas

> Pegá todo lo que sigue como primer mensaje en Claude Code, abierto en la raíz del repositorio de WhatsPro.

---

Vas a trabajar sobre el repositorio de **WhatsPro** en producción. Tu tarea es **rediseñar por completo el frontend del plugin de Tareas** (`pluginId: tasks`, el que en el menú aparece como **Tareas**), replicando con exactitud milimétrica el lenguaje visual de una app de referencia.

**No creás un plugin nuevo. No migrás la base. No perdés una sola tarea.** El plugin sigue siendo el mismo, con sus mismas tablas y su misma ruta: lo que se reemplaza es toda su interfaz.

**Referencia visual (abrila y usala para verificar):** https://todos-app-green.vercel.app/ Ese sitio se llama "ToDoS" — es solo la referencia de diseño. **El plugin se sigue llamando Tareas** y así aparece en la marca del menú lateral, en el título de la pestaña y en todos los textos.

La especificación está en `docs/tareas-rediseno/`. Leé cada archivo cuando corresponda, no todos de entrada:

- `02-SPEC-UI.md` — spec visual pantalla por pantalla
- `03-COPY-ES.md` — literales en español
- `04-BACKEND-MAPEO.md` — cómo se lee y escribe sobre las tablas del plugin (**leelo entero antes de tocar la capa de datos**)
- `05-PANTALLA-COMPLETA.md` — el takeover de pantalla
- `06-CHECKLIST-QA.md` — verificación final

## Reglas innegociables (producción)

- **Rama nueva.** Creá `feat/tareas-rediseno` antes de tocar nada. No commitees a la rama principal. No hagas push ni deploy sin que yo lo pida.
- **Cero migraciones.** No creás, alterás ni borrás tablas ni columnas. Todo se apoya en el esquema `task-*` que ya existe.
- **La capa de datos se conserva.** El rediseño es de la **interfaz**. Si el plugin ya tiene un cliente de datos, hooks o servicios que funcionan, **se reutilizan**. Solo los tocás cuando la interfaz nueva necesita algo que no existe, y en ese caso agregás sin romper las firmas que usa el código actual.
- **Bandera de rediseño, obligatoria.** La interfaz nueva vive detrás de una bandera (`tasksUi: 'clasico' | 'nuevo'`, por preferencia de usuario o de equipo, según lo que el repo permita). Por defecto arranca en `clasico`. **El tablero clásico no se borra**: queda en el código y accesible hasta que yo confirme que el rediseño está estable. Poder volver atrás sin un deploy no es un lujo, es el requisito que hace viable rediseñar algo en uso.
- **Prohibido crear proyectos automáticamente.** Hoy hay ~170 proyectos duplicados llamados "Mi Proyecto OS", uno por cada montaje del componente que los crea. La interfaz nueva **jamás** crea workspace, proyecto ni columna en el render, en un `useEffect` sin guarda, ni al guardar la primera tarea. La única creación posible es explícita, con el usuario apretando un botón, y va con *get-or-create* por nombre exacto, promesa compartida y caché de ids. **Si encontrás el código que causa los duplicados, no lo arregles por tu cuenta: reportámelo.**
- **Sin datos inventados.** Nada de mocks ni de seeds en producción. Si no hay tareas, se muestra el estado vacío de la spec.
- **Escrituras conservadoras.** Toda escritura que modifique un proyecto (agregar una etiqueta a su `labels[]`, mover una tarea, borrarla) pide confirmación. Ante la duda, no escribas: mostrá el control deshabilitado con el motivo a la vista.
- **Multi-tenant.** Todo filtrado por `teamId`. Nunca consultes sin ese filtro.
- **Preguntame antes de:** borrar cualquier registro, eliminar el tablero clásico, agregar una dependencia al `package.json`, modificar rutas compartidas, o proponer limpiar los proyectos duplicados.

## Fase 0 — Reconocimiento (no escribas código todavía)

Explorá el repo y respondeme por escrito, con rutas de archivo concretas:

- **El plugin de Tareas.** Ubicá su carpeta completa e inventariá **todos** sus componentes de interfaz: tablero, columnas, tarjeta de tarea, modal de detalle, barra superior, selector de workspace, modales de proyecto y etiqueta, menús contextuales, arrastre. Necesito el mapa completo de lo que se va a reemplazar.
- **Su capa de datos.** Cliente/SDK, hooks, servicios, caché. Qué endpoints de escritura existen para `tasks`, `task-projects`, `task-columns`, `task-workspaces`: ruta, método, payload, validación, autorización. ¿Se puede listar tareas **sin filtrar por proyecto**, y con qué paginación? ¿El proyecto de una tarea se escribe en `tasks.projectId` o pasa por `task-locations`?
- **El takeover de pantalla.** ¿Cómo hace hoy el plugin para ocultar el sidebar y el topbar de WhatsPro? Qué componente, qué bandera, cómo se sale. Comparalo con el otro módulo que hace lo mismo (Business Manager, o `aapp-space` / `memberships` / el mini-app `business-woman-planner`).
- **Nomenclatura.** Yo uso "Tareas" para este plugin y "Tareas OS" como un nombre que puede referirse a lo mismo o a otra cosa. **Decime qué son en el repo**, y si hay más de una superficie escribiendo sobre las tablas `task-*` (los labels `tag-...-tasks-os-project-N` sugieren que sí).
- **Banderas.** ¿Hay un sistema de feature flags o de preferencias por usuario/equipo que sirva para la regla 4? Si no existe, proponé el más simple que respete las convenciones del repo.
- **Stack.** Framework y versión, router, estilos (¿Tailwind? ¿qué config, qué prefijo?), íconos, estado, i18n, tests, linter, convención de commits.

Cerrá con **"Divergencias con la spec"**: todo punto donde la especificación asume algo que el repo hace distinto. **Esperá mi confirmación antes de la Fase 1.**

## Fase 1 — Andamiaje

- Implementá la bandera de la regla 4 y el punto de bifurcación: con `clasico` se renderiza exactamente lo de hoy, con `nuevo` una pantalla vacía con el shell nuevo.
- Estructura sugerida, **conviviendo** con los componentes actuales, sin borrarlos:

```
plugins/tasks/
  (todo lo actual, intacto)
  ui-nueva/
    TareasApp.tsx            shell (takeover)
    layout/  Sidebar.tsx  MobileDrawer.tsx
    views/   Lista.tsx  Calendario.tsx  Tablero.tsx  Enfoque.tsx
             Metricas.tsx  Ajustes.tsx  ComoUsar.tsx
    components/  ListaTareas.tsx  FilaTarea.tsx  ChipProyecto.tsx  CapturaRapida.tsx
                 ModalTarea.tsx  BarraSeleccion.tsx  EstadoVacio.tsx
                 AnilloProgreso.tsx  GraficoBarras.tsx  GraficoDona.tsx
    data/    universo.ts  mapeo.ts  etiquetas.ts  parser.ts  vistas.ts  recurrencia.ts
    hooks/   useUniverso.ts  useAtajos.ts  useAjustes.ts
    i18n/    es.ts
```

`data/` se apoya en el cliente que ya existe (regla 3). `universo.ts` carga y cachea workspaces, proyectos y tareas del equipo. `etiquetas.ts` resuelve la unificación por nombre y la escritura aditiva en `labels[]`. Los dos están especificados en `04-BACKEND-MAPEO.md`.

Al terminar: con la bandera en `nuevo`, la ruta carga el shell vacío; con `clasico`, todo funciona como hoy.

## Fase 2 — Pantalla completa

Leé `05-PANTALLA-COMPLETA.md`. Conservá el mecanismo de takeover que el plugin ya tiene y verificá que cumple los criterios de ese documento. Si hoy no cumple alguno, arreglalo en la interfaz nueva sin tocar la clásica.

## Fase 3 — Interfaz

Leé `02-SPEC-UI.md` y `03-COPY-ES.md`. Construí en este orden, verificando cada pantalla contra la referencia antes de seguir:

- Menú lateral + shell + atajos de teclado
- Vista Lista: cabecera, buscador, filas, agrupaciones, estados vacíos
- Barra de captura rápida con el parser `@ ! # *`
- Modal de tarea
- Vista Calendario
- **Vista Tablero**: el kanban actual, re-estilado con el lenguaje visual nuevo. Conserva columnas, arrastre y agrupación por proyecto.
- Modo Enfoque
- Métricas (SVG puro, sin dependencias nuevas)
- Ajustes
- Página "Cómo usar"

La spec trae clases de Tailwind **literales, extraídas del DOM de la referencia**. Usalas tal cual si la config del repo lo permite; si hay prefijo o tokens propios, traducí manteniendo los valores computados idénticos y anotá la equivalencia.

## Fase 4 — Datos

Leé `04-BACKEND-MAPEO.md` y completá `data/`:

- Carga paginada del universo (workspaces, proyectos, tareas del equipo), con la interfaz usable desde la primera página.
- Agrupación visual de proyectos duplicados por nombre, con contador. **Sin borrar nada** (regla 5).
- Vistas Bandeja / Hoy / Próximas / Vencidas / Completadas derivadas de `dueDate` y `status`.
- Unificación de etiquetas entre proyectos y escritura aditiva con confirmación.
- Prioridad y recurrencia con labels reservados, **en modo conservador por defecto**.
- Selector de proyecto destino; barra de captura deshabilitada mientras no haya uno elegido.
- Subtareas sobre `checklist[]`.
- Arrastre solo con la vista filtrada a un proyecto (o dentro del Tablero, donde sí hay columna).
- Actualizaciones optimistas con rollback y un toast de error discreto.
- Métricas del lado del cliente, con filtro por workspace. Cero endpoints nuevos.
- Las salvaguardas de la sección 12 de `04-BACKEND-MAPEO.md`, completas.

## Fase 5 — Verificación

Ejecutá `06-CHECKLIST-QA.md` entero. Por cada ítem, capturá tu pantalla y la de la referencia y comparalas lado a lado. Reportá las diferencias reales, no las disimules.

Además: build sin errores, linter limpio, `tsc` sin errores nuevos, y esta prueba en particular — **poner la bandera en `clasico` devuelve el tablero de hoy funcionando exactamente igual**, con los mismos proyectos, columnas, etiquetas y tareas.

## Formato de trabajo

- Un commit por fase, mensajes descriptivos en español.
- Al terminar cada fase: qué hiciste, qué archivos tocaste, qué quedó pendiente, qué necesitás de mí. **Frená y esperá.**
- Si algo de la spec choca con la realidad del repo, **no improvises**: explicá el conflicto y proponé dos opciones.
