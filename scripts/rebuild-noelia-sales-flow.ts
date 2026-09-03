import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, inArray, lt, notLike } from 'drizzle-orm';
import { db, client } from '../lib/db/drizzle';
import {
  aiConfigs,
  automationSessions,
  automations,
  customFields,
  teamDocuments,
  users,
} from '../lib/db/schema';
import { prepareAutomationFlowForSave } from '../lib/automation/flow-normalizer';

const TEAM_ID = 2;
const INSTANCE_ID = 4;
const OWNER_EMAIL = 'noelia@whatspro.uno';
const V3_PREFIX = 'AAPP V3 · ';
const backupRoot = path.join(process.cwd(), '.backups', 'noelia-flow');
const WELCOME_MESSAGE = `¡Hola! 👋 Te damos la bienvenida a AAPP SPACE.

Ayudamos a emprendedores, profesionales y negocios a construir y mejorar su presencia digital, organizar su atención y convertir más consultas en oportunidades de venta.

Podemos acompañarte con:
🌐 Sitios web profesionales para presentar tus servicios y recibir consultas.
🛒 Tiendas online para exhibir productos y gestionar pedidos.
🎨 Contenido para redes sociales e identidad digital.
📣 Campañas publicitarias para llegar a nuevos clientes.
🤖 Automatizaciones y asistentes inteligentes para mejorar la atención.

No importa si ya sabés qué necesitás o si recién estás explorando opciones: vamos a orientarte paso a paso. Si ya sos cliente o tu consulta es diferente, también podés escribirnos con confianza y la dirigiremos a la persona indicada.

Para conocerte y ayudarte mejor, te haremos unas preguntas breves.`;

type NodeLike = { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> };
type EdgeLike = { id: string; source: string; target: string; sourceHandle?: string | null };
type Flow = { nodes: NodeLike[]; edges: EdgeLike[] };

const slug = (value: string) => value
  .normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

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
    options: Array<{ id: string; text: string; target: string; matchValue?: string }>,
    x: number,
    y: number,
    variable?: string,
  ) {
    this.node(id, 'menu_simple', {
      label,
      markerStyle: 'emoji_number',
      globalDelaySeconds: 0,
      variable,
      menuOptions: options.map(({ id: optionId, text, matchValue }) => ({
        id: optionId,
        text,
        ...(matchValue ? { matchType: 'text', matchOperator: 'equals', matchValue } : {}),
      })),
    }, x, y);
    for (const option of options) this.edge(id, option.target, `menu-${option.id}`);
    this.edge(id, id, 'fallback');
    return id;
  }

  flow(): Flow { return { nodes: this.nodes, edges: this.edges }; }
}

const startData = (triggerType: 'first_message' | 'exact_match' = 'first_message', keywords: string[] = []) => ({
  label: 'Inicio', triggerType, keywords, conditions: {},
});
const gotoData = (automationId: number, targetNodeId: string) => ({
  mode: 'other_flow', targetAutomationId: automationId, targetNodeId, fallbackAction: 'stop',
});
const saveData = (input: Record<string, unknown>) => ({
  nameVariable: undefined,
  agentId: 'null', departmentId: 'null', tagId: 'null', funnelStageId: 'null', customFields: {},
  ...input,
});

function addContactUpdateChain(
  builder: FlowBuilder,
  input: {
    baseId: string;
    previous: string;
    fields: Array<[string, string]>;
    x: number;
    y: number;
    metadata?: Record<string, unknown>;
  },
) {
  let previous = input.previous;
  let x = input.x;
  input.fields.forEach(([key, value], index) => {
    const nodeId = index === 0 ? input.baseId : `${input.baseId}-${slug(key)}`;
    builder.node(nodeId, 'save_contact', saveData({
      ...(index === 0 ? input.metadata : {}),
      customFields: { [key]: value },
    }), x, input.y);
    builder.edge(previous, nodeId);
    previous = nodeId;
    x += 380;
  });
  return { previous, x };
}

const CATALOG = {
  simple_site: { name: 'Sitio Web Simple', price: 40000, tagId: 1, renewal: true,
    detail: '🌐 SITIO WEB SIMPLE — $40.000\n\nHasta 25 servicios, reservas, galerías, formulario, editor, dominio el primer año y 0% de comisión. Publicación estimada: 24 a 48 horas desde que recibimos los datos.' },
  simple_store: { name: 'Tienda Online Simple', price: 40000, tagId: 2, renewal: true,
    detail: '🛒 TIENDA ONLINE SIMPLE — $40.000\n\nCarrito a WhatsApp, hasta 50 productos, stock, editor, dominio el primer año y 0% de comisión. Publicación estimada: 24 a 48 horas.' },
  simple_combo: { name: 'Combo Full Sitio + Tienda', price: 60000, tagId: 3, renewal: true,
    detail: '🔥 COMBO FULL — $60.000\n\nSitio de servicios + tienda en una plataforma: reservas, catálogo, carrito, editor, dominio el primer año y 0% de comisión. Ahorrás $20.000 frente a comprarlos por separado.' },
  pro_site: { name: 'Sitio Web Profesional', price: 200000, tagId: 5, renewal: false,
    detail: '🌐 SITIO WEB PROFESIONAL — $200.000\n\nDiseño a medida, información institucional, servicios, blog, equipo, portafolio, formulario avanzado y newsletter. Plazo estimado: 7 a 15 días.' },
  pro_store: { name: 'Tienda Online Profesional', price: 200000, tagId: 6, renewal: false,
    detail: '🛒 TIENDA ONLINE PROFESIONAL — $200.000\n\nDiseño a medida, Mercado Pago, punto de venta, stock, variantes, blog, carrito, zona de usuarios y hasta 100 productos. Plazo estimado: 7 a 15 días.' },
  pro_combo: { name: 'Combo Profesional', price: 250000, tagId: 6, renewal: false,
    detail: '💼 COMBO PROFESIONAL — $250.000\n\nSitio profesional + tienda profesional: diseño a medida, Mercado Pago, stock, variantes, usuarios, blog, servicios y estructura institucional completa.' },
  kit_basic: { name: 'Kit de contenido Básico', price: 30000, tagId: 9, renewal: false,
    detail: '🎨 KIT BÁSICO — $30.000\n\n2 posts + 2 historias profesionales, adaptados a la identidad de tu marca.' },
  kit_recommended: { name: 'Kit de contenido Recomendado', price: 40000, tagId: 10, renewal: false,
    detail: '🎨 KIT RECOMENDADO — $40.000\n\n3 posts + 3 historias profesionales. Es la opción con mejor relación calidad-precio.' },
  kit_premium: { name: 'Kit de contenido Premium', price: 50000, tagId: 11, renewal: false,
    detail: '🎨 KIT PREMIUM — $50.000\n\n4 posts + 4 historias profesionales para campañas, lanzamientos o mayor presencia.' },
  campaign: { name: 'Campaña Publicitaria', price: 100000, tagId: 12, renewal: false,
    detail: '📣 CAMPAÑA PUBLICITARIA — $100.000\n\nEstrategia, preparación y gestión de campaña. La inversión publicitaria se paga aparte directamente a la plataforma.' },
} as const;

