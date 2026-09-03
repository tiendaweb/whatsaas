import { eq, and, inArray } from 'drizzle-orm';
import { db, client } from '../lib/db/drizzle';
import { automationFolders, automations } from '../lib/db/schema';
import { prepareAutomationFlowForSave } from '../lib/automation/flow-normalizer';

const TEAM_ID = 4;
const INSTANCE_ID = 18; // "mi vendedor v"
const FOLDER_ID = 7; // existing "Indumentaria" folder, being rebranded
const OLD_AUTOMATION_IDS = [65, 66, 67]; // generic demo Inicio/Asesoramiento/Reservas Indumentaria

const STORE_URL = 'https://tiendaweb.uno/store/az';

const IMG = {
  hero: 'https://tiendaweb.uno/storage/uploads/theme12/header/az_hero_2.jpg',
  remeras: 'https://tiendaweb.uno/storage/uploads/product_image/remeras%20hombre%20varios%20colores%20az%20indumentaria%20once%20caba_1780541625.jpeg',
  campera: 'https://tiendaweb.uno/storage/uploads/product_image/campera-acolchada-negra-hombre-az-indumentaria-once-caba.jpg_1780537307.png',
  buzo: 'https://tiendaweb.uno/storage/uploads/product_image/buzo-premium-hombre-negro-az-indumentaria-once-caba.jpg_1780543630.jpeg',
};

const CATEGORY_LINK = (name: string) => `${STORE_URL}/categorie/${encodeURIComponent(name)}`;

const CATEGORIES_ABRIGO = [
  { id: 'camperas', text: 'Camperas', name: 'Camperas', blurb: '🧥 Camperas para el frío porteño, desde acolchadas hasta con capucha.' },
  { id: 'chalecos', text: 'Chalecos', name: 'Chalecos', blurb: '🦺 Chalecos ideales para combinar en las estaciones intermedias.' },
  { id: 'buzos', text: 'Buzos', name: 'Buzos', blurb: '👕 Buzos y hoodies premium, básicos y estampados.' },
  { id: 'pijamas', text: 'Pijamas de hombre', name: 'Pijamas de Hombre', blurb: '🌙 Pijamas súper frizados para estar cómodo en casa.' },
  { id: 'termicas', text: 'Camisetas térmicas', name: 'Camisetas Térmicas de Hombre', blurb: '🔥 Camisetas térmicas para las noches más frías.' },
];

const CATEGORIES_REMERAS = [
  { id: 'remeras', text: 'Remeras', name: 'Remeras', blurb: '👕 Remeras en varios colores, el básico que no puede faltar.' },
  { id: 'manga-larga', text: 'Remeras manga larga', name: 'Remera Manga Larga de Hombre', blurb: '👔 Remeras manga larga para entretiempo.' },
  { id: 'joggins', text: 'Joggins', name: 'Joggins', blurb: '🏃 Joggins premium, comodidad para el día a día.' },
  { id: 'bombacha', text: 'Bombacha de campo', name: 'Bombacha de Campo', blurb: '🤠 Bombachas de campo, el clásico que nunca pasa de moda.' },
  { id: 'chino', text: 'Pantalón chino premium', name: 'Pantalón Chino Premium de Hombre', blurb: '👖 Pantalones chinos premium para un look prolijo.' },
  { id: 'cargo', text: 'Pantalones cargo', name: 'Pantalones Cargos', blurb: '🎒 Pantalones cargo con bolsillos, estilo urbano.' },
];

type NodeLike = { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> };
type EdgeLike = { id: string; source: string; target: string; sourceHandle?: string | null };
type Flow = { nodes: NodeLike[]; edges: EdgeLike[] };

