import 'server-only';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { assertPermission, parse, type GrokActionContext, type GrokActionTool } from '@/lib/plugins/grok-connector/server/actions';
import { isTerminalOperator, terminalRegistry } from '@/lib/terminal/access';
import { completePromptRun } from '@/lib/plugins/sales-ops/server/prompt-queue';
import { cancelMission, createMission, getMission, launchMissionToConnector, listMissions, updateMission } from '../server/missions';
import { listDevPrompts } from '../server/prompts';
import { MISSION_AGENTS, MISSION_MODES, MISSION_STATUSES, MISSION_STATUS_META, esAgenteMcp, type MissionRow } from '../shared/types';

const AGENTES_MCP = ['claude_desktop', 'codex_desktop', 'connector'] as const;

/**
 * Centro de Desarrollo por MCP (`whatspro_dev_*`).
 *
 * Un conector puede ver la biblioteca y las misiones, crear una misión para sí
 * mismo o para otro agente, y cerrar la suya con el resultado. La puerta es
 * doble: `tasksWrite` del miembro Y que el usuario detrás del conector esté en
 * la lista blanca de las terminales (`isTerminalOperator`): un conector de
 * otra persona no ve ni crea misiones, aunque tenga permisos de tareas.
 *
 * 🚨 `inputSchema` es JSON Schema puro: un `z.object` adentro hace desaparecer
 * la tool en silencio. Verificar con scripts/verify-connector-tools.mts.
 */

export const devCenterReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_dev_missions',
    description:
      'Centro de Desarrollo: misiones técnicas sobre los proyectos del servidor (WhatsPro, AAPP PRO, Contrataya), la biblioteca de prompts '
      + 'de desarrollo y la ficha de cada proyecto (carpeta, stack, comandos). Una misión de agente "connector" se encola como corrida y '
      + 'aparece en whatspro_work_queue como run_prompt. Las de claude_desktop / codex_desktop son para ESE cliente de escritorio; las "connector" '
      + 'las toma cualquiera. Cada ítem trae steps: tomarla (update running), trabajar con las tools, cerrarla (result). Las de "claude"/"codex" '
      + 'las ejecuta una persona en una terminal: no las tomes. Sólo para el operador de terminales.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'all', ...MISSION_STATUSES], description: 'open = abiertas (por defecto).' },
        for_agent: { type: 'string', enum: [...AGENTES_MCP], description: 'Quién pregunta: devuelve las misiones para ese agente más las "connector", abiertas primero.' },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
      },
      additionalProperties: false,
    },
  },
];

export const devCenterActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_dev_mission_manage',
    description:
      'Crea, actualiza, cierra o cancela una misión del Centro de Desarrollo. create: título + proyecto (slug del registro) + prompt (o '
      + 'prompt_key de la biblioteca con variables); agent por defecto "connector" (launch:true la encola ya). update: estado/prioridad/etiquetas. '
      + 'result: cierra con result_summary (status completed|failed). cancel: cancela (y su corrida si estaba en cola). '
      + 'No ejecuta nada por sí misma: una misión de conector se hace tomándola de whatspro_work_queue.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update', 'result', 'cancel'] },
        mission_id: { type: 'integer', minimum: 1 },
        title: { type: 'string', minLength: 2, maxLength: 200 },
        project: { type: 'string', maxLength: 40, description: 'Slug del registro: whatspro, aapp-pro, contrataya.' },
        agent: { type: 'string', enum: [...MISSION_AGENTS] },
        mode: { type: 'string', enum: [...MISSION_MODES] },
        prompt: { type: 'string', maxLength: 20000 },
        prompt_key: { type: 'string', maxLength: 64, description: 'Clave de la biblioteca (whatspro_dev_missions la lista). El prompt libre se agrega como indicación extra.' },
        variables: { type: 'object', additionalProperties: { type: 'string' }, description: 'Valores para las {{variables}} del prompt de la biblioteca.' },
        status: { type: 'string', enum: [...MISSION_STATUSES] },
        result_summary: { type: 'string', maxLength: 8000 },
        priority: { type: 'integer', minimum: 1, maximum: 3 },
        tags: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 40 } },
        launch: { type: 'boolean', description: 'create con agent MCP (connector, claude_desktop, codex_desktop): encolar ya.' },
        client: { type: 'string', maxLength: 40, description: 'Nombre del cliente que cierra (claude_desktop, codex_desktop…). Queda en la corrida.' },
      },
      additionalProperties: false,
    },
  },
];