const money = (amount: number) => `$${amount.toLocaleString('es-AR')}`;
const branchId = (key: string) => `close-${key}-entry`;
const MAIN_MENU_NODE = 'v3-main-menu';
const GENERIC_CALL_ENTRY = 'close-generic-call-entry';

function addFixedCloseBranch(builder: FlowBuilder, key: keyof typeof CATALOG, mainMenuAutomationId: number, row: number) {
  const product = CATALOG[key];
  const prefix = `close-${key}`;
  const y = row * 1420;
  const needsStoreDetails = ['simple_store', 'simple_combo', 'pro_store', 'pro_combo'].includes(key);
  const entry = builder.node(branchId(key), 'message', {
    label: `${product.detail}${product.renewal ? '\n\nRenovación: USD 60 por año, no negociable.' : ''}`,
    referenceName: product.name,
  }, 0, y);
  const select = builder.node(`${prefix}-select`, 'save_contact', saveData({
    agentId: '3', departmentId: '1', funnelStageId: '27', tagId: String(product.tagId),
    customFields: { producto_interes: product.name },
  }), 380, y);
  builder.edge(entry, select);
  let x = 760;
  const summary = builder.node(`${prefix}-summary`, 'collect', {
    label: key.startsWith('kit_')
      ? 'Contame el rubro, el estilo de tu marca y qué querés lograr con el contenido.'
      : key === 'campaign'
        ? '¿Qué querés promocionar y cuál es el objetivo principal de la campaña?'
        : 'Contame brevemente qué necesitás para tu proyecto.',
    variable: `project_summary_${key}`,
  }, x, y);
  builder.edge(select, summary);
  x += 380;
  const summarySave = builder.node(`${prefix}-summary-save`, 'save_contact', saveData({
    customFields: { resumen_proyecto: `{{project_summary_${key}}}` },
  }), x, y);
  builder.edge(summary, summarySave);
  let previous = summarySave;
  x += 380;

  if (needsStoreDetails) {
    const quantity = builder.node(`${prefix}-quantity`, 'collect', {
      label: '¿Cuántos productos aproximadamente querés publicar?',
      variable: `product_quantity_${key}`,
    }, x, y);
    builder.edge(previous, quantity); previous = quantity; x += 380;
    const quantitySave = builder.node(`${prefix}-quantity-save`, 'save_contact', saveData({
      customFields: { cantidad_productos: `{{product_quantity_${key}}}` },
    }), x, y);
    builder.edge(previous, quantitySave); previous = quantitySave; x += 380;
    const variants = builder.node(`${prefix}-variants`, 'collect', {
      label: '¿Necesitás variantes como talle, color o tamaño? Respondé SI o NO.',
      variable: `product_variants_${key}`,
    }, x, y);
    builder.edge(previous, variants); previous = variants; x += 380;
    const variantsSave = builder.node(`${prefix}-variants-save`, 'save_contact', saveData({
      customFields: { variantes_productos: `{{product_variants_${key}}}` },
    }), x, y);
    builder.edge(previous, variantsSave); previous = variantsSave; x += 380;
    const mercadoPago = builder.node(`${prefix}-mercadopago`, 'collect', {
      label: '¿Necesitás Mercado Pago integrado? Respondé SI o NO.',
      variable: `mercadopago_required_${key}`,
    }, x, y);
    builder.edge(previous, mercadoPago); previous = mercadoPago; x += 380;
    const mercadoPagoSave = builder.node(`${prefix}-mercadopago-save`, 'save_contact', saveData({
      customFields: { mercado_pago: `{{mercadopago_required_${key}}}` },
    }), x, y);
    builder.edge(previous, mercadoPagoSave); previous = mercadoPagoSave; x += 380;
    const shipping = builder.node(`${prefix}-shipping`, 'collect', {
      label: '¿Cómo manejás los envíos, entregas o retiros?',
      variable: `shipping_method_${key}`,
    }, x, y);
    builder.edge(previous, shipping); previous = shipping; x += 380;
    const shippingSave = builder.node(`${prefix}-shipping-save`, 'save_contact', saveData({
      customFields: { envios_retiros: `{{shipping_method_${key}}}` },
    }), x, y);
    builder.edge(previous, shippingSave); previous = shippingSave; x += 380;
  }
  const menuX = x;

  const fullMsg = `${prefix}-full-message`;
  const halfMsg = `${prefix}-half-message`;
  const callDay = `${prefix}-call-day`;
  const back = `${prefix}-back`;
  const menu = builder.menu(`${prefix}-menu`, '¿Cómo querés avanzar?', [
    { id: 'full', text: `Pagar el total (${money(product.price)})`, target: fullMsg },
    { id: 'half', text: `Reservar con una seña del 50% (${money(product.price / 2)})`, target: halfMsg },
    { id: 'call', text: 'Reservar una llamada con Noelia', target: callDay },
    { id: 'back', text: 'Volver al menú principal (también podés responder 0)', target: back, matchValue: '0' },
  ], menuX, y, `advance_${key}`);
  builder.edge(previous, menu);

  const addPaymentPath = (kind: 'full' | 'half', startNode: string, pathY: number) => {
    const paid = kind === 'full' ? product.price : product.price / 2;
    const startX = menuX + 380;
    builder.node(startNode, 'message', {
      label: `Perfecto. Transferí ${money(paid)} al alias:\n\nAlias: impulsodigitalmp\nA nombre de: Noelia Marisol Paz\n\nAdjuntá el comprobante y después escribí LISTO para dejarlo en revisión.`,
    }, startX, pathY);
    const paymentUpdates = addContactUpdateChain(builder, {
      baseId: `${prefix}-${kind}-save`, previous: startNode, x: startX + 380, y: pathY,
      metadata: { agentId: '3', departmentId: '1', funnelStageId: '28' },
      fields: [
        ['modalidad_avance', kind === 'full' ? 'Pago total' : 'Seña 50%'],
        ['monto', money(product.price)],
        ['sena', kind === 'half' ? money(paid) : 'No aplica'],
        ['cuotas', kind === 'full' ? '1' : '2'],
      ],
    });
    const receipt = builder.node(`${prefix}-${kind}-receipt`, 'collect', {
      label: 'Cuando hayas adjuntado la captura o foto del comprobante, respondé LISTO.',
      variable: `payment_receipt_ack_${key}_${kind}`,
    }, paymentUpdates.x, pathY);
    builder.edge(paymentUpdates.previous, receipt);
    const saveReceipt = builder.node(`${prefix}-${kind}-receipt-save`, 'save_contact', saveData({
      agentId: '3', departmentId: '1', funnelStageId: '29',
      customFields: { comprobante_enviado: 'true' },
    }), paymentUpdates.x + 380, pathY);
    builder.edge(receipt, saveReceipt);
    const done = builder.node(`${prefix}-${kind}-done`, 'message', {
      label: '✅ Recibido. El comprobante quedó pendiente de validación manual. Noelia continuará por este chat. Si querés iniciar otra consulta más adelante, escribí MENÚ.',
    }, paymentUpdates.x + 760, pathY);
    builder.edge(saveReceipt, done);
    const end = builder.node(`${prefix}-${kind}-end`, 'end', { disableAutomation: false }, paymentUpdates.x + 1140, pathY);
    builder.edge(done, end);
  };
  addPaymentPath('full', fullMsg, y - 360);
  addPaymentPath('half', halfMsg, y + 20);

  const callX = menuX + 380;
  builder.node(callDay, 'collect', { label: '¿Qué día preferís que te contacte Noelia?', variable: `call_day_${key}` }, callX, y + 400);
  const daySave = builder.node(`${prefix}-call-day-save`, 'save_contact', saveData({ customFields: { dia_contacto: `{{call_day_${key}}}` } }), callX + 380, y + 400);
  builder.edge(callDay, daySave);
  const callTime = builder.node(`${prefix}-call-time`, 'collect', { label: '¿En qué franja horaria?', variable: `call_time_${key}` }, callX + 760, y + 400);
  builder.edge(daySave, callTime);
  const timeSave = builder.node(`${prefix}-call-time-save`, 'save_contact', saveData({ customFields: { horario_contacto: `{{call_time_${key}}}` } }), callX + 1140, y + 400);
  builder.edge(callTime, timeSave);
  const callReason = builder.node(`${prefix}-call-reason`, 'collect', { label: '¿Hay algo más que Noelia deba saber antes de llamarte?', variable: `call_reason_${key}` }, callX + 1520, y + 400);
  builder.edge(timeSave, callReason);
  const reasonSave = builder.node(`${prefix}-call-reason-save`, 'save_contact', saveData({ customFields: { motivo_contacto: `{{call_reason_${key}}}` } }), callX + 1900, y + 400);
  builder.edge(callReason, reasonSave);
  const callSave = builder.node(`${prefix}-call-save`, 'save_contact', saveData({
    agentId: '3', departmentId: '1', funnelStageId: '47', tagId: String(product.tagId),
    customFields: { modalidad_avance: 'Reserva de llamada' },
  }), callX + 2280, y + 400);
  builder.edge(reasonSave, callSave);
  const callDone = builder.node(`${prefix}-call-done`, 'message', { label: '📅 Perfecto. La solicitud quedó asignada a Noelia y te responderá por este chat. Para volver a comenzar, escribí MENÚ.' }, callX + 2660, y + 400);
  builder.edge(callSave, callDone);
  const callEnd = builder.node(`${prefix}-call-end`, 'end', { disableAutomation: false }, callX + 3040, y + 400);
  builder.edge(callDone, callEnd);

  builder.node(back, 'go_to_node', gotoData(mainMenuAutomationId, MAIN_MENU_NODE), callX, y + 780);
}

