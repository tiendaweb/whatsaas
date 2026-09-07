import 'server-only';

import type { PermissionContext } from '@/lib/auth/permissions-guard';
import { hasPermission } from '@/lib/permissions';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';
import { listWorkQueue } from '@/lib/plugins/sales-ops/server/work-queue';
import { listProductionWorkQueue } from '@/lib/plugins/tasks/server/production-work-queue';
import { loadTaskAiWorklist, type TaskAiWorkItem } from '@/lib/plugins/tasks/server/ai-operations';
import { getCommandCenter } from '@/lib/desktop/command-center/service';
import type { CommandItem } from '@/lib/desktop/command-center/types';
import {
  WORK_PRIORITY,
  type UnifiedWorkItem,
  type UnifiedWorkQueue,
  type WorkApproval,
  type WorkSource,
  type WorkSourceStatus,
} from './types';

const RULES = [
  'Trabajá de arriba hacia abajo: la lista ya está ordenada por prioridad.',
  'approval="ready" se puede ejecutar siguiendo steps. approval="needs_human" se propone y espera confirmación explícita de la persona.',
  'Un envío de mensaje por llamada, con la idempotency_key del ítem cuando la trae.',
  'Todo resultado vuelve por la tool de escritura que indica el ítem; sin eso el servidor no se entera de que lo hiciste.',
  'En los ítems de source="sales" podés corregir el CRM del contacto que estás trabajando (etapa, etiquetas, campos), sólo lo que contradice ese chat y de a un contacto; nunca en lote. Lo que hacés dentro de un pedido aprobado sale directo; lo que proponés por tu cuenta espera aprobación. Cobros: sólo whatspro_sales_register_payment desde una fila aprobada o por pedido explícito.',
];

/** Los pasos de un ítem de Tareas dependen sólo de su fase y su estado. */
function taskToolsAndSteps(item: TaskAiWorkItem): { tools: string[]; steps: string[]; approval: WorkApproval } {
  const ref = `target_type="${item.targetType}", target_id=${item.targetId}, phase="${item.phase}", fingerprint="${item.fingerprint}"`;

  if (item.state === 'needs-context') {
    return {
      approval: 'needs_human',
      tools: ['whatspro_operations_ai_reply', 'whatspro_manage_task'],
      steps: [
        `Esta tarea está trabada esperando una respuesta humana: "${item.contextQuestion}".`,
        'Preguntale al usuario y guardá su respuesta en ai_context_answer con whatspro_manage_task. Hasta que eso pase, no se prepara ni se ejecuta.',
      ],
    };
  }

  if (item.phase === 'prepare') {
    return {
      approval: 'ready',
      tools: ['whatspro_tasks_get', 'whatspro_manage_task', 'whatspro_tasks_ai_report'],
      steps: [
        'Leé el prompt (propio + heredado) y convertilo en un próximo paso concreto y accionable.',
        `Reportá con whatspro_tasks_ai_report {${ref}, status:"completed", prepared_next_step:"…", summary:"…"}.`,
      ],
    };
  }

  return {
    approval: 'ready',
    tools: ['whatspro_tasks_get', 'whatspro_tasks_ai_report'],
    steps: [
      `Ejecutá el próximo paso ya preparado: "${item.nextStep}". Usá las herramientas normales, con sus permisos.`,
      `Reportá con whatspro_tasks_ai_report {${ref}, status:"completed"|"blocked"|"failed", summary:"…"}.`,
    ],
  };
}

/**
 * Los pendientes de la bandeja son propuestas, no trabajo aprobado: todos salen
 * como `needs_human` y con la misma cadena, porque el camino es siempre el
 * mismo — mirar, proponer, y ejecutar sólo con el OK de la persona.
 */
function inboxToolsAndSteps(item: CommandItem): { tools: string[]; steps: string[] } {
  const acciones = item.actions.map((action) => action.type).join(', ') || 'ninguna';
  return {
    tools: [
      'whatspro_command_center_suggest',
      'whatspro_command_center_execute',
    ],
    steps: [
      `Acciones disponibles sobre este pendiente: ${acciones}.`,
      item.reply
        ? `Si hace falta responder, pedí un borrador con whatspro_command_center_suggest {item_ids:["${item.id}"]} y mostráselo a la persona.`
        : 'Este pendiente no tiene a quién responderle: resolvelo con una de las acciones de arriba.',
      `Ejecutá con whatspro_command_center_execute usando item_id="${item.id}", primero con dry_run:true. Sin confirm:"EJECUTAR" no se aplica nada.`,
    ],
  };
}

type Options = {
  sources?: WorkSource[];
  approval?: WorkApproval;
  limit?: number;
};

