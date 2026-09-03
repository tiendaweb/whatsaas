import { and, eq, inArray } from 'drizzle-orm';
import { db, client } from '../lib/db/drizzle';
import { automationFolders, automations } from '../lib/db/schema';
import { prepareAutomationFlowForSave } from '../lib/automation/flow-normalizer';

const TEAM_ID = 4;
const INSTANCE_ID = 18; // "mi vendedor v"
const FOLDER_ID = 10; // existing "Centro de Estética" folder
const OLD_AUTOMATION_IDS = [74, 75, 76]; // generic demo Inicio/Asesoramiento/Reservas Centro de Estética

type NodeLike = { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> };
type EdgeLike = { id: string; source: string; target: string; sourceHandle?: string | null };
type Flow = { nodes: NodeLike[]; edges: EdgeLike[] };

const slug = (value: string) =>
  value.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

class FlowBuilder {
  nodes: NodeLike[] = [];
  edges: EdgeLike[] = [];
  private edgeIndex = 0;

  node(id: string, type: string, data: Record<string, unknown>, x: number, y: number) {
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
      menuOptions: options.map((option) => ({ id: option.id, text: option.text })),
    }, x, y);
    for (const option of options) this.edge(id, option.target, `menu-${option.id}`);
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

// ---------------------------------------------------------------------------
// Specialties data
// ---------------------------------------------------------------------------

type Service = { id: string; name: string; duration: string; description: string; beneficios: string; cuidados: string };

type SpecialtyConfig = {
  key: 'facial' | 'corporal' | 'depilacion' | 'unas' | 'bienestar';
  displayName: string;
  emoji: string;
  specialistTitle: string; // "nuestra esteticista facial"
  teaser: string; // one-liner for the hub menu
  intro: string; // full intro message for this specialty's automation
  services: Service[];
};