function buildClosingFlow(mainMenuAutomationId: number) {
  const b = new FlowBuilder();
  const start = b.node('v3-closing-start', 'start', startData(), 0, -420);
  const internal = b.node('v3-closing-internal', 'message', { label: 'Este es un subflujo interno de cierres.' }, 380, -420);
  b.edge(start, internal);
  const internalEnd = b.node('v3-closing-internal-end', 'end', { disableAutomation: false }, 760, -420);
  b.edge(internal, internalEnd);
  (Object.keys(CATALOG) as Array<keyof typeof CATALOG>).forEach((key, index) => addFixedCloseBranch(b, key, mainMenuAutomationId, index));

  const y = Object.keys(CATALOG).length * 1420;
  b.node(GENERIC_CALL_ENTRY, 'collect', { label: 'Contame brevemente qué servicio necesitás o qué querés mejorar.', variable: 'project_summary_general' }, 0, y);
  const summarySave = b.node('generic-call-summary-save', 'save_contact', saveData({
    customFields: { resumen_proyecto: '{{project_summary_general}}' },
  }), 380, y);
  b.edge(GENERIC_CALL_ENTRY, summarySave);
  const day = b.node('generic-call-day', 'collect', { label: '¿Qué día preferís que te contacte Noelia?', variable: 'call_day_general' }, 760, y);
  b.edge(summarySave, day);
  const daySave = b.node('generic-call-day-save', 'save_contact', saveData({
    customFields: { dia_contacto: '{{call_day_general}}' },
  }), 1140, y);
  b.edge(day, daySave);
  const time = b.node('generic-call-time', 'collect', { label: '¿En qué franja horaria?', variable: 'call_time_general' }, 1520, y);
  b.edge(daySave, time);
  const timeSave = b.node('generic-call-time-save', 'save_contact', saveData({
    customFields: { horario_contacto: '{{call_time_general}}' },
  }), 1900, y);
  b.edge(time, timeSave);
  const reasonSave = b.node('generic-call-reason-save', 'save_contact', saveData({
    customFields: { motivo_contacto: '{{project_summary_general}}' },
  }), 2280, y);
  b.edge(timeSave, reasonSave);
  const save = b.node('generic-call-save', 'save_contact', saveData({
    agentId: '3', departmentId: '1', funnelStageId: '47',
    customFields: { modalidad_avance: 'Reserva de llamada' },
  }), 2660, y);
  b.edge(reasonSave, save);
  const done = b.node('generic-call-done', 'message', { label: '📅 Listo. Noelia recibió tu solicitud y continuará por este chat. Podés escribir MENÚ cuando quieras volver al inicio.' }, 3040, y);
  b.edge(save, done);
  const end = b.node('generic-call-end', 'end', { disableAutomation: false }, 3420, y);
  b.edge(done, end);
  return b.flow();
}

