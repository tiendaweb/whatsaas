/**
 * Siembra las acciones rápidas del Prompt Studio (P1–P9 del doc 07) como
 * prompts `qa.*` del equipo 2, audiencia conector. Idempotente por key: si la
 * versión 1 existe, actualiza su texto; no crea versiones nuevas.
 *
 *   npx tsx scripts/seed-sales-ops-quick-actions.ts
 */
import 'dotenv/config';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamPrompts } from '@/lib/db/schema';

const TEAM_ID = 2;
const USER_ID = 3;

const REGLAS = `REGLAS DEL COMMAND CENTER COMERCIAL: WhatsPro es la fuente, leé antes de escribir. NO uses whatspro_change_crm_stage, whatspro_set_contact_tags, whatspro_set_custom_fields, whatspro_save_contact, whatspro_manage_automation*, whatspro_chat_trigger_automation, whatspro_convert_lead, whatspro_manage_customer ni whatspro_delete_record. El historial del chat es la evidencia; etiquetas y campos son hipótesis. Citá evidencia (ids de mensajes). No reabras decisiones tomadas. Un envío por llamada, sólo desde lotes aprobados, con la idempotency_key indicada. Teléfonos: últimos 4 dígitos. CONTEXTO DISPONIBLE: whatspro_sales_dossier trae el historial recortado, las notas internas (who: nota), los campos personalizados del contacto (contact.customData) y lo comercial; podés ampliar con whatspro_private_notes {contact_id} y whatspro_custom_fields, y agregar notas con whatspro_add_internal_note (no es CRM: el cliente no la ve).`;