const SPECIALTIES: SpecialtyConfig[] = [
  {
    key: 'facial',
    displayName: 'Estética Facial',
    emoji: '✨',
    specialistTitle: 'nuestra esteticista especializada en tratamientos faciales',
    teaser: 'Limpieza, hidratación y tratamientos antiedad para tu rostro.',
    intro:
      '✨ Estética Facial\n\n' +
      'Trabajamos con vos para lograr una piel más sana y luminosa, siempre de la mano de nuestra esteticista especializada en tratamientos faciales. Estos son nuestros servicios:',
    services: [
      {
        id: 'limpieza-profunda', name: 'Limpieza facial profunda', duration: '60 min',
        description: 'Doble limpieza + exfoliación + extracción de impurezas + mascarilla + hidratación final. Ideal para piel con puntos negros, poros obstruidos o exceso de grasitud.',
        beneficios: 'Piel más luminosa y despejada, reduce brotes de acné y mejora la absorción de las cremas que uses en casa.',
        cuidados: 'Evitá el sol sin protector los primeros 2 días, no uses maquillaje pesado durante 24hs y mantené la piel bien hidratada.',
      },
      {
        id: 'peeling', name: 'Peeling / exfoliación (punta de cristal)', duration: '45 min',
        description: 'Microexfoliación mecánica que remueve células muertas y mejora la textura y luminosidad de la piel.',
        beneficios: 'Piel más pareja y luminosa, disminuye marcas superficiales y líneas finas. Ideal antes de un evento.',
        cuidados: 'Usá protector solar SPF50 los días siguientes y evitá exfoliantes caseros por una semana.',
      },
      {
        id: 'hidratacion', name: 'Hidratación profunda con ácido hialurónico', duration: '50 min',
        description: 'Aplicación de sérum de ácido hialurónico + masaje facial + mascarilla hidratante intensiva.',
        beneficios: 'Piel visiblemente más tersa, suave y con mejor elasticidad. Ideal para piel deshidratada o en climas fríos.',
        cuidados: 'Tomá abundante agua y evitá productos con alcohol en la piel por 48hs.',
      },
      {
        id: 'antiedad', name: 'Tratamiento antiedad (radiofrecuencia facial)', duration: '60 min',
        description: 'Radiofrecuencia facial + sérum específico antiedad. Se recomienda un ciclo de 6 sesiones para mejores resultados.',
        beneficios: 'Estimula colágeno, mejora la firmeza y reduce líneas de expresión de forma progresiva.',
        cuidados: 'No tomes sol directo el mismo día. Se recomienda completar el ciclo de sesiones para ver resultados óptimos.',
      },
      {
        id: 'punta-diamante', name: 'Punta de diamante (microdermoabrasión)', duration: '45 min',
        description: 'Microdermoabrasión con punta de diamante para tratar manchas leves, cicatrices superficiales y poros dilatados.',
        beneficios: 'Piel más uniforme y renovada, mejora la textura general del rostro.',
        cuidados: 'Uso obligatorio de protector solar por al menos 5 días. Evitá la exposición solar directa.',
      },
    ],
  },
  {
    key: 'corporal',
    displayName: 'Estética Corporal',
    emoji: '🧖',
    specialistTitle: 'nuestra masoterapeuta especializada en estética corporal',
    teaser: 'Masajes, drenaje linfático y tratamientos reafirmantes.',
    intro:
      '🧖 Estética Corporal\n\n' +
      'Tratamientos corporales guiados por nuestra masoterapeuta especializada, pensados para relajar, tonificar y cuidar tu cuerpo. Estos son nuestros servicios:',
    services: [
      {
        id: 'descontracturante', name: 'Masaje descontracturante', duration: '50 min',
        description: 'Masaje de tejido profundo enfocado en zonas de tensión (espalda, cuello, hombros) para liberar contracturas musculares.',
        beneficios: 'Alivia dolores musculares, mejora la movilidad y reduce el estrés acumulado.',
        cuidados: 'Tomá agua después de la sesión y evitá esfuerzos físicos intensos el mismo día.',
      },
      {
        id: 'reductor', name: 'Masaje reductor', duration: '50 min',
        description: 'Técnica manual que estimula la circulación y ayuda a modelar la silueta en zonas específicas. Se recomienda en ciclos.',
        beneficios: 'Mejora la circulación y ayuda a reducir medidas de forma progresiva, combinado con hábitos saludables.',
        cuidados: 'Mantené buena hidratación y una alimentación equilibrada para potenciar los resultados.',
      },
      {
        id: 'drenaje', name: 'Drenaje linfático', duration: '45 min',
        description: 'Masaje suave y rítmico que estimula el sistema linfático para reducir retención de líquidos e hinchazón.',
        beneficios: 'Reduce la sensación de piernas pesadas, mejora la hinchazón y da sensación de liviandad.',
        cuidados: 'Tomá abundante agua después de la sesión para ayudar a eliminar toxinas.',
      },
      {
        id: 'radiofrecuencia-corporal', name: 'Radiofrecuencia corporal', duration: '45 min',
        description: 'Tecnología de radiofrecuencia aplicada en zonas con flacidez para tensar la piel.',
        beneficios: 'Mejora la firmeza de la piel de forma progresiva, ideal en zonas como abdomen, brazos y piernas.',
        cuidados: 'Hidratación profunda post sesión. Evitá la exposición solar directa en la zona tratada por 24hs.',
      },
      {
        id: 'reafirmante', name: 'Tratamiento reafirmante', duration: '60 min',
        description: 'Combinación de masaje manual + activos reafirmantes en crema para mejorar la elasticidad de la piel.',
        beneficios: 'Piel más firme y tonificada, ideal como complemento de una rutina de cuidado corporal.',
        cuidados: 'Usá cremas hidratantes/reafirmantes en casa para prolongar el efecto.',
      },
    ],
  },
  {
    key: 'depilacion',
    displayName: 'Depilación',
    emoji: '🌿',
    specialistTitle: 'nuestra especialista en depilación',
    teaser: 'Depilación láser, con cera y diseño de cejas.',
    intro:
      '🌿 Depilación\n\n' +
      'Trabajamos distintas técnicas de depilación con nuestra especialista, para que elijas la que más se adapte a vos. Estos son nuestros servicios:',
    services: [
      {
        id: 'laser', name: 'Depilación láser', duration: 'según zona (30 a 60 min)',
        description: 'Tecnología láser que reduce el vello de forma progresiva y prolongada. Se trabaja por zonas (piernas, axilas, bikini, rostro o espalda) en ciclos de sesiones.',
        beneficios: 'Reducción progresiva y duradera del vello, piel más suave y menos irritación que otros métodos a largo plazo.',
        cuidados: 'Evitá el sol directo en la zona tratada, no te depiles con cera entre sesiones (sí podés rasurar) y usá protector solar.',
      },
      {
        id: 'cera', name: 'Depilación con cera', duration: 'según zona (20 a 45 min)',
        description: 'Método tradicional de depilación con cera tibia, resultado inmediato en la zona elegida.',
        beneficios: 'Piel lisa al instante, con un resultado que dura entre 3 y 4 semanas según la zona.',
        cuidados: 'Evitá exponerte al sol directo las primeras horas y usá cremas calmantes si tenés la piel sensible.',
      },
      {
        id: 'cejas', name: 'Diseño de cejas', duration: '20 min',
        description: 'Depilación y diseño de cejas con cera o hilo, adaptado a la forma de tu rostro.',
        beneficios: 'Mirada más definida y prolija, resalta tus rasgos naturales.',
        cuidados: 'Evitá el maquillaje en la zona por algunas horas después del servicio.',
      },
    ],
  },
  {
    key: 'unas',
    displayName: 'Uñas (Manicuría y Pedicuría)',
    emoji: '💅',
    specialistTitle: 'nuestra manicurista y pedicurista',
    teaser: 'Manicuría, semipermanente, pedicuría spa y esculpidas.',
    intro:
      '💅 Uñas — Manicuría y Pedicuría\n\n' +
      'Cuidamos tus manos y pies con nuestra manicurista y pedicurista. Estos son nuestros servicios:',
    services: [
      {
        id: 'manicuria-clasica', name: 'Manicuría clásica', duration: '40 min',
        description: 'Limado, cutícula, hidratación de manos y esmaltado tradicional a elección.',
        beneficios: 'Manos prolijas y cuidadas, ideal para mantenimiento regular.',
        cuidados: 'Usá crema de manos a diario y guantes para tareas de limpieza, así dura más.',
      },
      {
        id: 'semipermanente', name: 'Esmaltado semipermanente', duration: '50 min',
        description: 'Esmaltado de larga duración (hasta 3 semanas) con secado en cabina LED, sin manchar ni descascararse.',
        beneficios: 'Color intacto por semanas y brillo duradero, ideal si no tenés tiempo de retocarte seguido.',
        cuidados: 'Para retirarlo, hacelo siempre en el centro para no dañar la uña natural.',
      },
      {
        id: 'pedicuria-spa', name: 'Pedicuría spa', duration: '60 min',
        description: 'Exfoliación, hidratación profunda, masaje y esmaltado de pies. Incluye tratamiento de callosidades leves.',
        beneficios: 'Pies suaves y descansados, ideal antes del verano o para el uso de sandalias.',
        cuidados: 'Hidratá tus pies a diario y usá calzado cómodo los días posteriores.',
      },
      {
        id: 'esculpidas', name: 'Uñas esculpidas (soft gel)', duration: '90 min',
        description: 'Extensión de uñas con soft gel, con el largo y diseño que prefieras.',
        beneficios: 'Uñas resistentes y con el largo deseado, incluso si las tuyas son cortas o débiles.',
        cuidados: 'Evitá usarlas como herramienta y programá el retoque cada 3 a 4 semanas.',
      },
    ],
  },
  {
    key: 'bienestar',
    displayName: 'Bienestar y Spa',
    emoji: '🕯️',
    specialistTitle: 'nuestra terapeuta de bienestar y spa',
    teaser: 'Masajes relajantes, circuito spa y piedras calientes.',
    intro:
      '🕯️ Bienestar y Spa\n\n' +
      'Un espacio para desconectar, guiado por nuestra terapeuta de bienestar y spa. Estos son nuestros servicios:',
    services: [
      {
        id: 'relajante', name: 'Masaje relajante con aromaterapia', duration: '50 min',
        description: 'Masaje corporal completo con aceites esenciales para liberar el estrés y relajar el cuerpo y la mente.',
        beneficios: 'Reduce el estrés y la ansiedad, y mejora la calidad del sueño.',
        cuidados: 'Tomá agua después de la sesión y date un momento de descanso antes de retomar tu rutina.',
      },
      {
        id: 'circuito-spa', name: 'Circuito spa (sauna + hidromasaje)', duration: '90 min',
        description: 'Acceso a sauna y bañera de hidromasaje en un circuito guiado de bienestar.',
        beneficios: 'Relaja los músculos, mejora la circulación y libera tensiones acumuladas.',
        cuidados: 'Hidratate bien antes y después. Evitá el circuito si tenés la presión arterial descompensada.',
      },
      {
        id: 'piedras-calientes', name: 'Masaje con piedras calientes', duration: '60 min',
        description: 'Masaje corporal con piedras volcánicas calientes que ayudan a relajar la musculatura en profundidad.',
        beneficios: 'Alivio profundo de tensiones musculares y sensación de relajación prolongada.',
        cuidados: 'Evitá actividad física intensa el resto del día para prolongar la relajación.',
      },
    ],
  },
];