function buildEntryFlow(mainMenuAutomationId: number) {
  const b = new FlowBuilder();
  const start = b.node('v3-entry-start', 'start', startData('first_message'), 0, 0);
  const welcome = b.node('v3-entry-welcome', 'message', { label: WELCOME_MESSAGE }, 380, 0);
  b.edge(start, welcome);
  const name = b.node('v3-entry-name', 'collect', { label: '¿Cómo te llamás?', variable: 'contact_name' }, 760, 0); b.edge(welcome, name);
  const nameSave = b.node('v3-entry-name-save', 'save_contact', saveData({
    nameVariable: '{{contact_name}}', agentId: '3', departmentId: '1', funnelStageId: '27',
  }), 1140, 0); b.edge(name, nameSave);
  const email = b.node('v3-entry-email', 'collect', { label: '¿Cuál es tu email?', variable: 'contact_email' }, 1520, 0); b.edge(nameSave, email);
  const emailSave = b.node('v3-entry-email-save', 'save_contact', saveData({
    customFields: { email: '{{contact_email}}' },
  }), 1900, 0); b.edge(email, emailSave);
  const business = b.node('v3-entry-business', 'collect', { label: '¿Cómo se llama tu negocio o marca?', variable: 'business_name' }, 2280, 0); b.edge(emailSave, business);
  const businessSave = b.node('v3-entry-business-save', 'save_contact', saveData({
    customFields: { marca: '{{business_name}}' },
  }), 2660, 0); b.edge(business, businessSave);
  const category = b.node('v3-entry-category', 'collect', { label: '¿A qué se dedica tu negocio?', variable: 'business_category' }, 3040, 0); b.edge(businessSave, category);
  const categorySave = b.node('v3-entry-category-save', 'save_contact', saveData({
    customFields: { rubro: '{{business_category}}' },
  }), 3420, 0); b.edge(category, categorySave);
  const goal = b.node('v3-entry-goal', 'collect', { label: '¿Qué querés lograr: mostrar servicios, vender productos, ambas cosas o conseguir más clientes?', variable: 'business_goal' }, 3800, 0); b.edge(categorySave, goal);
  const save = b.node('v3-entry-save', 'save_contact', saveData({
    customFields: { objetivo_cliente: '{{business_goal}}' },
  }), 4180, 0); b.edge(goal, save);
  const go = b.node('v3-entry-go-menu', 'go_to_node', gotoData(mainMenuAutomationId, MAIN_MENU_NODE), 4560, 0); b.edge(save, go);
  return b.flow();
}

function buildRecoveryFlow(mainMenuAutomationId: number) {
  const b = new FlowBuilder();
  const start = b.node('v3-recovery-start', 'start', startData('exact_match', ['menu', 'menú', 'MENU', 'MENÚ', 'inicio', 'INICIO', 'volver', 'VOLVER', '0']), 0, 0);
  const pause = b.node('v3-recovery-pause-ai', 'ai_control', { action: 'paused' }, 380, 0); b.edge(start, pause);
  const go = b.node('v3-recovery-go-menu', 'go_to_node', gotoData(mainMenuAutomationId, MAIN_MENU_NODE), 760, 0); b.edge(pause, go);
  return b.flow();
}

function buildMainMenuFlow(ids: { simple: number; pro: number; marketing: number; ai: number; closing: number }) {
  const b = new FlowBuilder();
  const start = b.node('v3-main-start', 'start', startData(), 0, 0);
  const pause = b.node('v3-main-pause-ai', 'ai_control', { action: 'paused' }, 380, 0); b.edge(start, pause);
  const simple = b.node('v3-main-go-simple', 'go_to_node', gotoData(ids.simple, 'v3-simple-menu'), 1140, -500);
  const pro = b.node('v3-main-go-pro', 'go_to_node', gotoData(ids.pro, 'v3-pro-menu'), 1140, -250);
  const marketing = b.node('v3-main-go-marketing', 'go_to_node', gotoData(ids.marketing, 'v3-marketing-menu'), 1140, 0);
  const callSave = b.node('v3-main-call-save', 'save_contact', saveData({ agentId: '3', departmentId: '1', funnelStageId: '27', customFields: { producto_interes: 'Asesoramiento general' } }), 1140, 250);
  const ai = b.node('v3-main-go-ai', 'go_to_node', gotoData(ids.ai, 'v3-ai-message'), 1140, 500);
  const menu = b.menu(MAIN_MENU_NODE, '¿Qué necesitás?', [
    { id: 'simple', text: 'Sitio, tienda o Combo Full económico', target: simple },
    { id: 'pro', text: 'Solución profesional con diseño a medida', target: pro },
    { id: 'marketing', text: 'Contenido, publicidad u otros servicios', target: marketing },
    { id: 'call', text: 'Hablar o reservar una llamada con Noelia', target: callSave },
    { id: 'ai', text: 'Activar el asistente IA para una consulta libre', target: ai },
  ], 760, 0, 'main_menu_choice');
  b.edge(pause, menu);
  const callGo = b.node('v3-main-call-go', 'go_to_node', gotoData(ids.closing, GENERIC_CALL_ENTRY), 1520, 250); b.edge(callSave, callGo);
  return b.flow();
}