const ACTIONS: Array<{ key: string; title: string; text: string; toolChain: string[]; notes?: string }> = [
  {
    key: 'qa.p9-drenar-cola',
    title: 'P9 · Drenar la cola de trabajo',
    toolChain: ['whatspro_sales_work_queue', 'whatspro_sales_dossier', 'whatspro_sales_classification_write', 'whatspro_chat_send_message', 'whatspro_sales_queue_result', 'whatspro_sales_signal_write', 'whatspro_sales_prompt_result'],
    text: `${REGLAS}\n\nPedí whatspro_sales_work_queue {limit: 30}. Trabajá los ítems en el orden en que vienen (prompts encolados, envíos aprobados, clasificaciones del prefiltro de dinero, respuestas nuevas, audios). Por cada ítem seguí exactamente sus "steps" y cerrá con la tool de resultado antes de pasar al siguiente. Nunca reintentes un envío que dio timeout: reportalo como send_unknown con el chat. Cuando termines, volvé a pedir la cola; si viene vacía, informá cuántos ítems hiciste por tipo.`,
  },
  {
    key: 'qa.p1-prefiltro-dinero',
    title: 'P1 · Prefiltro de dinero (Frente 1)',
    toolChain: ['whatspro_sales_pending', 'whatspro_sales_dossier', 'whatspro_sales_classification_write'],
    text: `${REGLAS}\n\nPedí whatspro_sales_pending {source: "prefiltro", limit: 30}: son los chats donde probablemente hay plata detenida (nosotros mandamos alias/CBU/comprobante, radar P1, deals abiertos, etiqueta de producto sin cliente vinculado). Para cada uno: whatspro_sales_dossier {chat_id} → clasificá con el prompt sales-ops.classify → whatspro_sales_classification_write. Al final, resumí en una tabla: nombre · gate · prioridad · siguiente acción · responsable, ordenada por prioridad.`,
  },
  {
    key: 'qa.p2-auditar-chat',
    title: 'P2 · Auditar y clasificar un chat',
    toolChain: ['whatspro_sales_dossier', 'whatspro_sales_classification_write'],
    text: `${REGLAS}\n\nPara el chat indicado en CONTEXTO: whatspro_sales_dossier {chat_id} y aplicá las reglas R1–R5 del Command Center (cliente existente → G11; entrada muerta → G0; nunca contestado → G0 "Responder ya"; rechazo explícito → GX; pago pendiente → mínimo G9 / G10 si el bloqueo es nuestro). Si ninguna decide, elegí G1..G8 por el punto más alto con evidencia DEL CLIENTE. Devolvé el JSON del contrato y guardalo con whatspro_sales_classification_write {chat_id, classification, connector}. Contame en 3 líneas qué encontraste y cuál es la siguiente acción.`,
  },
  {
    key: 'qa.p4-armar-cola',
    title: 'P4 · Proponer lotes de la semana',
    toolChain: ['whatspro_sales_queue_propose', 'whatspro_sales_queue_list'],
    text: `${REGLAS}\n\nArmá los lotes de la semana con whatspro_sales_queue_propose, SIEMPRE primero con dry_run: true para ver incluidos y excluidos: (1) "Cierre G10" gates [G10] rol carlos, mensaje individual que continúa desde el último compromiso; (2) "Cobro G9" gates [G9] rol carlos, reenviar datos de pago y confirmar el plan elegido; (3) "Reactivación G4-G5" gates [G4,G5] rol noelia con A/B (variant_split) retomando el precio conocido; (4) "Último intento G0-G3" gates [G0,G1,G2,G3] rol noelia, texto corto que pide una respuesta de una palabra, excluyendo quien tiene 3+ impactos. Usá variables {{nombre}}, {{plan}}, {{precio}}. Después del dry run, proponé de verdad y contame cuántos entraron a cada lote y por qué quedaron afuera los excluidos. NO aprobás: eso lo hace una persona en la vista Cola.`,
  },
  {
    key: 'qa.p5-ejecutar-aprobados',
    title: 'P5 · Ejecutar envíos aprobados (uno por uno)',
    toolChain: ['whatspro_sales_work_queue', 'whatspro_chat_send_message', 'whatspro_sales_queue_result'],
    text: `${REGLAS}\n\nPedí whatspro_sales_work_queue {kinds: ["execute_action"]}. Por cada envío aprobado: verificá con whatspro_list_records messages {chatId, fromMe: false, limit: 1} que el cliente no escribió después de approvedAt (si escribió, whatspro_sales_queue_result status "failed" con result.reason "customer_replied" y seguí); whatspro_chat_send_message {chat_id, text: payload.text, idempotency_key, dry_run: true} y, si está bien, la misma llamada sin dry_run; whatspro_sales_queue_result {action_id, status: "executed", result_message_id, executed_via: "connector"}. Un envío por llamada. Timeout = send_unknown, sin reintento. Al final: enviados · saltados · fallidos.`,
  },
  {
    key: 'qa.p6-radar-respuestas',
    title: 'P6 · Radar de respuestas',
    toolChain: ['whatspro_sales_radar_scan', 'whatspro_sales_signals_list', 'whatspro_sales_signal_write'],
    text: `${REGLAS}\n\nPedí whatspro_sales_radar_scan {limit: 100, dry_run: true} para ver las respuestas nuevas sin señal. Clasificá cada una: interesado · pide_informacion · precio · objecion · quiere_llamada · intencion_compra · pago · rechazo · respuesta_automatica · irrelevante (auto-reply si llegó <5 s después de un mensaje nuestro o tiene patrón de bot; pago si menciona alias/transferencia/comprobante; rechazo si "no me interesa"/"no molestar"). Guardá cada una con whatspro_sales_signal_write {message_id, kind, confidence, urgent}. Al final listá primero las pago / intencion_compra / quiere_llamada con el texto literal y el chat.`,
  },
  {
    key: 'qa.p7-meta-de-caja',
    title: 'P7 · Meta de caja y ventas faltantes',
    toolChain: ['whatspro_list_records', 'whatspro_finance_summary', 'whatspro_sales_signals_list', 'whatspro_register_sale'],
    text: `${REGLAS}\n\nListá las ventas pagadas del período de la misión (whatspro_list_records sales {status: "paid"}) y las señales de pago atendidas (whatspro_sales_signals_list {kind: "pago", status: "handled"}). Compará: cada señal de pago sin venta registrada es un "cobro probable sin registrar". Devolvé: USD cobrado (ARS 1.000 = USD 1, Gs 7.500 = USD 1 salvo que el equipo diga otro fx), tabla de ventas, y para cada faltante el comando whatspro_register_sale sugerido con idempotency_key "sale:{chatId}:{fecha}" para que Carlos lo confirme. No registres ventas sin confirmación.`,
  },
  {
    key: 'qa.resumen-chat-3-lineas',
    title: 'Resumen del chat en 3 líneas',
    toolChain: ['whatspro_sales_dossier'],
    text: `${REGLAS}\n\nPara el chat del CONTEXTO: whatspro_sales_dossier {chat_id} y devolvé exactamente tres líneas: (1) quién es y qué quiere, (2) dónde se detuvo y por qué (con la fecha del último mensaje del cliente), (3) qué haría hoy y quién (Noelia / Carlos / Producción). Nada más.`,
  },
  {
    key: 'qa.redactar-siguiente-mensaje',
    title: 'Redactar el siguiente mensaje (sin enviar)',
    toolChain: ['whatspro_sales_dossier'],
    text: `${REGLAS}\n\nPara el chat del CONTEXTO: whatspro_sales_dossier {chat_id}. Redactá el próximo mensaje de WhatsApp que continúa desde el último compromiso real del cliente (no vuelvas a explicar qué es AAPP SPACE ni preguntes "¿seguís interesado?"). Tono rioplatense, 2–4 líneas, una sola pregunta al final. Si pidió datos de pago, incluí que se los pasamos ahora. NO lo envíes: devolvelo como texto para que una persona lo apruebe en la vista Cola.`,
  },
];

async function main() {
  for (const a of ACTIONS) {
    const v1 = await db.query.teamPrompts.findFirst({ where: and(eq(teamPrompts.teamId, TEAM_ID), eq(teamPrompts.key, a.key), eq(teamPrompts.version, 1)) });
    if (v1) {
      await db.update(teamPrompts).set({ title: a.title, userTemplate: a.text, toolChain: a.toolChain, notes: a.notes ?? null, updatedAt: new Date() }).where(eq(teamPrompts.id, v1.id));
      console.log(`= ${a.key} v1 actualizado`);
      continue;
    }
    const [row] = await db.insert(teamPrompts).values({ teamId: TEAM_ID, key: a.key, title: a.title, purpose: 'custom', audience: 'connector', version: 1, status: 'active', systemPrompt: '', userTemplate: a.text, toolChain: a.toolChain, notes: a.notes ?? null, createdBy: USER_ID }).returning({ id: teamPrompts.id });
    console.log(`+ ${a.key} v1 creado (id ${row.id})`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
