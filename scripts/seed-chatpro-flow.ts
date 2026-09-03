import { and, eq, inArray } from 'drizzle-orm';
import { db, client } from '../lib/db/drizzle';
import { automationFolders, automations } from '../lib/db/schema';
import { prepareAutomationFlowForSave } from '../lib/automation/flow-normalizer';

const TEAM_ID = 4;
const INSTANCE_ID = 18; // "mi vendedor v"
const FOLDER_COLOR = '#374151';

// Assets generated earlier this session, hosted locally under public/uploads/automation/
// (engine.ts's processMediaOutput reads `public/<mediaUrl>` straight off disk, so every
// media node MUST point at a local path — external URLs fail silently in production).
const ASSETS = {
  hero: '/uploads/automation/81cc3003-4170-4b07-8bbe-5e1f7a7fdaf3.jpeg',
  pdf: '/uploads/automation/928adcd3-d282-42f3-b095-4cd03fb18f70.pdf',
  audio: '/uploads/automation/a8a2153c-b26a-45b2-b6c6-23b6dba69ebc.mp3',
};

type NodeLike = { id: string; type: string; position: { x: number; y: number }; data: Record<string, any> };
type EdgeLike = { id: string; source: string; target: string; sourceHandle?: string | null };
type Flow = { nodes: NodeLike[]; edges: EdgeLike[] };

const slug = (value: string) =>
  value.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

class FlowBuilder {
  nodes: NodeLike[] = [];
  edges: EdgeLike[] = [];
  private edgeIndex = 0;

  node(id: string, type: string, data: Record<string, any>, x: number, y: number) {
    this.nodes.push({ id, type, data, position: { x, y } });
    return id;
  }

  edge(source: string, target: string, sourceHandle?: string) {
    this.edgeIndex += 1;
    this.edges.push({ id: `edge-${slug(source)}-${slug(sourceHandle ?? 'default')}-${slug(target)}-${this.edgeIndex}`, source, target, sourceHandle: sourceHandle ?? null });
  }

  menu(id: string, label: string, options: Array<{ id: string; text: string; target: string }>, x: number, y: number, fallbackTarget?: string) {
    this.node(id, 'menu_simple', {
      label, markerStyle: 'emoji_number', globalDelaySeconds: 0,
      menuOptions: options.map((o) => ({ id: o.id, text: o.text })),
    }, x, y);
    for (const o of options) this.edge(id, o.target, `menu-${o.id}`);
    this.edge(id, fallbackTarget ?? id, 'fallback');
    return id;
  }

  flow(): Flow {
    return { nodes: this.nodes, edges: this.edges };
  }
}

function internalStart(fb: FlowBuilder, firstNodeId: string, label = 'Start (interno)') {
  fb.node('start', 'start', { label, triggerType: 'fallback', keywords: [], conditions: {} }, 0, 0);
  fb.edge('start', firstNodeId);
}

function humanHandoff(fb: FlowBuilder, msgId: string, aiId: string, endId: string, label: string, x: number, y: number) {
  fb.node(msgId, 'message', { label }, x, y);
  fb.node(aiId, 'ai_control', { action: 'paused' }, x + 320, y);
  fb.node(endId, 'end', { disableAutomation: true }, x + 640, y);
  fb.edge(msgId, aiId);
  fb.edge(aiId, endId);
}

type Ids = {
  inicio: number; queEs: number; funciones: number; ejemplos: number; planes: number; faq: number; contacto: number;
  seguridad: number; comoEmpezar: number; objeciones: number;
  featFlujos: number; featIa: number; featCampanas: number; featBandeja: number; featEquipo: number; featAnalitica: number; featDispositivos: number;
};

// ---------------------------------------------------------------------------
// Features data (used to drive both the hub menu and the 7 deep-dive automations)
// ---------------------------------------------------------------------------
type Feature = {
  key: keyof Omit<Ids, 'inicio' | 'queEs' | 'funciones' | 'ejemplos' | 'planes' | 'faq' | 'contacto' | 'seguridad' | 'comoEmpezar' | 'objeciones'>;
  name: string; emoji: string;
  queEs: string;
  comoFunciona: string;
  paraQuien: string;
  ejemploReal: string;
  antesDespues: string;
  miniFaqQ: string; miniFaqA: string;
  miniFaqQ2: string; miniFaqA2: string;
};