function buildProductMenuFlow(kind: 'simple' | 'pro', closingId: number, mainMenuId: number) {
  const b = new FlowBuilder();
  const startId = `v3-${kind}-start`;
  const menuId = `v3-${kind}-menu`;
  const start = b.node(startId, 'start', startData(), 0, 0);
  const keys: Array<keyof typeof CATALOG> = kind === 'simple'
    ? ['simple_site', 'simple_store', 'simple_combo']
    : ['pro_site', 'pro_store', 'pro_combo'];
  const targets = keys.map((key, index) => b.node(`v3-${kind}-go-${key}`, 'go_to_node', gotoData(closingId, branchId(key)), 760, (index - 1) * 280));
  const examples = kind === 'simple' ? b.node('v3-simple-examples', 'message', {
    label: '🌐 Ejemplos:\nhttps://agualoshermanos.com.ar/\nhttps://lauraintuitiva.uno\nhttps://julianperricone.uno/\n\n🛒 Tiendas:\nhttps://vanguardia.uno\nhttps://fersindumentaria.uno/\nhttps://cleanmas.uno/\n\nMás trabajos: https://aapp.space/clientes',
  }, 760, 560) : undefined;
  const back = b.node(`v3-${kind}-back`, 'go_to_node', gotoData(mainMenuId, MAIN_MENU_NODE), 760, kind === 'simple' ? 840 : 560);
  const options = keys.map((key, index) => ({ id: key, text: CATALOG[key].name, target: targets[index] }));
  if (examples) options.push({ id: 'examples' as keyof typeof CATALOG, text: 'Ver ejemplos' as string, target: examples } as never);
  const menu = b.menu(menuId, kind === 'simple' ? 'Elegí el plan que querés conocer:' : 'Elegí la solución profesional:', [
    ...options.map((item) => ({ id: String(item.id), text: item.text, target: item.target })),
    { id: 'back', text: 'Volver al menú principal (respondé 0)', target: back, matchValue: '0' },
  ], 380, 0, `${kind}_product_choice`);
  b.edge(start, menu);
  if (examples) b.edge(examples, menu);
  return b.flow();
}

function buildMarketingFlow(closingId: number, mainMenuId: number) {
  const b = new FlowBuilder();
  const start = b.node('v3-marketing-start', 'start', startData(), 0, 0);
  const fixedKeys: Array<keyof typeof CATALOG> = ['kit_basic', 'kit_recommended', 'kit_premium', 'campaign'];
  const targets = fixedKeys.map((key, index) => b.node(`v3-marketing-go-${key}`, 'go_to_node', gotoData(closingId, branchId(key)), 760, (index - 2) * 240));
  const quoteServices = [
    { id: 'community', name: 'Community Manager', tagId: 26 },
    { id: 'seo', name: 'SEO y posicionamiento', tagId: 1 },
    { id: 'leads', name: 'Automatización de leads', tagId: 8 },
    { id: 'custom', name: 'Desarrollo a medida', tagId: 7 },
  ];
  const quoteTargets = quoteServices.map((service, index) => {
    const save = b.node(`v3-marketing-${service.id}-save`, 'save_contact', saveData({
      agentId: '3', departmentId: '1', funnelStageId: '27', tagId: String(service.tagId),
      customFields: { producto_interes: service.name },
    }), 760, 520 + index * 240);
    const go = b.node(`v3-marketing-${service.id}-go`, 'go_to_node', gotoData(closingId, GENERIC_CALL_ENTRY), 1140, 520 + index * 240);
    b.edge(save, go);
    return save;
  });
  const back = b.node('v3-marketing-back', 'go_to_node', gotoData(mainMenuId, MAIN_MENU_NODE), 760, 1560);
  const menu = b.menu('v3-marketing-menu', 'Elegí el servicio que más te interesa. Los servicios sin precio fijo se revisan con Noelia:', [
    ...fixedKeys.map((key, index) => ({ id: key, text: CATALOG[key].name, target: targets[index] })),
    ...quoteServices.map((service, index) => ({ id: service.id, text: `${service.name} — a cotizar`, target: quoteTargets[index] })),
    { id: 'back', text: 'Volver al menú principal (respondé 0)', target: back, matchValue: '0' },
  ], 380, 0, 'marketing_service_choice');
  b.edge(start, menu);
  return b.flow();
}

function buildAIFlow() {
  const b = new FlowBuilder();
  const start = b.node('v3-ai-start', 'start', startData(), 0, 0);
  const message = b.node('v3-ai-message', 'message', { label: '🤖 Asistente activado. Escribime tu consulta libre. Cuando quieras volver a las opciones, escribí MENÚ.' }, 380, 0); b.edge(start, message);
  const active = b.node('v3-ai-active', 'ai_control', { action: 'active' }, 760, 0); b.edge(message, active);
  const end = b.node('v3-ai-end', 'end', { disableAutomation: false }, 1140, 0); b.edge(active, end);
  return b.flow();
}

const canonicalKnowledge = `AGENTE COMERCIAL AAPP SPACE — FUENTE CANÓNICA V3

Rol: asesor comercial argentino, claro, breve y con voseo. No inventar funciones, precios ni plazos.

CATÁLOGO
- Sitio Web Simple: $40.000. Hasta 25 servicios, reservas, galerías, formulario, editor y dominio el primer año.
- Tienda Online Simple: $40.000. Carrito a WhatsApp, hasta 50 productos, stock, editor y dominio el primer año.
- Combo Full: $60.000. Sitio + tienda. Ahorra $20.000 frente a comprarlos por separado.
- Renovación de productos simples: USD 60 por año, fija y no negociable.
- Sitio Web Profesional: $200.000.
- Tienda Online Profesional: $200.000. Mercado Pago, punto de venta, stock, variantes, usuarios y hasta 100 productos.
- Combo Profesional: $250.000.
- Kit de contenido: 2+2 $30.000; 3+3 $40.000; 4+4 $50.000.
- Campaña Publicitaria: $100.000. La inversión en anuncios se paga aparte.
- Community Manager, SEO, automatización de leads y desarrollo a medida: derivar a Noelia para cotizar.

PAGO
Priorizar transferencia. Alias: impulsodigitalmp. Titular: Noelia Marisol Paz.
Ofrecer pago total, seña 50% o reserva de llamada. Nunca confirmar un pago por IA: el comprobante queda en revisión manual.
Link de pago solo si lo solicitan y avisando recargo de 15% a 20%.

PLAZOS
Productos simples: 24 a 48 horas desde que se reciben los datos.
Profesionales: 7 a 15 días. Desarrollo a medida: requiere estimación de Noelia.

DERIVAR
Derivar por integraciones, AFIP, logística, membresías, roles complejos, más de 100 productos, descuentos mayores al 10%, asuntos legales, clientes molestos o cualquier dato no confirmado.

CONVERSACIÓN
Diagnóstico corto, recomendación clara, precio y beneficio, forma de avance. Una idea por mensaje. Para volver al flujo determinístico indicar MENÚ.`;

