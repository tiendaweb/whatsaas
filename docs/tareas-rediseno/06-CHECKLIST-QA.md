# 06 — Checklist de verificación

Referencia visual: https://todos-app-green.vercel.app/

Método por ítem: abrí la pantalla rediseñada y la del sitio de referencia en el mismo ancho de ventana, capturá ambas y comparalas lado a lado. Los textos difieren (español vs inglés) — lo que se compara es **layout, tamaños, pesos, colores, radios, sombras y espaciado**.

Marcá cada ítem solo cuando lo verificaste de verdad. Un ítem que no se pudo verificar se reporta como tal, no se tilda.

## A. Bandera, estructura y shell

- [ ] Con la bandera en `clasico`, el tablero de hoy funciona **exactamente igual** que antes de empezar
- [ ] Con la bandera en `nuevo`, se carga la interfaz rediseñada
- [ ] Volver de `nuevo` a `clasico` no requiere deploy ni recarga forzada
- [ ] Al entrar, no queda ni un píxel del menú ni de la barra superior de WhatsPro
- [ ] Recargar mantiene al usuario adentro, en la misma vista
- [ ] Existe una única salida visible y funciona sin recargar
- [ ] Al salir, WhatsPro queda como estaba (scroll, título, estilos)
- [ ] Business Manager y los demás módulos de pantalla completa siguen entrando y saliendo igual que antes
- [ ] Menú lateral de 256px, fondo blanco, borde derecho de 1px
- [ ] Contenido principal centrado con ancho máximo de 768px (`max-w-3xl`) y `py-12`
- [ ] La barra de captura queda fija abajo, alineada con el contenido y por encima de la lista

## B. Menú lateral

- [ ] Logo: cuadrado de 40px, radio 12px, fondo de acento, sombra de acento, ícono blanco
- [ ] La marca dice **Tareas** (no "ToDoS"), en 20px peso 700 con tracking ajustado
- [ ] Rótulos SISTEMA, ESPACIOS y ETIQUETAS en 10px, peso 900, tracking 0.2em, gris
- [ ] Ítems de nav: 14px, peso 500, padding 10px/14px, radio 12px
- [ ] Ítem activo con fondo de acento al 10% y texto e ícono en acento
- [ ] Badges solo cuando el contador es mayor que cero, en 10px peso 700 sobre gris
- [ ] Sección ESPACIOS con los 7 workspaces, plegables a sus proyectos, en el mismo estilo de fila que las etiquetas
- [ ] Los proyectos duplicados ("Mi Proyecto OS") aparecen agrupados en **una** fila con contador, no ~170 filas
- [ ] Filtrar por un workspace o proyecto reduce la lista y actualiza los contadores
- [ ] Etiquetas con punto de 10px del color correspondiente, que crece al hover
- [ ] La lista de etiquetas es la unión de todos los proyectos, deduplicada por nombre
- [ ] Las etiquetas reservadas `prio-*` y `rec-*` **no** aparecen en la lista del menú
- [ ] La lista de etiquetas queda debajo del pliegue y se ve con scroll, igual que el original
- [ ] Pie separado por borde superior con Modo Enfoque, Métricas y Ajustes

## C. Cabecera y lista

- [ ] `h1` en 36px peso 900 con tracking ajustado
- [ ] Subtítulo "N tareas activas." en gris justo debajo
- [ ] Los botones de vista cambian a fondo de acento cuando están activos
- [ ] El botón de Tablero está deshabilitado con tooltip si no hay proyecto seleccionado
- [ ] Buscador: radio 24px, `py-5`, ícono a la izquierda, texto en peso 700
- [ ] El buscador al enfocarse muestra anillo de acento al 10% y borde de acento
- [ ] Filas de tarea con casilla circular de 24px y borde de 2px
- [ ] Metadatos en 12px peso 700; fecha vencida en rojo
- [ ] En vista mezclada la manija de arrastre **no** aparece y hay un espaciador que mantiene la alineación
- [ ] Con la vista filtrada a un proyecto, la manija aparece y el reordenamiento persiste tras recargar
- [ ] Cada fila muestra el chip de proyecto de origen, y se oculta cuando ya se filtró por ese proyecto
- [ ] La Bandeja agrupa por fecha con encabezados en mayúsculas
- [ ] Completar tacha el título y lo pasa a gris
- [ ] Estado vacío: círculo de 80px con radio 32px, título en 18px peso 700, bajada en gris