type Ids = {
  inicio: number; especialidades: number; asesoramiento: number; reservas: number; gestion: number;
  facial: number; corporal: number; depilacion: number; unas: number; bienestar: number;
};

// ---------------------------------------------------------------------------
// 1. Inicio Centro de Estética
// ---------------------------------------------------------------------------
function buildInicio(ids: Ids): Flow {
  const fb = new FlowBuilder();

  fb.node('start', 'start', {
    label: 'Start Centro de Estética',
    triggerType: 'contains',
    keywords: ['estetica', 'tratamiento', 'belleza', 'spa', 'turno estetica'],
    conditions: {},
  }, 0, 0);

  fb.node('msg-welcome', 'message', {
    label:
      '¡Hola! 👋 Bienvenido/a a nuestro Centro de Estética.\n\n' +
      'Contamos con 5 especialidades: Estética Facial, Estética Corporal, Depilación, Uñas y Bienestar & Spa, cada una con su propia especialista. Todo lo podés hacer eligiendo opciones, sin necesidad de escribir nada complicado.\n\n' +
      '¿En qué te puedo ayudar hoy?',
  }, 320, 0);
  fb.edge('start', 'msg-welcome');

  fb.node('sticky-note', 'sticky_note', {
    title: 'Demo comercial · Centro de Estética (ultra completo)',
    bodyText: 'Sistema con 5 especialidades, servicios detallados con beneficios/cuidados, asesoramiento con derivación a especialistas, reservas por especialidad y gestión de turnos.',
  }, 320, -280);

  fb.node('msg-info', 'message', {
    label:
      '📍 Contamos con showroom con turno previo.\n' +
      '💳 Medios de pago: tarjetas de crédito/débito y cuotas sin interés.\n' +
      '🕐 Horarios: Lunes a Sábado de 9 a 19hs.',
  }, 960, -220);
  fb.node('end-info', 'end', { disableAutomation: false }, 1280, -220);
  fb.edge('msg-info', 'end-info');

  humanHandoff(fb, 'msg-asesor', 'ai-control-asesor', 'end-asesor', 'Un momento, te conecto con recepción 👤', 960, 220);

  fb.node('goto-especialidades', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.especialidades, targetNodeId: 'menu-especialidades', fallbackAction: 'stop' }, 960, -110);
  fb.node('goto-asesoramiento', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.asesoramiento, targetNodeId: 'menu-concern', fallbackAction: 'stop' }, 960, -40);
  fb.node('goto-reservas', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.reservas, targetNodeId: 'menu-especialidad', fallbackAction: 'stop' }, 960, 40);
  fb.node('goto-gestion', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.gestion, targetNodeId: 'menu-gestion', fallbackAction: 'stop' }, 960, 110);

  fb.menu('menu-main', '¿Qué necesitás?', [
    { id: 'especialidades', text: 'Ver especialidades y servicios', target: 'goto-especialidades' },
    { id: 'asesoramiento', text: 'Asesoramiento personalizado', target: 'goto-asesoramiento' },
    { id: 'reservar', text: 'Reservar un turno', target: 'goto-reservas' },
    { id: 'gestion', text: 'Gestionar mi turno', target: 'goto-gestion' },
    { id: 'info', text: 'Ubicación y medios de pago', target: 'msg-info' },
    { id: 'asesor', text: 'Hablar con recepción', target: 'msg-asesor' },
  ], 640, 0);
  fb.edge('msg-welcome', 'menu-main');

  return fb.flow();
}