async function checksum(filePath: string) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(backupRoot, timestamp);
  await mkdir(path.join(dir, 'ai-attachments'), { recursive: true, mode: 0o700 });
  const [automationRows, sessionRows, fieldRows, aiRow, documentRows] = await Promise.all([
    db.select().from(automations).where(eq(automations.teamId, TEAM_ID)),
    db.select({ id: automationSessions.id, automationId: automationSessions.automationId, chatId: automationSessions.chatId, currentNodeId: automationSessions.currentNodeId, status: automationSessions.status, updatedAt: automationSessions.updatedAt }).from(automationSessions).where(eq(automationSessions.teamId, TEAM_ID)),
    db.select().from(customFields).where(eq(customFields.teamId, TEAM_ID)),
    db.query.aiConfigs.findFirst({ where: eq(aiConfigs.teamId, TEAM_ID) }),
    db.select().from(teamDocuments).where(and(eq(teamDocuments.teamId, TEAM_ID), notLike(teamDocuments.slug, '%credencial%'))),
  ]);
  const safeAi = aiRow ? { ...aiRow, apiKey: '[PRESERVED_NOT_EXPORTED]' } : null;
  await writeFile(path.join(dir, 'snapshot.json'), JSON.stringify({
    createdAt: new Date().toISOString(), teamId: TEAM_ID, ownerEmail: OWNER_EMAIL,
    automations: automationRows, sessions: sessionRows, customFields: fieldRows, aiConfig: safeAi, documents: documentRows,
  }, null, 2), { mode: 0o600 });
  const copied: Array<{ source: string; backup: string; sha256: string }> = [];
  for (const attachment of (aiRow?.attachments as Array<{ name: string; url: string }> | null) ?? []) {
    if (!attachment.url.startsWith('/uploads/ai-attachments/')) continue;
    const source = path.join(process.cwd(), 'public', attachment.url);
    const backup = path.join(dir, 'ai-attachments', path.basename(attachment.url));
    try {
      await copyFile(source, backup);
      copied.push({ source: attachment.url, backup: path.relative(dir, backup), sha256: await checksum(backup) });
    } catch (error) {
      console.warn(`No se pudo respaldar ${attachment.name}:`, error);
    }
  }
  await writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ files: copied }, null, 2), { mode: 0o600 });
  await chmod(dir, 0o700);
  return dir;
}

function validatePrepared(name: string, flow: Flow) {
  const prepared = prepareAutomationFlowForSave({ nodes: flow.nodes as never[], edges: flow.edges });
  if (!prepared.success) throw new Error(`${name}: ${prepared.errors.join('; ')}`);
  const ids = new Set(prepared.nodes.map((node) => node.id));
  for (const edge of prepared.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) throw new Error(`${name}: arista inválida ${edge.id}`);
  }
  return { nodes: prepared.nodes, edges: prepared.edges };
}

async function restore(backupDir: string) {
  const snapshot = JSON.parse(await readFile(path.join(backupDir, 'snapshot.json'), 'utf8'));
  if (snapshot.teamId !== TEAM_ID || snapshot.ownerEmail !== OWNER_EMAIL) throw new Error('El respaldo no corresponde a Noelia/equipo 2.');
  await db.transaction(async (tx) => {
    await tx.delete(automations).where(and(eq(automations.teamId, TEAM_ID), inArray(automations.name, (await tx.select({ name: automations.name }).from(automations).where(and(eq(automations.teamId, TEAM_ID), inArray(automations.name, Object.values(FLOW_NAMES))))).map((row) => row.name))));
    for (const row of snapshot.automations) {
      await tx.update(automations).set({ name: row.name, instanceId: row.instanceId, triggerKeyword: row.triggerKeyword, note: row.note, nodes: row.nodes, edges: row.edges, isActive: row.isActive, updatedAt: new Date(row.updatedAt) }).where(and(eq(automations.id, row.id), eq(automations.teamId, TEAM_ID)));
    }
    if (snapshot.aiConfig) {
      await tx.update(aiConfigs).set({ isActive: snapshot.aiConfig.isActive, provider: snapshot.aiConfig.provider, model: snapshot.aiConfig.model, systemPrompt: snapshot.aiConfig.systemPrompt, attachments: snapshot.aiConfig.attachments, temperature: snapshot.aiConfig.temperature, maxOutputTokens: snapshot.aiConfig.maxOutputTokens, updatedAt: new Date() }).where(eq(aiConfigs.teamId, TEAM_ID));
    }
  });
  console.log(`Restauración aplicada desde ${backupDir}. Las sesiones no se reabrieron automáticamente.`);
}

const FLOW_NAMES = {
  entry: `${V3_PREFIX}Inicio y diagnóstico`, recovery: `${V3_PREFIX}Volver al menú`, main: `${V3_PREFIX}Menú principal`,
  simple: `${V3_PREFIX}Planes simples`, pro: `${V3_PREFIX}Planes profesionales`, marketing: `${V3_PREFIX}Marketing y otros`,
  ai: `${V3_PREFIX}Asistente IA`, closing: `${V3_PREFIX}Cierres y reservas`,
} as const;