const FEATURES: Feature[] = [
  {
    key: 'featFlujos', name: 'Constructor visual de flujos', emoji: '🧩',
    queEs: 'Es la herramienta con la que armás la conversación de tu bot como un diagrama: arrastrás bloques (mensajes, preguntas, menús) y los conectás entre sí. No hace falta escribir una sola línea de código.',
    comoFunciona: '1) Elegís cuándo arranca el bot (por ejemplo, cuando alguien escribe "PRECIO" o le escribe por primera vez).\n2) Agregás mensajes, preguntas o menús de opciones.\n3) Conectás cada opción con su siguiente paso.\n4) Si el flujo crece mucho, podés dividirlo en varias automatizaciones más chicas y conectarlas entre sí con "ir al nodo", para que no se vuelva un enredo.\n5) Probás la conversación y la activás cuando estés conforme.',
    paraQuien: 'Para cualquier negocio que reciba las mismas consultas una y otra vez (horarios, precios, catálogo, turnos) y quiera responderlas al instante, sin perder el trato personal cuando hace falta.',
    ejemploReal: 'De hecho: todo lo que armamos en esta conversación —incluida esta misma automatización que te está hablando— se construyó con este mismo constructor, en minutos.',
    antesDespues: 'Antes: cada consulta repetida (horarios, precios, catálogo) le robaba tiempo a una persona del equipo. Después: el flujo responde solo, y tu equipo entra recién cuando el cliente realmente necesita a alguien.',
    miniFaqQ: '¿Necesito saber programar para usarlo?',
    miniFaqA: 'No. Todo se arma visualmente, conectando bloques con el mouse. Si podés armar una lista de pasos en un papel, podés armar un flujo en ChatPro.',
    miniFaqQ2: '¿Puedo dividir un flujo muy largo en partes más chicas?',
    miniFaqA2: 'Sí, y de hecho es lo recomendado: cada uno de los ejemplos que armamos hoy está dividido en varias automatizaciones conectadas, en vez de una sola gigante e imposible de editar.',
  },
  {
    key: 'featIa', name: 'Agentes de inteligencia artificial', emoji: '🤖',
    queEs: 'Es un asistente con IA que entiende preguntas escritas libremente (no solo botones), puede coordinar turnos, resolver dudas y hasta enviar archivos, sin que tengas que anticipar cada pregunta posible.',
    comoFunciona: '1) Le contás a la IA sobre tu negocio (qué vendés, tus políticas, tus horarios).\n2) La IA responde consultas por su cuenta usando esa información.\n3) Si la consulta es demasiado particular o sensible, se pausa automáticamente y te avisa para que un humano tome la posta.\n4) Vos decidís en qué momentos del flujo la IA está activa o pausada.',
    paraQuien: 'Para negocios con consultas variadas que no siempre entran prolijas en un menú de opciones fijas.',
    ejemploReal: 'En el centro de estética que armamos hoy, apenas alguien pide hablar con una especialista, la IA se pausa sola y deriva la conversación a una persona real.',
    antesDespues: 'Antes: si la pregunta no entraba en ningún botón, el cliente quedaba sin respuesta hasta que alguien la viera. Después: la IA entiende la pregunta libre y responde, o avisa a tu equipo si de verdad hace falta una persona.',
    miniFaqQ: '¿La IA puede llegar a inventar cosas o prometer algo que no es cierto?',
    miniFaqA: 'Vos controlás exactamente qué información tiene disponible y en qué puntos del flujo puede actuar libremente. Para todo lo sensible (precios finales, cierres de venta), lo normal es que la IA derive a una persona.',
    miniFaqQ2: '¿Tengo que estar prendiendo y apagando la IA todo el tiempo?',
    miniFaqA2: 'No, se configura una sola vez dentro del flujo: vos decidís en qué pasos queda activa y en cuáles se pausa automáticamente.',
  },
  {
    key: 'featCampanas', name: 'Campañas masivas', emoji: '📣',
    queEs: 'Te permite mandar un mismo mensaje a muchos contactos de una sola vez, por ejemplo para avisar una promoción o reactivar clientes que no te compran hace tiempo.',
    comoFunciona: '1) Elegís a quién le llega: a todos tus contactos, o solo a los que tengan cierta etiqueta o estén en cierta etapa del embudo de ventas.\n2) Escribís el mensaje (podés incluir el nombre de cada contacto automáticamente).\n3) Programás cuándo se envía.',
    paraQuien: 'Para negocios que quieren "despertar" clientes que dejaron de responder, o avisar novedades sin escribir uno por uno.',
    ejemploReal: 'Combinado con las etiquetas del CRM, podés armar una campaña solo para quienes preguntaron por un producto y nunca terminaron de comprar.',
    antesDespues: 'Antes: los clientes que no compraron la primera vez quedaban olvidados en el chat. Después: les mandás una campaña puntual y varios vuelven a preguntar.',
    miniFaqQ: '¿Esto no es lo mismo que mandar spam?',
    miniFaqA: 'La diferencia es que le hablás a gente que ya te dio su número (tus propios contactos), no a desconocidos, y podés segmentar para que el mensaje sea relevante para quien lo recibe.',
    miniFaqQ2: '¿Sirve para activar campañas y mover clientes dormidos?',
    miniFaqA2: 'Sí, es exactamente uno de los usos más comunes: reimpactar contactos que dejaron de responder hace tiempo.',
  },
  {
    key: 'featBandeja', name: 'Bandeja centralizada (estilo Kanban)', emoji: '📥',
    queEs: 'Todas tus conversaciones de WhatsApp en una sola pantalla, organizadas en columnas —como un tablero de tareas— en vez de perderse en el chat del celular.',
    comoFunciona: '1) Cada conversación aparece como una tarjeta.\n2) Podés etiquetarla, moverla de etapa (por ejemplo: "nuevo", "en conversación", "vendido") y asignarla a una persona de tu equipo.\n3) Nada se pierde ni queda "invisible" entre cientos de chats.',
    paraQuien: 'Para cualquier negocio donde más de una persona atiende WhatsApp, o donde se maneja un volumen alto de conversaciones.',
    ejemploReal: 'Es la misma vista que usamos para revisar, uno por uno, cada flujo que armamos hoy para tus otros negocios de ejemplo.',
    antesDespues: 'Antes: WhatsApp normal mezcla todo en una sola lista, sin saber qué está resuelto y qué no. Después: cada chat tiene una etapa y un responsable claro.',
    miniFaqQ: '¿Se pueden perder mensajes con esto?',
    miniFaqA: 'Justamente resuelve ese problema: cada chat queda como una tarjeta visible y asignada a alguien, así nadie "se olvida" de responder.',
    miniFaqQ2: '¿Cómo evita que un cliente interesado se enfríe y se pierda?',
    miniFaqA2: 'Al quedar visible con su etapa y responsable, cualquiera del equipo puede ver que sigue pendiente, en vez de perderse entre cientos de chats.',
  },
  {
    key: 'featEquipo', name: 'Colaboración en equipo y roles', emoji: '👥',
    queEs: 'Invitás a las personas de tu equipo a la plataforma y decidís qué puede ver o hacer cada una.',
    comoFunciona: '1) Invitás a un miembro del equipo por su correo.\n2) Le asignás un rol (por ejemplo: vendedor, administrador).\n3) Las conversaciones se pueden repartir automáticamente entre las personas disponibles.',
    paraQuien: 'Para negocios que ya no dependen de una sola persona respondiendo WhatsApp, o que están por sumar gente al equipo.',
    ejemploReal: 'Cuando cualquiera de los bots de ejemplo deriva a "hablar con un asesor", en el fondo eso es una conversación que le llega asignada a la persona correcta de tu equipo.',
    antesDespues: 'Antes: cualquiera con acceso podía ver y tocar todo. Después: cada persona ve y hace solo lo que le corresponde según su rol.',
    miniFaqQ: '¿Es complicado controlar quién puede ver o hacer qué?',
    miniFaqA: 'No, se maneja con roles: le asignás uno a cada persona y listo, automáticamente ve solo lo que le corresponde.',
    miniFaqQ2: '¿Mi equipo puede atender junto sin pisarse ni duplicar respuestas?',
    miniFaqA2: 'Sí, cada conversación se asigna a una sola persona, así evitás que dos del equipo le contesten lo mismo al mismo cliente.',
  },
  {
    key: 'featAnalitica', name: 'Analítica en tiempo real', emoji: '📊',
    queEs: 'Paneles que muestran cómo le está yendo a tu negocio en WhatsApp: cuántas conversaciones entran, cuántas se convierten en venta, y cómo rinde cada persona de tu equipo.',
    comoFunciona: '1) El sistema registra automáticamente cada conversación y en qué etapa del embudo está.\n2) Vos ves paneles con esos números, sin tener que armar una planilla a mano.\n3) Podés comparar el rendimiento entre agentes o entre campañas.',
    paraQuien: 'Para quien quiere tomar decisiones con datos reales, no solo con la sensación de "estamos vendiendo más o menos".',
    ejemploReal: 'Es lo que te permitiría ver, por ejemplo, en qué paso del flujo de reservas del centro de estética la gente abandona más seguido.',
    antesDespues: 'Antes: decidías a partir de la sensación de "estamos vendiendo más o menos". Después: lo ves reflejado en números concretos, sin armar planillas a mano.',
    miniFaqQ: '¿Voy a entender fácil si mi equipo está respondiendo bien o mal?',
    miniFaqA: 'Sí, los paneles están pensados para leerse de un vistazo, sin necesitar formación técnica.',
    miniFaqQ2: '¿Puedo detectar fácil quién está vendiendo, quién está frenando y dónde corregir?',
    miniFaqA2: 'Sí, la analítica compara el rendimiento por persona y por campaña, así ves rápido dónde está el cuello de botella.',
  },
  {
    key: 'featDispositivos', name: 'Multi-dispositivo (QR o línea oficial)', emoji: '📱',
    queEs: 'Podés conectar tu WhatsApp de dos formas: escaneando un código QR (como WhatsApp Web) para arrancar rápido, o usando la línea oficial de WhatsApp Business (API), pensada para negocios más grandes.',
    comoFunciona: '1) Con el código QR, conectás tu WhatsApp actual en minutos.\n2) Con la línea oficial, accedés a funciones adicionales pensadas para volumen alto y mayor estabilidad.\n3) Podés tener varias conexiones al mismo tiempo si manejás más de un número.',
    paraQuien: 'Empezar por QR es ideal si estás arrancando; la línea oficial conviene si ya tenés un volumen de mensajes grande y estable.',
    ejemploReal: 'Los bots de ejemplo que armamos hoy corren sobre una conexión QR, y por eso usan menús de texto en vez de botones nativos de WhatsApp Business.',
    antesDespues: 'Antes: dependías del WhatsApp del celular de una sola persona. Después: podés escalar a la línea oficial o sumar más de una conexión sin perder el historial.',
    miniFaqQ: '¿Puedo manejar varias líneas o cuentas desde un mismo lugar?',
    miniFaqA: 'Sí, según tu plan podés conectar más de un número de WhatsApp y manejarlos todos desde la misma plataforma.',
    miniFaqQ2: '¿Qué diferencia real hay entre el QR y la línea oficial?',
    miniFaqA2: 'El QR es como WhatsApp Web: rápido de conectar. La línea oficial (API de WhatsApp Business) suma más estabilidad y funciones para cuando el volumen de mensajes crece mucho.',
  },
];

// ---------------------------------------------------------------------------
// FAQ data (real questions from chatpro.uno, grouped by theme)
// ---------------------------------------------------------------------------
type FaqGroup = { key: string; title: string; emoji: string; items: Array<{ q: string; a: string }> };