// ---------------------------------------------------------------------------
// 2. Especialidades (hub)
// ---------------------------------------------------------------------------
function buildEspecialidades(ids: Ids): Flow {
  const fb = new FlowBuilder();
  internalStart(fb, 'msg-intro-hub');

  const teaser = SPECIALTIES.map((s) => `${s.emoji} *${s.displayName}*: ${s.teaser}`).join('\n');
  fb.node('msg-intro-hub', 'message', {
    label: 'Estas son nuestras especialidades:\n\n' + teaser + '\n\n¿Cuál te interesa?',
  }, 320, 0);
  fb.edge('msg-intro-hub', 'menu-especialidades');

  fb.node('goto-asesoramiento', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.asesoramiento, targetNodeId: 'menu-concern', fallbackAction: 'stop' }, 960, 160);
  fb.node('goto-menu-principal', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.inicio, targetNodeId: 'menu-main', fallbackAction: 'stop' }, 960, 220);

  const options = SPECIALTIES.map((s) => ({ id: s.key, text: `${s.emoji} ${s.displayName}`, target: `goto-${s.key}` }));
  for (const s of SPECIALTIES) {
    fb.node(`goto-${s.key}`, 'go_to_node', { mode: 'other_flow', targetAutomationId: ids[s.key], targetNodeId: 'menu-services', fallbackAction: 'stop' }, 960, 0);
  }

  fb.menu('menu-especialidades', '¿Qué especialidad te interesa?', [
    ...options,
    { id: 'asesoramiento', text: 'Asesoramiento personalizado', target: 'goto-asesoramiento' },
    { id: 'menu', text: 'Volver al menú principal', target: 'goto-menu-principal' },
  ], 640, 0);

  return fb.flow();
}