async function updateWelcomeMessage() {
  const rows = await db.select({ id: automations.id, name: automations.name, nodes: automations.nodes })
    .from(automations)
    .where(and(
      eq(automations.teamId, TEAM_ID),
      inArray(automations.name, ['COMIENZO', FLOW_NAMES.entry]),
    ));
  const updates: Array<{ id: number; name: string; nodes: NodeLike[]; nodeId: string }> = [];
  for (const row of rows) {
    let nodeId = '';
    const nodes = (row.nodes as NodeLike[]).map((node) => {
      const label = String(node.data?.label ?? '');
      const isTarget = node.id === 'v3-entry-welcome'
        || label.startsWith('¡Hola! 😊 Gracias por comunicarte con AAPP SPACE.');
      if (!isTarget) return node;
      nodeId = node.id;
      return { ...node, data: { ...node.data, label: WELCOME_MESSAGE } };
    });
    if (nodeId) updates.push({ id: row.id, name: row.name, nodes, nodeId });
  }
  if (!updates.some((row) => row.name === 'COMIENZO')) {
    throw new Error('No se encontró la bienvenida directa de la automatización COMIENZO.');
  }
  if (!updates.some((row) => row.name === FLOW_NAMES.entry)) {
    throw new Error(`No se encontró la bienvenida de ${FLOW_NAMES.entry}.`);
  }
  const backupDir = await createBackup();
  await db.transaction(async (tx) => {
    for (const update of updates) {
      await tx.update(automations)
        .set({ nodes: update.nodes, updatedAt: new Date() })
        .where(and(eq(automations.id, update.id), eq(automations.teamId, TEAM_ID)));
    }
  });
  await writeFile(path.join(backupDir, 'welcome-applied.json'), JSON.stringify({
    appliedAt: new Date().toISOString(),
    updated: updates.map(({ id, name, nodeId }) => ({ id, name, nodeId })),
  }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ success: true, backupDir, updated: updates.map(({ id, name, nodeId }) => ({ id, name, nodeId })) }, null, 2));
}

async function apply() {
  const owner = await db.query.users.findFirst({ where: eq(users.email, OWNER_EMAIL) });
  if (!owner || owner.id !== 3) throw new Error('No se encontró la cuenta esperada de Noelia.');
  const existingV3 = await db.query.automations.findFirst({ where: and(eq(automations.teamId, TEAM_ID), inArray(automations.name, Object.values(FLOW_NAMES))) });
  if (existingV3) throw new Error(`Ya existe ${existingV3.name}; no se aplicó una segunda copia.`);

  const backupDir = await createBackup();
  console.log(`Respaldo creado: ${backupDir}`);
  const knowledgeDir = path.join(process.cwd(), 'public', 'uploads', 'ai-attachments');
  await mkdir(knowledgeDir, { recursive: true });
  const knowledgeName = `aapp-space-canon-v3-${Date.now()}.txt`;
  const knowledgePath = path.join(knowledgeDir, knowledgeName);
  await writeFile(knowledgePath, canonicalKnowledge, { mode: 0o600 });

  const created = await db.transaction(async (tx) => {
    const customFieldSpecs = [
      ['Objetivo del cliente', 'objetivo_cliente', 'text'], ['Producto de interés', 'producto_interes', 'text'],
      ['Modalidad de avance', 'modalidad_avance', 'text'], ['Resumen del proyecto', 'resumen_proyecto', 'text'],
      ['Cantidad de productos', 'cantidad_productos', 'text'], ['Variantes de productos', 'variantes_productos', 'boolean'],
      ['Mercado Pago', 'mercado_pago', 'boolean'], ['Envíos o retiros', 'envios_retiros', 'text'],
      ['Día de contacto', 'dia_contacto', 'text'], ['Horario de contacto', 'horario_contacto', 'text'],
      ['Motivo de contacto', 'motivo_contacto', 'text'], ['Comprobante enviado', 'comprobante_enviado', 'boolean'],
    ] as const;
    const existingFields = await tx.select().from(customFields).where(eq(customFields.teamId, TEAM_ID));
    let position = Math.max(-1, ...existingFields.map((field) => field.position)) + 1;
    for (const [name, key, type] of customFieldSpecs) {
      if (existingFields.some((field) => field.key === key)) continue;
      await tx.insert(customFields).values({ teamId: TEAM_ID, name, key, type, position: position++ });
    }

    const ids: Record<keyof typeof FLOW_NAMES, number> = {} as never;
    for (const [key, name] of Object.entries(FLOW_NAMES) as Array<[keyof typeof FLOW_NAMES, string]>) {
      const [row] = await tx.insert(automations).values({
        teamId: TEAM_ID, instanceId: INSTANCE_ID, name, note: 'Flujo comercial V3 generado con respaldo y catálogo canónico.',
        nodes: [{ id: 'placeholder-start', type: 'start', position: { x: 0, y: 0 }, data: startData() }], edges: [], isActive: false,
      }).returning({ id: automations.id });
      ids[key] = row.id;
    }

    const flows: Record<keyof typeof FLOW_NAMES, Flow> = {
      entry: buildEntryFlow(ids.main), recovery: buildRecoveryFlow(ids.main),
      main: buildMainMenuFlow({ simple: ids.simple, pro: ids.pro, marketing: ids.marketing, ai: ids.ai, closing: ids.closing }),
      simple: buildProductMenuFlow('simple', ids.closing, ids.main), pro: buildProductMenuFlow('pro', ids.closing, ids.main),
      marketing: buildMarketingFlow(ids.closing, ids.main), ai: buildAIFlow(), closing: buildClosingFlow(ids.main),
    };
    for (const [key, flow] of Object.entries(flows) as Array<[keyof typeof flows, Flow]>) {
      const validated = validatePrepared(FLOW_NAMES[key], flow);
      await tx.update(automations).set({ nodes: validated.nodes, edges: validated.edges, updatedAt: new Date() }).where(eq(automations.id, ids[key]));
    }

    await tx.update(automations).set({ isActive: false, updatedAt: new Date() }).where(and(eq(automations.teamId, TEAM_ID), eq(automations.isActive, true)));
    await tx.update(automations).set({ isActive: true, updatedAt: new Date() }).where(inArray(automations.id, [ids.entry, ids.recovery]));
    await tx.update(automationSessions).set({ status: 'completed', updatedAt: new Date() }).where(and(eq(automationSessions.teamId, TEAM_ID), eq(automationSessions.status, 'active'), lt(automationSessions.updatedAt, new Date(Date.now() - 48 * 60 * 60 * 1000))));
    await tx.update(aiConfigs).set({
      isActive: false,
      systemPrompt: canonicalKnowledge,
      attachments: [{ name: 'AAPP_SPACE_CANON_V3.txt', url: `/uploads/ai-attachments/${knowledgeName}`, type: 'text/plain', size: Buffer.byteLength(canonicalKnowledge) }],
      temperature: '0.3', maxOutputTokens: 700, updatedAt: new Date(),
    }).where(eq(aiConfigs.teamId, TEAM_ID));
    return ids;
  });

  await writeFile(path.join(backupDir, 'applied.json'), JSON.stringify({ appliedAt: new Date().toISOString(), created, knowledgePath }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ success: true, backupDir, created }, null, 2));
}