const slug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

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
    this.edges.push({
      id: `edge-${slug(source)}-${slug(sourceHandle ?? 'default')}-${slug(target)}-${this.edgeIndex}`,
      source,
      target,
      sourceHandle: sourceHandle ?? null,
    });
  }

  menu(
    id: string,
    label: string,
    options: Array<{ id: string; text: string; target: string }>,
    x: number,
    y: number,
    fallbackTarget?: string,
  ) {
    this.node(id, 'menu_simple', {
      label,
      markerStyle: 'emoji_number',
      globalDelaySeconds: 0,
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

type Ids = { inicio: number; catalogo: number; asesoramiento: number; reservas: number; postventa: number };

// ---------------------------------------------------------------------------
// 1. Inicio AZ Indumentaria
// ---------------------------------------------------------------------------
function buildInicio(ids: Ids): Flow {
  const fb = new FlowBuilder();

  fb.node('start', 'start', {
    label: 'Start AZ Indumentaria',
    triggerType: 'contains',
    keywords: ['az', 'az indumentaria', 'indumentaria', 'ropa'],
    conditions: {},
  }, 0, 0);

  fb.node('media-hero', 'media', {
    mediaType: 'image',
    mediaUrl: IMG.hero,
    caption: 'AZ Indumentaria — Vestite como vos ✨',
  }, 320, 0);
  fb.edge('start', 'media-hero');

  fb.node('msg-welcome', 'message', {
    label:
      '¡Hola! 👋 Bienvenido/a a AZ Indumentaria.\n\n' +
      'Ropa de hombre pensada para durar: básicos atemporales y la colección de temporada, con hasta 30% OFF en productos seleccionados, envío gratis en compras seleccionadas, cambios gratis dentro de los 30 días y hasta 12 cuotas sin interés con Mercado Pago.\n\n' +
      '¿En qué te puedo ayudar hoy?',
  }, 640, 0);
  fb.edge('media-hero', 'msg-welcome');

  fb.node('sticky-note', 'sticky_note', {
    title: 'Demo comercial · AZ Indumentaria',
    bodyText: `Flujo real armado en base a ${STORE_URL}. Usa "ir al nodo" para derivar a Catálogo, Asesoramiento, Reservas y Postventa.`,
  }, 320, -280);

  fb.node('msg-info', 'message', {
    label:
      '🌐 Somos una tienda 100% online: ' + STORE_URL + '\n' +
      '📍 También podés probarte las prendas en nuestro showroom en Once, CABA (con turno previo).\n' +
      '💳 Medios de pago: tarjetas de crédito/débito y hasta 12 cuotas sin interés con Mercado Pago.\n' +
      '🔁 Cambios gratis dentro de los 30 días de la compra.',
  }, 960, -180);
  fb.node('end-info', 'end', { disableAutomation: false }, 1280, -180);
  fb.edge('msg-info', 'end-info');

  fb.node('msg-asesor', 'message', { label: 'Un momento, te conecto con un miembro de nuestro equipo 👤' }, 960, 180);
  fb.node('ai-control-asesor', 'ai_control', { action: 'paused' }, 1280, 180);
  fb.node('end-asesor', 'end', { disableAutomation: true }, 1600, 180);
  fb.edge('msg-asesor', 'ai-control-asesor');
  fb.edge('ai-control-asesor', 'end-asesor');

  fb.node('goto-catalogo', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.catalogo, targetNodeId: 'menu-groups', fallbackAction: 'stop' }, 960, -60);
  fb.node('goto-asesoramiento', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.asesoramiento, targetNodeId: 'menu-estilo', fallbackAction: 'stop' }, 960, 0);
  fb.node('goto-reservas', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.reservas, targetNodeId: 'menu-ya-elegiste', fallbackAction: 'stop' }, 960, 60);
  fb.node('goto-postventa', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.postventa, targetNodeId: 'menu-postventa', fallbackAction: 'stop' }, 960, 120);

  fb.menu('menu-main', '¿Qué necesitás?', [
    { id: 'catalogo', text: 'Ver catálogo por categoría', target: 'goto-catalogo' },
    { id: 'asesoramiento', text: 'Asesoramiento de looks', target: 'goto-asesoramiento' },
    { id: 'reservar', text: 'Reservar turno para probador', target: 'goto-reservas' },
    { id: 'postventa', text: 'Cambios, devoluciones o postventa', target: 'goto-postventa' },
    { id: 'info', text: 'Ubicación y medios de pago', target: 'msg-info' },
    { id: 'asesor', text: 'Hablar con un asesor', target: 'msg-asesor' },
  ], 640, 60);
  fb.edge('msg-welcome', 'menu-main');

  return fb.flow();
}