const listSchema = z.object({ status: z.enum(['open', 'all', ...MISSION_STATUSES]).optional(), for_agent: z.enum(AGENTES_MCP).optional(), limit: z.number().int().min(1).max(200).optional() });
const manageSchema = z.object({
  action: z.enum(['create', 'update', 'result', 'cancel']),
  mission_id: z.number().int().positive().optional(),
  title: z.string().min(2).max(200).optional(),
  project: z.string().max(40).optional(),
  agent: z.enum(MISSION_AGENTS).optional(),
  mode: z.enum(MISSION_MODES).optional(),
  prompt: z.string().max(20000).optional(),
  prompt_key: z.string().max(64).optional(),
  variables: z.record(z.string(), z.string()).optional(),
  status: z.enum(MISSION_STATUSES).optional(),
  result_summary: z.string().max(8000).optional(),
  priority: z.number().int().min(1).max(3).optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
  launch: z.boolean().optional(),
  client: z.string().max(40).optional(),
});

/** Los tres pasos que un cliente MCP tiene que dar con una misión que tomó. */
function pasosDe(m: MissionRow): string[] {
  if (!esAgenteMcp(m.agent)) return ['Esta misión la ejecuta una persona en una terminal del servidor: no la tomes.'];
  return [
    `whatspro_dev_mission_manage {action: "update", mission_id: ${m.id}, status: "running"} al tomarla.`,
    'Trabajá con las tools de WhatsPro y AAPP SPACE según el prompt; leé antes de escribir y no reveles secretos.',
    `whatspro_dev_mission_manage {action: "result", mission_id: ${m.id}, status: "completed" | "failed" | "blocked", result_summary: "<qué hiciste, qué verificaste, qué queda>"}.`,
  ];
}

/** Las dos cerraduras: permiso del miembro y lista blanca de la persona detrás del conector. */
async function puertaTools(context: GrokActionContext) {
  await assertPermission(context, 'tasksWrite', 'tasks');
  const user = await db.query.users.findFirst({ where: eq(users.id, context.userId), columns: { email: true, deletedAt: true } });
  if (!isTerminalOperator(user)) throw new Error('El Centro de Desarrollo no está habilitado para el usuario de este conector.');
}

