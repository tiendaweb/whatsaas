Este manual te enseña a usar el editor de flujos de automatización de AAPP SPACE, la herramienta con la que vas a diseñar las respuestas automáticas de WhatsApp de tu equipo. No necesitás saber programar: todo se arma arrastrando y conectando bloques visuales sobre un lienzo (canvas). El objetivo es que, al terminar de leer esto, puedas crear, probar y publicar tu primera automatización con confianza.

## Qué es el editor de flujos

El editor de flujos es un espacio de trabajo visual donde diseñás una conversación automática paso a paso. Cada paso de la conversación es un **nodo**: un bloque con una función concreta (enviar un mensaje, hacer una pregunta, esperar unos segundos, actualizar el CRM, etc.). Los nodos se conectan entre sí con flechas que indican el camino que va a seguir la conversación según lo que responda el contacto.

Toda automatización, sin excepción, tiene un único nodo de arranque llamado `start`. Es el punto de entrada: ahí definís qué la va a disparar. A partir de ese nodo, vas agregando el resto de los bloques y conectándolos como si dibujaras un diagrama de flujo.

## Cómo arrancar un flujo nuevo

Conceptualmente, armar una automatización sigue siempre la misma lógica:

1. Creás la automatización y aparece en el lienzo el nodo `start`, listo para configurar.
2. Definís el disparador: qué tiene que pasar para que esta automatización se active. Puede ser una palabra exacta que escribe el contacto, que el mensaje contenga cierto texto, el primer mensaje de un contacto nuevo, o un disparador "comodín" que se activa solo si ninguna otra automatización aplicó a ese mensaje.
3. Opcionalmente, agregás filtros adicionales al `start`: que el contacto esté en cierta etapa del embudo de ventas, que tenga una etiqueta puntual, que esté asignado a determinado agente, o que pertenezca a cierto departamento. Estos filtros afinan cuándo se dispara la automatización, además de la condición principal.
4. Desde el `start`, vas arrastrando nuevos nodos al lienzo y conectándolos con flechas para armar el recorrido de la conversación.
5. Guardás y probás el flujo con el simulador antes de darlo por terminado (más abajo te explico cómo).

No hace falta que el flujo sea lineal: podés ramificarlo cuantas veces necesites usando los nodos de lógica que vemos a continuación.

## Los tipos de nodo disponibles

El editor ofrece 16 tipos de nodo, agrupados en cinco categorías según su función: disparador, mensajes, lógica, integraciones con el CRM y utilidad.

### Disparador

- **start** — el punto de entrada obligatorio de todo flujo. Ahí configurás qué dispara la automatización (palabra exacta, texto contenido en el mensaje, primer mensaje de un contacto nuevo, o disparador comodín para cuando ninguna otra automatización aplicó) y, opcionalmente, filtros extra por etapa del embudo, etiqueta, agente asignado o departamento.

### Mensajes

- **message** — envía un mensaje de texto simple, sin ningún elemento adicional.
- **media** — envía una imagen, video, audio o documento, con la posibilidad de agregar un texto opcional que lo acompañe.
- **options** — le hace una pregunta al contacto con varias opciones numeradas, y el flujo se ramifica automáticamente según la opción que elija.
- **menu_simple** — la forma más práctica de armar un menú: en un solo nodo combina la pregunta, las opciones y el guardado de la respuesta en una variable, con numeración o emojis automáticos. Si tenés que armar un menú rápido, este es el nodo indicado.
- **button_message** — mensaje con hasta 3 botones interactivos. Ojo: solo está disponible en instancias conectadas por la API oficial de WhatsApp, no en todas.
- **list_message** — mensaje con una lista desplegable de hasta 10 opciones. Igual que el anterior, solo funciona en instancias con API oficial.
- **call_to_action** — mensaje con un botón que lleva a un link externo, por ejemplo a una página de pago o a tu sitio web. Es importante aclarar que esto **no es una llamada telefónica**: es simplemente un botón que abre un enlace.

### Lógica

- **condition** — evalúa una condición (puede ser sobre un texto, un número, una variable guardada previamente, o el tiempo transcurrido) usando operadores como igual a, contiene, empieza con, mayor que, entre, entre otros. Según el resultado, ramifica el flujo, y siempre tiene una salida de respaldo por si ninguna condición se cumple.
- **delay** — pausa el flujo por unos segundos antes de continuar con el siguiente paso. Útil para que la conversación no se sienta robótica.
- **go_to_node** — redirige la conversación. Tiene tres modos: volver al nodo anterior (usando el historial de la conversación), saltar a un nodo específico dentro de la misma automatización, o saltar directamente a otra automatización distinta.
- **end** — termina el flujo. Además, puede "apagar" el modo automático para ese chat puntual, de forma que un humano tome el control de la conversación sin que la automatización se vuelva a disparar sola.

### Integraciones con el CRM