// ---------------------------------------------------------------------------
// 2. Catálogo AZ Indumentaria
// ---------------------------------------------------------------------------
function buildCatalogo(ids: Ids): Flow {
  const fb = new FlowBuilder();
  internalStart(fb, 'menu-groups');

  fb.node('menu-more', 'menu_simple', {
    label: '¿Te ayudo con algo más?',
    markerStyle: 'emoji_number',
    menuOptions: [
      { id: 'otra', text: 'Ver otra categoría' },
      { id: 'reservar', text: 'Reservar turno para probador' },
      { id: 'listo', text: 'Listo, gracias' },
    ],
  }, 2240, 0);
  fb.edge('menu-more', 'menu-groups', 'menu-otra');
  fb.node('goto-reservas', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.reservas, targetNodeId: 'menu-ya-elegiste', fallbackAction: 'stop' }, 2560, -60);
  fb.edge('menu-more', 'goto-reservas', 'menu-reservar');
  fb.node('end-catalogo', 'end', { disableAutomation: false }, 2560, 60);
  fb.edge('menu-more', 'end-catalogo', 'menu-listo');
  fb.edge('menu-more', 'menu-more', 'fallback');

  const buildCategoryMessages = (items: typeof CATEGORIES_ABRIGO, xBase: number) => {
    items.forEach((cat, index) => {
      const nodeId = `msg-cat-${cat.id}`;
      fb.node(nodeId, 'message', {
        label: `${cat.blurb}\n\nMirá toda la colección acá 👉 ${CATEGORY_LINK(cat.name)}`,
      }, xBase, index * 90 - (items.length * 45));
      fb.edge(nodeId, 'menu-more');
    });
  };

  fb.menu('menu-group-a', '¿Qué buscás dentro de abrigo y buzos?', CATEGORIES_ABRIGO.map((c) => ({
    id: c.id, text: c.text, target: `msg-cat-${c.id}`,
  })), 1280, -160, 'menu-groups');
  buildCategoryMessages(CATEGORIES_ABRIGO, 1920);

  fb.menu('menu-group-b', '¿Qué buscás dentro de remeras y pantalones?', CATEGORIES_REMERAS.map((c) => ({
    id: c.id, text: c.text, target: `msg-cat-${c.id}`,
  })), 1280, 160, 'menu-groups');
  buildCategoryMessages(CATEGORIES_REMERAS, 1920);

  fb.node('msg-full-catalog', 'message', {
    label: `🛍️ Mirá el catálogo completo de AZ Indumentaria acá 👉 ${STORE_URL}`,
  }, 1280, 320);
  fb.edge('msg-full-catalog', 'menu-more');

  fb.menu('menu-groups', '¿Qué tipo de prenda estás buscando?', [
    { id: 'abrigo', text: 'Abrigo y buzos ❄️', target: 'menu-group-a' },
    { id: 'remeras', text: 'Remeras y pantalones 👕', target: 'menu-group-b' },
    { id: 'todo', text: 'Ver todo el catálogo online', target: 'msg-full-catalog' },
  ], 640, 0);

  return fb.flow();
}