const FAQ_GROUPS: FaqGroup[] = [
  {
    key: 'resultados', title: 'Resultados y ventas', emoji: '💰',
    items: [
      { q: '¿Qué gana mi negocio con ChatPro desde el primer día?', a: 'Desde el día uno tenés todas tus conversaciones de WhatsApp centralizadas y podés activar respuestas automáticas para las consultas más comunes, así no perdés a nadie mientras armás el resto.' },
      { q: '¿Las respuestas automáticas sí sirven para vender, o solo son para adornar?', a: 'Están pensadas para vender: guían al cliente paso a paso (catálogo, asesoramiento, reserva) hasta un cierre o una derivación a una persona, no son solo un mensaje de bienvenida.' },
      { q: '¿Cómo evita el sistema que un lead caliente se enfríe y se pierda?', a: 'Cada conversación queda visible en la bandeja, con etapa y responsable asignado, así nada queda "flotando" sin que nadie lo vea.' },
    ],
  },
  {
    key: 'equipo', title: 'Equipo y organización', emoji: '👥',
    items: [
      { q: '¿Mi equipo puede atender junto sin pisarse ni duplicar respuestas?', a: 'Sí, cada conversación se puede asignar a una sola persona, así evitás que dos vendedores le contesten lo mismo al mismo cliente.' },
      { q: '¿Es complicado controlar quién puede ver o hacer cosas dentro del sistema?', a: 'No, se maneja con roles y permisos: a cada persona le asignás un rol y automáticamente ve solo lo que le corresponde.' },
      { q: '¿Voy a entender fácil si mi equipo está respondiendo bien o mal?', a: 'Sí, los paneles de analítica muestran el rendimiento por persona de forma simple, sin necesitar planillas.' },
    ],
  },
  {
    key: 'automatizacion', title: 'Automatización e IA', emoji: '🤖',
    items: [
      { q: '¿Sí me ayuda a dejar de perder mensajes y oportunidades?', a: 'Sí, ese es justamente el problema central que resuelve: centraliza todo y automatiza las respuestas más comunes para que nada quede sin atender.' },
      { q: '¿La IA me ayuda de verdad o solo mete relleno bonito?', a: 'La IA puede resolver consultas reales por su cuenta y sabe cuándo pausarse para derivar a una persona, no es solo un saludo automático.' },
      { q: '¿Me ayuda a dar seguimiento comercial sin depender de la memoria del vendedor?', a: 'Sí, el sistema guarda el historial y la etapa de cada contacto, así el seguimiento no depende de que una persona se acuerde.' },
    ],
  },
  {
    key: 'escala', title: 'Escalar sin complicarte', emoji: '🚀',
    items: [
      { q: '¿Puedo manejar varias líneas o cuentas de WhatsApp desde un mismo lugar?', a: 'Sí, según tu plan podés conectar varias líneas y manejarlas todas desde la misma bandeja.' },
      { q: '¿Sirve para activar campañas y mover clientes dormidos?', a: 'Sí, con las campañas masivas podés reimpactar a contactos que dejaron de responder, segmentando por etiqueta o etapa.' },
      { q: '¿Qué pasa si mi equipo no se da abasto cuando entran muchos mensajes de golpe?', a: 'La automatización responde lo inmediato (horarios, catálogo, preguntas frecuentes) mientras tu equipo se enfoca en lo que realmente necesita una persona.' },
      { q: '¿Me sirve si quiero escalar sin contratar gente a lo loco?', a: 'Sí, esa es una de las razones principales por las que los negocios eligen ChatPro: atender más consultas sin sumar proporcionalmente más personal.' },
    ],
  },
  {
    key: 'general', title: 'Alcance general', emoji: '🧭',
    items: [
      { q: '¿Qué áreas importantes puedo resolver con ChatPro además de responder mensajes?', a: 'Además de responder, podés organizar tu embudo de ventas, coordinar turnos, lanzar campañas, medir el rendimiento de tu equipo y automatizar la postventa: todo desde el mismo lugar.' },
      { q: '¿Puedo detectar fácil quién está vendiendo, quién está frenando y dónde corregir?', a: 'Sí, la analítica compara el rendimiento por persona y por campaña, así ves rápido dónde está el cuello de botella.' },
    ],
  },
];

// ---------------------------------------------------------------------------
// 1. Inicio ChatPro
// ---------------------------------------------------------------------------
function buildInicio(ids: Ids): Flow {
  const fb = new FlowBuilder();

  fb.node('start', 'start', {
    label: 'Start ChatPro',
    triggerType: 'contains',
    keywords: ['chatpro', 'chat pro', 'automatizacion', 'demo'],
    conditions: {},
  }, 0, 0);

  fb.node('media-hero', 'media', {
    mediaType: 'image', mediaUrl: ASSETS.hero,
    caption: 'ChatPro — automatizá tus ventas y soporte por WhatsApp',
  }, 320, 0);
  fb.edge('start', 'media-hero');

  fb.node('msg-welcome', 'message', {
    label:
      '¡Hola! 👋 Soy el asistente de *ChatPro*.\n\n' +
      'Así como el negocio que te escribió esto usa un chatbot armado con nuestra plataforma, vos también podés tener uno para el tuyo. Esta conversación entera es un ejemplo en vivo de lo que podés lograr.\n\n' +
      '¿Por dónde te gustaría empezar?',
  }, 640, 0);
  fb.edge('media-hero', 'msg-welcome');

  fb.node('sticky-note', 'sticky_note', {
    title: 'Demo comercial · ChatPro (vende el propio sistema)',
    bodyText: 'Automatización de ventas de la plataforma. Usa "ir al nodo" para derivar a: Qué es, Funciones (7 subautomatizaciones), Ejemplos reales, Planes, FAQ y Contacto.',
  }, 320, -280);

  fb.node('goto-que-es', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.queEs, targetNodeId: 'msg-intro', fallbackAction: 'stop' }, 960, -180);
  fb.node('goto-funciones', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.funciones, targetNodeId: 'menu-funciones', fallbackAction: 'stop' }, 960, -120);
  fb.node('goto-ejemplos', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.ejemplos, targetNodeId: 'menu-ejemplos', fallbackAction: 'stop' }, 960, -60);
  fb.node('goto-planes', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.planes, targetNodeId: 'menu-planes-intro', fallbackAction: 'stop' }, 960, 0);
  fb.node('goto-faq', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.faq, targetNodeId: 'menu-faq', fallbackAction: 'stop' }, 960, 60);
  fb.node('goto-contacto', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.contacto, targetNodeId: 'menu-contacto', fallbackAction: 'stop' }, 960, 120);

  fb.node('media-pdf', 'media', { mediaType: 'document', mediaUrl: ASSETS.pdf, caption: 'Folleto de ChatPro', fileName: 'ChatPro.pdf' }, 960, 200);
  fb.node('msg-post-pdf', 'message', { label: '¿Seguimos? Elegí una opción del menú para continuar 👇' }, 1120, 200);
  fb.edge('media-pdf', 'msg-post-pdf');
  fb.edge('msg-post-pdf', 'menu-main');

  fb.node('media-audio', 'media', { mediaType: 'audio', mediaUrl: ASSETS.audio }, 960, 260);
  fb.node('msg-post-audio', 'message', { label: '¿Seguimos? Elegí una opción del menú para continuar 👇' }, 1120, 260);
  fb.edge('media-audio', 'msg-post-audio');
  fb.edge('msg-post-audio', 'menu-main');

  fb.node('goto-seguridad', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.seguridad, targetNodeId: 'msg-intro-seguridad', fallbackAction: 'stop' }, 960, 180);
  fb.node('goto-como-empezar', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.comoEmpezar, targetNodeId: 'msg-intro-empezar', fallbackAction: 'stop' }, 960, 240);

  fb.menu('menu-main', '¿Qué necesitás?', [
    { id: 'que-es', text: '¿Qué es ChatPro?', target: 'goto-que-es' },
    { id: 'funciones', text: 'Ver todas las funciones', target: 'goto-funciones' },
    { id: 'ejemplos', text: 'Ver ejemplos reales', target: 'goto-ejemplos' },
    { id: 'planes', text: 'Planes y precios', target: 'goto-planes' },
    { id: 'seguridad', text: 'Seguridad y confianza', target: 'goto-seguridad' },
    { id: 'empezar-paso', text: 'Cómo empezar, paso a paso', target: 'goto-como-empezar' },
    { id: 'pdf', text: 'Enviarme el folleto en PDF', target: 'media-pdf' },
    { id: 'audio', text: 'Escuchar la presentación en audio', target: 'media-audio' },
    { id: 'faq', text: 'Preguntas frecuentes', target: 'goto-faq' },
    { id: 'empezar', text: 'Empezar mi prueba gratis', target: 'goto-contacto' },
  ], 640, 60);
  fb.edge('msg-welcome', 'menu-main');

  return fb.flow();
}

