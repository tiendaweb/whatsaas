whatsaas (comercialmente **AAPP SPACE**) es una plataforma SaaS multi-tenant construida sobre Next.js con App Router y TypeScript, pensada para operar WhatsApp a escala: automatizaciones conversacionales, atención con IA, CRM de contactos y un ecosistema de apps instalables por equipo. Este documento describe la arquitectura real del sistema tal como está implementada, sin relleno comercial, para que cualquier desarrollador pueda orientarse rápido en el código.

## Arquitectura general y multi-tenancy

La base de datos es PostgreSQL, accedida a través de Drizzle ORM. El principio organizador de todo el esquema es el `team`: prácticamente cualquier tabla de negocio (contactos, automatizaciones, instancias de WhatsApp, configuraciones de IA, documentos, etc.) tiene una columna `team_id` con clave foránea a `teams` y `onDelete: cascade`. Esto significa que borrar un equipo limpia en cascada todos sus datos, y que ninguna consulta de negocio debería ejecutarse sin filtrar por `team_id`.

La relación usuario-equipo no es 1 a 1: un usuario puede pertenecer a varios equipos a través de la tabla puente `team_members`, que además de la membresía guarda:

- `role`: rol general del miembro dentro del equipo (por ejemplo `owner`, `admin`, miembro).
- `permissions`: permisos granulares específicos, que se evalúan server-side antes de cualquier operación sensible.

Sobre esa membresía se apoya un segundo mecanismo de control: la tabla `team_member_plugins`, que determina qué apps del dashboard están habilitadas para cada equipo (y en algunos casos, para cada usuario dentro del equipo). El sistema de plugins se describe en detalle más abajo, pero es clave entender que convive con el modelo de equipos desde el arranque: no es un afterthought, es parte del control de acceso.

## Marca blanca y revendedores

Por encima del multi-tenant por `team_id` existe una segunda capa de multi-tenancy, orientada a revendedores (white-label). Se resuelve por **Host HTTP**: cada revendedor opera bajo su propio dominio, y el sistema identifica el contexto de reseller a partir del header `Host` de la request entrante, no de una cookie o un parámetro de sesión.

Los elementos centrales de este modelo son:

- Cada `team` puede tener un `reseller_id`, que lo asocia a un revendedor concreto.
- Cada revendedor opera con una **wallet prepago**: los cargos por planes y consumo se descuentan de ese saldo en lugar de facturarse directo.
- Los precios que ve el cliente final son configurables por el revendedor sobre los planes base de la plataforma, es decir, hay una capa de pricing propia por encima del catálogo de planes.

Esta capa de white-label agrega complejidad real al modelo de permisos y de facturación: cualquier feature nueva que toque planes, cobros o resolución de tenant debería considerar explícitamente si corre en contexto de reseller o no.

## Integración con WhatsApp: dos canales en paralelo

whatsaas no depende de un único proveedor de mensajería; sostiene **dos integraciones distintas** que conviven en el mismo modelo de datos, cada una con sus propias capacidades y límites:

- **Evolution API**: un servicio self-hosted, corriendo en su propio contenedor Docker, que implementa el protocolo no oficial de WhatsApp Web (Baileys) mediante conexión por QR. Es la vía de bajo costo y sin aprobación de Meta, pero al ser no oficial está sujeta a los riesgos habituales de ese tipo de integraciones (baneos, inestabilidad de sesión).
- **Meta Cloud API oficial** (Graph API, versión v21.0): la integración oficial de WhatsApp Business, necesaria específicamente cuando se requieren mensajes interactivos nativos como botones o listas, que la vía no oficial no soporta de forma confiable.

Ambos tipos de instancia se modelan en una única tabla, `evolution_instances`, distinguidos por un campo `integration` (por ejemplo, el valor `WHATSAPP-BAILEYS` identifica una instancia de Evolution API). Esto permite que el resto del sistema —automatizaciones, IA, CRM— trate a ambos canales de forma más o menos uniforme, delegando las diferencias de bajo nivel a la capa de envío.

## Motor de automatizaciones

El corazón operativo de la plataforma es el motor de automatizaciones, implementado en `lib/automation/engine.ts`. Es un motor server-side que procesa cada mensaje entrante evaluándolo contra las automatizaciones activas del equipo correspondiente.

Cada automatización se guarda como un grafo en la tabla `automations`, con dos columnas `jsonb`:

- `nodes`: los nodos del flujo.
- `edges`: las conexiones entre nodos.

Existen 16 tipos de nodo soportados por el motor:

- `start` (disparador del flujo)
- `message`
- `media`
- `options`
- `menu_simple`
- `delay`
- `collect`
- `save_contact`
- `end`
- `button_message`
- `list_message`
- `call_to_action`
- `ai_control`
- `condition`
- `go_to_node`
- `sticky_note`

Los triggers que activan un flujo son `first_message`, `exact_match`, `contains` y `fallback`, y admiten filtros opcionales por etapa de embudo, tag, agente o departamento, lo que permite segmentar qué automatización dispara según el estado actual del contacto.

Cada conversación en curso mantiene su propio estado de ejecución en la tabla `automation_sessions`, que guarda el nodo actual del grafo y las variables (`{{variable}}`) que se van completando a medida que el usuario responde. Esto es lo que permite que un flujo con `collect` recuerde en qué paso quedó cada chat de forma independiente.

