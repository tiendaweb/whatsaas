import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { chats, messageAudioInsights, teamCommercialActions, teamCommercialAnalysis } from '@/lib/db/schema';
import { maskJid } from '@/lib/desktop/command-center/types';
import { listPendingChats, type PendingChat } from './classifier';
import { listScanCandidates, type ScanCandidate } from './radar';
import { getSalesOpsSettings, patchSalesOpsSettings } from './settings';
import { listPromptRuns } from './prompt-queue';

/**
 * Cola de trabajo para conectores.
 *
 * Todo lo que el servidor no puede hacer solo —por falta de cuota/tokens de IA
 * (clasificar chats, clasificar respuestas, transcribir) o por diseño (los
 * envíos aprobados no salen del servidor hasta la Fase 6)— queda acá, con la
 * cadena de tools `whatspro_*` que lo resuelve. Un conector (Claude / ChatGPT /
 * Grok) pide la cola, ejecuta ítem por ítem y devuelve el resultado con las
 * tools de escritura.
 *
 * Desde el 2026-09-05 el conector SÍ puede corregir el CRM del contacto que
 * está trabajando. La regla vieja ("no tocar el CRM") lo obligaba a anotar en
 * `crm_to_fix` una contradicción que él mismo acababa de detectar y a esperar a
 * que una persona la leyera y repitiera el cambio a mano; casi nunca pasaba. Lo
 * que se conserva es el límite que importaba de verdad: de a un contacto por
 * vez y sólo lo que contradice ese chat, nunca en lote sin que alguien lo pida.
 */
export type WorkKind = 'run_prompt' | 'classify' | 'execute_action' | 'classify_signal' | 'transcribe';
export const WORK_KINDS: WorkKind[] = ['run_prompt', 'classify', 'execute_action', 'classify_signal', 'transcribe'];

export type WorkItem =
  | { kind: 'run_prompt'; priority: number; runId: number; title: string; promptKey: string; text: string; variables: Record<string, string>; targetKind: string; targetId: string; targetName: string | null; chatId: number | null; createdAt: string; tools: string[]; steps: string[] }
  | { kind: 'classify'; priority: number; chatId: number; name: string; phoneMasked: string; reason: PendingChat['pendingReason']; signals: string[]; automationActive: boolean; pendingAudios: number; tools: string[]; steps: string[] }
  | { kind: 'execute_action'; priority: number; actionId: number; batchId: string; batchLabel: string; actionKind: string; chatId: number; name: string; payload: Record<string, unknown>; idempotencyKey: string; approvedAt: string | null; tools: string[]; steps: string[] }
  | { kind: 'classify_signal'; priority: number; messageId: string; chatId: number; name: string; excerpt: string; at: string; tools: string[]; steps: string[] }
  | { kind: 'transcribe'; priority: number; messageId: string; chatId: number; name: string; queuedAt: string | null; tools: string[]; steps: string[] };

export type WorkQueue = {
  generatedAt: string;
  counts: Record<WorkKind, number>;
  items: WorkItem[];
  rules: string[];
};

const RULES = [
  'Podés corregir el CRM del contacto que estás trabajando —etapa del embudo, etiquetas, campos y notas— con whatspro_change_crm_stage, whatspro_set_contact_tags y whatspro_set_custom_fields. Todo queda auditado con tu nombre de conector.',
  'Corregí SÓLO lo que contradice lo que leíste en ese chat, y de a un contacto por vez: nada de whatspro_crm_bulk_stage ni whatspro_crm_bulk_tags sin que una persona lo haya pedido explícitamente. Una etapa mal puesta en 200 contactos no se nota y no se deshace.',
  'Automatizaciones y registro de clientes siguen siendo de las personas: no las prendas, no las apagues y no conviertas a nadie en cliente por tu cuenta.',
  'Un envío por llamada, con la idempotency_key que viene en el ítem; nunca reintentar un envío con timeout.',
  'Antes de ejecutar un envío aprobado, verificá que el cliente no haya escrito después de la aprobación (whatspro_list_records messages fromMe=false limit=1); si escribió, reportá el resultado como skipped.',
  'Todo resultado vuelve por la tool de escritura del ítem; sin eso el servidor no se entera.',
];

