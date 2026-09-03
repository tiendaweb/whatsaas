El asistente de Inteligencia Artificial de AAPP SPACE es el "cerebro conversacional" que puede responder automáticamente a los contactos que escriben por WhatsApp, usando lenguaje natural en vez de un guion fijo. A diferencia de las automatizaciones armadas a mano (esos flujos con nodos y condiciones que vos diseñás paso a paso), la IA no sigue un camino rígido predefinido: entiende lo que la persona escribe, razona una respuesta y la redacta en el momento, adaptándose a cada conversación. Esto la hace mucho más flexible para atender consultas variadas, pero también significa que necesita que vos le des una buena configuración inicial para que se comporte exactamente como querés.

Este manual te guía paso a paso para dejar el asistente configurado y funcionando. No vamos a entrar en detalle sobre las acciones automáticas que la IA puede ejecutar dentro del sistema (como agendar una cita o consultar un pedido): eso se explica en un manual aparte, dedicado a las "Funciones de llamada de IA".

## Dónde se configura

Toda la configuración del asistente vive en un solo lugar del panel: andá a **Configuración** y luego a la pestaña **IA** (en inglés, Settings → AI). Ahí vas a encontrar todos los controles que se explican a continuación, organizados en un mismo formulario.

## Primeros pasos: elegir proveedor, modelo y clave de API

Antes de que el asistente pueda responder un solo mensaje, necesita estar conectado a un proveedor de inteligencia artificial. Seguí estos pasos:

1. Elegí el **proveedor** del modelo de IA. Hoy podés elegir entre **OpenAI** y **Google Gemini**. Si ya tenés una cuenta y una clave de API de alguno de los dos, usá ese; si no tenés ninguna, cualquiera de los dos funciona bien, la diferencia está más en el costo y en las preferencias personales que en la calidad para este uso.
2. Elegí el **modelo** específico dentro del proveedor que seleccionaste. El sistema te muestra una lista de modelos disponibles: algunos son más potentes (piensan mejor respuestas complejas pero cuestan más y son un poco más lentos) y otros son más rápidos y económicos (ideales para consultas simples y de alto volumen). Si estás empezando, un modelo intermedio o rápido suele ser suficiente; siempre podés cambiarlo más adelante sin perder el resto de la configuración.
3. Pegá tu **clave de API** (API key) del proveedor elegido. Esta clave la generás desde la cuenta que tengas en OpenAI o en Google, y es la que le permite al sistema "hablar" con ese proveedor en tu nombre.
4. Antes de guardar, usá el botón de **probar conexión**. Este botón hace una verificación real con el proveedor para confirmar que la clave es válida y que todo está bien conectado. Si la prueba falla, revisá que hayas copiado la clave completa y sin espacios, y que la cuenta del proveedor esté activa. Nunca guardes la configuración sin haber pasado la prueba de conexión primero: te vas a ahorrar sorpresas cuando la IA ya esté atendiendo contactos reales.

Una vez que la prueba de conexión es exitosa, guardá los cambios y el asistente ya queda técnicamente operativo. Pero antes de dejarlo conversando con tus contactos, conviene ajustar su personalidad.

## Ajustar la personalidad del asistente

Un asistente bien configurado se nota, y la diferencia la marcan tres controles.

### El prompt del sistema

El **prompt del sistema** (system prompt) es el texto de instrucciones de fondo que le da identidad al asistente. Ahí es donde le contás quién es el negocio, cómo debe presentarse, qué tono usar (formal, cercano, con humor, etc.), qué puede prometer y qué no, y en qué momentos tiene que derivar la conversación a una persona del equipo en lugar de seguir respondiendo sola. Pensalo como el manual de instrucciones interno que la IA lee antes de cada conversación.

Algunas recomendaciones prácticas para escribir un buen prompt del sistema:

- Presentá al negocio con claridad: nombre, rubro, y en pocas palabras qué vende o qué servicio ofrece.
- Definí el tono deseado (por ejemplo: "respondé de forma cordial y cercana, usando 'vos', sin sonar robótico").
- Marcá límites explícitos: qué información no debe inventar, qué precios o promesas no debe confirmar sin que un humano lo revise.
- Indicá con claridad cuándo debe pasar la conversación a un agente humano (por ejemplo, ante un reclamo, una queja grave, o un pedido explícito de hablar con una persona).

Cuanto más claro y específico sea este texto, más consistente va a ser el comportamiento del asistente.

### La temperatura

La **temperatura** es un control deslizante que define qué tan creativa o conservadora es la IA al redactar sus respuestas.