// ---------------------------------------------------------------------------
// 3. One automation per specialty
// ---------------------------------------------------------------------------
function buildSpecialtyFlow(cfg: SpecialtyConfig, ids: Ids): Flow {
  const fb = new FlowBuilder();
  internalStart(fb, 'msg-intro');

  fb.node('msg-intro', 'message', { label: cfg.intro }, 320, 0);
  fb.edge('msg-intro', 'menu-services');

  fb.node('goto-reservas', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.reservas, targetNodeId: `msg-confirm-${cfg.key}`, fallbackAction: 'stop' }, 2560, -200);
  fb.node('goto-especialidades', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.especialidades, targetNodeId: 'menu-especialidades', fallbackAction: 'stop' }, 2560, -140);
  fb.node('goto-menu-principal', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.inicio, targetNodeId: 'menu-main', fallbackAction: 'stop' }, 2560, -80);
  humanHandoff(fb, 'msg-asesor', 'ai-control-asesor', 'end-asesor', `Un momento, te conecto con ${cfg.specialistTitle} 👤`, 2560, 300);

  cfg.services.forEach((svc, index) => {
    const y = index * 140 - (cfg.services.length * 70);
    const msgId = `msg-service-${svc.id}`;
    const detailId = `menu-detail-${svc.id}`;
    const benefId = `msg-beneficios-${svc.id}`;
    const cuidId = `msg-cuidados-${svc.id}`;

    fb.node(msgId, 'message', {
      label: `${svc.name} (${svc.duration})\n\n${svc.description}`,
    }, 960, y);
    fb.edge(msgId, detailId);

    fb.node(benefId, 'message', { label: `✅ Beneficios de ${svc.name}:\n${svc.beneficios}` }, 1920, y - 30);
    fb.edge(benefId, detailId);

    fb.node(cuidId, 'message', { label: `🩹 Cuidados posteriores de ${svc.name}:\n${svc.cuidados}` }, 1920, y + 30);
    fb.edge(cuidId, detailId);

    fb.menu(detailId, `${svc.name} — ¿Qué querés ver?`, [
      { id: 'beneficios', text: 'Beneficios', target: benefId },
      { id: 'cuidados', text: 'Cuidados posteriores', target: cuidId },
      { id: 'reservar', text: 'Reservar este servicio', target: 'goto-reservas' },
      { id: 'otro', text: 'Ver otro servicio', target: 'menu-services' },
      { id: 'especialidades', text: 'Volver a especialidades', target: 'goto-especialidades' },
      { id: 'menu', text: 'Volver al menú principal', target: 'goto-menu-principal' },
    ], 1280, y);
  });

  fb.menu('menu-services', `¿Qué servicio de ${cfg.displayName} te interesa?`, [
    ...cfg.services.map((svc) => ({ id: svc.id, text: svc.name, target: `msg-service-${svc.id}` })),
    { id: 'asesor', text: `Hablar con ${cfg.specialistTitle}`, target: 'msg-asesor' },
    { id: 'especialidades', text: 'Volver a especialidades', target: 'goto-especialidades' },
    { id: 'menu', text: 'Volver al menú principal', target: 'goto-menu-principal' },
  ], 640, 0);

  return fb.flow();
}

