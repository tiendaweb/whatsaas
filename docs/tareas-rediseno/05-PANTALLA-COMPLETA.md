# 05 — Pantalla completa: que se sienta otra aplicación

El plugin de Tareas ya hace esto hoy. Este documento define qué hay que **conservar** y qué exigirle. El objetivo no es "una pantalla ancha": es que al entrar, el usuario tenga la sensación de haber **cambiado de aplicación** — el menú de WhatsPro desaparece por completo, la marca cambia, la navegación es otra, y solo hay una puerta de vuelta.

**El patrón correcto es el que el plugin ya usa**, el que documentaste en la Fase 0. No lo reemplaces: reusalo desde el shell nuevo. Este documento describe el resultado esperado; si el repo lo consigue de otra manera, seguí la del repo.

> Nota de terminología: "Tareas" es este plugin (`pluginId: tasks`). Si en el repo aparece además algo llamado "Tareas OS", aclarame en la Fase 0 si es lo mismo bajo otro nombre visible o una superficie distinta que también escribe sobre las tablas `task-*`.

## Las cuatro capas del efecto

**1. La ruta.** La interfaz vive en la ruta que el plugin ya tiene, fuera del layout que dibuja el shell de WhatsPro. Si el repo anida todo bajo un layout con sidebar, el plugin necesita estar registrado en el nivel donde ese layout **no** aplica. Esto es lo que separa un takeover real de un `div` a pantalla completa: con la ruta propia el usuario puede recargar y sigue adentro, el botón "atrás" del navegador funciona, y la URL es compartible.

**2. El contenedor.** El componente raíz ocupa el viewport entero:

```
<div class="tareas-ui fixed inset-0 z-40 flex h-screen w-full overflow-hidden
            bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 transition-colors">
```

Al montar bloquea el scroll del documento (`overflow: hidden` en `body`) y al desmontar lo restaura. Si el shell de WhatsPro persiste detrás por z-index, no lo tapes con un overlay: usá el mecanismo real de ocultamiento — casi siempre es una bandera de layout (`hideChrome`, `fullscreen`, `standalone`) que el plugin ya activa.

**3. La identidad.** Dentro del takeover manda la interfaz nueva: su marca, su menú lateral, su tipografía (Inter) y su color de acento. Nada de la navegación de WhatsPro sobrevive: ni el buscador global, ni las notificaciones, ni el selector de instancia. El `document.title` pasa a **"Tareas — WhatsPro"** mientras está montado y se restaura al salir.

**4. La transición.** La entrada y la salida son suaves, no un salto: fade de 200 ms sobre el contenedor, o el mismo efecto que ya use el plugin. Nunca una recarga completa de página.

## La puerta de salida

Sin ella la aplicación se siente una trampa. Tiene que haber **una sola**, evidente y consistente:

- Un botón discreto al pie del menú lateral — ícono `ArrowLeft` o `LogOut` con el texto **"Volver a WhatsPro"**, en `text-neutral-400 hover:text-neutral-900`, separado del resto por el borde superior.
- Navega por router (`navigate('/')` o la ruta base que corresponda), **sin `window.location`**, para no perder el estado de la aplicación.
- La tecla `Esc` **no** sale: cierra modales. Salir es una acción deliberada.

Si el plugin resuelve hoy la salida de otra forma (una `X` en una barra propia, por ejemplo), conservá esa, no inventes una distinta. La consistencia entre módulos es parte del efecto.

## Persistencia de la sesión

Al volver a entrar, se restauran la última vista, el modo claro/oscuro, el color de acento y los filtros activos desde `localStorage`. La sensación de "aplicación propia" depende mucho de esto: si cada entrada resetea todo, se siente una pantalla, no un programa.

## Qué evitar

- **Un `<iframe>`.** Rompe los atajos de teclado, el tema compartido y la sesión. Aunque exista `embedEnabled` en los proyectos, esa función es para incrustar tableros afuera, no para montar la interfaz adentro.
- **Ocultar el shell con CSS global.** Nada de `body.hide-sidebar` ni de `display: none` sobre selectores de WhatsPro: cualquier refactor ajeno lo rompe en silencio y se filtra a otras rutas.
- **Duplicar el estado global.** Se reusa la sesión, el `teamId` y el cliente HTTP de WhatsPro. Lo único propio es el estado de interfaz.
- **Montar el takeover dentro del layout con `position: absolute`.** Se ve bien hasta que aparece un modal de WhatsPro por encima.

## Criterio de aceptación

Con la interfaz nueva abierta:

- No hay ni un píxel del menú, la barra superior ni la navegación de WhatsPro.
- Recargar la página deja al usuario adentro, con la misma vista.
- El botón "atrás" del navegador se comporta de forma razonable.
- Hay exactamente una salida visible, y funciona sin recargar.
- Al salir, WhatsPro queda exactamente como estaba: scroll del body restaurado, título restaurado, sin estilos filtrados.
- Business Manager y los demás módulos de pantalla completa siguen entrando y saliendo igual que antes.
- Con la bandera `tasksUi` en `clasico`, el takeover se comporta exactamente como hoy.