// ---------------------------------------------------------------------------
// 3. Asesoramiento AZ Indumentaria
// ---------------------------------------------------------------------------
function buildAsesoramiento(ids: Ids): Flow {
  const fb = new FlowBuilder();
  internalStart(fb, 'menu-estilo');

  fb.node('msg-casual', 'message', {
    label: 'Para el día a día te recomendamos combinar remeras con un pantalón chino premium o un jean: cómodo, prolijo y versátil.',
  }, 640, -240);
  fb.node('media-casual', 'media', { mediaType: 'image', mediaUrl: IMG.remeras, caption: 'Remeras AZ en varios colores 👕' }, 960, -240);
  fb.edge('msg-casual', 'media-casual');
  fb.edge('media-casual', 'menu-siguiente');

  fb.node('msg-abrigo', 'message', {
    label: 'Para el frío, la combinación ganadora es campera o chaleco por arriba de un buzo o camiseta térmica.',
  }, 640, -80);
  fb.node('media-abrigo', 'media', { mediaType: 'image', mediaUrl: IMG.campera, caption: 'Campera acolchada AZ 🧥' }, 960, -80);
  fb.edge('msg-abrigo', 'media-abrigo');
  fb.edge('media-abrigo', 'menu-siguiente');

  fb.node('msg-urbano', 'message', {
    label: 'Para un estilo urbano/deportivo, un buzo con joggins o pantalón cargo es la combinación más elegida.',
  }, 640, 80);
  fb.node('media-urbano', 'media', { mediaType: 'image', mediaUrl: IMG.buzo, caption: 'Buzo premium AZ 👕' }, 960, 80);
  fb.edge('msg-urbano', 'media-urbano');
  fb.edge('media-urbano', 'menu-siguiente');

  fb.node('msg-regalo', 'message', {
    label: 'Si es para regalar, una remera o un buzo básico son opciones seguras. Y como tenemos cambios gratis dentro de los 30 días, si no es el talle correcto no hay problema.',
  }, 640, 240);
  fb.edge('msg-regalo', 'menu-siguiente');

  fb.node('msg-asesor', 'message', { label: 'Un momento, te conecto con un miembro de nuestro equipo 👤' }, 1600, 300);
  fb.node('ai-control-asesor', 'ai_control', { action: 'paused' }, 1920, 300);
  fb.node('end-asesor', 'end', { disableAutomation: true }, 2240, 300);
  fb.edge('msg-asesor', 'ai-control-asesor');
  fb.edge('ai-control-asesor', 'end-asesor');

  fb.node('goto-catalogo', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.catalogo, targetNodeId: 'menu-categorias', fallbackAction: 'stop' }, 1600, -60);
  fb.node('goto-reservas', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.reservas, targetNodeId: 'menu-ya-elegiste', fallbackAction: 'stop' }, 1600, 120);
  fb.node('goto-menu-principal', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.inicio, targetNodeId: 'menu-main', fallbackAction: 'stop' }, 1920, 180);

  fb.menu('menu-siguiente', '¿Qué te gustaría hacer ahora?', [
    { id: 'catalogo', text: 'Ver la categoría sugerida', target: 'goto-catalogo' },
    { id: 'reservar', text: 'Reservar turno para probador', target: 'goto-reservas' },
    { id: 'asesor', text: 'Hablar con un asesor', target: 'msg-asesor' },
    { id: 'menu', text: 'Volver al menú principal', target: 'goto-menu-principal' },
  ], 1280, 60);

  fb.menu('menu-estilo', '¿Para qué buscás tu próximo look? 🧢', [
    { id: 'casual', text: 'Uso diario y casual', target: 'msg-casual' },
    { id: 'abrigo', text: 'Frío y abrigo', target: 'msg-abrigo' },
    { id: 'urbano', text: 'Estilo urbano/deportivo', target: 'msg-urbano' },
    { id: 'regalo', text: 'Es un regalo', target: 'msg-regalo' },
  ], 320, 0);

  return fb.flow();
}

// ---------------------------------------------------------------------------
// 4. Reservas AZ Indumentaria (turno para probador, showroom Once CABA)
// ---------------------------------------------------------------------------
function buildReservas(ids: Ids): Flow {
  const fb = new FlowBuilder();
  internalStart(fb, 'menu-ya-elegiste');

  fb.node('goto-asesoramiento', 'go_to_node', { mode: 'other_flow', targetAutomationId: ids.asesoramiento, targetNodeId: 'menu-estilo', fallbackAction: 'stop' }, 320, 80);

  fb.node('collect-nombre', 'collect', { label: '¿A nombre de quién coordinamos la prueba de prendas?', variable: 'nombre_turno' }, 640, -40);

  fb.menu('menu-ya-elegiste', '¿Ya tenés en mente qué prenda querés probarte?', [
    { id: 'si', text: 'Sí, ya elegí', target: 'collect-nombre' },
    { id: 'no', text: 'Todavía no, quiero asesoramiento', target: 'goto-asesoramiento' },
  ], 0, 0);

  fb.menu('menu-horario', '¿Qué franja horaria te queda mejor?', [
    { id: 'manana', text: 'Mañana (10 a 14hs)', target: 'msg-confirmacion' },
    { id: 'tarde', text: 'Tarde (14 a 18hs)', target: 'msg-confirmacion' },
    { id: 'finde', text: 'Fin de semana', target: 'msg-confirmacion' },
  ], 960, -40);
  fb.edge('collect-nombre', 'menu-horario');

  fb.node('msg-confirmacion', 'message', {
    label: '¡Listo, {{nombre_turno}}! Anotamos tu turno para probarte las prendas en nuestro showroom de Once, CABA. Te vamos a confirmar día y horario exacto a la brevedad. 📍',
  }, 1280, -40);

  fb.node('save-contact', 'save_contact', { nameVariable: '{{nombre_turno}}' }, 1600, -40);
  fb.edge('msg-confirmacion', 'save-contact');

  fb.node('end-reserva', 'end', { disableAutomation: false }, 1920, -40);
  fb.edge('save-contact', 'end-reserva');

  return fb.flow();
}