- Con una temperatura **baja**, el asistente responde de forma más predecible y apegada al guion que le diste en el prompt del sistema: ideal si querés respuestas consistentes, sobre todo para temas sensibles como precios o políticas.
- Con una temperatura **alta**, el asistente se permite más variedad en la forma de redactar, lo que puede sonar más natural y espontáneo, pero también más impredecible.

Para la mayoría de los negocios conviene arrancar con una temperatura baja o media, y subirla solo si sentís que las respuestas suenan demasiado repetitivas o "de robot".

### El límite de tokens de salida

Este control define **cuán largas pueden ser las respuestas** del asistente como máximo. Un límite bajo obliga a respuestas cortas y directas (útil para WhatsApp, donde los mensajes largos cansan al lector); un límite alto permite respuestas más extensas y detalladas cuando la consulta lo amerita. Si notás que el asistente corta sus respuestas a mitad de una idea, es señal de que conviene subir este límite.

## Cargar la base de conocimiento

Por más bien redactado que esté el prompt del sistema, la IA no sabe nada del negocio por sí sola. Ahí entra en juego la **base de conocimiento**: una sección donde podés subir archivos que el asistente va a usar como fuente real de información al momento de responder, en lugar de inventar datos o dar respuestas genéricas.

Se pueden subir distintos tipos de archivo:

- Documentos de texto y PDFs convertidos a texto (por ejemplo, listas de precios, catálogos, políticas de cambios y devoluciones, preguntas frecuentes).
- Imágenes, que la IA puede "ver" e interpretar siempre que el modelo elegido tenga capacidad de visión (no todos los modelos la tienen, así que si esto es importante para tu negocio, elegí un modelo que la soporte).

Los archivos de texto se incorporan directamente al conocimiento del asistente, es decir, pasan a formar parte de lo que la IA "sabe" al responder. La recomendación general es simple: cuantos más documentos relevantes y actualizados tengas cargados, más precisas y confiables van a ser las respuestas. Vale la pena dedicar un rato a subir el catálogo completo, la lista de precios vigente, las políticas del negocio y un documento de preguntas frecuentes bien armado. Si la información del negocio cambia (nuevos precios, nuevos productos), acordate de actualizar estos archivos para que el asistente no quede respondiendo con datos viejos.

## Cómo conversa el asistente en la práctica

Una vez configurado, hay algunos comportamientos automáticos que conviene conocer para entender cómo se ve la IA "en acción":

- **Agrupa mensajes seguidos.** Cuando un contacto escribe varios mensajitos cortos en pocos segundos (algo muy típico en WhatsApp, como contar una idea en tres o cuatro mensajes separados), la IA no responde apenas llega el primero. Espera un margen breve de pocos segundos para juntar todos los mensajes relacionados y responder de una sola vez, con todo el contexto completo, en lugar de contestar de forma atropellada mensaje por mensaje.
- **Recuerda el hilo de cada conversación.** La IA mantiene memoria de lo que se habló antes dentro de un mismo chat, así que no arranca de cero en cada mensaje nuevo: puede hacer referencia a algo que el contacto dijo unos minutos antes en esa misma conversación.
- **Transcribe los audios de voz.** Si un contacto manda un audio en lugar de texto, el asistente lo transcribe automáticamente antes de procesarlo, así que también puede responder con naturalidad a mensajes de voz.

## Pausar y reactivar la IA en una conversación puntual

Hay momentos en los que conviene que la IA deje de responder en un chat específico, por ejemplo cuando un agente humano del equipo decide tomar el control de esa conversación en persona. Para eso existen dos caminos:

- De forma manual, usando el nodo **`ai_control`** dentro de una automatización, que permite pausar (o reactivar) la IA para una conversación puntual.
- De forma automática, cuando la propia IA decide "pasar la posta" a un humano por su cuenta, algo que se conoce como *handover* y que se explica en detalle en el manual de Funciones de llamada de IA.

Mientras la IA está pausada en un chat, ese contacto puede seguir escribiendo, pero el asistente no va a responder automáticamente hasta que alguien la reactive. Esto es útil para no pisar a un agente humano que ya está atendiendo esa conversación en tiempo real.

---

Con estos pasos, el asistente queda listo para atender conversaciones reales: conectado a su proveedor de IA, con una personalidad definida, alimentado con información propia del negocio y con la posibilidad de cederle el control a un humano cuando haga falta. El siguiente paso natural, una vez que te sientas cómodo con esta configuración básica, es explorar el manual de **Funciones de llamada de IA**, donde se explica cómo darle al asistente la capacidad de ejecutar acciones concretas dentro del sistema (como agendar, consultar o registrar información) en lugar de solo conversar.