// ---------------------------------------------------------------------------
// 2. Qué es ChatPro (concepto, para no técnicos)
// ---------------------------------------------------------------------------
function buildQueEs(ids: Ids): Flow {
  const fb = new FlowBuilder();
  internalStart(fb, 'msg-intro');

  fb.node('msg-intro', 'message', {
    label:
      'ChatPro es una plataforma que junta 3 cosas en un solo lugar: tu WhatsApp, un CRM (para organizar clientes) y automatizaciones con inteligencia artificial. Todo pensado para que respondas más rápido y vendas más, sin necesitar equipo técnico.',
  }, 320, 0);

  fb.node('collect-experiencia', 'collect', {
    label: '¿Hoy usás algún sistema o alguien de tu equipo se encarga de responder WhatsApp manualmente? Contame brevemente cómo lo hacés hoy.',
    variable: 'experiencia_actual',
  }, 640, 0);
  fb.edge('msg-intro', 'collect-experiencia');

  fb.node('condition-experiencia', 'condition', {
    label: 'Detecta si ya usan algún sistema automatizado',
    conditions: [
      { id: 'ya-usa', type: 'text', operator: 'contains', value: 'automat', label: 'Ya usa algo automatizado' },
      { id: 'manual', type: 'text', operator: 'contains', value: 'manual', label: 'Todo manual' },
    ],
  }, 960, 0);
  fb.edge('collect-experiencia', 'condition-experiencia');

  fb.node('msg-ya-usa', 'message', {
    label: 'Genial, entonces ya sabés lo valioso que es no perder mensajes. ChatPro te suma todo eso en un solo lugar en vez de tener herramientas sueltas.',
  }, 1280, -100);
  fb.node('msg-manual', 'message', {
    label: 'Es más común de lo que pensás: la mayoría de nuestros clientes arrancó atendiendo todo a mano. Automatizar lo repetitivo libera tiempo para las conversaciones que sí necesitan a una persona.',
  }, 1280, 0);
  fb.node('msg-generico', 'message', {
    label: 'Como sea que lo hagas hoy, ChatPro está pensado para sumarse sin romper lo que ya funciona.',
  }, 1280, 100);
  fb.edge('condition-experiencia', 'msg-ya-usa', 'ya-usa');
  fb.edge('condition-experiencia', 'msg-manual', 'manual');
  fb.edge('condition-experiencia', 'msg-generico', 'fallback');

  fb.node('msg-analogia', 'message', {
    label:
      'Pensalo así: un "flujo" de ChatPro es como un empleado que siempre está despierto, sigue exactamente los pasos que vos le enseñaste, nunca se olvida de nada, y te avisa apenas algo se le complica.',
  }, 1600, 0);
  fb.edge('msg-ya-usa', 'msg-analogia');
  fb.edge('msg-manual', 'msg-analogia');
  fb.edge('msg-generico', 'msg-analogia');

  fb.node('goto-funciones', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.funciones, targetNodeId: 'menu-funciones', fallbackAction: 'stop' }, 2240, -60);
  fb.node('goto-ejemplos', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.ejemplos, targetNodeId: 'menu-ejemplos', fallbackAction: 'stop' }, 2240, 0);
  fb.node('goto-menu-principal', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.inicio, targetNodeId: 'menu-main', fallbackAction: 'stop' }, 2240, 60);

  fb.menu('menu-siguiente', '¿Querés ver más?', [
    { id: 'funciones', text: 'Ver todas las funciones', target: 'goto-funciones' },
    { id: 'ejemplos', text: 'Ver ejemplos reales', target: 'goto-ejemplos' },
    { id: 'menu', text: 'Volver al menú principal', target: 'goto-menu-principal' },
  ], 1920, 0);
  fb.edge('msg-analogia', 'menu-siguiente');

  return fb.flow();
}

// ---------------------------------------------------------------------------
// 3. Funciones (hub)
// ---------------------------------------------------------------------------
function buildFunciones(ids: Ids): Flow {
  const fb = new FlowBuilder();
  internalStart(fb, 'msg-intro-funciones');

  const teaser = FEATURES.map((f) => `${f.emoji} *${f.name}*`).join('\n');
  fb.node('msg-intro-funciones', 'message', {
    label: 'Esto es lo que podés hacer con ChatPro:\n\n' + teaser + '\n\nTocá cualquiera para ver el detalle.',
  }, 320, 0);
  fb.edge('msg-intro-funciones', 'menu-funciones');

  fb.node('goto-menu-principal', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.inicio, targetNodeId: 'menu-main', fallbackAction: 'stop' }, 960, 200);

  for (const f of FEATURES) {
    fb.node(`goto-${f.key}`, 'go_to_node', { mode: 'other_flow', targetAutomationId: ids[f.key], targetNodeId: 'msg-que-es', fallbackAction: 'stop' }, 960, 0);
  }

  fb.menu('menu-funciones', '¿Qué función te interesa conocer?', [
    ...FEATURES.map((f) => ({ id: f.key, text: `${f.emoji} ${f.name}`, target: `goto-${f.key}` })),
    { id: 'menu', text: 'Volver al menú principal', target: 'goto-menu-principal' },
  ], 640, 0);

  return fb.flow();
}

// ---------------------------------------------------------------------------
// 4-10. One automation per feature
// ---------------------------------------------------------------------------
function buildFeatureFlow(f: Feature, ids: Ids): Flow {
  const fb = new FlowBuilder();
  internalStart(fb, 'msg-que-es');

  fb.node('msg-que-es', 'message', { label: `${f.emoji} ${f.name}\n\n${f.queEs}` }, 320, 0);
  fb.edge('msg-que-es', 'menu-detalle');

  fb.node('msg-como-funciona', 'message', { label: `Cómo funciona, paso a paso:\n\n${f.comoFunciona}` }, 960, -160);
  fb.edge('msg-como-funciona', 'menu-detalle');

  fb.node('msg-para-quien', 'message', { label: `¿Para quién es ideal?\n\n${f.paraQuien}` }, 960, -60);
  fb.edge('msg-para-quien', 'menu-detalle');

  fb.node('msg-ejemplo-real', 'message', { label: `Ejemplo real:\n\n${f.ejemploReal}` }, 960, 40);
  fb.edge('msg-ejemplo-real', 'menu-detalle');

  fb.node('msg-mini-faq', 'message', { label: `${f.miniFaqQ}\n\n${f.miniFaqA}` }, 960, 140);
  fb.edge('msg-mini-faq', 'menu-detalle');

  fb.node('msg-antes-despues', 'message', { label: `Antes y después de ChatPro:\n\n${f.antesDespues}` }, 960, 220);
  fb.edge('msg-antes-despues', 'menu-detalle');

  fb.node('msg-mini-faq-2', 'message', { label: `${f.miniFaqQ2}\n\n${f.miniFaqA2}` }, 960, 300);
  fb.edge('msg-mini-faq-2', 'menu-detalle');

  fb.node('goto-contacto', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.contacto, targetNodeId: 'menu-contacto', fallbackAction: 'stop' }, 1600, -60);
  fb.node('goto-funciones', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.funciones, targetNodeId: 'menu-funciones', fallbackAction: 'stop' }, 1600, 40);
  fb.node('goto-menu-principal', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.inicio, targetNodeId: 'menu-main', fallbackAction: 'stop' }, 1600, 140);

  fb.menu('menu-detalle', `${f.name} — ¿Qué querés ver?`, [
    { id: 'como', text: 'Cómo funciona, paso a paso', target: 'msg-como-funciona' },
    { id: 'quien', text: 'Para quién es ideal', target: 'msg-para-quien' },
    { id: 'ejemplo', text: 'Ejemplo real', target: 'msg-ejemplo-real' },
    { id: 'antes', text: 'Antes y después de ChatPro', target: 'msg-antes-despues' },
    { id: 'faq', text: f.miniFaqQ, target: 'msg-mini-faq' },
    { id: 'faq2', text: f.miniFaqQ2, target: 'msg-mini-faq-2' },
    { id: 'prueba', text: 'Empezar mi prueba gratis', target: 'goto-contacto' },
    { id: 'funciones', text: 'Ver otra función', target: 'goto-funciones' },
    { id: 'menu', text: 'Volver al menú principal', target: 'goto-menu-principal' },
  ], 640, 0);

  return fb.flow();
}