// ---------------------------------------------------------------------------
// 4. Asesoramiento Centro de Estética
// ---------------------------------------------------------------------------
const CONCERNS: Array<{ id: string; text: string; specialty: SpecialtyConfig['key']; rec: string }> = [
  { id: 'piel', text: 'Cuidar la piel del rostro', specialty: 'facial', rec: 'Para cuidar la piel del rostro te recomendamos nuestra línea de Estética Facial: limpieza profunda, hidratación, tratamientos antiedad y más. Te muestro todos los servicios 👇' },
  { id: 'tension', text: 'Relajarme y aliviar tensión muscular', specialty: 'corporal', rec: 'Para relajarte y aliviar la tensión te recomendamos nuestra línea de Estética Corporal: masajes descontracturantes, drenaje linfático y más. Te muestro todos los servicios 👇' },
  { id: 'vello', text: 'Eliminar vello de forma prolija', specialty: 'depilacion', rec: 'Para eliminar el vello de forma prolija tenemos depilación láser y con cera, para distintas zonas. Te muestro todos los servicios 👇' },
  { id: 'manos-pies', text: 'Cuidar mis manos y pies', specialty: 'unas', rec: 'Para cuidar tus manos y pies tenemos manicuría, pedicuría spa y esmaltado semipermanente. Te muestro todos los servicios 👇' },
  { id: 'bienestar', text: 'Un momento de bienestar completo', specialty: 'bienestar', rec: 'Para un momento de bienestar completo tenemos masajes relajantes, circuito spa y más. Te muestro todos los servicios 👇' },
];

function buildAsesoramiento(ids: Ids): Flow {
  const fb = new FlowBuilder();
  internalStart(fb, 'menu-concern');

  fb.node('goto-menu-principal', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.inicio, targetNodeId: 'menu-main', fallbackAction: 'stop' }, 1600, 260);

  for (const concern of CONCERNS) {
    const recId = `msg-rec-${concern.id}`;
    const gotoId = `goto-${concern.specialty}`;
    fb.node(recId, 'message', { label: concern.rec }, 640, 0);
    fb.node(gotoId, 'go_to_node', { mode: 'other_flow', targetAutomationId: ids[concern.specialty], targetNodeId: 'menu-services', fallbackAction: 'stop' }, 960, 0);
    fb.edge(recId, gotoId);
  }

  fb.menu('menu-elegir-especialista', '¿Con quién te gustaría hablar?', [
    { id: 'facial', text: 'Esteticista facial', target: 'msg-asesor-generico' },
    { id: 'corporal', text: 'Masoterapeuta corporal', target: 'msg-asesor-generico' },
    { id: 'depilacion', text: 'Especialista en depilación', target: 'msg-asesor-generico' },
    { id: 'unas', text: 'Manicurista/pedicurista', target: 'msg-asesor-generico' },
    { id: 'bienestar', text: 'Terapeuta de bienestar', target: 'msg-asesor-generico' },
    { id: 'cualquiera', text: 'Cualquiera disponible', target: 'msg-asesor-generico' },
  ], 640, 320);

  humanHandoff(fb, 'msg-asesor-generico', 'ai-control-asesor', 'end-asesor', 'Perfecto, te vamos a conectar con la persona indicada. Un momento por favor 👤', 960, 320);

  fb.menu('menu-concern', '¿Qué te gustaría lograr?', [
    ...CONCERNS.map((c) => ({ id: c.id, text: c.text, target: `msg-rec-${c.id}` })),
    { id: 'no-seguro', text: 'No estoy seguro/a, quiero hablar con un especialista', target: 'menu-elegir-especialista' },
    { id: 'menu', text: 'Volver al menú principal', target: 'goto-menu-principal' },
  ], 320, 0);

  return fb.flow();
}

