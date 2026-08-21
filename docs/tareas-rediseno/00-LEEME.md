# Tareas — rediseño total del plugin

Objetivo: **rediseñar por completo el frontend del plugin de Tareas de WhatsPro** (`pluginId: tasks`, el que en el menú se llama **Tareas**), tomando como referencia visual exacta el sitio https://todos-app-green.vercel.app/. Mismo plugin, mismas tablas, misma ruta: lo que cambia es toda la interfaz.

No se crea un plugin nuevo. No se migra la base. No se pierde una sola tarea.

## Decisiones tomadas (no volver a preguntar)

| Decisión | Valor |
| Qué se hace | **Rediseño total de la interfaz del plugin `tasks`.** No es un plugin aparte ni una vista adicional. |
| Nombre visible | **Tareas** (el que ya tiene). "ToDoS" es solo el sitio de referencia visual. |
| Backend | Las tablas que el plugin ya usa: `task-workspaces`, `task-projects`, `task-columns`, `tasks`. **Cero migraciones.** |
| Alcance de datos | **Todas las tareas del equipo**, de todos los workspaces y proyectos. |
| Idioma | **Español** (literales en el documento 03) |
| Pantalla completa | Se conserva el takeover que el plugin ya tiene: al entrar, los menús de WhatsPro desaparecen. |
| Referencia visual | https://todos-app-green.vercel.app/ — abrir y comparar |

> **Esto reemplaza una interfaz en uso.** No hay sandbox: el día que se active, el equipo abre Tareas y ve otra cosa. Por eso el rediseño va detrás de una **bandera** que permite volver al tablero clásico al instante, sin deploy. Está en la regla 4 del prompt maestro y es innegociable.

## Documentos de esta carpeta

| Documento | Para qué |
| 01 — Prompt maestro | **Esto es lo que pegás en Claude Code.** Fases, reglas de producción, criterios de aceptación. |
| 02 — Spec visual | Especificación pantalla por pantalla, con clases de Tailwind literales extraídas del DOM del sitio de referencia. |
| 03 — Textos en español | Todos los literales, incluidos los que no existen en el original. |
| 04 — Mapeo de datos | Cómo se lee y se escribe cada concepto sobre las tablas del plugin. **El más importante.** |
| 05 — Pantalla completa | La sensación de "otra aplicación": qué conservar del takeover actual y qué exigirle. |
| 06 — Checklist de QA | Verificación final contra el sitio de referencia, punto por punto. |
| 07 — Prompt corto | Versión condensada de una pantalla, para arrancar rápido o re-encarrilar. |
| 08 — Anexo standalone | La versión suelta de la primera iteración. Referencia histórica. |

## Cómo lanzarlo

- Abrí Claude Code en la raíz del repo de WhatsPro.
- Copiá estos documentos a `docs/tareas-rediseno/` dentro del repo, así se leen cuando hacen falta y no ocupan contexto de entrada.
- Pegá el contenido del documento 01 como primer mensaje.
- Claude Code arranca por la **Fase 0 de reconocimiento** y devuelve un informe antes de tocar una línea. Revisalo: ahí se confirma si lo que asumí sobre el plugin es cierto.

## Lo que encontré en el backend

Medido en producción, y ya contemplado en el prompt:

- Entre **500 y 1000 tareas**, en **menos de 175 proyectos** y **7 workspaces** (Principal, Membresias, Clientes, EMPRESA, Distribuidora, Escritorio, LOOPPY).
- **Casi todos esos proyectos son duplicados de "Mi Proyecto OS"**, uno por cada montaje del componente que los crea. El rediseño tiene prohibido crear proyectos automáticamente y los **agrupa visualmente** con un contador. Limpiarlos es una decisión aparte, que no se toma sin vos.
- **Las etiquetas son por proyecto, no globales.** El menú nuevo las unifica por nombre; escribir una en un proyecto tiene efecto visible en él, así que va con confirmación.
- El plugin **no tiene campos de prioridad ni de recurrencia**. Se modelan con etiquetas reservadas `prio-*` y `rec-*`, en modo conservador por defecto.
- `tasks.order` es relativo **a la columna**: por eso el arrastre solo se habilita cuando la vista está filtrada a un proyecto.

## Qué pasa con el tablero kanban actual

El sitio de referencia no tiene tablero: es una lista con vistas por fecha. Borrar el kanban sería tirar el flujo de trabajo que el equipo usa hoy.

La spec lo **conserva como una tercera vista** (`Lista · Calendario · Tablero`), rediseñada con el lenguaje visual nuevo. Si querés que el tablero desaparezca de verdad, es una línea a cambiar en el documento 02 — pero decidilo a propósito, no por omisión.