- **collect** — le hace una pregunta al contacto y guarda su respuesta en una variable, para poder usarla más adelante en el mismo flujo (por ejemplo, en un `condition` o en un `save_contact`).
- **save_contact** — actualiza los datos del contacto en el CRM: nombre, agente asignado, departamento, etapa del embudo, etiqueta o campos personalizados. Puede usar las variables que recolectaste antes con `collect`.
- **ai_control** — activa o pausa el asistente de Inteligencia Artificial para esa conversación puntual. Es el nodo que usás cuando querés que un humano tome el control sin que la IA interfiera en el medio.

### Utilidad

- **sticky_note** — una nota adhesiva sobre el lienzo, pensada solo para anotaciones internas del equipo. No afecta en absoluto la ejecución del flujo; es puramente documentación visual.

---

## Cómo probar un flujo con el simulador

Antes de publicar cualquier automatización, siempre conviene probarla. Para eso, el editor incluye un simulador de conversación integrado, disponible con un botón dentro de la misma pantalla donde armás el flujo.

El simulador te deja escribir mensajes como si fueras el propio contacto, y el flujo responde exactamente con el mismo comportamiento que tendría en producción: las mismas condiciones se evalúan igual, los mismos menús aparecen igual, y los tiempos de espera de los nodos `delay` se reproducen, aunque limitados a un máximo breve para no hacerte esperar durante la prueba.

Para usarlo:

1. Terminá de armar (o modificar) tu flujo en el lienzo.
2. Abrí el simulador desde el editor.
3. Escribí el mensaje que dispararía la automatización, tal como lo escribiría un contacto real.
4. Recorré la conversación completa, probando distintas respuestas si el flujo tiene ramas (por ejemplo, elegí distintas opciones en un `options` o `menu_simple` para verificar que cada camino funcione).
5. Si algo no se comporta como esperabas, volvé al lienzo, corregí el nodo correspondiente y volvé a probar.

Repetir este paso las veces que haga falta, probando todas las ramas posibles, es la mejor forma de evitar sorpresas cuando el flujo ya esté activo con clientes reales.

## El mapa de conexiones entre automatizaciones

Cuando un negocio tiene varias automatizaciones que se derivan entre sí —por ejemplo, un flujo de bienvenida que al final usa un `go_to_node` en modo "otro flujo" para mandar al contacto a una automatización de ventas— puede volverse difícil recordar cómo se conectan todas. Para eso existe una pantalla especial: el mapa de conexiones entre automatizaciones.

Esta pantalla dibuja todas tus automatizaciones y las flechas que las une, mostrando visualmente cuál deriva a cuál. Las conexiones que avanzan hacia adelante en la lógica del negocio se muestran de una forma; las que "vuelven atrás" y cierran un ciclo entre automatizaciones (por ejemplo, si la automatización C termina derivando otra vez a la A) se dibujan distinto, como un arco punteado. Esto te permite detectar de un vistazo si armaste, sin querer, un bucle entre automatizaciones que podría hacer que un contacto quede dando vueltas sin salida.

Además del mapa visual, hay una vista alternativa en formato de lista, que muestra para cada automatización a cuáles otras envía contactos y de cuáles otras recibe. Esta vista es útil cuando tenés muchas automatizaciones y preferís revisar las conexiones como un listado ordenado en lugar de un diagrama.

Te conviene revisar este mapa cada vez que agregues una nueva automatización que se conecte con las existentes, así te asegurás de que el recorrido completo del contacto tenga sentido de punta a punta.

## Buenas prácticas antes de publicar

- Probá siempre el flujo completo en el simulador antes de activarlo con clientes reales, recorriendo todas las ramas posibles, no solo la principal.
- Usá el nodo `sticky_note` para dejar anotaciones dentro del propio flujo: qué hace cada sección, para qué campaña se armó, o cualquier aclaración que le sirva a otro compañero del equipo que lo abra más adelante.
- Prestá atención a los ciclos entre automatizaciones. Un `go_to_node` que salta a otro flujo puede ser muy útil, pero si esa otra automatización termina derivando de nuevo a la primera, revisá el mapa de conexiones para confirmar que no se genere un bucle sin salida para el contacto.
- Recordá que `button_message` y `list_message` solo funcionan en instancias conectadas por la API oficial de WhatsApp; si tu instancia no lo es, elegí `options` o `menu_simple` como alternativa.
- Cuando termines un flujo y quieras que un humano siga la conversación sin que la automatización vuelva a intervenir, usá `end` con la opción de apagar el modo automático, o `ai_control` si lo que querés pausar puntualmente es la IA.

Con estos conceptos ya tenés todo lo necesario para armar tu primera automatización de punta a punta: definir el disparador en el `start`, construir la conversación con los nodos de mensajes y lógica, guardar información del contacto con los nodos de CRM, probarla en el simulador y, si forma parte de un conjunto más grande de automatizaciones, revisar cómo se conecta con las demás en el mapa antes de publicarla.