// ---------------------------------------------------------------------------
// 5. Postventa AZ Indumentaria
// ---------------------------------------------------------------------------
function buildPostventa(ids: Ids): Flow {
  const fb = new FlowBuilder();
  internalStart(fb, 'menu-postventa');

  fb.node('msg-asesor', 'message', { label: 'Dale, te conecto con un miembro de nuestro equipo de postventa 👤' }, 1280, 320);
  fb.node('ai-control-asesor', 'ai_control', { action: 'paused' }, 1600, 320);
  fb.node('end-asesor', 'end', { disableAutomation: true }, 1920, 320);
  fb.edge('msg-asesor', 'ai-control-asesor');
  fb.edge('ai-control-asesor', 'end-asesor');

  fb.node('msg-cambios', 'message', {
    label: 'Tenés 30 días desde la compra para hacer el cambio totalmente gratis. Podés iniciarlo desde tu cuenta en ' + STORE_URL + ' o coordinarlo con un asesor.',
  }, 640, -240);
  fb.menu('menu-cambios-siguiente', '¿Querés que te ayude un asesor a iniciar el cambio ahora?', [
    { id: 'si', text: 'Sí, hablar con un asesor', target: 'msg-asesor' },
    { id: 'no', text: 'No, gracias', target: 'end-cambios' },
  ], 960, -240);
  fb.edge('msg-cambios', 'menu-cambios-siguiente');
  fb.node('end-cambios', 'end', { disableAutomation: false }, 1280, -300);

  fb.node('collect-numero-pedido', 'collect', { label: '¿Cuál es tu número de pedido?', variable: 'numero_pedido' }, 640, -80);
  fb.node('msg-estado', 'message', {
    label: 'Gracias. Vamos a revisar el estado de tu pedido {{numero_pedido}} y te contactamos a la brevedad.',
  }, 960, -80);
  fb.node('ai-control-pedido', 'ai_control', { action: 'paused' }, 1280, -80);
  fb.node('end-pedido', 'end', { disableAutomation: true }, 1600, -80);
  fb.edge('collect-numero-pedido', 'msg-estado');
  fb.edge('msg-estado', 'ai-control-pedido');
  fb.edge('ai-control-pedido', 'end-pedido');

  fb.node('collect-detalle-reclamo', 'collect', { label: 'Contanos brevemente qué pasó con tu producto.', variable: 'detalle_reclamo' }, 640, 80);
  fb.node('msg-reclamo', 'message', {
    label: 'Gracias por contarnos. Derivamos tu reclamo a nuestro equipo y te vamos a responder a la brevedad.',
  }, 960, 80);
  fb.node('ai-control-reclamo', 'ai_control', { action: 'paused' }, 1280, 80);
  fb.node('end-reclamo', 'end', { disableAutomation: true }, 1600, 80);
  fb.edge('collect-detalle-reclamo', 'msg-reclamo');
  fb.edge('msg-reclamo', 'ai-control-reclamo');
  fb.edge('ai-control-reclamo', 'end-reclamo');

  fb.menu('menu-postventa', '¿En qué te podemos ayudar con tu compra?', [
    { id: 'cambios', text: 'Cambios y devoluciones', target: 'msg-cambios' },
    { id: 'pedido', text: 'Estado de mi pedido', target: 'collect-numero-pedido' },
    { id: 'reclamo', text: 'Reclamo o problema con un producto', target: 'collect-detalle-reclamo' },
    { id: 'asesor', text: 'Hablar con un asesor', target: 'msg-asesor' },
  ], 320, 0);

  return fb.flow();
}