async function refreshV3() {
  const rows = await db.select({ id: automations.id, name: automations.name })
    .from(automations)
    .where(and(eq(automations.teamId, TEAM_ID), inArray(automations.name, Object.values(FLOW_NAMES))));
  if (rows.length !== Object.keys(FLOW_NAMES).length) {
    throw new Error(`Se esperaban ${Object.keys(FLOW_NAMES).length} flujos V3 y se encontraron ${rows.length}.`);
  }
  const idByName = new Map(rows.map((row) => [row.name, row.id]));
  const ids = Object.fromEntries(
    (Object.entries(FLOW_NAMES) as Array<[keyof typeof FLOW_NAMES, string]>).map(([key, name]) => [key, idByName.get(name)!]),
  ) as Record<keyof typeof FLOW_NAMES, number>;
  const flows: Record<keyof typeof FLOW_NAMES, Flow> = {
    entry: buildEntryFlow(ids.main), recovery: buildRecoveryFlow(ids.main),
    main: buildMainMenuFlow({ simple: ids.simple, pro: ids.pro, marketing: ids.marketing, ai: ids.ai, closing: ids.closing }),
    simple: buildProductMenuFlow('simple', ids.closing, ids.main), pro: buildProductMenuFlow('pro', ids.closing, ids.main),
    marketing: buildMarketingFlow(ids.closing, ids.main), ai: buildAIFlow(), closing: buildClosingFlow(ids.main),
  };
  const prepared = Object.fromEntries(
    (Object.entries(flows) as Array<[keyof typeof flows, Flow]>).map(([key, flow]) => [key, validatePrepared(FLOW_NAMES[key], flow)]),
  ) as Record<keyof typeof flows, { nodes: NodeLike[]; edges: EdgeLike[] }>;
  dryValidateCrossReferences(prepared, ids);
  const backupDir = await createBackup();
  await db.transaction(async (tx) => {
    for (const key of Object.keys(FLOW_NAMES) as Array<keyof typeof FLOW_NAMES>) {
      await tx.update(automations).set({ nodes: prepared[key].nodes, edges: prepared[key].edges, updatedAt: new Date() })
        .where(and(eq(automations.id, ids[key]), eq(automations.teamId, TEAM_ID)));
    }
  });
  await writeFile(path.join(backupDir, 'refresh-applied.json'), JSON.stringify({ refreshedAt: new Date().toISOString(), ids }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ success: true, refreshed: ids, backupDir }, null, 2));
}

function dryValidateCrossReferences(
  prepared: Record<keyof typeof FLOW_NAMES, { nodes: NodeLike[]; edges: EdgeLike[] }>,
  ids: Record<keyof typeof FLOW_NAMES, number>,
) {
  const keyById = new Map(Object.entries(ids).map(([key, id]) => [id, key as keyof typeof FLOW_NAMES]));
  for (const [flowKey, flow] of Object.entries(prepared) as Array<[keyof typeof prepared, typeof prepared[keyof typeof prepared]]>) {
    const variables = new Set<string>();
    for (const node of flow.nodes) {
      if (node.type === 'collect') {
        const variable = String(node.data.variable ?? '');
        if (variables.has(variable)) throw new Error(`${flowKey}: variable collect repetida ${variable}`);
        variables.add(variable);
      }
      if (node.type === 'save_contact') {
        const keys = Object.keys((node.data.customFields ?? {}) as Record<string, unknown>);
        if (keys.length > 1) {
          throw new Error(`${flowKey}/${node.id}: Guardar contacto actualiza más de un dato (${keys.join(', ')})`);
        }
      }
      if (node.type !== 'go_to_node' || node.data.mode !== 'other_flow') continue;
      const targetId = Number(node.data.targetAutomationId);
      const targetKey = keyById.get(targetId);
      if (!targetKey) throw new Error(`${flowKey}: automatización destino desconocida ${targetId}`);
      const targetNode = String(node.data.targetNodeId ?? '');
      if (!prepared[targetKey].nodes.some((candidate) => candidate.id === targetNode)) {
        throw new Error(`${flowKey}: nodo destino inexistente ${targetKey}/${targetNode}`);
      }
    }
  }
}

function dryRun() {
  const ids: Record<keyof typeof FLOW_NAMES, number> = {
    entry: 9001, recovery: 9002, main: 9003, simple: 9004,
    pro: 9005, marketing: 9006, ai: 9007, closing: 9008,
  };
  const flows: Record<keyof typeof FLOW_NAMES, Flow> = {
    entry: buildEntryFlow(ids.main), recovery: buildRecoveryFlow(ids.main),
    main: buildMainMenuFlow({ simple: ids.simple, pro: ids.pro, marketing: ids.marketing, ai: ids.ai, closing: ids.closing }),
    simple: buildProductMenuFlow('simple', ids.closing, ids.main), pro: buildProductMenuFlow('pro', ids.closing, ids.main),
    marketing: buildMarketingFlow(ids.closing, ids.main), ai: buildAIFlow(), closing: buildClosingFlow(ids.main),
  };
  const prepared = Object.fromEntries(
    (Object.entries(flows) as Array<[keyof typeof flows, Flow]>).map(([key, flow]) => [key, validatePrepared(FLOW_NAMES[key], flow)]),
  ) as Record<keyof typeof flows, { nodes: NodeLike[]; edges: EdgeLike[] }>;
  dryValidateCrossReferences(prepared, ids);
  console.log(JSON.stringify(Object.fromEntries(
    (Object.entries(prepared) as Array<[string, { nodes: NodeLike[]; edges: EdgeLike[] }]>).map(([key, flow]) => [key, { nodes: flow.nodes.length, edges: flow.edges.length }]),
  ), null, 2));
  console.log('Dry-run V3 correcto: esquema, referencias cruzadas y variables collect validadas.');
}

async function main() {
  const restoreIndex = process.argv.indexOf('--restore');
  try {
    if (restoreIndex >= 0) {
      const dir = process.argv[restoreIndex + 1];
      if (!dir) throw new Error('Indicá la carpeta del respaldo después de --restore.');
      await restore(path.resolve(dir));
    } else if (process.argv.includes('--dry-run')) {
      dryRun();
    } else if (process.argv.includes('--update-welcome')) {
      await updateWelcomeMessage();
    } else if (process.argv.includes('--refresh-v3')) {
      await refreshV3();
    } else {
      await apply();
    }
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
