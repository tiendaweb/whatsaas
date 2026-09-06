/**
 * Siembra las skills del Prompt Studio (P1–P9 del doc 07, más las de uso
 * diario) como prompts `qa.*` del equipo 2. Idempotente por key y versionado
 * como `upsertSkill`: si la versión activa ya dice exactamente esto, no toca
 * nada; si cambió algo, retira la activa y crea la versión siguiente (nunca
 * pisa una versión: el historial del Prompt Studio tiene que poder mostrar
 * qué decía cada corrida).
 *
 * La metadata es lo que hace que una skill se pueda usar sin leer su texto:
 * `recurrence` la separa entre rutina y acción puntual, `execution` decide si
 * la corre la IA del equipo o un conector, `scope` dónde se lanza, `variables`
 * qué datos pide y `recommendFor` en qué chats aparece sola.
 *
 *   npx tsx scripts/seed-sales-ops-quick-actions.ts
 */
import 'dotenv/config';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamPrompts } from '@/lib/db/schema';
import { PROMPT_P9 } from '@/lib/plugins/sales-ops/shared/prompt-p9';
import type { SkillCategory, SkillExecution, SkillIcon, SkillRecommendFor, SkillRecurrence, SkillScope, SkillVariable } from '@/lib/plugins/sales-ops/shared/skills';

const TEAM_ID = 2;
const USER_ID = 3;

const REGLAS = `REGLAS DEL COMMAND CENTER COMERCIAL: WhatsPro es la fuente, leé antes de escribir. Podés corregir el CRM del contacto que estás trabajando (etapa, etiquetas, campos, con whatspro_change_crm_stage / whatspro_set_contact_tags / whatspro_set_custom_fields), sólo lo que contradice ese chat y de a uno; nada en lote (nunca whatspro_crm_bulk_* sin pedido explícito). No prendas ni apagues automatizaciones ni borres nada (whatspro_manage_automation*, whatspro_chat_trigger_automation, whatspro_delete_record quedan afuera). El historial del chat es la evidencia; etiquetas y campos son hipótesis. Citá evidencia (ids de mensajes). No reabras decisiones tomadas. Un envío inmediato sólo desde una fila aprobada y con su idempotency_key, uno por llamada; un programado, una tarea o una demo dentro de un pedido aprobado salen directo, lo que proponés por tu cuenta espera aprobación. Cobros: sólo con whatspro_sales_register_payment desde una fila aprobada o por pedido explícito de una persona, nunca por deducción del chat. Teléfonos: últimos 4 dígitos. CONTEXTO DISPONIBLE: whatspro_sales_dossier trae el historial recortado, las notas internas (who: nota), los campos personalizados del contacto (contact.customData) y lo comercial; podés ampliar con whatspro_private_notes {contact_id} y whatspro_custom_fields, y agregar notas con whatspro_add_internal_note (no es CRM: el cliente no la ve).`;

type SeedSkill = {
  key: string;
  title: string;
  text: string;
  toolChain: string[];
  notes?: string;
  description: string;
  category: SkillCategory;
  icon: SkillIcon;
  recurrence: SkillRecurrence;
  execution: SkillExecution;
  scope: SkillScope;
  variables?: SkillVariable[];
  recommendFor?: SkillRecommendFor;
  pinned?: boolean;
};