function classifyItem(p: PendingChat, index: number): WorkItem {
  return {
    kind: 'classify',
    priority: 1000 - index,
    chatId: p.chatId,
    name: p.name,
    phoneMasked: p.phoneMasked,
    reason: p.pendingReason,
    signals: p.signals,
    automationActive: p.automationActive,
    pendingAudios: p.pendingAudios,
    tools: ['whatspro_sales_dossier', 'whatspro_sales_classification_write', 'whatspro_change_crm_stage', 'whatspro_set_contact_tags', 'whatspro_set_custom_fields'],
    steps: [
      `whatspro_sales_dossier {chat_id: ${p.chatId}} → leer expediente y facts`,
      'aplicar el prompt sales-ops.classify (whatspro_sales_prompts o doc 07 P2) y armar el JSON del contrato',
      `whatspro_sales_classification_write {chat_id: ${p.chatId}, classification, connector}`,
      'si el CRM contradice lo que leíste, corregilo en el mismo paso (whatspro_change_crm_stage / whatspro_set_contact_tags / whatspro_set_custom_fields) y dejá el detalle en crm_fix para que quede a la vista en la ficha; sólo este contacto, nunca en lote',
    ],
  };
}

export async function listWorkQueue(teamId: number, opts: { kinds?: WorkKind[]; limit?: number } = {}): Promise<WorkQueue> {
  const kinds = new Set(opts.kinds?.length ? opts.kinds : WORK_KINDS);
  const limit = Math.min(Math.max(1, opts.limit ?? 30), 200);
  const items: WorkItem[] = [];
  const counts: Record<WorkKind, number> = { run_prompt: 0, classify: 0, execute_action: 0, classify_signal: 0, transcribe: 0 };

  // 0. Prompts encolados a mano (Prompt Studio / "Siguiente acción"): lo más explícito va primero.
  // Sólo lo aprobado: lo que espera en "En revisión" todavía no es trabajo para nadie.
  const runs = await listPromptRuns(teamId, { status: 'queued', approved: true, limit: 200 });
  counts.run_prompt = runs.length;
  if (kinds.has('run_prompt')) {
    for (const run of runs) {
      items.push({
        kind: 'run_prompt',
        priority: 2500,
        runId: run.id,
        title: run.title,
        promptKey: run.promptKey,
        text: run.text,
        // El texto ya viene con las variables resueltas; esto es sólo para que se vea con qué datos se lanzó.
        variables: run.variables,
        targetKind: run.targetKind,
        targetId: run.targetId,
        targetName: run.targetName,
        chatId: run.targetKind === 'chat' ? Number(run.targetId) : null,
        createdAt: run.createdAt,
        tools: ['whatspro_sales_dossier', 'whatspro_sales_tareas_from_chat', 'whatspro_manage_scheduled_message', 'whatspro_sales_queue_propose', 'whatspro_sales_prompt_result'],
        steps: [
          `whatspro_sales_prompt_result {run_id: ${run.id}, status: "in_progress"} (opcional, para marcar que lo tomaste)`,
          'ejecutar el texto del prompt tal cual, con las tools whatspro_* que pida; respetar las reglas del Command Center',
          'si el pedido no dice qué forma tiene el resultado, leé el chat y elegí: mensaje programado (whatspro_manage_scheduled_message / whatspro_sales_queue_propose), demo web (whatspro_sales_tareas_from_chat action "demo") o proyecto del cliente en Tareas OS (whatspro_sales_tareas_from_chat action "project")',
          'si falta una decisión humana, no la inventes: devolvé status="blocked" y human_request con 1–8 campos (buttons, select, text, textarea o code); el Command Center mostrará el formulario y reencolará esta corrida con la respuesta',
          `whatspro_sales_prompt_result {run_id: ${run.id}, status: "completed"|"failed"|"blocked", summary: "<qué hiciste o qué falta, 1-3 líneas>", output: "<el resultado completo, si lo hay>", human_request: "<sólo si blocked>"}`,
        ],
      });
    }
  }

  // 1. Envíos y acciones aprobadas que el servidor no ejecuta (Fase 6 pendiente).
  const approved = await db
    .select({
      id: teamCommercialActions.id,
      batchId: teamCommercialActions.batchId,
      batchLabel: teamCommercialActions.batchLabel,
      kind: teamCommercialActions.kind,
      chatId: teamCommercialActions.chatId,
      payload: teamCommercialActions.payload,
      approvedAt: teamCommercialActions.approvedAt,
      remoteJid: chats.remoteJid,
      name: chats.name,
      pushName: chats.pushName,
    })
    .from(teamCommercialActions)
    .innerJoin(chats, eq(chats.id, teamCommercialActions.chatId))
    .where(and(eq(teamCommercialActions.teamId, teamId), eq(teamCommercialActions.status, 'approved')))
    .orderBy(desc(teamCommercialActions.approvedAt));
  counts.execute_action = approved.length;
  if (kinds.has('execute_action')) {
    for (const a of approved) {
      const idempotencyKey = `sales-ops:${a.id}`;
      const tools =
        a.kind === 'send_message'
          ? ['whatspro_chat_send_message', 'whatspro_sales_queue_result']
          : a.kind === 'create_task'
            ? ['whatspro_create_contact_task', 'whatspro_sales_queue_result']
            : a.kind === 'register_sale'
              ? ['whatspro_register_sale', 'whatspro_sales_queue_result']
              : a.kind === 'schedule_message'
                ? ['whatspro_manage_scheduled_message', 'whatspro_sales_queue_result']
                : a.kind === 'request_demo'
                  ? ['whatspro_sales_dossier', 'whatspro_manage_task_workspace', 'whatspro_manage_task', 'whatspro_sales_queue_result']
                  : ['whatspro_sales_queue_result'];
      items.push({
        kind: 'execute_action',
        priority: 2000,
        actionId: a.id,
        batchId: a.batchId,
        batchLabel: a.batchLabel,
        actionKind: a.kind,
        chatId: a.chatId,
        name: a.name || a.pushName || maskJid(a.remoteJid),
        payload: a.payload ?? {},
        idempotencyKey,
        approvedAt: a.approvedAt ? a.approvedAt.toISOString() : null,
        tools,
        steps:
          a.kind === 'send_message'
            ? [
                `verificar que el chat ${a.chatId} no tenga mensaje del cliente posterior a ${a.approvedAt?.toISOString() ?? 'la aprobación'}`,
                `whatspro_chat_send_message {chat_id: ${a.chatId}, text: payload.text, idempotency_key: "${idempotencyKey}", dry_run: true} y después sin dry_run`,
                `whatspro_sales_queue_result {action_id: ${a.id}, status: "executed", result_message_id, executed_via: "connector"}`,
              ]
            : a.kind === 'schedule_message'
              ? [
                  `whatspro_manage_scheduled_message: crear un programado único para el chat ${a.chatId} con payload.text a la hora payload.sendAt (nombre "Cola · #${a.id}")`,
                  `whatspro_sales_queue_result {action_id: ${a.id}, status: "executed", result: { scheduledMessageId }}`,
                ]
              : a.kind === 'request_demo'
                ? [
                    `whatspro_sales_dossier {chat_id: ${a.chatId}}: investigar el negocio, qué pidió, tono y datos concretos`,
                    'redactar el prompt para generar el sitio de demo en AAPP SPACE (gobiz_sites_create: una página, secciones, textos en el tono del cliente, paleta, datos a confirmar)',
                    'whatspro_manage_task_workspace / whatspro_manage_task: tarea "Demo web — {nombre}" en el workspace "Demos" (proyecto "Demos") con la investigación en notes y el prompt en ai_prompt, vinculada al contacto',
                    `whatspro_sales_queue_result {action_id: ${a.id}, status: "executed", result: { taskId }}`,
                  ]
                : [`ejecutar ${a.kind} según payload`, `whatspro_sales_queue_result {action_id: ${a.id}, status: "executed"|"failed", result}`],
      });
    }
  }

  // 2. Chats sin clasificar o desactualizados (prefiltro de dinero primero).
  if (kinds.has('classify')) {
    const pending = await listPendingChats(teamId, { source: 'prefiltro', limit: Math.max(limit, 50) });
    let list = pending;
    if (list.length < limit) {
      const stale = await listPendingChats(teamId, { source: 'stale', limit });
      const seen = new Set(list.map((p) => p.chatId));
      list = [...list, ...stale.filter((p) => !seen.has(p.chatId))];
    }
    counts.classify = list.length;
    list.slice(0, limit).forEach((p, i) => items.push(classifyItem(p, i)));
  } else {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(teamCommercialAnalysis)
      .where(and(eq(teamCommercialAnalysis.teamId, teamId), eq(teamCommercialAnalysis.stale, true)));
    counts.classify = row?.n ?? 0;
  }

  // 3. Respuestas nuevas sin señal (el radar por reglas las clasifica solo; el conector afina lo ambiguo).
  if (kinds.has('classify_signal')) {
    const { candidates } = await listScanCandidates(teamId, { limit });
    counts.classify_signal = candidates.length;
    for (const c of candidates as ScanCandidate[]) {
      items.push({
        kind: 'classify_signal',
        priority: 1500,
        messageId: c.messageId,
        chatId: c.chatId,
        name: c.name,
        excerpt: c.excerpt,
        at: c.timestamp,
        tools: ['whatspro_sales_signal_write'],
        steps: [
          'clasificar el mensaje con el prompt sales-ops.radar (interesado · pide_informacion · precio · objecion · quiere_llamada · intencion_compra · pago · rechazo · respuesta_automatica · irrelevante)',
          `whatspro_sales_signal_write {message_id: "${c.messageId}", kind, confidence, urgent}`,
        ],
      });
    }
  }

  // 4. Audios sin ficha de los chats del prefiltro: el servidor los encola; sin cuota, los toma el conector.
  if (kinds.has('transcribe')) {
    const pendingChats = items.filter((i): i is Extract<WorkItem, { kind: 'classify' }> => i.kind === 'classify' && i.pendingAudios > 0).map((i) => i.chatId);
    if (pendingChats.length) {
      const audios = await db
        .select({ messageId: messageAudioInsights.messageId, chatId: messageAudioInsights.chatId, queuedAt: messageAudioInsights.queuedAt })
        .from(messageAudioInsights)
        .where(and(eq(messageAudioInsights.teamId, teamId), inArray(messageAudioInsights.chatId, pendingChats), inArray(messageAudioInsights.status, ['queued', 'pending'])))
        .limit(limit);
      counts.transcribe = audios.length;
      const names = new Map(items.filter((i) => i.kind === 'classify').map((i) => [i.chatId, i.name]));
      for (const a of audios) {
        items.push({
          kind: 'transcribe',
          priority: 900,
          messageId: a.messageId,
          chatId: a.chatId,
          name: names.get(a.chatId) ?? `chat ${a.chatId}`,
          queuedAt: a.queuedAt ? a.queuedAt.toISOString() : null,
          tools: ['whatspro_audio_queue_takeover', 'whatspro_audio_insight_write'],
          steps: ['whatspro_audio_queue_takeover → descargar y escuchar', `whatspro_audio_insight_write {message_id: "${a.messageId}", transcript, summary, intent}`],
        });
      }
    }
  }

  // Descartados desde la Cola de conectores: por esta vez (hasta una fecha) o para siempre.
  const skips = await listWorkSkips(teamId);
  if (skips.length) {
    const activos = new Set(skips.map((s) => `${s.kind}|${s.key}`));
    const antes = new Map<WorkKind, number>();
    for (const it of items) antes.set(it.kind, (antes.get(it.kind) ?? 0) + 1);
    const filtrados = items.filter((it) => !activos.has(`${it.kind}|${workItemKey(it)}`));
    for (const kind of WORK_KINDS) {
      const quitados = (antes.get(kind) ?? 0) - filtrados.filter((it) => it.kind === kind).length;
      if (quitados > 0) counts[kind] = Math.max(0, counts[kind] - quitados);
    }
    items.length = 0;
    items.push(...filtrados);
  }

  items.sort((a, b) => b.priority - a.priority);
  return { generatedAt: new Date().toISOString(), counts, items: items.slice(0, limit), rules: RULES };
}