/**
 * Todo lo que hay para hacer, de las tres fuentes, en una sola lista.
 *
 * Ninguna fuente puede hacer fallar a las otras: si falta un permiso, el plugin
 * está apagado o la consulta rompe, esa fuente vuelve vacía con el motivo en
 * `sources[].skipped`. Una cola de trabajo que devuelve 403 entero porque el
 * equipo no usa uno de los tres módulos no le sirve a nadie.
 */
export async function listUnifiedWorkQueue(
  ctx: PermissionContext,
  opts: Options = {},
): Promise<UnifiedWorkQueue> {
  const limit = Math.min(Math.max(opts.limit ?? 40, 1), 200);
  // `limit` acota lo que se DEVUELVE, no lo que se mira. Si se usara el mismo
  // número para consultar cada fuente, pedir 5 ítems haría que `total` dijera 5
  // y una IA planificaría creyendo que eso es todo lo que hay. La ventana es
  // más ancha que la página a propósito.
  const window = Math.min(200, Math.max(limit, 60));
  const wanted = new Set<WorkSource>(opts.sources?.length ? opts.sources : ['sales', 'tasks', 'inbox', 'production']);
  const active = new Set((await resolveActivePluginsForTeam(ctx.teamId, ctx.userId)).map((item) => item.pluginId));
  const can = (permission: Parameters<typeof hasPermission>[2]) => hasPermission(ctx.role, ctx.permissions, permission);

  const items: UnifiedWorkItem[] = [];
  const sources: WorkSourceStatus[] = [];
  /** Reglas propias de la cola comercial, que se suman a las generales cuando se incluye `sales`. */
  const salesRules: string[] = [];
  /** Ídem para producción: sin sus reglas, los steps de un sitio quedan sin marco. */
  const productionRules: string[] = [];

  const record = (source: WorkSource, skipped: string | null, count: number) => {
    sources.push({ source, available: skipped === null, skipped, count });
  };

  // ── Cola comercial ────────────────────────────────────────────────────────
  if (wanted.has('sales')) {
    let skipped: string | null = null;
    let count = 0;
    try {
      if (!active.has('sales-ops')) throw new Error('La app Command Center Comercial no está activa en este equipo.');
      if (!can('salesOpsRead')) throw new Error('Falta el permiso salesOpsRead.');
      const queue = await listWorkQueue(ctx.teamId, { limit: window });
      // Las reglas de la cola comercial viajan con sus ítems: sin esto el
      // conector veía los steps pero no las reglas que los enmarcan.
      for (const rule of queue.rules ?? []) if (!salesRules.includes(rule)) salesRules.push(rule);
      for (const item of queue.items) {
        items.push({
          source: 'sales',
          kind: item.kind,
          key: String(
            item.kind === 'run_prompt' ? item.runId
              : item.kind === 'execute_action' ? item.actionId
                : item.kind === 'classify' ? item.chatId
                  : item.messageId,
          ),
          priority: item.priority,
          // `execute_action` ya lo aprobó una persona en la cola; el resto es
          // trabajo de análisis que no le escribe a nadie.
          approval: 'ready',
          title: item.kind === 'run_prompt' ? item.title : item.kind === 'execute_action' ? item.batchLabel : item.name,
          detail: item.kind === 'classify' ? item.reason : item.kind === 'classify_signal' ? item.excerpt : null,
          chatId: 'chatId' in item ? item.chatId : null,
          tools: item.tools,
          steps: item.steps,
          payload: item as unknown as Record<string, unknown>,
        });
        count += 1;
      }
    } catch (error) {
      skipped = error instanceof Error ? error.message : String(error);
    }
    record('sales', skipped, count);
  }

  // ── Producción (demos, sitios, tiendas y cambios) ─────────────────────────
  if (wanted.has('production')) {
    let skipped: string | null = null;
    let count = 0;
    try {
      if (!active.has('tasks')) throw new Error('La app Tareas no está activa en este equipo.');
      if (!can('tasksRead')) throw new Error('Falta el permiso tasksRead.');
      const queue = await listProductionWorkQueue(ctx.teamId, { limit: window, forUserId: ctx.userId });
      for (const rule of queue.rules) if (!productionRules.includes(rule)) productionRules.push(rule);
      for (const item of queue.items) {
        items.push({
          source: 'production',
          kind: `produccion_${item.workKind}`,
          key: String(item.taskId),
          // Debajo de un pedido comercial ya aprobado (2000) y arriba de
          // clasificar respuestas: producir algo que un cliente está esperando
          // vale más que ordenar la base.
          priority: WORK_PRIORITY.production + Math.min(199, item.priority % 200),
          // Nadie de afuera se entera de lo que hace producción hasta que hay
          // enlace: se puede ejecutar sin volver a preguntar.
          approval: 'ready',
          title: `${item.workKindLabel} · ${item.title}`,
          detail: item.blockedReason ?? (item.notes.slice(0, 200) || null),
          chatId: item.chatId,
          tools: item.tools,
          steps: item.steps,
          payload: item as unknown as Record<string, unknown>,
        });
        count += 1;
      }
    } catch (error) {
      skipped = error instanceof Error ? error.message : String(error);
    }
    record('production', skipped, count);
  }

  // ── Prompts de Tareas OS ──────────────────────────────────────────────────
  if (wanted.has('tasks')) {
    let skipped: string | null = null;
    let count = 0;
    try {
      if (!active.has('tasks')) throw new Error('La app Tareas no está activa en este equipo.');
      if (!can('tasksRead')) throw new Error('Falta el permiso tasksRead.');
      const worklist = await loadTaskAiWorklist(ctx.teamId, { limit: window });
      for (const item of worklist) {
        if (item.state === 'completed') continue;
        const { tools, steps, approval } = taskToolsAndSteps(item);
        items.push({
          source: 'tasks',
          kind: `task_${item.phase}`,
          // Sin el fingerprint a propósito: cambia con cada edición del prompt, y
          // una clave que se mueve sola no sirve para saltear ni para deduplicar.
          key: `${item.targetType}:${item.targetId}:${item.phase}`,
          priority:
            item.state === 'needs-context'
              ? WORK_PRIORITY.taskNeedsContext
              : item.phase === 'prepare'
                ? WORK_PRIORITY.taskPrepare
                : WORK_PRIORITY.taskExecute,
          approval,
          title: item.name,
          detail: item.state === 'needs-context' ? item.contextQuestion : item.nextStep || item.prompt || null,
          chatId: null,
          tools,
          steps,
          payload: {
            target_type: item.targetType,
            target_id: item.targetId,
            phase: item.phase,
            state: item.state,
            // El fingerprint viaja como dato: es el token de concurrencia que
            // `whatspro_tasks_ai_report` exige, y falla si el prompt cambió.
            fingerprint: item.fingerprint,
            prompt: item.prompt,
            inherited_prompt: item.inheritedPrompt,
            ai_next_step: item.nextStep,
            ai_context_question: item.contextQuestion,
            ai_context_answer: item.contextAnswer,
            workspace: item.workspace,
            project: item.project,
          },
        });
        count += 1;
      }
    } catch (error) {
      skipped = error instanceof Error ? error.message : String(error);
    }
    record('tasks', skipped, count);
  }

  // ── Bandeja del Centro de comandos ────────────────────────────────────────
  if (wanted.has('inbox')) {
    let skipped: string | null = null;
    let count = 0;
    try {
      const inbox = await getCommandCenter(ctx, { limit: Math.min(window, 30) });
      inbox.items.forEach((item, index) => {
        const { tools, steps } = inboxToolsAndSteps(item);
        items.push({
          source: 'inbox',
          kind: item.kind,
          key: item.id,
          priority: (item.urgent ? WORK_PRIORITY.inboxUrgent : WORK_PRIORITY.inboxNormal) - index,
          approval: 'needs_human',
          title: item.title,
          detail: item.detail,
          chatId: item.reply?.chatId ?? null,
          tools,
          steps,
          payload: {
            item_id: item.id,
            entity_id: item.entityId,
            urgent: item.urgent,
            at: item.at,
            href: item.href,
            actions: item.actions,
            default_action: item.defaultActionType,
          },
        });
        count += 1;
      });
    } catch (error) {
      skipped = error instanceof Error ? error.message : String(error);
    }
    record('inbox', skipped, count);
  }

  const filtered = opts.approval ? items.filter((item) => item.approval === opts.approval) : items;
  filtered.sort((a, b) => b.priority - a.priority);
  const page = filtered.slice(0, limit);

  const byKind: Record<string, number> = {};
  for (const item of filtered) byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;

  return {
    generatedAt: new Date().toISOString(),
    total: filtered.length,
    returned: page.length,
    // Honestidad sobre el corte: `total` es lo que hay dentro de la ventana
    // mirada, no el universo entero. Si la ventana se llenó, hay más atrás.
    truncated: filtered.length > page.length,
    counts: {
      bySource: {
        sales: filtered.filter((item) => item.source === 'sales').length,
        tasks: filtered.filter((item) => item.source === 'tasks').length,
        inbox: filtered.filter((item) => item.source === 'inbox').length,
        production: filtered.filter((item) => item.source === 'production').length,
      },
      byApproval: {
        ready: filtered.filter((item) => item.approval === 'ready').length,
        needs_human: filtered.filter((item) => item.approval === 'needs_human').length,
      },
      byKind,
    },
    sources,
    items: page,
    rules: [...RULES, ...salesRules.filter((rule) => !RULES.includes(rule)), ...productionRules.filter((rule) => !RULES.includes(rule))],
  };
}