Para la construcción de flujos existe un editor visual basado en `@xyflow/react` (canvas de nodos y conexiones), pensado para armar automatizaciones sin escribir código. Junto al editor hay un simulador que **reimplementa la misma lógica del motor real** para poder probar un flujo sin enviar mensajes reales a WhatsApp; cualquier cambio de comportamiento en `engine.ts` debe replicarse en el simulador para no perder paridad entre lo que se prueba y lo que corre en producción.

## Inteligencia artificial y function calling

La IA conversacional se configura por equipo en la tabla `ai_configs`, que incluye proveedor (OpenAI o Gemini), modelo, API key propia del equipo, `systemPrompt`, `temperature`, `maxOutputTokens` y `attachments`.

Un punto importante de diseño: la base de conocimiento **no es un RAG vectorial**. Los archivos de texto adjuntos se inyectan literalmente dentro del `systemPrompt`, delimitados bajo un bloque del tipo `--- Knowledge Base (nombre) ---`. Las imágenes, en cambio, se adjuntan como `image_url` en base64 para los modelos con capacidad de visión. Esto simplifica la implementación pero implica un límite práctico de tamaño de la base de conocimiento, acotado por la ventana de contexto del modelo.

La orquestación de la conversación vive en `lib/plugins/ai-chat/service.ts` e incluye:

- Historial de conversación persistido por chat en `ai_sessions`.
- Transcripción de audio entrante con Whisper.
- Debounce de mensajes entrantes: si el usuario manda varios mensajes seguidos, el sistema espera una ventana configurable de aproximadamente 5 segundos y los agrupa antes de generar una única respuesta, evitando que la IA conteste mensaje por mensaje de forma fragmentada.
- Un loop de hasta 5 iteraciones consultando al modelo con las tools disponibles, lo que permite encadenar varias llamadas a función antes de responder al usuario final.

Las tools de IA (function calling) se definen por equipo en la tabla `ai_tools`. A través de ellas el modelo puede ejecutar acciones reales sobre el sistema, no solo generar texto:

- Mover al contacto de etapa dentro del embudo.
- Asignar un agente humano a la conversación.
- Setear un campo personalizado del contacto.
- Agregar una nota o un tag al contacto.
- Enviar un archivo multimedia.
- Transferir la conversación a un humano mediante `handover_to_human`, acción que pausa la IA para ese chat.

Este último punto es relevante para cualquier debugging de "la IA no contestó": antes de sospechar de un error, hay que revisar si el chat quedó en estado de handover.

## CRM y embudo

El CRM organiza contactos alrededor de un embudo de ventas configurable. Las etapas viven en `funnel_stages` y pueden agruparse en `funnel_groups`; el modelo permite que una misma etapa pertenezca a varios grupos simultáneamente, lo que da flexibilidad para tener vistas distintas del mismo embudo (por ejemplo, agrupaciones por área comercial que comparten etapas). La gestión visual se hace sobre un tablero Kanban.

Además de la etapa, cada contacto admite campos personalizados, tags, asignación a un departamento y asignación a un agente. Estos atributos son los mismos que las tools de IA pueden leer y modificar, y los mismos que los triggers de automatización pueden usar como filtro — es el punto de integración natural entre las tres capas (CRM, automatizaciones, IA).

## Sistema de plugins/apps

El dashboard no es monolítico: cada funcionalidad más allá del núcleo de mensajería es una app instalable, controlada por la tabla `team_member_plugins`. Entre las apps del marketplace actual:

- **Documentos**: editor de texto enriquecido tipo Notion, basado en Tiptap/ProseMirror, con carpetas anidadas hasta 5 niveles. El contenido se guarda como JSON de ProseMirror en una columna `jsonb`, con control de concurrencia optimista por versión y soporte de enlaces entre documentos con backlinks.
- **Membresías**: venta de membresías, planes y suscripciones, con recordatorios automáticos.
- **Hostinger**: importación y vinculación de dominios de clientes.
- **Meta Ads**: gestión de campañas publicitarias sobre la Marketing API de Meta.
- **Social Publisher**: publicación de contenido en Facebook e Instagram.

Cada app se activa o desactiva de forma independiente por equipo (y en algunos casos por usuario dentro del equipo), lo que permite ofrecer combinaciones distintas de funcionalidad según el plan o el acuerdo comercial, sin necesidad de ramas de código separadas por cliente.

## Seguridad y permisos

La autenticación se resuelve con un JWT guardado en una cookie de sesión (`session`), verificado en cada request al servidor. A partir de ese JWT se resuelve el usuario y, en combinación con `team_members`, el equipo activo y el rol/permisos correspondientes.

El chequeo de autorización ocurre **server-side y antes de cada operación sensible** — no se confía en el estado del cliente para decidir si una acción está permitida. Esto es consistente con el resto del diseño multi-tenant: dado que casi todas las tablas cuelgan de `team_id`, el filtro por equipo funciona como la primera línea de aislamiento de datos entre tenants, y la verificación de rol/permisos como la segunda línea dentro de un mismo equipo.

## Cierre

whatsaas combina un modelo de datos multi-tenant relativamente simple —todo cuelga de `team_id`— con varias capas de complejidad superpuestas de forma deliberada: doble canal de WhatsApp (oficial y no oficial), un motor de automatizaciones basado en grafos con simulador de paridad, IA con function calling sobre las mismas entidades que maneja el CRM, y una capa adicional de white-label resuelta por dominio para revendedores. Entender estas piezas por separado, y sobre todo los puntos donde se tocan (automatizaciones que filtran por etapa de embudo, IA que mueve contactos de etapa, apps que se habilitan por equipo), es el camino más directo para trabajar sobre el código sin romper invariantes del sistema.