/** La clave estable de un ítem, para poder descartarlo o excluirlo. */
export function workItemKey(item: WorkItem): string {
  switch (item.kind) {
    case 'run_prompt':
      return String(item.runId);
    case 'execute_action':
      return String(item.actionId);
    case 'classify':
      return String(item.chatId);
    case 'classify_signal':
    case 'transcribe':
      return item.messageId;
  }
}

export type WorkSkip = { kind: string; key: string; until: string | null; label?: string; at?: string };

/** Descartes vigentes (los "por esta vez" vencidos se limpian al leer). */
export async function listWorkSkips(teamId: number): Promise<WorkSkip[]> {
  const todos = (await getSalesOpsSettings(teamId)).workQueueSkips;
  const ahora = new Date().toISOString();
  return todos.filter((s) => s.until === null || s.until > ahora);
}

/**
 * Descarta un ítem de la cola de conectores: por esta vez (24 h, después
 * vuelve si sigue pendiente) o para siempre. No borra nada: sólo deja de
 * ofrecérselo a los conectores. Lo que tenga un estado propio (una corrida,
 * una fila aprobada) se cancela o se quita desde su propia acción.
 */
export async function skipWorkItem(teamId: number, userId: number, input: { kind: WorkKind; key: string; forever: boolean; label?: string }): Promise<WorkSkip[]> {
  const vigentes = (await listWorkSkips(teamId)).filter((s) => !(s.kind === input.kind && s.key === input.key));
  const until = input.forever ? null : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const next = [...vigentes, { kind: input.kind, key: input.key, until, label: input.label?.slice(0, 120), at: new Date().toISOString() }].slice(-500);
  const settings = await patchSalesOpsSettings(teamId, userId, { workQueueSkips: next });
  return settings.workQueueSkips;
}

export async function unskipWorkItem(teamId: number, userId: number, input: { kind: string; key: string }): Promise<WorkSkip[]> {
  const vigentes = (await listWorkSkips(teamId)).filter((s) => !(s.kind === input.kind && s.key === input.key));
  const settings = await patchSalesOpsSettings(teamId, userId, { workQueueSkips: vigentes });
  return settings.workQueueSkips;
}

/** Conteo barato para el dashboard: aprobadas sin ejecutar + sin analizar + desactualizados. */
export async function countConnectorPending(teamId: number, totals: { total: number; analyzed: number; stale: number }): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(teamCommercialActions)
    .where(and(eq(teamCommercialActions.teamId, teamId), eq(teamCommercialActions.status, 'approved')));
  const queuedRuns = await listPromptRuns(teamId, { status: 'queued', limit: 200 });
  return (row?.n ?? 0) + queuedRuns.length + Math.max(0, totals.total - totals.analyzed) + totals.stale;
}