// ---------------------------------------------------------------------------
// 11. Ejemplos reales (case studies de AZ Indumentaria y Centro de Estética)
// ---------------------------------------------------------------------------
function buildEjemplos(ids: Ids): Flow {
  const fb = new FlowBuilder();
  internalStart(fb, 'msg-intro-ejemplos');

  fb.node('msg-intro-ejemplos', 'message', {
    label: 'No te lo cuento solo en teoría: hoy mismo armamos con ChatPro cuatro negocios de ejemplo completos, de rubros bien distintos. Elegí cuál querés conocer:',
  }, 320, 0);
  fb.edge('msg-intro-ejemplos', 'menu-ejemplos');

  // --- Caso 1: AZ Indumentaria ---
  fb.node('msg-az-1', 'message', {
    label:
      '🧥 *AZ Indumentaria* (tienda de ropa online real)\n\n' +
      'Armamos un asistente que recibe al cliente, entiende qué está buscando y lo ayuda a comprar, sin que nadie del local tenga que estar respondiendo todo el día.',
  }, 640, -320);
  fb.node('msg-az-2', 'message', {
    label:
      'Se compone de 5 automatizaciones conectadas entre sí:\n\n' +
      '• *Inicio*: bienvenida y menú principal.\n' +
      '• *Catálogo*: 10 categorías reales de productos, cada una manda el link directo a esa categoría.\n' +
      '• *Asesoramiento*: pregunta qué tipo de look busca el cliente y recomienda productos con fotos.\n' +
      '• *Reservas*: turno para probarse ropa en el showroom.\n' +
      '• *Postventa*: cambios, devoluciones y reclamos.',
  }, 640, -260);
  fb.edge('msg-az-1', 'msg-az-2');
  fb.node('msg-az-3', 'message', {
    label: 'En total son 73 pasos de conversación distintos, pero para el cliente se siente como hablar con una sola persona muy atenta, nunca como "elegir opciones de un menú robótico".',
  }, 640, -200);
  fb.edge('msg-az-2', 'msg-az-3');
  fb.edge('msg-az-3', 'menu-ejemplos-siguiente');

  // --- Caso 2: Centro de Estética ---
  fb.node('msg-estetica-1', 'message', {
    label:
      '💅 *Centro de Estética* (5 especialidades: facial, corporal, depilación, uñas y bienestar)\n\n' +
      'Acá el desafío era distinto: muchos tratamientos distintos, cada uno con su propia información y su propia especialista.',
  }, 640, -80);
  fb.node('msg-estetica-2', 'message', {
    label:
      'Armamos 10 automatizaciones conectadas:\n\n' +
      '• Una por cada una de las 5 especialidades, donde el cliente puede leer beneficios y cuidados posteriores de cada tratamiento antes de decidir.\n' +
      '• Un asesor que pregunta qué quiere lograr el cliente y lo deriva a la especialidad correcta.\n' +
      '• Reservas de turno organizadas por especialidad.\n' +
      '• Gestión de turnos (reprogramar, cancelar, reclamos).',
  }, 640, -20);
  fb.edge('msg-estetica-1', 'msg-estetica-2');
  fb.node('msg-estetica-3', 'message', {
    label: 'En total son 200 pasos de conversación, y en cualquier punto el cliente puede volver al menú principal con una sola opción, así nunca se siente "perdido" dentro del bot.',
  }, 640, 40);
  fb.edge('msg-estetica-2', 'msg-estetica-3');
  fb.edge('msg-estetica-3', 'menu-ejemplos-siguiente');

  // --- Caso 3: Gastronomía ---
  fb.node('msg-gastro-1', 'message', {
    label:
      '🍽️ *Restaurante* (ejemplo de gastronomía)\n\n' +
      'Acá el foco fue la reserva de mesa: el bot recomienda según cuántas personas son y si tienen alguna restricción alimentaria, y después coordina la reserva.',
  }, 640, 140);
  fb.node('msg-gastro-2', 'message', {
    label: '3 automatizaciones conectadas: Inicio, Asesoramiento (recomendación de menú) y Reservas (mesa y horario). Un ejemplo de cómo un flujo chico y bien enfocado también puede resolver todo un rubro.',
  }, 640, 200);
  fb.edge('msg-gastro-1', 'msg-gastro-2');
  fb.edge('msg-gastro-2', 'menu-ejemplos-siguiente');

  // --- Caso 4: Consultorio Médico ---
  fb.node('msg-medico-1', 'message', {
    label:
      '🩺 *Consultorio Médico* (ejemplo de servicios de salud)\n\n' +
      'Acá el bot pregunta la especialidad buscada y si el paciente tiene obra social, prepaga o es particular, usando un nodo de "condición" que responde distinto según cada caso.',
  }, 640, 320);
  fb.node('msg-medico-2', 'message', {
    label: '3 automatizaciones conectadas: Inicio, Asesoramiento (con esa lógica de condición según cobertura) y Reservas de turno. Un buen ejemplo de cómo ChatPro también sirve para servicios profesionales, no solo para vender productos.',
  }, 640, 380);
  fb.edge('msg-medico-1', 'msg-medico-2');
  fb.edge('msg-medico-2', 'menu-ejemplos-siguiente');

  fb.node('goto-contacto', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.contacto, targetNodeId: 'menu-contacto', fallbackAction: 'stop' }, 1600, -60);
  fb.node('goto-funciones', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.funciones, targetNodeId: 'menu-funciones', fallbackAction: 'stop' }, 1600, 40);
  fb.node('goto-menu-principal', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.inicio, targetNodeId: 'menu-main', fallbackAction: 'stop' }, 1600, 140);

  fb.menu('menu-ejemplos-siguiente', '¿Qué te gustaría hacer ahora?', [
    { id: 'otro', text: 'Ver otro ejemplo', target: 'menu-ejemplos' },
    { id: 'prueba', text: 'Quiero uno para mi negocio', target: 'goto-contacto' },
    { id: 'funciones', text: 'Ver todas las funciones', target: 'goto-funciones' },
    { id: 'menu', text: 'Volver al menú principal', target: 'goto-menu-principal' },
  ], 1280, 0);

  fb.menu('menu-ejemplos', '¿Cuál ejemplo querés conocer?', [
    { id: 'az', text: '🧥 Tienda de ropa (AZ Indumentaria)', target: 'msg-az-1' },
    { id: 'estetica', text: '💅 Centro de estética', target: 'msg-estetica-1' },
    { id: 'gastro', text: '🍽️ Restaurante', target: 'msg-gastro-1' },
    { id: 'medico', text: '🩺 Consultorio médico', target: 'msg-medico-1' },
    { id: 'menu', text: 'Volver al menú principal', target: 'goto-menu-principal' },
  ], 320, 60);

  return fb.flow();
}

// ---------------------------------------------------------------------------
// Seguridad y confianza
// ---------------------------------------------------------------------------
function buildSeguridad(ids: Ids): Flow {
  const fb = new FlowBuilder();
  internalStart(fb, 'msg-intro-seguridad');

  fb.node('msg-intro-seguridad', 'message', {
    label: 'Es normal tener dudas antes de sumar una herramienta nueva a tu negocio. Estas son las preguntas que más nos hacen sobre seguridad y confianza:',
  }, 320, 0);
  fb.edge('msg-intro-seguridad', 'menu-seguridad');

  fb.node('msg-datos', 'message', {
    label: '🔒 ¿Mis datos están seguros?\n\nTus conversaciones y contactos quedan dentro de tu cuenta, con acceso controlado por roles. Ningún otro cliente de ChatPro puede ver tu información.',
  }, 960, -160);
  fb.edge('msg-datos', 'menu-seguridad');

  fb.node('msg-humano', 'message', {
    label: '💬 ¿Mis clientes van a notar que hablan con un bot?\n\nVos elegís el tono de las respuestas, y en cualquier punto del flujo podés derivar a una persona real. Los ejemplos que armamos hoy siempre ofrecen la opción de "hablar con un asesor".',
  }, 960, -80);
  fb.edge('msg-humano', 'menu-seguridad');

  fb.node('msg-portabilidad', 'message', {
    label: '📤 ¿Qué pasa si en algún momento me quiero ir de la plataforma?\n\nTus contactos y conversaciones son tuyos. Podés exportar tu información en cualquier momento.',
  }, 960, 0);
  fb.edge('msg-portabilidad', 'menu-seguridad');

  fb.node('msg-cumplimiento', 'message', {
    label: '✅ ¿Cumplen con las políticas de WhatsApp?\n\nSí. Para volúmenes grandes te recomendamos conectar mediante la línea oficial de WhatsApp Business (API), pensada exactamente para operar dentro de las reglas de Meta.',
  }, 960, 80);
  fb.edge('msg-cumplimiento', 'menu-seguridad');

  fb.node('goto-contacto', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.contacto, targetNodeId: 'menu-contacto', fallbackAction: 'stop' }, 1600, -40);
  fb.node('goto-menu-principal', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.inicio, targetNodeId: 'menu-main', fallbackAction: 'stop' }, 1600, 60);

  fb.menu('menu-seguridad', 'Seguridad y confianza — ¿qué duda tenés?', [
    { id: 'datos', text: '¿Mis datos están seguros?', target: 'msg-datos' },
    { id: 'humano', text: '¿Mis clientes van a notar que es un bot?', target: 'msg-humano' },
    { id: 'portabilidad', text: '¿Puedo irme cuando quiera?', target: 'msg-portabilidad' },
    { id: 'cumplimiento', text: '¿Cumplen las políticas de WhatsApp?', target: 'msg-cumplimiento' },
    { id: 'prueba', text: 'Empezar mi prueba gratis', target: 'goto-contacto' },
    { id: 'menu', text: 'Volver al menú principal', target: 'goto-menu-principal' },
  ], 640, 0);

  return fb.flow();
}

