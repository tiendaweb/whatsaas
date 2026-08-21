# 03 — Literales en español

Tabla de traducción del sitio de referencia al texto que va en el código. La columna "Original" sirve para localizar el elemento en https://todos-app-green.vercel.app/ durante la verificación visual.

Centralizá todo en `i18n/es.ts`. Nada de strings sueltos en los componentes.

## Marca y navegación

| Original | Español | Dónde |
| ToDoS | **Tareas** | marca del menú lateral — el plugin conserva su nombre |
| SYSTEM | SISTEMA | rótulo de sección |
| Inbox | Bandeja | nav |
| Today | Hoy | nav |
| Upcoming | Próximas | nav |
| Overdue | Vencidas | nav |
| Completed | Completadas | nav |
| TAGS | ETIQUETAS | rótulo de sección |
| Work / Personal / Fitness | Trabajo / Personal / Fitness | etiquetas por defecto |
| New Tag | Nueva etiqueta | sidebar |
| Focus Mode | Modo Enfoque | pie del sidebar |
| Insights | Métricas | pie del sidebar |
| Settings | Ajustes | pie del sidebar |

## Cabecera y lista

| Original | Español |
| My Tasks | Mis Tareas |
| N tasks active. | N tareas activas. |
| Search tasks, tags, or focus areas... (Press / to focus) | Buscar tareas, etiquetas o áreas de enfoque... (Presioná / para buscar) |
| No matches found | Sin resultados |
| Try clearing your filters or changing your search query. | Probá limpiar los filtros o cambiar la búsqueda. |
| SELECTED / N Tasks | SELECCIONADAS / N tareas |
| FINISH | COMPLETAR |
| DELETE | ELIMINAR |

Singular y plural: **"1 tarea activa."** / **"N tareas activas."**, **"1 tarea"** / **"N tareas"**. Resolvelo con una función, no con concatenación cruda.

## Captura rápida

| Original | Español |
| Type task... (e.g. 'Pay bills @tomorrow !high #personal *daily') | Escribí una tarea... (ej. 'Pagar cuentas @mañana !alta #personal *diario') |
| One-off / Daily / Weekly / Monthly | Única / Diaria / Semanal / Mensual |
| Low / Medium / High | Baja / Media / Alta |
| How to | Cómo usar |

## Modal de edición

| Original | Español |
| EDIT MOMENTUM | EDITAR TAREA |
| SUB-STEPS BREAKDOWN | SUBTAREAS |
| AI BREAKDOWN | DESGLOSAR CON IA |
| + ADD STEP | + AGREGAR PASO |
| TIMELINE / RECURRENCE / URGENCY | FECHA / RECURRENCIA / PRIORIDAD |
| Low Intensity / Standard Priority / Critical Mission | Baja / Media / Alta |
| Update Momentum | Guardar cambios |

## Modo Enfoque

| Original | Español |
| DEEP WORK | TRABAJO PROFUNDO |
| MAIN MISSION | TAREA PRINCIPAL |
| SUB-STEPS | SUBTAREAS |
| Finish | Finalizar |

## Métricas

| Original | Español |
| Productivity Insights | Métricas de productividad |
| Deep analysis of your local focus patterns and velocity. | Análisis de tus patrones de enfoque y velocidad. |
| ACTIVE STREAK | RACHA ACTIVA |
| COMPLETED | COMPLETADAS |
| EFFICIENCY | EFICIENCIA |
| OVERDUE | VENCIDAS |
| Productivity Velocity | Velocidad de productividad |
| DAILY AVERAGE / N tasks | PROMEDIO DIARIO / N tareas |
| Priority Mix | Mezcla de prioridades |
| TOTAL | TOTAL |
| High / Medium / Low | Alta / Media / Baja |
| FOCUS PEAK | PICO DE ENFOQUE |
| Your most active day this week. | Tu día más activo de la semana. |
| N/A | N/D |

## Ajustes

| Original | Español |
| Settings | Ajustes |
| Configure your local productivity engine. | Configurá tu motor de productividad. |
| INTERFACE & THEME | INTERFAZ Y TEMA |
| Appearance Mode / Switch between light and dark. | Modo de apariencia / Alterná entre claro y oscuro. |
| System Accent | Acento del sistema |
| MOMENTUM GOAL | META DIARIA |
| Daily Target / 5 TASKS | Objetivo diario / 5 TAREAS |
| TAG MANAGEMENT | GESTIÓN DE ETIQUETAS |
| ADD NEW TAG | AGREGAR ETIQUETA |
| SUPPORT | AYUDA |
| Help & Documentation / Learn how to use features and shortcuts. | Ayuda y documentación / Aprendé a usar las funciones y los atajos. |
| DATA CONTROLS | DATOS |
| EXPORT DATA / IMPORT DATA | EXPORTAR DATOS / IMPORTAR DATOS |
| DESTROY ALL DATA | **no se implementa** — ver sección 11 del documento 02 |

## Textos nuevos (no existen en el sitio de referencia)

Van igual en `i18n/es.ts`. Son las cadenas que aparecen porque el rediseño opera sobre datos multi-proyecto reales.