// ---------------------------------------------------------------------------
// 5. Reservas Centro de Estética
// ---------------------------------------------------------------------------
function buildReservas(ids: Ids): Flow {
  const fb = new FlowBuilder();
  internalStart(fb, 'menu-especialidad');

  fb.node('goto-asesoramiento', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.asesoramiento, targetNodeId: 'menu-concern', fallbackAction: 'stop' }, 320, 260);
  fb.node('goto-menu-principal', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.inicio, targetNodeId: 'menu-main', fallbackAction: 'stop' }, 320, 320);

  fb.node('collect-nombre', 'collect', { label: '¿A nombre de quién coordinamos el turno?', variable: 'nombre_turno' }, 960, 0);
  fb.edge('collect-nombre', 'menu-horario');

  for (const s of SPECIALTIES) {
    const confirmId = `msg-confirm-${s.key}`;
    fb.node(confirmId, 'message', { label: `Perfecto, vamos a coordinar tu turno de ${s.displayName} ${s.emoji}.` }, 640, 0);
    fb.edge(confirmId, 'collect-nombre');
  }

  fb.menu('menu-especialidad', '¿Para qué especialidad querés reservar?', [
    ...SPECIALTIES.map((s) => ({ id: s.key, text: `${s.emoji} ${s.displayName}`, target: `msg-confirm-${s.key}` })),
    { id: 'asesoramiento', text: 'Quiero asesoramiento primero', target: 'goto-asesoramiento' },
    { id: 'menu', text: 'Volver al menú principal', target: 'goto-menu-principal' },
  ], 320, 0);

  fb.menu('menu-horario', '¿Qué franja horaria te queda mejor?', [
    { id: 'manana', text: 'Mañana (9 a 13hs)', target: 'msg-confirmacion' },
    { id: 'tarde', text: 'Tarde (13 a 17hs)', target: 'msg-confirmacion' },
    { id: 'noche', text: 'Noche (17 a 19hs)', target: 'msg-confirmacion' },
  ], 1280, 0);

  fb.node('msg-confirmacion', 'message', {
    label: '¡Listo, {{nombre_turno}}! Anotamos tu turno y te vamos a confirmar el día y horario exacto a la brevedad. 📍',
  }, 1600, 0);
  fb.node('save-contact', 'save_contact', { nameVariable: '{{nombre_turno}}' }, 1920, 0);
  fb.edge('msg-confirmacion', 'save-contact');
  fb.node('end-reserva', 'end', { disableAutomation: false }, 2240, 0);
  fb.edge('save-contact', 'end-reserva');

  return fb.flow();
}

// ---------------------------------------------------------------------------
// 6. Gestión de turno Centro de Estética (postventa)
// ---------------------------------------------------------------------------
function buildGestion(ids: Ids): Flow {
  const fb = new FlowBuilder();
  internalStart(fb, 'menu-gestion');

  fb.node('goto-menu-principal', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.inicio, targetNodeId: 'menu-main', fallbackAction: 'stop' }, 640, 320);

  humanHandoff(fb, 'msg-derivar', 'ai-control-derivar', 'end-derivado', 'Gracias, un miembro de nuestro equipo va a continuar con vos 👤', 1600, 0);

  fb.node('collect-reprogramar', 'collect', { label: '¿Qué turno querés reprogramar? Contanos el día y horario actual.', variable: 'turno_reprogramar' }, 640, -160);
  fb.edge('collect-reprogramar', 'msg-derivar');

  fb.node('collect-cancelar', 'collect', { label: '¿Qué turno querés cancelar? Contanos el día y horario.', variable: 'turno_cancelar' }, 640, -80);
  fb.edge('collect-cancelar', 'msg-derivar');

  fb.node('msg-politica', 'message', {
    label: 'Podés cancelar o reprogramar tu turno sin cargo hasta 24hs antes. Pasado ese plazo, te pedimos que nos avises igual para poder reorganizar la agenda.',
  }, 640, 0);
  fb.menu('menu-politica-siguiente', '¿Querés reprogramar o cancelar un turno ahora?', [
    { id: 'reprogramar', text: 'Reprogramar mi turno', target: 'collect-reprogramar' },
    { id: 'cancelar', text: 'Cancelar mi turno', target: 'collect-cancelar' },
    { id: 'menu', text: 'Volver al menú principal', target: 'goto-menu-principal' },
  ], 960, 0);
  fb.edge('msg-politica', 'menu-politica-siguiente');

  fb.node('collect-reclamo', 'collect', { label: 'Contanos brevemente qué pasó con tu turno o tratamiento.', variable: 'detalle_reclamo' }, 640, 80);
  fb.edge('collect-reclamo', 'msg-derivar');

  fb.menu('menu-gestion', '¿En qué te podemos ayudar con tu turno?', [
    { id: 'reprogramar', text: 'Reprogramar mi turno', target: 'collect-reprogramar' },
    { id: 'cancelar', text: 'Cancelar mi turno', target: 'collect-cancelar' },
    { id: 'politica', text: 'Política de cancelación', target: 'msg-politica' },
    { id: 'reclamo', text: 'Reclamo o consulta sobre un tratamiento', target: 'collect-reclamo' },
    { id: 'recepcion', text: 'Hablar con recepción', target: 'msg-derivar' },
    { id: 'menu', text: 'Volver al menú principal', target: 'goto-menu-principal' },
  ], 320, 0);

  return fb.flow();
}