// ---------------------------------------------------------------------------
// Cómo empezar, paso a paso
// ---------------------------------------------------------------------------
function buildComoEmpezar(ids: Ids): Flow {
  const fb = new FlowBuilder();
  internalStart(fb, 'msg-intro-empezar');

  fb.node('msg-intro-empezar', 'message', {
    label: 'Arrancar es más simple de lo que parece. Así se ve, paso a paso:',
  }, 320, 0);
  fb.edge('msg-intro-empezar', 'menu-pasos');

  fb.node('msg-paso1', 'message', {
    label: '1️⃣ Día 1 — Activás tu prueba gratis de 1 día (sin tarjeta) y conectás tu WhatsApp escaneando un código QR. Te lleva minutos.',
  }, 960, -160);
  fb.edge('msg-paso1', 'menu-pasos');

  fb.node('msg-paso2', 'message', {
    label: '2️⃣ Armás tu primer flujo — Podés partir de cero con el constructor visual, o usar como base uno de los ejemplos que armamos hoy (tienda de ropa, centro de estética, restaurante o consultorio) y adaptarlo a tu negocio.',
  }, 960, -80);
  fb.edge('msg-paso2', 'menu-pasos');

  fb.node('msg-paso3', 'message', {
    label: '3️⃣ Sumás a tu equipo — Invitás a las personas que van a atender, les asignás un rol, y organizás la bandeja de conversaciones.',
  }, 960, 0);
  fb.edge('msg-paso3', 'menu-pasos');

  fb.node('msg-paso4', 'message', {
    label: '4️⃣ Cuando estés listo — Activás campañas para reactivar clientes y usás la analítica para ver qué está funcionando y qué no.',
  }, 960, 80);
  fb.edge('msg-paso4', 'menu-pasos');

  fb.node('msg-no-se', 'message', {
    label: 'Si no sabés por dónde arrancar, no hace falta que lo resuelvas solo/a: un asesor te puede ayudar a armar el primer flujo con vos.',
  }, 960, 160);
  fb.edge('msg-no-se', 'menu-pasos');

  fb.node('goto-contacto', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.contacto, targetNodeId: 'menu-contacto', fallbackAction: 'stop' }, 1600, -40);
  fb.node('goto-ejemplos', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.ejemplos, targetNodeId: 'menu-ejemplos', fallbackAction: 'stop' }, 1600, 40);
  fb.node('goto-menu-principal', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.inicio, targetNodeId: 'menu-main', fallbackAction: 'stop' }, 1600, 120);

  fb.menu('menu-pasos', '¿Qué paso querés ver?', [
    { id: 'paso1', text: 'Día 1: prueba gratis y conexión', target: 'msg-paso1' },
    { id: 'paso2', text: 'Armar el primer flujo', target: 'msg-paso2' },
    { id: 'paso3', text: 'Sumar a mi equipo', target: 'msg-paso3' },
    { id: 'paso4', text: 'Campañas y analítica', target: 'msg-paso4' },
    { id: 'no-se', text: 'No sé por dónde arrancar', target: 'msg-no-se' },
    { id: 'ejemplos', text: 'Ver ejemplos para inspirarme', target: 'goto-ejemplos' },
    { id: 'prueba', text: 'Empezar mi prueba gratis', target: 'goto-contacto' },
    { id: 'menu', text: 'Volver al menú principal', target: 'goto-menu-principal' },
  ], 640, 0);

  return fb.flow();
}

// ---------------------------------------------------------------------------
// Objeciones comunes
// ---------------------------------------------------------------------------
function buildObjeciones(ids: Ids): Flow {
  const fb = new FlowBuilder();
  internalStart(fb, 'msg-intro-objeciones');

  fb.node('msg-intro-objeciones', 'message', {
    label: 'Está bien tener dudas antes de decidir. Elegí la que más se parezca a la tuya:',
  }, 320, 0);
  fb.edge('msg-intro-objeciones', 'menu-objeciones');

  fb.node('msg-caro', 'message', {
    label: '"Me parece caro para un negocio chico"\n\nEl plan Esencial arranca en $45/mes con 1 día gratis para probarlo sin tarjeta. La idea es que se pague solo con las consultas que hoy se te escapan por no responder a tiempo.',
  }, 960, -180);
  fb.edge('msg-caro', 'menu-objeciones');

  fb.node('msg-tiempo', 'message', {
    label: '"No tengo tiempo para armar todo esto"\n\nNo hace falta armarlo desde cero: podés partir de uno de los ejemplos que ya construimos hoy y solo cambiarle los textos y datos de tu negocio.',
  }, 960, -100);
  fb.edge('msg-tiempo', 'menu-objeciones');

  fb.node('msg-otra-herramienta', 'message', {
    label: '"Ya uso otra herramienta para mis chats"\n\nMuchos de nuestros clientes migraron desde una planilla, un WhatsApp Business suelto, o herramientas sueltas de mensajería. ChatPro junta todo eso en un solo lugar, sin perder tu historial de contactos.',
  }, 960, -20);
  fb.edge('msg-otra-herramienta', 'menu-objeciones');

  fb.node('msg-complicado', 'message', {
    label: '"Parece complicado para alguien no técnico"\n\nEsta misma conversación que estás teniendo ahora es un ejemplo armado con ChatPro, sin código. Si podés seguir un menú de opciones, podés usar la plataforma.',
  }, 960, 60);
  fb.edge('msg-complicado', 'menu-objeciones');

  fb.node('msg-clientes-no-les-gusta', 'message', {
    label: '"Tengo miedo de que mis clientes no quieran hablar con un bot"\n\nEl bot resuelve lo repetitivo (horarios, catálogo, turnos) y siempre deja la puerta abierta para hablar con una persona. La mayoría de los clientes prefiere una respuesta inmediata a esperar horas.',
  }, 960, 140);
  fb.edge('msg-clientes-no-les-gusta', 'menu-objeciones');

  fb.node('goto-contacto', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.contacto, targetNodeId: 'menu-contacto', fallbackAction: 'stop' }, 1600, -60);
  fb.node('goto-ejemplos', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.ejemplos, targetNodeId: 'menu-ejemplos', fallbackAction: 'stop' }, 1600, 40);
  fb.node('goto-menu-principal', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.inicio, targetNodeId: 'menu-main', fallbackAction: 'stop' }, 1600, 120);

  fb.menu('menu-objeciones', '¿Cuál es tu duda?', [
    { id: 'caro', text: 'Me parece caro', target: 'msg-caro' },
    { id: 'tiempo', text: 'No tengo tiempo para armarlo', target: 'msg-tiempo' },
    { id: 'otra', text: 'Ya uso otra herramienta', target: 'msg-otra-herramienta' },
    { id: 'complicado', text: 'Me parece complicado', target: 'msg-complicado' },
    { id: 'clientes', text: 'No sé si a mis clientes les guste', target: 'msg-clientes-no-les-gusta' },
    { id: 'ejemplos', text: 'Prefiero ver un ejemplo primero', target: 'goto-ejemplos' },
    { id: 'prueba', text: 'Igual quiero probarlo', target: 'goto-contacto' },
    { id: 'menu', text: 'Volver al menú principal', target: 'goto-menu-principal' },
  ], 640, 0);

  return fb.flow();
}

