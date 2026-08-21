# 08 — Historial de decisiones

Por qué el paquete quedó como quedó. Sirve para que nadie reabra una discusión ya cerrada, y para entender qué cambia si alguna decisión se revierte.

## Cómo evolucionó el encargo

| # | Planteo | Resultado |
| 1 | Replicar el frontend de https://todos-app-green.vercel.app/ como app suelta | Prompt standalone: React + Vite + `localStorage`, en inglés. **Descartado**, queda solo como referencia en el archivo `08-ANEXO-VERSION-STANDALONE.md` del paquete comprimido. |
| 2 | Meterlo en WhatsPro como plugin nuevo `todos-os`, con proyecto propio aislado | **Descartado**: duplicaba un módulo de tareas en vez de mejorar el que ya existe. |
| 3 | Reusar el plugin de Tareas y operar sobre **todas** las tareas del equipo | **Vigente.** Cambió el diseño entero: apareció la sección ESPACIOS, el chip de proyecto, el selector de destino y el modo conservador de escritura. |
| 4 | Que sea el **rediseño total del plugin Tareas**, no un plugin aparte | **Vigente.** Se eliminó el andamiaje de plugin nuevo y apareció la bandera `tasksUi` para poder volver atrás. |

## Decisiones abiertas que conviene revisar

**El kanban se conserva.** El sitio de referencia no tiene tablero; el plugin actual sí, y es el flujo que el equipo usa. La spec lo mantiene como tercera vista re-estilada (`Lista · Calendario · Tablero`). Si querés que desaparezca, se quita el botón y la sección 9-bis del documento 02. Es una decisión de producto: tomala a propósito, no por omisión.

**Prioridad y recurrencia como etiquetas reservadas.** `tasks` no tiene esos campos y la restricción es cero migraciones. Los labels `prio-*` y `rec-*` son la salida sin tocar el esquema, con el costo de que aparecen en los tableros de los proyectos donde se escriben. Si algún día se permite una migración, dos columnas reales son más limpias y el mapeo se simplifica.

**Los ~170 proyectos duplicados.** Se agrupan visualmente con un contador; **no se borra nada**. Limpiarlos requiere primero encontrar y arreglar el código que los genera — está pedido como reporte en la Fase 0, no como arreglo automático.

**"Borrar todos los datos" no se implementa.** En el sitio de referencia vaciaba el LocalStorage del navegador. Trasladado tal cual, borraría los tableros de trabajo del equipo.

**El botón "Desglosar con IA"** queda oculto tras una bandera salvo que en la Fase 0 aparezca un endpoint reutilizable en la infraestructura de IA que ya existe (`ai-config`, `ai-tools`, `ai-sessions`). Preferible a inventar un endpoint que falle en producción.

## Datos del backend en los que se apoya todo esto

Medidos en producción el 21/08/2026:

- Entre **500 y 1000 tareas**, en **menos de 175 proyectos**, repartidos en **7 workspaces**.
- Los proyectos son casi todos duplicados de **"Mi Proyecto OS"** (ids consecutivos 270-279 y siguientes), uno por cada montaje del componente que los crea.
- Las etiquetas viven en `task-projects.labels[]`: **son por proyecto**, no globales.
- `tasks.order` es relativo **a la columna**, no global.
- `tasks.status` acepta `open`, `in_progress` y `done` — el diseño de referencia solo contempla dos estados, y el mapeo tiene que respetar el tercero.

Si alguno de estos números cambia mucho, revisá la sección de rendimiento del documento 04 antes de dar por buena la estrategia de carga.