## D. Captura rápida

- [ ] Tarjeta con radio 24px, borde y sombra de acento difusa
- [ ] El botón de agregar está deshabilitado al 30% de opacidad con el input vacío
- [ ] Los tres chips muestran el estado actual y el de prioridad va coloreado
- [ ] Los cuadraditos de etiqueta están en gris al 40% y toman color al activarse
- [ ] `@` fija la fecha y actualiza el chip en vivo
- [ ] `!` fija la prioridad y actualiza el chip en vivo
- [ ] `#` asigna la etiqueta y crea la que no existe
- [ ] `*` fija la recurrencia
- [ ] Al guardar, los tokens desaparecen del título
- [ ] Los alias en inglés (`@tomorrow`, `!high`, `*daily`) también funcionan
- [ ] Sin proyecto destino elegido, la barra está deshabilitada y el placeholder lo explica con enlace a Ajustes
- [ ] Con la vista filtrada a un proyecto, la tarea se crea **en ese proyecto** y el placeholder lo indica
- [ ] La tarea nueva cae en la primera columna del proyecto por `order`, y se ve en el tablero clásico

## E. Modal de edición

- [ ] Overlay oscuro con desenfoque
- [ ] Píldora de acento arriba a la izquierda y `X` a la derecha
- [ ] Título en 30px peso 900, editable en línea
- [ ] Descripción sobre fondo gris con radio 16px
- [ ] Subtareas como filas grises con casilla circular
- [ ] Botón "+ AGREGAR PASO" con borde punteado en acento
- [ ] Los tres selectores en grilla con sus rótulos en mayúsculas
- [ ] Botón de guardar ancho completo en acento con sombra
- [ ] Cierra con `Esc` y con clic en el overlay
- [ ] Selector de PROYECTO presente; mover una tarea cambia `projectId` y `columnId` y se refleja en el tablero
- [ ] En modo conservador, el selector de prioridad se ve deshabilitado con tooltip en proyectos sin labels `prio-*`
- [ ] Los cambios persisten: recargar y volver a abrir muestra lo guardado
- [ ] **Abrir la misma tarea en el tablero clásico muestra los mismos datos**
- [ ] Es el mismo modal el que se abre desde la vista Lista y desde la vista Tablero

## F. Calendario

- [ ] Mes y año en 24px peso 900
- [ ] Flechas y botón "Hoy" a la derecha
- [ ] Días de la semana en 10px peso 900 con tracking amplio, arrancando en domingo
- [ ] Celdas de alto mínimo 110px, radio 16px, fondo gris claro
- [ ] Días de otro mes en gris claro sin fondo
- [ ] El día de hoy con anillo de acento y número en círculo de acento
- [ ] Las tareas aparecen en el día de su fecha de vencimiento

## F-bis. Tablero

- [ ] Solo aparece con un proyecto seleccionado
- [ ] Columnas de 320px con radio 24px, scroll horizontal fluido
- [ ] Cabecera de columna con rótulo en mayúsculas y badge de cantidad
- [ ] Tarjetas con la misma fila de metadatos que la vista Lista, sin el chip de proyecto
- [ ] El arrastre entre columnas funciona y persiste tras recargar
- [ ] "+ AGREGAR" y "+ NUEVA COLUMNA" con borde punteado
- [ ] Las columnas y el orden coinciden con lo que muestra el tablero clásico

## G. Modo Enfoque

- [ ] Ocupa toda la pantalla y oculta el menú lateral
- [ ] Anillo circular de ~290px con extremos redondeados y progreso en acento
- [ ] "TRABAJO PROFUNDO" con ícono de diana sobre el tiempo
- [ ] Tiempo en 72px peso 900
- [ ] Botón de reset circular gris y botón de play grande en acento
- [ ] El temporizador corre, pausa y resetea correctamente
- [ ] Panel derecho con la tarea principal y sus subtareas
- [ ] Marcar una subtarea desde aquí la actualiza en el backend

## H. Métricas

- [ ] Cuatro tarjetas KPI con ícono en cuadrado tintado y valor en 30px peso 900
- [ ] Gráfico de barras con líneas de guía punteadas y eje X con fechas
- [ ] Dona con extremos redondeados, total al centro y rótulo TOTAL debajo
- [ ] Leyenda con punto de color y porcentaje alineado a la derecha
- [ ] Tarjeta "Pico de enfoque" en bloque sólido de acento con texto blanco
- [ ] El filtro por workspace está presente y recalcula todos los KPI
- [ ] Los números coinciden con las tareas reales (verificalo contra el MCP)