const ACTIONS: SeedSkill[] = [
  {
    key: 'qa.p9-drenar-cola',
    description: "Trabaja todo lo que la cola tenga pendiente: prompts encolados, envíos aprobados, clasificaciones, respuestas y audios.",
    category: 'auditoria',
    icon: 'zap',
    recurrence: 'daily',
    execution: 'connector',
    scope: 'team',
    pinned: true,
    title: 'P9 · Drenar la cola de trabajo',
    toolChain: ['whatspro_sales_work_queue', 'whatspro_sales_dossier', 'whatspro_sales_classification_write', 'whatspro_chat_send_message', 'whatspro_sales_queue_result', 'whatspro_sales_signal_write', 'whatspro_sales_prompt_result'],
    text: `${REGLAS}\n\n${PROMPT_P9}`,
  },
  {
    key: 'qa.p1-prefiltro-dinero',
    description: "Encuentra los chats donde hay plata detenida y los clasifica de a uno.",
    category: 'cobro',
    icon: 'coins',
    recurrence: 'weekly',
    execution: 'connector',
    scope: 'team',
    title: 'P1 · Prefiltro de dinero (Frente 1)',
    toolChain: ['whatspro_sales_pending', 'whatspro_sales_dossier', 'whatspro_sales_classification_write'],
    text: `${REGLAS}\n\nPedí whatspro_sales_pending {source: "prefiltro", limit: 30}: son los chats donde probablemente hay plata detenida (nosotros mandamos alias/CBU/comprobante, radar P1, deals abiertos, etiqueta de producto sin cliente vinculado). Para cada uno: whatspro_sales_dossier {chat_id} → clasificá con el prompt sales-ops.classify → whatspro_sales_classification_write. Al final, resumí en una tabla: nombre · gate · prioridad · siguiente acción · responsable, ordenada por prioridad.`,
  },
  {
    key: 'qa.p2-auditar-chat',
    description: "Audita un chat y le fija gate, atributos y siguiente acción con evidencia citada.",
    category: 'auditoria',
    icon: 'search',
    recurrence: 'on_demand',
    execution: 'connector',
    scope: 'chat',
    pinned: true,
    title: 'P2 · Auditar y clasificar un chat',
    toolChain: ['whatspro_sales_dossier', 'whatspro_sales_classification_write'],
    text: `${REGLAS}\n\nPara el chat indicado en CONTEXTO: whatspro_sales_dossier {chat_id} y aplicá las reglas R1–R5 del Command Center (cliente existente → G11; entrada muerta → G0; nunca contestado → G0 "Responder ya"; rechazo explícito → GX; pago pendiente → mínimo G9 / G10 si el bloqueo es nuestro). Si ninguna decide, elegí G1..G8 por el punto más alto con evidencia DEL CLIENTE. Devolvé el JSON del contrato y guardalo con whatspro_sales_classification_write {chat_id, classification, connector}. Contame en 3 líneas qué encontraste y cuál es la siguiente acción.`,
  },
  {
    key: 'qa.p4-armar-cola',
    description: "Propone los lotes de la semana con dry run, para que una persona los apruebe.",
    category: 'seguimiento',
    icon: 'calendar',
    recurrence: 'weekly',
    execution: 'connector',
    scope: 'team',
    title: 'P4 · Proponer lotes de la semana',
    toolChain: ['whatspro_sales_queue_propose', 'whatspro_sales_queue_list'],
    text: `${REGLAS}\n\nArmá los lotes de la semana con whatspro_sales_queue_propose, SIEMPRE primero con dry_run: true para ver incluidos y excluidos: (1) "Cierre G10" gates [G10] rol carlos, mensaje individual que continúa desde el último compromiso; (2) "Cobro G9" gates [G9] rol carlos, reenviar datos de pago y confirmar el plan elegido; (3) "Reactivación G4-G5" gates [G4,G5] rol noelia con A/B (variant_split) retomando el precio conocido; (4) "Último intento G0-G3" gates [G0,G1,G2,G3] rol noelia, texto corto que pide una respuesta de una palabra, excluyendo quien tiene 3+ impactos. Usá variables {{nombre}}, {{plan}}, {{precio}}. Después del dry run, proponé de verdad y contame cuántos entraron a cada lote y por qué quedaron afuera los excluidos. NO aprobás: eso lo hace una persona en la vista Cola.`,
  },
  {
    key: 'qa.p5-ejecutar-aprobados',
    description: "Envía uno por uno lo que ya aprobó una persona, verificando antes que el cliente no haya escrito.",
    category: 'seguimiento',
    icon: 'zap',
    recurrence: 'daily',
    execution: 'connector',
    scope: 'team',
    title: 'P5 · Ejecutar envíos aprobados (uno por uno)',
    toolChain: ['whatspro_sales_work_queue', 'whatspro_chat_send_message', 'whatspro_sales_queue_result'],
    text: `${REGLAS}\n\nPedí whatspro_sales_work_queue {kinds: ["execute_action"]}. Por cada envío aprobado: verificá con whatspro_list_records messages {chatId, fromMe: false, limit: 1} que el cliente no escribió después de approvedAt (si escribió, whatspro_sales_queue_result status "failed" con result.error "customer_replied" y seguí); whatspro_chat_send_message {chat_id, text: payload.text, idempotency_key, dry_run: true} y, si está bien, la misma llamada sin dry_run; whatspro_sales_queue_result {action_id, status: "executed", result_message_id, executed_via: "connector"}. Un envío por llamada. Timeout = send_unknown, sin reintento. Al final: enviados · saltados · fallidos.`,
  },
  {
    key: 'qa.p6-radar-respuestas',
    description: "Clasifica las respuestas nuevas y deja arriba los pagos, las intenciones de compra y los pedidos de llamada.",
    category: 'radar',
    icon: 'radar',
    recurrence: 'daily',
    execution: 'connector',
    scope: 'team',
    title: 'P6 · Radar de respuestas',
    toolChain: ['whatspro_sales_radar_scan', 'whatspro_sales_signals_list', 'whatspro_sales_signal_write'],
    text: `${REGLAS}\n\nPedí whatspro_sales_radar_scan {limit: 100, dry_run: true} para ver las respuestas nuevas sin señal. Clasificá cada una: interesado · pide_informacion · precio · objecion · quiere_llamada · intencion_compra · pago · rechazo · respuesta_automatica · irrelevante (auto-reply si llegó <5 s después de un mensaje nuestro o tiene patrón de bot; pago si menciona alias/transferencia/comprobante; rechazo si "no me interesa"/"no molestar"). Guardá cada una con whatspro_sales_signal_write {message_id, kind, confidence, urgent}. Al final listá primero las pago / intencion_compra / quiere_llamada con el texto literal y el chat.`,
  },
  {
    key: 'qa.p7-meta-de-caja',
    description: "Cruza ventas cobradas contra señales de pago y lista los cobros sin registrar.",
    category: 'reporte',
    icon: 'chart',
    recurrence: 'weekly',
    execution: 'connector',
    scope: 'team',
    title: 'P7 · Meta de caja y ventas faltantes',
    toolChain: ['whatspro_list_records', 'whatspro_finance_summary', 'whatspro_sales_signals_list', 'whatspro_sales_register_payment'],
    text: `${REGLAS}\n\nListá las ventas pagadas del período de la misión (whatspro_list_records sales {status: "paid"}) y las señales de pago atendidas (whatspro_sales_signals_list {kind: "pago", status: "handled"}). Compará: cada señal de pago sin venta registrada es un "cobro probable sin registrar". Devolvé: USD cobrado (ARS 1.000 = USD 1, Gs 7.500 = USD 1 salvo que el equipo diga otro fx), tabla de ventas, y para cada faltante el comando whatspro_sales_register_payment sugerido {chat_id, amount (en unidades), currency, method, paid_on, concept, idempotency_key "sale:{chatId}:{fecha}"} para que Carlos lo confirme. No registres cobros sin esa confirmación explícita: registrar crea la venta, el asiento y el pago, vincula al cliente y pasa el chat a G11.`,
  },
  {
    key: 'qa.resumen-chat-3-lineas',
    description: "Quién es, dónde se detuvo y qué haría hoy. Tres líneas, nada más.",
    category: 'general',
    icon: 'clipboard',
    recurrence: 'on_demand',
    execution: 'both',
    scope: 'chat',
    pinned: true,
    title: 'Resumen del chat en 3 líneas',
    toolChain: ['whatspro_sales_dossier'],
    text: `${REGLAS}\n\nPara el chat del CONTEXTO: whatspro_sales_dossier {chat_id} y devolvé exactamente tres líneas: (1) quién es y qué quiere, (2) dónde se detuvo y por qué (con la fecha del último mensaje del cliente), (3) qué haría hoy y quién (Noelia / Carlos / Producción). Nada más.`,
  },
  {
    key: 'qa.redactar-siguiente-mensaje',
    description: "Redacta el próximo mensaje continuando desde el último compromiso. No lo envía.",
    category: 'redaccion',
    icon: 'pen',
    recurrence: 'on_demand',
    execution: 'both',
    scope: 'chat',
    recommendFor: {"gates": ["G4", "G5", "G6", "G7", "G8", "G9", "G10"], "signals": ["interesado", "pide_informacion", "precio", "objecion"]},
    title: 'Redactar el siguiente mensaje (sin enviar)',
    toolChain: ['whatspro_sales_dossier'],
    text: `${REGLAS}\n\nPara el chat del CONTEXTO: whatspro_sales_dossier {chat_id}. Redactá el próximo mensaje de WhatsApp que continúa desde el último compromiso real del cliente (no vuelvas a explicar qué es AAPP SPACE ni preguntes "¿seguís interesado?"). Tono rioplatense, 2–4 líneas, una sola pregunta al final. Si pidió datos de pago, incluí que se los pasamos ahora. NO lo envíes: devolvelo como texto para que una persona lo apruebe en la vista Cola.`,
  },
  // ── Skills con formulario: los datos se cargan al lanzar, en la UI o desde el conector ──
  {
    key: 'qa.mensaje-a-medida',
    title: 'Mensaje a medida (con datos)',
    description: 'Arma el mensaje del chat pidiendo primero el objetivo, el tono y el dato que hay que meter sí o sí.',
    category: 'redaccion',
    icon: 'pen',
    recurrence: 'on_demand',
    execution: 'both',
    scope: 'chat',
    recommendFor: { gates: ['G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10'] },
    toolChain: ['whatspro_sales_dossier'],
    variables: [
      { name: 'objetivo', label: 'Objetivo del mensaje', type: 'select', required: true, options: ['Pedir la seña', 'Reenviar el precio', 'Responder la objeción', 'Agendar una llamada', 'Reactivar sin presionar', 'Confirmar el plan elegido'], placeholder: null, help: null, defaultValue: null },
      { name: 'tono', label: 'Tono', type: 'select', required: false, options: ['Cercano', 'Directo', 'Formal'], placeholder: null, help: null, defaultValue: 'Cercano' },
      { name: 'dato_clave', label: 'Dato que tiene que aparecer', type: 'text', required: false, placeholder: 'Ej.: el alias, la fecha de inicio, el precio final', help: 'Lo que no puede faltar en el mensaje.', defaultValue: null },
      { name: 'plazo', label: 'Plazo o fecha', type: 'text', required: false, placeholder: 'Ej.: esta semana, el viernes', help: null, defaultValue: null },
    ],
    text: `${REGLAS}\n\nPara el chat del CONTEXTO: whatspro_sales_dossier {chat_id} y leé el historial antes de escribir.\n\nObjetivo de este mensaje: {{objetivo}}.\nTono: {{tono}}.\nTiene que aparecer sí o sí: {{dato_clave}}.\nPlazo mencionado: {{plazo}}.\n\nRedactá UN mensaje de WhatsApp que continúa desde el último compromiso real del cliente. Nunca vuelvas a explicar qué es AAPP SPACE ni preguntes "¿seguís interesado?" si ya hubo precio, elección de plan o compromiso. Español rioplatense, 2–4 líneas, una sola pregunta al final. Si algún dato de arriba vino vacío, resolvelo con lo que diga el historial y aclaralo en una línea aparte. NO lo envíes: devolvelo como texto para que una persona lo apruebe.`,
  },
  {
    key: 'qa.propuesta-con-precio',
    title: 'Propuesta con precio',
    description: 'Arma la propuesta con el plan, el precio y el vencimiento que le cargues, sin inventar números.',
    category: 'cobro',
    icon: 'coins',
    recurrence: 'on_demand',
    execution: 'both',
    scope: 'chat',
    recommendFor: { gates: ['G5', 'G6', 'G7', 'G8'], signals: ['precio', 'intencion_compra'] },
    toolChain: ['whatspro_sales_dossier'],
    variables: [
      { name: 'plan', label: 'Plan o producto', type: 'select', required: true, options: ['Combo Full', 'Tienda online', 'Tienda profesional', 'Sitio web', 'Sitio profesional', 'Publicidad', 'Desarrollo a medida', 'Automatización'], placeholder: null, help: null, defaultValue: null },
      { name: 'precio', label: 'Precio', type: 'text', required: true, placeholder: '150000', help: 'Sólo el número; la moneda va en el campo de al lado.', defaultValue: null },
      { name: 'moneda', label: 'Moneda', type: 'select', required: true, options: ['ARS', 'PYG', 'USD'], placeholder: null, help: null, defaultValue: 'ARS' },
      { name: 'vence', label: 'Válido hasta', type: 'date', required: false, placeholder: null, help: 'Si lo dejás vacío, el mensaje no menciona vencimiento.', defaultValue: null },
      { name: 'incluye', label: 'Qué incluye', type: 'textarea', required: false, placeholder: 'Tres secciones, dominio por un año, carga de 20 productos…', help: null, defaultValue: null },
    ],
    text: `${REGLAS}\n\nPara el chat del CONTEXTO: whatspro_sales_dossier {chat_id}.\n\nPropuesta a comunicar:\n- Plan: {{plan}}\n- Precio: {{precio}} {{moneda}}\n- Válido hasta: {{vence}}\n- Incluye: {{incluye}}\n\nRedactá el mensaje que le manda la propuesta. Usá EXACTAMENTE el precio y el plan de arriba: no los redondees, no los conviertas a otra moneda y no agregues nada que no esté en "incluye". Si el cliente ya recibió un precio distinto antes, mencioná el cambio en una línea. Cerrá con el paso concreto para avanzar (seña, alias, fecha de inicio), una sola pregunta. NO lo envíes.`,
  },
  {
    key: 'qa.barrido-por-criterio',
    title: 'Barrido por criterio',
    description: 'Recorre los chats que cumplan el criterio que escribas y devuelve una tabla priorizada.',
    category: 'limpieza',
    icon: 'brush',
    recurrence: 'weekly',
    execution: 'connector',
    scope: 'team',
    toolChain: ['whatspro_sales_pending', 'whatspro_sales_dossier', 'whatspro_sales_classification_write'],
    variables: [
      { name: 'criterio', label: 'Criterio del barrido', type: 'textarea', required: true, placeholder: 'Ej.: pidieron precio de tienda entre junio y agosto y nunca contestaron', help: 'Con qué se queda y con qué no.', defaultValue: null },
      { name: 'cantidad', label: 'Cuántos chats como máximo', type: 'number', required: false, placeholder: '20', help: null, defaultValue: '20' },
      { name: 'accion_final', label: 'Qué hacer con cada uno', type: 'select', required: true, options: ['Sólo listar', 'Clasificar y guardar', 'Clasificar y proponer un lote'], placeholder: null, help: null, defaultValue: 'Sólo listar' },
    ],
    text: `${REGLAS}\n\nBarrido de hasta {{cantidad}} chats con este criterio: {{criterio}}.\n\nEmpezá por whatspro_sales_pending {source: "all"} y quedate sólo con los que cumplen el criterio; si el criterio necesita leer el historial, usá whatspro_sales_dossier {chat_id} antes de decidir. Qué hacer con cada uno: {{accion_final}}. Si es "Sólo listar", NO escribas nada. Si es "Clasificar y guardar", cerrá cada uno con whatspro_sales_classification_write. Si es "Clasificar y proponer un lote", terminá con whatspro_sales_queue_propose en dry_run y contá cuántos entrarían.\n\nDevolvé una tabla: nombre · gate · prioridad · último mensaje del cliente · siguiente acción · responsable, ordenada por prioridad desc, y abajo los que descartaste con el motivo en una línea.`,
  },
];