| Clave | Texto |
| Rótulo de sección del menú | ESPACIOS |
| Chip de origen en la fila | `{workspace} · {proyecto}` |
| Agrupación de duplicados | `{nombre}` + badge con el contador |
| Captura sin destino | Elegí un proyecto destino en Ajustes |
| Captura con vista filtrada | Nueva tarea en {workspace} · {proyecto} |
| Bloque de Ajustes | DESTINO Y ESCRITURA |
| Fila de Ajustes | Proyecto destino |
| Fila de Ajustes | Escritura de etiquetas |
| Opción conservadora | Conservadora — Solo escribe prioridad y recurrencia en proyectos que ya las tienen |
| Opción completa | Completa — Agrega las etiquetas reservadas a cualquier proyecto, pidiendo confirmación |
| Rótulo del modal | PROYECTO |
| Prioridad bloqueada (tooltip) | Este proyecto no tiene etiquetas de prioridad. Cambiá el modo de escritura en Ajustes para agregarlas. |
| Confirmación de etiqueta | Se va a agregar la etiqueta "{etiqueta}" al proyecto {proyecto}. Va a aparecer también en su tablero. |
| Confirmación de borrado | Vas a eliminar {n} tareas de {m} proyectos. Esta acción no se puede deshacer. |
| Etiqueta compartida | en {n} proyectos |
| Filtro de métricas | Todos los espacios |
| Encabezados de agrupación | VENCIDAS · HOY · MAÑANA · ESTA SEMANA · MÁS ADELANTE · SIN FECHA |
| Arrastre deshabilitado (tooltip) | Filtrá por un proyecto para reordenar |
| Salida del takeover | Volver a WhatsPro |
| Vistas de la cabecera | Lista · Calendario · Tablero |
| Tablero sin proyecto (tooltip) | Elegí un proyecto para ver su tablero |

## Cómo usar

| Original | Español |
| How to use ToDoS | Cómo usar Tareas |
| Master your workflow with our step-by-step guide. | Dominá tu flujo de trabajo paso a paso. |
| QUICK START | INICIO RÁPIDO |
| Smart Task Creation | Creación inteligente de tareas |
| The input bar is designed for speed. Use symbols to set properties instantly. | La barra de captura está pensada para la velocidad. Usá símbolos para definir propiedades al instante. |
| "Finish report @tomorrow !high #work *daily" | "Terminar informe @mañana !alta #trabajo *diario" |
| Dates (@) / Priority (!) / Tags (#) / Recurring (*) | Fechas (@) / Prioridad (!) / Etiquetas (#) / Recurrencia (*) |
| FOCUS MODE | MODO ENFOQUE |
| Enter Focus / Click the target icon in the sidebar or press f. | Entrar en enfoque / Hacé clic en el ícono de diana del menú lateral o presioná f. |
| Start Timer / 25-minute sessions by default. Click the timer text to edit the duration. | Iniciar el temporizador / Sesiones de 25 minutos por defecto. Hacé clic en el tiempo para editar la duración. |
| Work / Your top active task is pinned automatically. Focus on one thing. | Trabajar / Tu tarea activa principal se fija automáticamente. Enfocate en una sola cosa. |
| SHORTCUTS / KEY / ACTION | ATAJOS / TECLA / ACCIÓN |
| Focus Search | Enfocar la búsqueda |
| Go to Inbox / Go to Today | Ir a Bandeja / Ir a Hoy |
| Open Focus Mode / Open Settings | Abrir Modo Enfoque / Abrir Ajustes |
| Toggle Sidebar | Plegar el menú lateral |
| FAQ | PREGUNTAS FRECUENTES |
| How do I delete a tag? | ¿Cómo elimino una etiqueta? |
| Go to Settings > Tag Management. Hover over a tag and click the trash icon. This removes the tag from all tasks. | Andá a Ajustes > Gestión de etiquetas, pasá el cursor sobre la etiqueta y hacé clic en el ícono de papelera. Se quita de todas las tareas. |
| Where is my data stored? | ¿Dónde se guardan mis datos? |
| Locally in your browser's LocalStorage. You can export a JSON backup from Settings. | En tus tableros de Tareas de WhatsPro. Esta es otra forma de verlos: lo que editás acá se edita allá. Podés exportar un respaldo en JSON desde Ajustes. |

> Esa última respuesta es la única donde el texto **cambia de significado** respecto del original, y es a propósito: acá los datos son los tableros reales del plugin, no un almacenamiento local del navegador. No la copies literal — y no la suavices: el usuario tiene que entender que está editando datos compartidos.

## Formato de fechas

Localización `es-AR`, zona horaria `America/Argentina/Buenos_Aires`.

| Contexto | Original | Español |
| Metadatos de tarea | `Jan 28, 2026` | `28 ene 2026` |
| Chip de captura | `Aug 19` | `19 ago` |
| Cabecera del calendario | `August 2026` | `agosto 2026` |
| Días de la semana | `SUN MON TUE...` | `DOM LUN MAR MIÉ JUE VIE SÁB` |
| Eje del gráfico | `Aug 14` | `14 ago` |

La semana arranca en **domingo**, igual que el sitio de referencia.