export async function executeDevCenterTool(name: string, input: Record<string, unknown>, context: GrokActionContext): Promise<unknown> {
  if (name === 'whatspro_dev_missions') {
    await puertaTools(context);
    const data = parse(listSchema, input);
    const registry = terminalRegistry();
    const [todas, prompts] = await Promise.all([listMissions(context.teamId, { status: data.status ?? 'open', limit: 500 }), listDevPrompts(context.teamId)]);
    // Para un escritorio: las suyas y las de cualquiera; nunca las del otro escritorio ni las de terminal.
    const filtradas = data.for_agent ? todas.filter((m) => m.agent === data.for_agent || m.agent === 'connector') : todas;
    const ordenadas = [...filtradas].sort((a, b) => Number(MISSION_STATUS_META[b.status].abierta) - Number(MISSION_STATUS_META[a.status].abierta) || a.priority - b.priority);
    const missions = ordenadas.slice(0, data.limit ?? 50).map((m) => ({ ...m, steps: pasosDe(m) }));
    return {
      note: data.for_agent
        ? `Misiones para ${data.for_agent} (y las de cualquier conector). Tomá la primera abierta, marcala running y cerrala con result. Las de claude/codex las abre una persona en una terminal: no aparecen acá.`
        : 'Una misión de agente MCP en queued ya está en whatspro_work_queue como run_prompt (run_id = promptRunId). Las de claude/codex las abre una persona en una terminal: no las tomes.',
      projects: registry.projects.map(({ slug, name: nombre, cwd, stack, productionUrl, defaultBranch, agents, commands }) => ({ slug, name: nombre, cwd, stack, productionUrl, defaultBranch, agents, commands })),
      missions,
      prompts: prompts.map(({ id, key, title, description, agentDefault, projectDefault, modeDefault, variables, pinned }) => ({ id, key, title, description, agentDefault, projectDefault, modeDefault, variables, pinned })),
    };
  }

  if (name === 'whatspro_dev_mission_manage') {
    await puertaTools(context);
    const data = parse(manageSchema, input);
    if (data.action === 'create') {
      if (!data.title) throw new Error('create necesita title.');
      const agent = data.agent ?? 'connector';
      // Sin proyecto: el de la plantilla, y si no, WhatsPro para los agentes MCP
      // (trabajan con tools, no con carpetas). Los de terminal sí lo necesitan.
      const plantilla = data.prompt_key ? (await listDevPrompts(context.teamId)).find((x) => x.key === data.prompt_key) : null;
      const project = data.project ?? plantilla?.projectDefault ?? (esAgenteMcp(agent) ? 'whatspro' : undefined);
      if (!project) throw new Error('create necesita project (whatspro, aapp-pro o contrataya).');
      const mission = await createMission(context.teamId, context.userId, {
        title: data.title,
        project,
        agent,
        mode: data.mode ?? 'editar',
        prompt: data.prompt,
        promptKey: data.prompt_key ?? null,
        variables: data.variables,
        priority: data.priority,
        tags: data.tags,
        launch: data.launch,
      });
      return { success: true, mission, note: mission.status === 'queued' ? `Encolada: run_id ${mission.promptRunId}. Aparece en whatspro_work_queue.` : esAgenteMcp(agent) ? 'Creada en borrador: encolala con action update status queued o desde el Centro de Desarrollo.' : 'Creada en borrador: la abre una persona desde Terminales.' };
    }
    if (!data.mission_id) throw new Error(`${data.action} necesita mission_id.`);
    if (data.action === 'cancel') return { success: true, mission: await cancelMission(context.teamId, context.userId, data.mission_id) };
    if (data.action === 'result') {
      const status = data.status === 'failed' ? 'failed' : data.status === 'blocked' ? 'blocked' : 'completed';
      const antes = await getMission(context.teamId, data.mission_id);
      if (!antes) throw new Error('No existe la misión.');
      // Cerrar la misión cierra también su corrida: la Cola del Command Center
      // y el Centro de Desarrollo tienen que decir lo mismo.
      if (antes.promptRunId && antes.runStatus && !['completed', 'failed', 'cancelled'].includes(antes.runStatus)) {
        await completePromptRun(context.teamId, context.userId, antes.promptRunId, {
          status,
          summary: data.result_summary ?? null,
          connector: data.client ?? (antes.agent === 'connector' ? 'mcp' : antes.agent),
          // `blocked` sin formulario se guarda como fallida (regla de la cola):
          // el resumen del agente se vuelve la pregunta y la persona responde en texto.
          ...(status === 'blocked' ? { metadata: { humanRequest: { title: 'La misión necesita una decisión', description: (data.result_summary ?? 'El agente pide una decisión humana.').slice(0, 2000), fields: [{ id: 'respuesta', type: 'textarea', label: 'Respuesta para el agente', required: true }] } } } : {}),
        }).catch((error) => console.error('[dev-center/result run]', error));
      }
      return { success: true, mission: await updateMission(context.teamId, context.userId, data.mission_id, { status, resultSummary: data.result_summary ?? null }) };
    }
    // update: encolar una de conector se hace con status queued; el resto es un patch.
    const actual = await getMission(context.teamId, data.mission_id);
    if (!actual) throw new Error('No existe la misión.');
    if (data.status === 'queued' && esAgenteMcp(actual.agent) && !actual.promptRunId) {
      return { success: true, mission: await launchMissionToConnector(context.teamId, context.userId, data.mission_id) };
    }
    return {
      success: true,
      mission: await updateMission(context.teamId, context.userId, data.mission_id, {
        ...(data.status !== undefined && { status: data.status }),
        ...(data.result_summary !== undefined && { resultSummary: data.result_summary }),
        ...(data.title !== undefined && { title: data.title }),
        ...(data.prompt !== undefined && { prompt: data.prompt }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.mode !== undefined && { mode: data.mode }),
      }),
    };
  }

  throw new Error(`dev-center: tool desconocida ${name}`);
}