/** Todo lo que describe a la skill, para insertar y para actualizar por igual. */
function valores(a: SeedSkill) {
  return {
    title: a.title,
    userTemplate: a.text,
    toolChain: a.toolChain,
    notes: a.notes ?? null,
    description: a.description,
    category: a.category,
    icon: a.icon,
    recurrence: a.recurrence,
    execution: a.execution,
    scope: a.scope,
    variables: (a.variables ?? []) as unknown as Record<string, unknown>[],
    recommendFor: (a.recommendFor ?? {}) as Record<string, unknown>,
    pinned: a.pinned ?? false,
    audience: a.execution === 'api' ? 'server' : a.execution === 'connector' ? 'connector' : 'both',
  };
}

/** Lo que define a la skill, en un orden fijo, para comparar la semilla con la fila activa. */
function huella(v: ReturnType<typeof valores>): string {
  return JSON.stringify([v.title, v.userTemplate, v.toolChain, v.notes, v.description, v.category, v.icon, v.recurrence, v.execution, v.scope, v.variables, v.recommendFor, v.pinned, v.audience]);
}
function huellaFila(p: typeof teamPrompts.$inferSelect): string {
  return JSON.stringify([p.title, p.userTemplate, p.toolChain ?? [], p.notes ?? null, p.description ?? '', p.category, p.icon, p.recurrence, p.execution, p.scope, p.variables ?? [], p.recommendFor ?? {}, p.pinned ?? false, p.audience]);
}