## I. Ajustes

- [ ] Bloques en tarjetas blancas con radio 24px y rótulos en mayúsculas
- [ ] El switch de tema funciona y el ícono cambia de sol a luna
- [ ] Las siete muestras de acento cambian el color de toda la interfaz al instante
- [ ] La muestra activa tiene anillo con separación
- [ ] El deslizador de objetivo diario actualiza el badge en vivo
- [ ] Bloque DESTINO Y ESCRITURA presente, con proyecto destino y modo de escritura
- [ ] El modo arranca en **Conservadora**
- [ ] Cada etiqueta muestra en cuántos proyectos existe
- [ ] Renombrar o borrar una etiqueta pide confirmación mostrando los proyectos afectados
- [ ] Las etiquetas reservadas (`prio-*`, `rec-*`) no aparecen en la gestión
- [ ] Exportar descarga un JSON válido, con el proyecto de origen de cada tarea
- [ ] Importar **crea** tareas nuevas en el destino y no sobrescribe ninguna existente
- [ ] **El botón "BORRAR TODOS LOS DATOS" no existe en ninguna parte de la interfaz**

## J. Modo oscuro

- [ ] Fondo `#171717`, superficies `neutral-800`, texto blanco
- [ ] Las sombras de acento desaparecen
- [ ] Los bordes pasan a `neutral-700`
- [ ] Ninguna tarjeta queda con fondo blanco olvidado
- [ ] La preferencia sobrevive a la recarga

## K. Atajos

- [ ] `/` enfoca el buscador
- [ ] `i` va a Bandeja, `t` a Hoy
- [ ] `f` abre Modo Enfoque, `s` abre Ajustes
- [ ] `b` pliega y despliega el menú
- [ ] `Esc` cierra modales pero **no** sale de la aplicación
- [ ] **Ningún atajo dispara mientras se escribe en un campo** (verificalo tipeando "instituto" en el buscador y en la barra de captura)

## L. Responsive

- [ ] A 1440px, 1280px y 1024px el layout se mantiene
- [ ] Por debajo de 1024px el menú pasa a drawer con overlay difuminado
- [ ] La barra de captura ocupa el ancho completo en móvil
- [ ] Métricas y Ajustes colapsan a una columna
- [ ] El Modo Enfoque apila temporizador y misión

## M. Rendimiento

- [ ] Con el universo completo cargado (500-1000 tareas), la primera pantalla útil aparece en menos de 2 segundos
- [ ] La carga es paginada y la interfaz se usa mientras completa en segundo plano
- [ ] Listas de más de 200 filas están virtualizadas y el scroll es fluido
- [ ] Los contadores del menú reflejan el universo completo, no la página visible
- [ ] Escribir en el buscador no dispara una recarga del universo

## N. Integridad de datos y producción

- [ ] Entrar y salir **20 veces seguidas** no crea ni un workspace, proyecto o columna — contá `task-projects` por MCP antes y después y verificá que el número es idéntico
- [ ] Crear 5 tareas seguidas tampoco crea proyectos
- [ ] Completar una tarea recurrente genera la siguiente en **el mismo proyecto y columna**, con fecha corrida y checklist reseteado
- [ ] Si falla la creación de la sucesora, la original no queda completada
- [ ] Descompletar una tarea que estaba `in_progress` **no** la deja en `open`
- [ ] Agregar una etiqueta a un proyecto pide confirmación y **no** reordena ni pisa las etiquetas que ya tenía
- [ ] Eliminar una tarea pide confirmación mostrando el proyecto
- [ ] Todas las consultas filtran por `teamId`
- [ ] Los errores de red muestran un toast y hacen rollback de la actualización optimista
- [ ] Build, linter y `tsc` limpios
- [ ] Los componentes del tablero clásico siguen en el código y siguen funcionando
- [ ] La capa de datos existente se reutilizó en vez de duplicarse
- [ ] Cero migraciones de base de datos en el diff
- [ ] **Con la bandera en `clasico`, el tablero se abre y se ve intacto**: mismos proyectos, columnas, etiquetas y tareas que antes de empezar
