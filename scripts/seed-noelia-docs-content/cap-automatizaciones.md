Cuando armás un flujo en el editor visual, conectás bloques con flechas y todo se ve bastante claro: "primero pasa esto, después esto otro". Pero hay una pregunta que casi nadie se hace hasta que algo no funciona como esperaba: ¿qué es exactamente lo que hace que una automatización *arranque*? Ese disparador inicial se llama **trigger**, y se configura en el nodo `start`, el primer bloque de cualquier flujo. Entender bien cómo funcionan los triggers, las variables y las sesiones es la diferencia entre armar un flujo que "más o menos anda" y uno que se comporta exactamente como lo pensaste.

## ¿Qué hace que una automatización arranque?

En criollo: una automatización nunca se activa sola. Necesita que pase algo puntual en la conversación —un mensaje nuevo, una palabra específica, o que un agente la dispare a mano— y ese "algo" es el trigger. Whatsaas evalúa los mensajes entrantes contra los triggers configurados en tus automatizaciones activas y, cuando encuentra una coincidencia, arranca el flujo correspondiente desde el nodo `start`.

Hay cuatro tipos de trigger disponibles.

## Los cuatro tipos de disparador

### first_message: la bienvenida

Se dispara con el **primer mensaje** que manda un contacto nuevo, sin importar qué haya escrito. Es el trigger ideal para automatizaciones de bienvenida.

Ejemplo: un contacto que nunca escribió antes manda "Hola, vi el anuncio en Instagram". No importa el contenido exacto: como es su primer mensaje, dispara tu automatización de bienvenida, que responde algo como "¡Hola! Bienvenido a AAPP SPACE, contame en qué te puedo ayudar."

### exact_match: coincidencia exacta

Se dispara cuando el mensaje del contacto coincide **exactamente** con alguna de las palabras o frases clave que configuraste.

Ejemplo: configurás la palabra clave "precios". Si el contacto escribe justo "precios", el trigger se activa. Pero si escribe "quiero saber los precios", *no* coincide exactamente, así que este trigger no se dispara (para ese caso necesitás `contains`).

### contains: coincidencia flexible

Se dispara cuando el mensaje **contiene** alguna de las palabras o frases clave configuradas, en cualquier parte del texto. Es mucho más flexible que `exact_match`.

Ejemplo: configurás la palabra clave "turno". Con `contains`, tanto "quiero pedir un turno", "¿tenés turno para mañana?" como simplemente "turno" van a disparar la automatización, porque en los tres casos la palabra aparece dentro del mensaje.

### fallback: la red de contención

Es el disparador "comodín": se activa cuando **ningún otro trigger de ninguna otra automatización** aplicó al mensaje que mandó el contacto. Sirve para no dejar a nadie sin respuesta cuando el cliente escribe algo que no está contemplado en tus flujos con palabras clave.

Ejemplo: tenés automatizaciones para "precios", "horarios" y "turno", pero el contacto escribe "¿atienden los feriados?". Ninguna palabra clave coincide, así que se activa la automatización de `fallback`, que puede responder algo como "No entendí bien tu consulta, ¿podés reformularla o preferís hablar con un asesor?"

> Un flujo bien armado casi siempre combina varios triggers específicos (`exact_match` o `contains`) más una automatización de `fallback` que actúe de red de contención.

## Filtros extra: la misma palabra, distinta respuesta

Cada trigger puede llevar filtros adicionales opcionales, para que no todos los contactos disparen la misma automatización aunque escriban lo mismo. Podés filtrar por:

- Etapa del embudo en la que está el contacto
- Etiqueta que tenga asignada
- Agente asignado a esa conversación
- Departamento del contacto

Esto permite, por ejemplo, que la palabra "precios" dispare una automatización distinta según si el contacto ya está en la etapa "Cliente" (con precios de renovación) o todavía en "Lead nuevo" (con precios de bienvenida). La misma palabra clave, dos respuestas completamente distintas según quién la escribe.

## El disparo manual

Además de los triggers automáticos, un agente humano puede arrancar una automatización **a mano** desde la conversación, sin esperar a que el contacto escriba la palabra clave. Es útil cuando el agente ya sabe qué flujo necesita ese cliente puntual y prefiere activarlo directamente en vez de guiar la charla hasta que el cliente escriba el disparador correcto.

## Variables: la memoria del flujo

Una variable guarda un dato durante la conversación para poder reutilizarlo más adelante, en ese mismo flujo. Por ejemplo, el nombre que dio el cliente, o qué servicio le interesa.

Se completan de dos maneras:

- Con el nodo `collect`: le pregunta algo al contacto y guarda su respuesta en la variable que definas.
- Con el nodo `menu_simple`: si lo configurás para eso, guarda la opción que el contacto eligió del menú.

Una vez que la variable tiene un valor, la usás escribiendo su nombre entre doble llave en el texto de cualquier mensaje posterior del flujo:

```
¡Gracias {{nombre}}! Ya anoté que te interesa {{servicio}}, en breve te paso más info.
```

Si el contacto respondió "Marina" cuando el flujo le preguntó el nombre con un `collect`, y después eligió "Diseño web" en un menú, ese mensaje sale como: *"¡Gracias Marina! Ya anoté que te interesa Diseño web, en breve te paso más info."* El flujo queda personalizado con los datos reales que dio esa persona, sin que tengas que armar un mensaje distinto para cada caso.

## Sesiones: el marcapáginas de cada cliente

Pensalo así: cada conversación que entra a un flujo tiene su propio marcapáginas dentro del libro. Ese marcapáginas —la **sesión**— guarda tres cosas: qué automatización está corriendo esa conversación, en qué nodo puntual está parada, y qué variables acumuló hasta ese momento.

Gracias a esto, dos clientes distintos pueden estar metidos en el mismo flujo de automatización pero en pasos completamente diferentes —uno recién arrancando, otro por terminar— sin que se pisen ni se mezclen sus datos entre sí.

La sesión también guarda un historial de los nodos por los que pasó esa conversación puntual. Ese historial es lo que usa el nodo `go_to_node` cuando lo configurás para "volver al nodo anterior": el flujo sabe exactamente de dónde vino esa conversación porque quedó registrado en su propia sesión.

Por último, una automatización se puede "cortar" para un chat puntual. Esto pasa, por ejemplo, cuando un agente humano toma el control de la conversación y el nodo `end` está configurado para desactivar la automatización en ese chat. Después, si hace falta, se puede reactivar manualmente para ese contacto.

## Condicionales: bifurcar el camino

El nodo `condition` te deja evaluar un dato y mandar la conversación por caminos distintos según el resultado. Podés evaluar texto libre, un número, el valor de una variable guardada, o un criterio de tiempo.

Los operadores disponibles son: igual a, distinto de, contiene, empieza con, termina con, mayor que, menor que, mayor o igual, menor o igual, y entre dos valores.

Cada condición se conecta a una rama distinta del flujo, y siempre hay una salida de respaldo por si ninguna condición se cumple —así la conversación nunca queda "colgada" sin respuesta.

Ejemplo: guardaste en una variable `{{presupuesto}}` el número que el cliente respondió a "¿con qué presupuesto contás?". Con un `condition` podés armar:

- Si `{{presupuesto}}` es mayor o igual a 50000 → rama "plan premium"
- Si `{{presupuesto}}` está entre 20000 y 49999 → rama "plan estándar"
- Salida de respaldo → rama "hablemos con un asesor"

## Los dos canales por los que corre todo esto

Las automatizaciones funcionan sobre dos tipos de instancia de WhatsApp: las conectadas por código QR (el WhatsApp normal, de toda la vida) y las conectadas por la API oficial de WhatsApp Business de Meta. La lógica de triggers, variables, sesiones y condicionales es la misma en ambos canales, pero la API oficial de Meta habilita además mensajes interactivos con botones y listas, que son exclusivos de ese canal y no están disponibles en las instancias por QR.

## Ejemplo completo: trigger + variable + condición

Armemos un flujo típico de agendamiento de turnos, combinando todo lo que vimos:

1. Trigger `contains` con la palabra clave "turno": el contacto escribe "quiero un turno para mañana" y arranca la automatización.
2. Un nodo `collect` pregunta "¿Para qué servicio sería el turno?" y guarda la respuesta en la variable `{{servicio}}`.
3. Otro `collect` pregunta "¿Qué día te queda mejor?" y guarda la respuesta en `{{dia}}`.
4. Un nodo `condition` evalúa la variable `{{dia}}`: si contiene "sábado" o "domingo" va por la rama "fin de semana" (donde se avisa que esos días no hay turnos y se ofrecen alternativas); en cualquier otro caso va por la rama "día hábil".
5. En la rama "día hábil", un mensaje final usa las dos variables juntas: `Perfecto, quedás anotado para {{servicio}} el {{dia}}. ¡Te esperamos!`

Mientras tanto, la sesión de esa conversación puntual guarda en todo momento en qué paso está parado ese contacto y qué respondió, sin afectar a ningún otro cliente que esté transitando el mismo flujo en simultáneo. Y si nadie escribe "turno" ni ninguna otra palabra clave configurada, la automatización de `fallback` se encarga de que esa persona igual reciba una respuesta.