async function main() {
  let creadas = 0;
  let iguales = 0;
  for (const a of ACTIONS) {
    const v = valores(a);
    const previas = await db.query.teamPrompts.findMany({ where: and(eq(teamPrompts.teamId, TEAM_ID), eq(teamPrompts.key, a.key)) });
    const activa = previas.find((p) => p.status === 'active');
    if (activa && huellaFila(activa) === huella(v)) {
      console.log(`= ${a.key} v${activa.version} ya dice esto`);
      iguales += 1;
      continue;
    }
    // Misma regla que upsertSkill: versión siguiente, la anterior queda
    // retirada, y el uso acumulado (que es de la skill, no de la versión) se arrastra.
    const version = previas.reduce((max, p) => Math.max(max, p.version), 0) + 1;
    const usageCount = previas.reduce((max, p) => Math.max(max, p.usageCount ?? 0), 0);
    const lastUsedAt = previas.reduce<Date | null>((latest, p) => (p.lastUsedAt && (!latest || p.lastUsedAt > latest) ? p.lastUsedAt : latest), null);
    const row = await db.transaction(async (tx) => {
      if (previas.length) {
        await tx.update(teamPrompts).set({ status: 'retired', updatedAt: new Date() }).where(and(eq(teamPrompts.teamId, TEAM_ID), eq(teamPrompts.key, a.key)));
      }
      const [inserted] = await tx
        .insert(teamPrompts)
        .values({ teamId: TEAM_ID, key: a.key, purpose: 'custom', version, status: 'active', systemPrompt: '', createdBy: USER_ID, usageCount, lastUsedAt, ...v })
        .returning({ id: teamPrompts.id });
      return inserted;
    });
    console.log(`${previas.length ? '^' : '+'} ${a.key} v${version} ${previas.length ? `creada, v${activa?.version ?? '?'} retirada` : 'creada'} (id ${row.id})`);
    creadas += 1;
  }
  console.log(`\n${ACTIONS.length} skills: ${creadas} versiones nuevas, ${iguales} sin cambios (${ACTIONS.filter((a) => a.recurrence !== 'on_demand').length} rutinas, ${ACTIONS.filter((a) => a.variables?.length).length} con formulario).`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
