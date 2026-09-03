Antes de arrancar, una aclaración de vocabulario que conviene tener clara: cuando hablamos de "funciones de llamada de IA" o *function calling*, NO nos referimos a llamadas telefónicas con voz. AAPP SPACE no hace llamadas de teléfono con inteligencia artificial. Se trata de algo distinto (y más útil todavía): la capacidad de tu asistente de IA de, mientras conversa por WhatsApp, ejecutar acciones reales dentro de tu negocio, no solo escribir texto. Con esa aclaración hecha, vamos al grano.

## Qué es esto en criollo

Normalmente un asistente de IA es como un vendedor que solo puede hablar: contesta preguntas, explica precios, da información. Pero no puede "tocar" nada del sistema. Con las funciones de llamada (function calling), tu IA deja de ser solo un pico que habla y pasa a tener manos: puede mover un contacto de etapa en el embudo, asignarle un agente humano, dejar una nota, ponerle una etiqueta, completar un dato, mandar un archivo o directamente pausarse y entregarle la charla a una persona.

Un ejemplo simple: si un cliente le escribe "ya hice la transferencia", vos querés que eso no se pierda en el chat. Con function calling, la IA puede efectivamente mover ese contacto a la etapa "esperando confirmación de pago" del embudo en el mismo instante, sin que nadie del equipo tenga que entrar después a hacerlo a mano.

## Dónde se configuran

Estas herramientas se administran en el panel de administración de **Tools** (gestor de herramientas de IA), dentro de la configuración de tu asistente. Ahí podés crear cada herramienta, ponerle un nombre, escribir una descripción de cuándo debe usarse, y armarla con una o varias acciones. La descripción es clave: es el texto que la IA lee para decidir en qué momento de la charla le toca actuar, así que cuanto más clara y específica la escribas, mejor va a "saber" cuándo usarla.

## Las acciones disponibles

A continuación, un recorrido por las siete acciones que hoy podés darle a tu asistente.

### Transferir a un humano

La acción `handover_to_human` hace que la IA detecte que el tema se puso complicado, sensible, o que el cliente directamente pidió hablar con una persona. Cuando eso pasa, la conversación queda en modo pausado: la IA deja de responder automáticamente en ese chat hasta que alguien del equipo la reactive.

> Cliente: Necesito hablar con un humano, esto no me lo puede resolver un bot.
> IA: Listo, te paso con alguien del equipo ahora mismo. En breve te responden por acá.

### Mover etapa del embudo

La acción `crm_funnel_stage` cambia automáticamente al contacto de etapa dentro de tu embudo de ventas o CRM, según lo que va diciendo en la charla. Por ejemplo, pasa de "cotizando" a "esperando pago" en cuanto el cliente confirma que va a transferir.

> Cliente: Dale, te confirmo que voy a transferir el 100% ahora.
> IA: Perfecto, quedás anotado. En cuanto veamos el pago te confirmamos el envío.

### Asignar agente

La acción `assign_agent` le asigna el chat a un agente humano específico de tu equipo, por ejemplo cuando la IA detecta de qué tema se trata la consulta (soporte técnico, ventas, reclamos) y sabe quién lo maneja.

> Cliente: Tengo un problema con la instalación del producto.
> IA: Te asigno con Martín, que es quien ve soporte técnico. Ya le llega tu consulta.

### Setear campo personalizado

La acción `set_custom_field` completa un dato puntual en la ficha del contacto, usando un campo personalizado que vos hayas definido antes (por ejemplo "presupuesto aproximado", "rubro" o "ciudad"). La IA va sacando esa información de la charla natural, sin tener que pedirla con un formulario.

> Cliente: Manejamos un presupuesto de entre 500 y 800 dólares por mes.
> IA: Genial, con ese rango te puedo armar una propuesta a medida.

### Agregar nota

La acción `add_note` deja anotado en la ficha del contacto un resumen de algo relevante que dijo, para que quede registro sin que un humano tenga que transcribirlo a mano después.

> Cliente: Ojo que el envío tiene que ser antes del viernes porque viajo.
> IA: Anotado, gracias por avisar. Vamos a priorizar que llegue antes del viernes.

### Agregar etiqueta

La acción `add_tag` le pone una etiqueta al contacto (por ejemplo "interesado en plan premium" o "reclamo") para que después lo puedas filtrar fácilmente en tu lista de contactos.

> Cliente: Me interesa el plan más completo que tengan.
> IA: Te cuento todo el detalle del plan premium en un momento.

### Enviar contenido multimedia

La acción `media` le permite a la IA mandar un archivo (imagen, catálogo, documento) directamente durante la charla, cuando detecta que el cliente lo necesita, sin que un humano tenga que buscarlo y adjuntarlo.

> Cliente: ¿Tienen catálogo con precios actualizados?
> IA: Sí, te lo mando ahora mismo.

## Cómo funciona por dentro, explicado simple

Mientras la IA arma su respuesta, si en algún punto detecta que corresponde ejecutar alguna de las herramientas que configuraste, la "llama" (de ahí el nombre "llamada de función"). Esa acción se ejecuta de verdad sobre los datos de tu negocio en ese instante, y recién después la IA sigue con la conversación, ya con el resultado aplicado. Esto puede pasar varias veces dentro de una misma respuesta si hace falta encadenar más de una acción, por ejemplo: mover de etapa y agregar una nota al mismo tiempo.

## Ejemplo de conversación con acciones encadenadas

Veamos un caso completo, donde el cliente confirma un pago y eso dispara, en simultáneo, dos acciones que él ni se entera que pasaron, pero que tu equipo sí ve reflejadas en el sistema.

> Cliente: Hola, ya transferí los $45.000 del pedido #128. Te mando el comprobante ahora.
> IA: Excelente, muchas gracias por avisar. En cuanto llegue el comprobante lo confirmamos por acá.
> Cliente: Listo, ahí te lo mandé por foto.
> IA: Recibido, gracias. Ya quedaste con el pago confirmado, en breve coordinamos el envío.

Detrás de esas dos últimas respuestas, sin que el cliente vea nada raro en el chat, la IA disparó dos acciones: movió al contacto de la etapa "esperando pago" a "pago confirmado" en el embudo, y agregó una nota en su ficha diciendo "cliente confirmó transferencia de $45.000 para el pedido #128, con comprobante adjunto". Cuando un vendedor del equipo entra a revisar ese contacto, ya se encuentra con todo actualizado, sin haber movido un dedo.

## Buenas prácticas antes de activarlo

- No actives las siete herramientas de una sola vez si recién estás arrancando. Empezá por una o dos (por ejemplo mover etapa y transferir a humano) y sumá el resto de a poco, así podés observar cómo se comporta la IA con cada una.
- Revisá que los campos personalizados que la IA va a completar ya existan y estén bien nombrados antes de habilitar `set_custom_field`. Si el campo no está creado, la IA no tiene dónde guardar el dato.
- Escribí descripciones claras para cada herramienta. Cuanto más precisa sea la descripción de cuándo usarla, menos errores va a cometer la IA decidiendo si le toca actuar o no.
- Probá la conversación vos mismo antes de exponerla a clientes reales. Simulá distintos casos (un pago, un reclamo, un pedido de catálogo) y confirmá que la acción correcta se dispara en el momento correcto.
- Revisá de tanto en tanto el embudo, las notas y las etiquetas que va dejando la IA, sobre todo en las primeras semanas, para confirmar que está interpretando bien las conversaciones y no está moviendo contactos de etapa por error.