// ---------------------------------------------------------------------------

function validatePrepared(name: string, flow: Flow) {
  const prepared = prepareAutomationFlowForSave({ nodes: flow.nodes as never[], edges: flow.edges as never[] });
  if (!prepared.success) {
    throw new Error(`${name}: ${prepared.errors.join('; ')}`);
  }
  const ids = new Set(prepared.nodes.map((node) => node.id));
  for (const edge of prepared.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      throw new Error(`${name}: arista inválida ${edge.id} (${edge.source} -> ${edge.target})`);
    }
  }
  return { nodes: prepared.nodes, edges: prepared.edges };
}

async function main() {
  console.log('Reemplazando el flujo genérico de Indumentaria por el de AZ Indumentaria...');

  await db.transaction(async (tx) => {
    // 1. Rename + rebrand the folder.
    await tx.update(automationFolders)
      .set({ name: 'INDUMENTARIA AZ', color: '#111827', updatedAt: new Date() })
      .where(and(eq(automationFolders.id, FOLDER_ID), eq(automationFolders.teamId, TEAM_ID)));
    console.log(`  Carpeta #${FOLDER_ID} renombrada a "INDUMENTARIA AZ".`);

    // 2. Delete the old generic demo automations for this folder.
    await tx.delete(automations).where(
      and(eq(automations.teamId, TEAM_ID), inArray(automations.id, OLD_AUTOMATION_IDS)),
    );
    console.log(`  Automatizaciones genéricas eliminadas: ${OLD_AUTOMATION_IDS.join(', ')}.`);

    // 3. Placeholder rows to get real cross-referenceable ids.
    const placeholder = (label: string) => [
      { id: 'placeholder-start', type: 'start', position: { x: 0, y: 0 }, data: { label, triggerType: 'fallback', keywords: [], conditions: {} } },
    ];

    const names = {
      inicio: 'Inicio AZ Indumentaria',
      catalogo: 'Catálogo AZ Indumentaria',
      asesoramiento: 'Asesoramiento AZ Indumentaria',
      reservas: 'Reservas AZ Indumentaria',
      postventa: 'Postventa AZ Indumentaria',
    } as const;

    const rows: Record<keyof typeof names, { id: number }> = {} as never;
    for (const key of Object.keys(names) as (keyof typeof names)[]) {
      const [row] = await tx.insert(automations).values({
        teamId: TEAM_ID, instanceId: INSTANCE_ID, folderId: FOLDER_ID,
        name: names[key],
        note: `Flujo AZ Indumentaria generado en base a ${STORE_URL}.`,
        nodes: placeholder('Start'), edges: [], isActive: false,
      }).returning({ id: automations.id });
      rows[key] = row;
    }

    const ids: Ids = {
      inicio: rows.inicio.id,
      catalogo: rows.catalogo.id,
      asesoramiento: rows.asesoramiento.id,
      reservas: rows.reservas.id,
      postventa: rows.postventa.id,
    };

    // 4. Build + validate + persist.
    const built: Record<keyof Ids, Flow> = {
      inicio: buildInicio(ids),
      catalogo: buildCatalogo(ids),
      asesoramiento: buildAsesoramiento(ids),
      reservas: buildReservas(ids),
      postventa: buildPostventa(ids),
    };

    for (const key of Object.keys(built) as (keyof Ids)[]) {
      const validated = validatePrepared(names[key], built[key]);
      await tx.update(automations)
        .set({ nodes: validated.nodes, edges: validated.edges, updatedAt: new Date() })
        .where(eq(automations.id, ids[key]));
      console.log(`  ✓ ${names[key]} (#${ids[key]}): ${validated.nodes.length} nodos, ${validated.edges.length} aristas.`);
    }
  });

  console.log('Listo. Flujo AZ Indumentaria creado como borrador (isActive=false) en la carpeta "INDUMENTARIA AZ".');
}

main()
  .catch((error) => {
    console.error('ERROR', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