// ---------------------------------------------------------------------------
// 12. Planes y precios (con asesor de planes)
// ---------------------------------------------------------------------------
function buildPlanes(ids: Ids): Flow {
  const fb = new FlowBuilder();
  internalStart(fb, 'menu-planes-intro');

  fb.node('msg-esencial', 'message', {
    label:
      '📦 *Plan Esencial* — $45/mes\n\n' +
      '• 3 usuarios\n• 1 conexión de WhatsApp\n• 2.000 contactos\n• Agente de IA\n• Constructor visual de flujos\n\n' +
      'Ideal para un negocio chico que recién arranca a organizar su WhatsApp.',
  }, 640, -80);
  fb.edge('msg-esencial', 'menu-planes-siguiente');

  fb.node('msg-premium', 'message', {
    label:
      '⭐ *Plan Premium Mensual* (el más elegido) — $60/mes\n\n' +
      '• 10 usuarios\n• 5 conexiones de WhatsApp\n• 5.000 contactos\n• Agente de IA\n• Constructor visual de flujos\n\n' +
      'Ideal si tenés equipo, manejás más de una línea, o esperás crecer rápido.',
  }, 640, 20);
  fb.edge('msg-premium', 'menu-planes-siguiente');

  fb.node('msg-recomendacion-chico', 'message', {
    label: 'Con un equipo chico y una sola línea, el plan *Esencial* ($45/mes) te alcanza de sobra para empezar.',
  }, 1280, 160);
  fb.node('msg-recomendacion-grande', 'message', {
    label: 'Con equipo y varias líneas, te conviene el plan *Premium Mensual* ($60/mes): es el que más eligen nuestros clientes.',
  }, 1280, 280);

  fb.menu('menu-asesor-planes', '¿Cómo describirías a tu equipo hoy?', [
    { id: 'chico', text: 'Somos 1 a 3 personas', target: 'msg-recomendacion-chico' },
    { id: 'grande', text: 'Somos un equipo más grande o varias líneas', target: 'msg-recomendacion-grande' },
  ], 960, 320);
  fb.edge('msg-recomendacion-chico', 'menu-planes-siguiente');
  fb.edge('msg-recomendacion-grande', 'menu-planes-siguiente');

  fb.node('media-pdf-planes', 'media', { mediaType: 'document', mediaUrl: ASSETS.pdf, caption: 'Folleto de ChatPro con todos los planes', fileName: 'ChatPro.pdf' }, 1600, 320);
  fb.edge('media-pdf-planes', 'menu-planes-siguiente');

  fb.node('msg-comparativa', 'message', {
    label:
      '📊 Diferencias punto por punto:\n\n' +
      'Usuarios: Esencial 3 · Premium 10\n' +
      'Conexiones de WhatsApp: Esencial 1 · Premium 5\n' +
      'Contactos: Esencial 2.000 · Premium 5.000\n' +
      'Agente de IA: incluido en los dos\n' +
      'Constructor visual de flujos: incluido en los dos\n\n' +
      'En resumen: la diferencia está en cuánta gente y cuántas líneas de WhatsApp podés manejar, no en las funciones disponibles.',
  }, 640, 120);
  fb.edge('msg-comparativa', 'menu-planes-siguiente');

  fb.node('msg-roi', 'message', {
    label: '💡 Pensalo así: si el plan Esencial cuesta $45/mes, alcanza con que se concrete una sola venta extra al mes gracias a no perder mensajes para que ya se haya pagado solo.',
  }, 640, 180);
  fb.edge('msg-roi', 'menu-planes-siguiente');

  fb.node('goto-contacto', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.contacto, targetNodeId: 'menu-contacto', fallbackAction: 'stop' }, 1920, -60);
  fb.node('goto-faq', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.faq, targetNodeId: 'menu-faq', fallbackAction: 'stop' }, 1920, 40);
  fb.node('goto-objeciones', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.objeciones, targetNodeId: 'menu-objeciones', fallbackAction: 'stop' }, 1920, 100);
  fb.node('goto-menu-principal', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.inicio, targetNodeId: 'menu-main', fallbackAction: 'stop' }, 1920, 160);

  fb.menu('menu-planes-siguiente', '¿Qué te gustaría hacer ahora?', [
    { id: 'empezar', text: 'Empezar mi prueba gratis', target: 'goto-contacto' },
    { id: 'faq', text: 'Tengo una duda antes', target: 'goto-faq' },
    { id: 'objeciones', text: 'Todavía no estoy seguro/a', target: 'goto-objeciones' },
    { id: 'menu', text: 'Volver al menú principal', target: 'goto-menu-principal' },
  ], 1600, 0);

  fb.menu('menu-planes-intro', 'Tenés 1 día gratis para probar, sin tarjeta de crédito. ¿Qué querés ver?', [
    { id: 'esencial', text: 'Plan Esencial ($45/mes)', target: 'msg-esencial' },
    { id: 'premium', text: 'Plan Premium ($60/mes)', target: 'msg-premium' },
    { id: 'comparar', text: 'Comparar los dos planes', target: 'msg-comparativa' },
    { id: 'roi', text: '¿Realmente se paga solo?', target: 'msg-roi' },
    { id: 'ayuda', text: 'Ayudame a elegir', target: 'menu-asesor-planes' },
    { id: 'pdf', text: 'Mandame el folleto en PDF', target: 'media-pdf-planes' },
  ], 320, 60);

  return fb.flow();
}

// ---------------------------------------------------------------------------
// 13. Preguntas frecuentes
// ---------------------------------------------------------------------------
function buildFaq(ids: Ids): Flow {
  const fb = new FlowBuilder();
  internalStart(fb, 'msg-intro-faq');

  const teaser = FAQ_GROUPS.map((g) => `${g.emoji} ${g.title}`).join('\n');
  fb.node('msg-intro-faq', 'message', { label: 'Estas son las dudas más comunes, agrupadas por tema:\n\n' + teaser }, 320, 0);
  fb.edge('msg-intro-faq', 'menu-faq');

  fb.node('goto-contacto', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.contacto, targetNodeId: 'menu-contacto', fallbackAction: 'stop' }, 1920, -60);
  fb.node('goto-menu-principal', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.inicio, targetNodeId: 'menu-main', fallbackAction: 'stop' }, 1920, 40);

  for (const group of FAQ_GROUPS) {
    const groupMenuId = `menu-faq-${group.key}`;
    for (const item of group.items) {
      const qId = `faq-${group.key}-${slug(item.q).slice(0, 24)}`;
      fb.node(qId, 'message', { label: `❓ ${item.q}\n\n${item.a}` }, 1280, 0);
      fb.edge(qId, groupMenuId);
    }
    fb.menu(groupMenuId, `${group.emoji} ${group.title} — elegí una pregunta`, [
      ...group.items.map((item, i) => ({
        id: `q${i}`, text: item.q.length > 60 ? item.q.slice(0, 57) + '...' : item.q,
        target: `faq-${group.key}-${slug(item.q).slice(0, 24)}`,
      })),
      { id: 'otras', text: 'Ver otro tema', target: 'menu-faq' },
      { id: 'empezar', text: 'Empezar mi prueba gratis', target: 'goto-contacto' },
      { id: 'menu', text: 'Volver al menú principal', target: 'goto-menu-principal' },
    ], 960, 0);
  }

  fb.menu('menu-faq', '¿Sobre qué tema es tu duda?', [
    ...FAQ_GROUPS.map((g) => ({ id: g.key, text: `${g.emoji} ${g.title}`, target: `menu-faq-${g.key}` })),
    { id: 'menu', text: 'Volver al menú principal', target: 'goto-menu-principal' },
  ], 640, 0);

  return fb.flow();
}

