# 07 — Prompt corto

Versión condensada, para arrancar rápido o re-encarrilar una sesión que se fue de tema. La completa es el documento 01.

---

Estás en el repositorio de **WhatsPro** en producción. Vas a **rediseñar por completo el frontend del plugin de Tareas** (`pluginId: tasks`, el que en el menú se llama **Tareas**), replicando con exactitud el lenguaje visual de https://todos-app-green.vercel.app/, en español.

**No creás un plugin nuevo, no migrás la base, no perdés una tarea.** Mismo plugin, mismas tablas `task-*`, misma ruta, misma capa de datos: lo que se reemplaza es la interfaz. El sitio de referencia se llama "ToDoS" — es solo el diseño; **el plugin se sigue llamando Tareas**.

La spec está en `docs/tareas-rediseno/`: `02-SPEC-UI.md` (visual), `03-COPY-ES.md` (textos), `04-BACKEND-MAPEO.md` (datos — **leelo entero antes de tocar la capa de datos**), `05-PANTALLA-COMPLETA.md` (takeover), `06-CHECKLIST-QA.md` (verificación).

**Reglas:** rama `feat/tareas-rediseno` · cero migraciones · reutilizar la capa de datos existente en vez de duplicarla · todo filtrado por `teamId` · preguntame antes de borrar datos, eliminar el tablero clásico, agregar dependencias o tocar rutas compartidas.

**Lo que no se negocia:**

- **Bandera de rediseño.** La interfaz nueva vive detrás de `tasksUi: 'clasico' | 'nuevo'`, arranca en `clasico`, y el tablero actual **queda en el código** hasta que yo confirme que el rediseño está estable. Volver atrás no puede requerir un deploy.
- **Nunca crear proyectos automáticamente.** Hoy hay ~170 duplicados de "Mi Proyecto OS" por exactamente eso. Se agrupan visualmente con contador; no se borra nada.
- **Las etiquetas son por proyecto.** El menú las unifica por nombre; escribir una en un proyecto pide confirmación.
- **Prioridad y recurrencia** van como labels reservados `prio-*` y `rec-*`, en modo conservador por defecto.
- **El proyecto de origen se muestra** en cada fila, y hay una sección ESPACIOS en el menú para filtrar. Sin eso la lista global es incomprensible.
- **El arrastre solo se habilita con la vista filtrada a un proyecto** o dentro del Tablero, porque `order` es relativo a la columna.
- **El kanban actual se conserva** como tercera vista (`Lista · Calendario · Tablero`), re-estilado. Eliminarlo es una decisión de producto que tomás vos, no por omisión.
- **"Borrar todos los datos" no se implementa.**

**Empezá por la Fase 0:** inventariá todos los componentes de interfaz del plugin, su capa de datos, cómo hace hoy el takeover de pantalla completa, y si existe un sistema de banderas. No escribas código hasta que yo confirme ese informe.