// ---------------------------------------------------------------------------

function validatePrepared(name: string, flow: Flow) {
  const prepared = prepareAutomationFlowForSave({ nodes: flow.nodes as never[], edges: flow.edges as never[] });
  if (!prepared.success) throw new Error(`${name}: ${prepared.errors.join('; ')}`);
  const ids = new Set(prepared.nodes.map((node) => node.id));
  for (const edge of prepared.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      throw new Error(`${name}: arista inválida ${edge.id} (${edge.source} -> ${edge.target})`);
    }
  }
  return { nodes: prepared.nodes, edges: prepared.edges };
}

async function main() {
  console.log('Reemplazando el flujo genérico de Centro de Estética por el sistema ultra completo...');

  await db.transaction(async (tx) => {
    await tx.delete(automations).where(
      and(eq(automations.teamId, TEAM_ID), inArray(automations.id, OLD_AUTOMATION_IDS)),
    );
    console.log(`  Automatizaciones genéricas eliminadas: ${OLD_AUTOMATION_IDS.join(', ')}.`);

    const placeholder = (label: string) => [
      { id: 'placeholder-start', type: 'start', position: { x: 0, y: 0 }, data: { label, triggerType: 'fallback', keywords: [], conditions: {} } },
    ];

    const names: Record<keyof Ids, string> = {
      inicio: 'Inicio Centro de Estética',
      especialidades: 'Especialidades Centro de Estética',
      facial: 'Especialidad: Estética Facial',
      corporal: 'Especialidad: Estética Corporal',
      depilacion: 'Especialidad: Depilación',
      unas: 'Especialidad: Uñas',
      bienestar: 'Especialidad: Bienestar y Spa',
      asesoramiento: 'Asesoramiento Centro de Estética',
      reservas: 'Reservas Centro de Estética',
      gestion: 'Gestión de turno Centro de Estética',
    };

    const rows: Record<keyof Ids, { id: number }> = {} as never;
    for (const key of Object.keys(names) as (keyof Ids)[]) {
      const [row] = await tx.insert(automations).values({
        teamId: TEAM_ID, instanceId: INSTANCE_ID, folderId: FOLDER_ID,
        name: names[key],
        note: 'Flujo ultra completo de Centro de Estética generado automáticamente.',
        nodes: placeholder('Start'), edges: [], isActive: false,
      }).returning({ id: automations.id });
      rows[key] = row;
    }

    const ids: Ids = {
      inicio: rows.inicio.id, especialidades: rows.especialidades.id,
      facial: rows.facial.id, corporal: rows.corporal.id, depilacion: rows.depilacion.id,
      unas: rows.unas.id, bienestar: rows.bienestar.id,
      asesoramiento: rows.asesoramiento.id, reservas: rows.reservas.id, gestion: rows.gestion.id,
    };

    const built: Record<keyof Ids, Flow> = {
      inicio: buildInicio(ids),
      especialidades: buildEspecialidades(ids),
      facial: buildSpecialtyFlow(SPECIALTIES[0], ids),
      corporal: buildSpecialtyFlow(SPECIALTIES[1], ids),
      depilacion: buildSpecialtyFlow(SPECIALTIES[2], ids),
      unas: buildSpecialtyFlow(SPECIALTIES[3], ids),
      bienestar: buildSpecialtyFlow(SPECIALTIES[4], ids),
      asesoramiento: buildAsesoramiento(ids),
      reservas: buildReservas(ids),
      gestion: buildGestion(ids),
    };

    let totalNodes = 0;
    for (const key of Object.keys(built) as (keyof Ids)[]) {
      const validated = validatePrepared(names[key], built[key]);
      totalNodes += validated.nodes.length;
      await tx.update(automations)
        .set({ nodes: validated.nodes, edges: validated.edges, updatedAt: new Date() })
        .where(eq(automations.id, ids[key]));
      console.log(`  ✓ ${names[key]} (#${ids[key]}): ${validated.nodes.length} nodos, ${validated.edges.length} aristas.`);
    }
    console.log(`  TOTAL: ${totalNodes} nodos en ${Object.keys(built).length} automatizaciones.`);
  });

  console.log('Listo. Sistema de Centro de Estética creado como borrador (isActive=false).');
}

main()
  .catch((error) => { console.error('ERROR', error); process.exitCode = 1; })
  .finally(async () => { await client.end(); });