// ---------------------------------------------------------------------------
// 14. Contacto / Empezar ahora
// ---------------------------------------------------------------------------
function buildContacto(ids: Ids): Flow {
  const fb = new FlowBuilder();
  internalStart(fb, 'menu-contacto');

  fb.node('form-datos', 'form', {
    fields: [
      { id: 'nombre', type: 'text', label: '¿Cómo te llamás?', variable: 'nombre_lead' },
      { id: 'negocio', type: 'text', label: '¿Cómo se llama tu negocio?', variable: 'nombre_negocio' },
      {
        id: 'rubro', type: 'menu', label: '¿A qué se dedica?', variable: 'rubro_negocio', markerStyle: 'emoji_number',
        menuOptions: [
          { id: 'retail', text: 'Venta de productos' },
          { id: 'servicios', text: 'Servicios o turnos' },
          { id: 'gastronomia', text: 'Gastronomía' },
          { id: 'otro', text: 'Otro' },
        ],
      },
    ],
  }, 640, -60);

  fb.node('msg-gracias', 'message', {
    label: '¡Gracias, {{nombre_lead}}! Ya anotamos los datos de {{nombre_negocio}}. Un asesor te va a escribir para ayudarte a armar tu prueba gratis de 1 día.',
  }, 960, -60);
  fb.node('delay-guardando', 'delay', { seconds: 1, label: 'Guardando tus datos…' }, 800, -60);
  fb.edge('form-datos', 'delay-guardando');
  fb.edge('delay-guardando', 'msg-gracias');

  fb.node('save-contact', 'save_contact', { nameVariable: '{{nombre_lead}}', customFields: { negocio: '{{nombre_negocio}}', rubro: '{{rubro_negocio}}' } }, 1280, -60);
  fb.edge('msg-gracias', 'save-contact');

  fb.node('ai-control-lead', 'ai_control', { action: 'paused' }, 1600, -60);
  fb.edge('save-contact', 'ai-control-lead');
  fb.node('end-lead', 'end', { disableAutomation: true }, 1920, -60);
  fb.edge('ai-control-lead', 'end-lead');

  humanHandoff(fb, 'msg-asesor', 'ai-control-asesor', 'end-asesor', 'Dale, te conecto directo con un asesor humano 👤', 640, 120);

  fb.node('media-pdf-contacto', 'media', { mediaType: 'document', mediaUrl: ASSETS.pdf, caption: 'Folleto de ChatPro', fileName: 'ChatPro.pdf' }, 640, 200);
  fb.edge('media-pdf-contacto', 'menu-post-pdf');

  fb.node('goto-menu-principal', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.inicio, targetNodeId: 'menu-main', fallbackAction: 'stop' }, 1280, 200);
  fb.menu('menu-post-pdf', '¿Qué querés hacer ahora?', [
    { id: 'formulario', text: 'Dejar mis datos para que me contacten', target: 'form-datos' },
    { id: 'menu', text: 'Volver al menú principal', target: 'goto-menu-principal' },
  ], 960, 200);

  fb.menu('menu-contacto', '¡Buenísimo! ¿Cómo preferís avanzar?', [
    { id: 'formulario', text: 'Dejar mis datos para que me contacten', target: 'form-datos' },
    { id: 'asesor', text: 'Hablar ahora con un asesor', target: 'msg-asesor' },
    { id: 'pdf', text: 'Prefiero leer el folleto primero', target: 'media-pdf-contacto' },
  ], 320, 0);

  return fb.flow();
}

// ---------------------------------------------------------------------------

function validatePrepared(name: string, flow: Flow) {
  const prepared = prepareAutomationFlowForSave({ nodes: flow.nodes as never[], edges: flow.edges as never[] });
  if (!prepared.success) throw new Error(`${name}: ${prepared.errors.join('; ')}`);
  const ids = new Set(prepared.nodes.map((n) => n.id));
  for (const e of prepared.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) throw new Error(`${name}: arista inválida ${e.id} (${e.source} -> ${e.target})`);
  }
  return { nodes: prepared.nodes, edges: prepared.edges };
}

async function main() {
  console.log('Creando carpeta y automatización ChatPro (venta del propio sistema)...');

  await db.transaction(async (tx) => {
    const existingFolders = await tx.select({ id: automationFolders.id }).from(automationFolders)
      .where(and(eq(automationFolders.teamId, TEAM_ID), eq(automationFolders.name, 'ChatPro')));
    if (existingFolders.length) {
      const folderIds = existingFolders.map((f) => f.id);
      const staleAutomations = await tx.select({ id: automations.id }).from(automations)
        .where(and(eq(automations.teamId, TEAM_ID), inArray(automations.folderId, folderIds)));
      if (staleAutomations.length) {
        await tx.delete(automations).where(inArray(automations.id, staleAutomations.map((a) => a.id)));
      }
      await tx.delete(automationFolders).where(inArray(automationFolders.id, folderIds));
      console.log(`  Carpeta "ChatPro" previa eliminada (id ${folderIds.join(', ')}) junto con ${staleAutomations.length} automatizaciones.`);
    }

    const [folder] = await tx.insert(automationFolders).values({
      teamId: TEAM_ID, parentId: null, name: 'ChatPro', color: FOLDER_COLOR, position: 4,
    }).returning();
    console.log(`  Carpeta "ChatPro" creada (id ${folder.id}).`);

    const placeholder = (label: string) => [
      { id: 'placeholder-start', type: 'start', position: { x: 0, y: 0 }, data: { label, triggerType: 'fallback', keywords: [], conditions: {} } },
    ];

    const names: Record<keyof Ids, string> = {
      inicio: 'Inicio ChatPro',
      queEs: '¿Qué es ChatPro?',
      funciones: 'Funciones ChatPro',
      featFlujos: 'Función: Constructor de flujos',
      featIa: 'Función: Agentes de IA',
      featCampanas: 'Función: Campañas masivas',
      featBandeja: 'Función: Bandeja centralizada',
      featEquipo: 'Función: Colaboración en equipo',
      featAnalitica: 'Función: Analítica en tiempo real',
      featDispositivos: 'Función: Multi-dispositivo',
      ejemplos: 'Ejemplos reales ChatPro',
      planes: 'Planes y precios ChatPro',
      faq: 'Preguntas frecuentes ChatPro',
      contacto: 'Contacto / Prueba gratis ChatPro',
      seguridad: 'Seguridad y confianza ChatPro',
      comoEmpezar: 'Cómo empezar paso a paso ChatPro',
      objeciones: 'Objeciones comunes ChatPro',
    };

    const rows: Record<keyof Ids, { id: number }> = {} as never;
    for (const key of Object.keys(names) as (keyof Ids)[]) {
      const [row] = await tx.insert(automations).values({
        teamId: TEAM_ID, instanceId: INSTANCE_ID, folderId: folder.id,
        name: names[key],
        note: 'Automatización de venta del propio sistema ChatPro, generada automáticamente.',
        nodes: placeholder('Start'), edges: [], isActive: false,
      }).returning({ id: automations.id });
      rows[key] = row;
    }

    const ids: Ids = Object.fromEntries(
      (Object.keys(names) as (keyof Ids)[]).map((k) => [k, rows[k].id]),
    ) as unknown as Ids;

    const built: Record<keyof Ids, Flow> = {
      inicio: buildInicio(ids),
      queEs: buildQueEs(ids),
      funciones: buildFunciones(ids),
      featFlujos: buildFeatureFlow(FEATURES[0], ids),
      featIa: buildFeatureFlow(FEATURES[1], ids),
      featCampanas: buildFeatureFlow(FEATURES[2], ids),
      featBandeja: buildFeatureFlow(FEATURES[3], ids),
      featEquipo: buildFeatureFlow(FEATURES[4], ids),
      featAnalitica: buildFeatureFlow(FEATURES[5], ids),
      featDispositivos: buildFeatureFlow(FEATURES[6], ids),
      ejemplos: buildEjemplos(ids),
      planes: buildPlanes(ids),
      faq: buildFaq(ids),
      contacto: buildContacto(ids),
      seguridad: buildSeguridad(ids),
      comoEmpezar: buildComoEmpezar(ids),
      objeciones: buildObjeciones(ids),
    };

    let totalNodes = 0;
    for (const key of Object.keys(built) as (keyof Ids)[]) {
      const validated = validatePrepared(names[key], built[key]);
      totalNodes += validated.nodes.length;
      await tx.update(automations).set({ nodes: validated.nodes, edges: validated.edges, updatedAt: new Date() }).where(eq(automations.id, ids[key]));
      console.log(`  ✓ ${names[key]} (#${ids[key]}): ${validated.nodes.length} nodos, ${validated.edges.length} aristas.`);
    }
    console.log(`  TOTAL: ${totalNodes} nodos en ${Object.keys(built).length} automatizaciones.`);
  });

  console.log('Listo. ChatPro creado como borrador (isActive=false).');
}

main()
  .catch((error) => { console.error('ERROR', error); process.exitCode = 1; })
  .finally(async () => { await client.end(); });
