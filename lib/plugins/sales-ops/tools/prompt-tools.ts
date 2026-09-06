import 'server-only';
import { z } from 'zod';
import { parse, type GrokActionContext, type GrokActionTool } from '@/lib/plugins/grok-connector/server/actions';
import { LaunchError, approveRun, completePromptRun, editQueuedRun, getPromptRun, launchRun, listPromptRuns, PROMPT_RUN_STATUSES, relaunchRun } from '@/lib/plugins/sales-ops/server/prompt-queue';
import {
  duplicateSkill,
  getSkill,
  listSkillVersions,
  listSkills,
  recommendSkillsForChat,
  retireSkill,
  setSkillPinned,
  upsertSkill,
} from '@/lib/plugins/sales-ops/server/skills';
import {
  RUN_MODES,
  SKILL_CATEGORIES,
  SKILL_EXECUTIONS,
  SKILL_ICONS,
  SKILL_RECURRENCES,
  SKILL_SCOPES,
  SKILL_VARIABLE_TYPES,
  extractVariableNames,
  missingVariables,
  renderSkillText,
  type Skill,
} from '@/lib/plugins/sales-ops/shared/skills';
import { ANALYSIS_STATUSES, GATES, OWNERS, SIGNAL_KINDS } from '@/lib/plugins/sales-ops/shared/taxonomy';
import {
  HUMAN_DECISION_FIELD_TYPES,
  humanDecisionRequestSchema,
} from '@/lib/plugins/sales-ops/shared/human-decision';

/**
 * Prompt Studio por MCP: el gestor completo de skills para conectores.
 *
 * Un conector puede hacer acá todo lo que hace una persona en la vista: ver el
 * catálogo separado en rutinas y acciones puntuales, leer una skill con su
 * formulario de datos, completarlo, lanzarla (con la API del equipo o dejándola
 * en la cola), crear una nueva, versionarla y retirarla.
 *
 * 🚨 `inputSchema` es JSON Schema puro. Un `z.object` acá adentro hace
 * desaparecer la tool en silencio (verificar con scripts/verify-connector-tools.mts).
 */

// ── JSON Schema compartido ─────────────────────────────────────────────────

const variableSchemaJson = {
  type: 'object',
  description: 'Campo del formulario de datos dinámicos. Su `name` es la variable {{name}} dentro del texto.',
  properties: {
    name: { type: 'string', maxLength: 60, description: 'Nombre de la variable, sin llaves. Se normaliza a snake_case.' },
    label: { type: 'string', maxLength: 80, description: 'Cómo se muestra en el formulario.' },
    type: { type: 'string', enum: [...SKILL_VARIABLE_TYPES] },
    required: { type: 'boolean' },
    placeholder: { type: 'string', maxLength: 160 },
    help: { type: 'string', maxLength: 240 },
    options: { type: 'array', items: { type: 'string', maxLength: 120 }, maxItems: 40, description: 'Sólo para type=select.' },
    defaultValue: { type: 'string', maxLength: 400 },
  },
  required: ['name'],
  additionalProperties: false,
} as const;

const recommendForJson = {
  type: 'object',
  description: 'Dónde la skill se ofrece sola como siguiente acción en la ficha de un chat.',
  properties: {
    gates: { type: 'array', items: { type: 'string', enum: [...GATES] }, maxItems: 13 },
    statuses: { type: 'array', items: { type: 'string', enum: [...ANALYSIS_STATUSES] }, maxItems: 10 },
    signals: { type: 'array', items: { type: 'string', enum: [...SIGNAL_KINDS] }, maxItems: 12 },
    owners: { type: 'array', items: { type: 'string', enum: [...OWNERS] }, maxItems: 5 },
  },
  additionalProperties: false,
} as const;

const humanDecisionOptionJson = {
  type: 'object',
  properties: {
    label: { type: 'string', minLength: 1, maxLength: 80 },
    value: { type: 'string', minLength: 1, maxLength: 120 },
    description: { type: 'string', maxLength: 240 },
  },
  required: ['label', 'value'],
  additionalProperties: false,
} as const;

const humanDecisionFieldJson = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 48, pattern: '^[a-z][a-z0-9_]*$', description: 'Identificador estable en snake_case.' },
    type: { type: 'string', enum: [...HUMAN_DECISION_FIELD_TYPES], description: 'buttons = opciones visibles; select = desplegable; text = una línea; textarea = respuesta extensa; code = texto monoespaciado.' },
    label: { type: 'string', minLength: 1, maxLength: 160 },
    description: { type: 'string', maxLength: 600 },
    placeholder: { type: 'string', maxLength: 240 },
    required: { type: 'boolean' },
    options: { type: 'array', items: humanDecisionOptionJson, minItems: 2, maxItems: 8, description: 'Obligatorio para buttons y select.' },
    allow_other: { type: 'boolean', description: 'Permite que la persona elija “Otra respuesta” y escriba un valor propio.' },
    language: { type: 'string', maxLength: 32, description: 'Lenguaje sugerido para type=code, por ejemplo json o sql.' },
  },
  required: ['id', 'type', 'label'],
  additionalProperties: false,
} as const;

const humanDecisionRequestJson = {
  type: 'object',
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 160, description: 'La decisión concreta que tiene que tomar la persona.' },
    description: { type: 'string', maxLength: 2000, description: 'Contexto suficiente para decidir sin releer toda la corrida.' },
    fields: { type: 'array', items: humanDecisionFieldJson, minItems: 1, maxItems: 8 },
    submit_label: { type: 'string', maxLength: 60, description: 'Texto opcional del botón que devuelve la corrida a la cola.' },
  },
  required: ['title', 'fields'],
  additionalProperties: false,
} as const;

// ── Tools de lectura ───────────────────────────────────────────────────────

export const promptReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_sales_prompts_list',
    description:
      'Prompt Studio del Command Center Comercial: catálogo de skills del equipo (prompts guardados y versionados, con su formulario de datos dinámicos y su cadena de tools). Vienen separadas en `routines` (las que se usan de forma recurrente: diaria, semanal o mensual — son las que podés correr por tu cuenta cada vez que trabajás) y `on_demand` (acciones puntuales, que se lanzan cuando alguien lo pide). Cada skill dice cómo se ejecuta (`execution`: connector = va a la cola, api = la corre el servidor, both = elegís) y sobre qué se lanza (`scope`: team o chat). Usala antes de improvisar un prompt. Con `chat_id` agrega las skills recomendadas para ese chat y las corridas abiertas. No escribe nada.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['routine', 'on_demand', 'all'], description: 'Filtrar por recurrentes o puntuales. Por defecto all.' },
        category: { type: 'string', enum: [...SKILL_CATEGORIES] },
        target: { type: 'string', enum: ['team', 'chat'], description: 'Sólo las que se pueden lanzar sobre ese destino.' },
        search: { type: 'string', maxLength: 120 },
        include_runs: { type: 'boolean', description: 'true = incluir también las corridas queued/in_progress.' },
        include_text: { type: 'boolean', description: 'true = incluir el texto completo de cada skill (por defecto sólo un recorte).' },
        chat_id: { type: 'integer', minimum: 1, description: 'Agrega `recommended` para ese chat y filtra las corridas.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sales_prompt_get',
    description:
      'Devuelve una skill del Prompt Studio completa: su texto con las `{{variables}}` sin resolver, el formulario que hay que completar (nombre, etiqueta, tipo, si es obligatoria y sus opciones), la cadena de tools sugerida y el historial de versiones. Pedila antes de lanzar una skill que tenga variables, para saber qué datos te va a pedir. Identificá la skill por `key` o por `id`.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', maxLength: 64 },
        id: { type: 'integer', minimum: 1 },
        include_versions: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sales_prompt_render',
    description:
      'Completa el formulario de una skill y devuelve el prompt final listo para ejecutar, sin encolar ni correr nada. Es la forma de "llenar" una skill con datos dinámicos desde el conector: pasás `variables` con los valores y recibís el texto resuelto. Si falta alguna variable obligatoria te dice cuáles y el texto vuelve con el hueco marcado «así», para que no ejecutes una instrucción incompleta. No escribe nada.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', maxLength: 64 },
        id: { type: 'integer', minimum: 1 },
        variables: { type: 'object', description: 'Valores del formulario: { nombre_variable: "valor" }.', additionalProperties: { type: 'string', maxLength: 4000 } },
        chat_id: { type: 'integer', minimum: 1, description: 'Si la skill se lanza sobre un chat, agrega el bloque de contexto con ese chat_id.' },
      },
      additionalProperties: false,
    },
  },
];

// ── Tools de escritura ─────────────────────────────────────────────────────

export const promptActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_sales_prompt_manage',
    description:
      'Crea, edita, duplica, fija o retira una skill del Prompt Studio. action=create crea una skill nueva; action=update la versiona (la versión nueva queda activa y la anterior retirada, sin perder el historial: mandá el objeto completo, no un parche); action=duplicate la copia para editarla aparte; action=pin la fija arriba en la vista; action=retire la saca de circulación sin borrar las corridas que ya la usaron. Declarar `variables` la convierte en una skill con formulario: quien la lance —persona o conector— completa esos datos antes de ejecutar. `recommend_for` hace que aparezca sola como siguiente acción en la ficha de los chats que cumplan la condición. Aceptá dry_run para ver el resultado sin guardar.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['create', 'update', 'duplicate', 'pin', 'retire'] },
        key: { type: 'string', maxLength: 64, description: 'Identifica la skill en update/pin/retire; en create fija la key (si no, se deriva del título).' },
        id: { type: 'integer', minimum: 1, description: 'Alternativa a key para update/duplicate/pin/retire.' },
        title: { type: 'string', minLength: 3, maxLength: 160 },
        text: { type: 'string', minLength: 5, maxLength: 20000, description: 'El prompt que se va a ejecutar tal cual, con {{variables}} donde haga falta.' },
        description: { type: 'string', maxLength: 400, description: 'Una línea de qué hace. Es lo que se lee en la tarjeta y en el listado.' },
        category: { type: 'string', enum: [...SKILL_CATEGORIES] },
        icon: { type: 'string', enum: [...SKILL_ICONS] },
        recurrence: { type: 'string', enum: [...SKILL_RECURRENCES], description: 'on_demand = puntual; daily/weekly/monthly = rutina que los conectores pueden correr de forma recurrente.' },
        execution: { type: 'string', enum: [...SKILL_EXECUTIONS], description: 'connector = a la cola; api = la corre el servidor con la IA del equipo; both = se elige al lanzar.' },
        scope: { type: 'string', enum: [...SKILL_SCOPES], description: 'team, chat o both: sobre qué se puede lanzar.' },
        variables: { type: 'array', items: variableSchemaJson, maxItems: 20 },
        recommend_for: recommendForJson,
        tool_chain: { type: 'array', items: { type: 'string', maxLength: 80 }, maxItems: 20 },
        notes: { type: 'string', maxLength: 2000 },
        pinned: { type: 'boolean', description: 'Para action=pin: true fija, false suelta.' },
        dry_run: { type: 'boolean' },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sales_prompt_launch',
    description:
      'Lanza una skill del Prompt Studio (o un prompt suelto) y deja el rastro en la actividad del Studio. mode="api" la ejecuta ahí mismo con la IA del equipo y te devuelve la salida en `run.output` (ese motor no tiene tools: sirve para redactar, resumir o analizar, no para ejecutar). mode="queue" la deja en "En revisión" de la Cola: una persona la aprueba (o la edita antes) y recién ahí la toma un conector desde whatspro_sales_work_queue; usá ese modo cuando la skill necesite tools. Si la skill tiene formulario, pasá `variables`: sin las obligatorias no se lanza y te devuelve cuáles faltan. Con target_kind="chat" hay que pasar target_id. No toca el CRM.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', maxLength: 64 },
        id: { type: 'integer', minimum: 1, description: 'Id de la skill. Alternativa a key.' },
        text: { type: 'string', maxLength: 20000, description: 'Prompt suelto, o indicación extra que se agrega al final de la skill.' },
        title: { type: 'string', maxLength: 160 },
        target_kind: { type: 'string', enum: ['team', 'chat', 'batch'], description: 'batch = una indicación para todo un lote de la Cola (pasá target_ref con el batch_id).' },
        target_id: { type: 'integer', minimum: 1, description: 'chat_id cuando target_kind=chat.' },
        target_ref: { type: 'string', maxLength: 64, description: 'batch_id cuando target_kind=batch.' },
        variables: { type: 'object', additionalProperties: { type: 'string', maxLength: 4000 } },
        mode: { type: 'string', enum: [...RUN_MODES] },
        dry_run: { type: 'boolean' },
      },
      required: ['target_kind'],
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sales_prompt_result',
    description:
      'Cierra (o marca en curso) una corrida del Prompt Studio que tomaste de whatspro_sales_work_queue (ítems kind=run_prompt). status: in_progress (la tomaste), completed (hecha; contá en summary qué hiciste en 1-3 líneas y dejá el resultado completo en output si lo hay), failed (no se pudo; motivo en summary), blocked (falta criterio humano). Cuando blocked, mandá human_request para que el Command Center dibuje la pregunta como botones, select, texto, área de texto o código. La persona responde ahí y la misma corrida vuelve a queued con su respuesta anexada; no inventes la decisión ni crees otra corrida. Es la única forma de que la interfaz sepa qué pasó. No toca el CRM.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'integer', minimum: 1 },
        status: { type: 'string', enum: ['in_progress', 'completed', 'failed', 'blocked'] },
        summary: { type: 'string', maxLength: 4000, description: 'Qué se hizo o por qué no.' },
        output: { type: 'string', maxLength: 60000, description: 'Resultado completo (el texto redactado, el informe, la tabla).' },
        connector: { type: 'string', enum: ['claude', 'chatgpt', 'grok'], description: 'Quién ejecutó.' },
        human_request: humanDecisionRequestJson,
        dry_run: { type: 'boolean' },
      },
      required: ['run_id', 'status'],
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sales_run_manage',
    description:
      'Administra una corrida del Prompt Studio que ya existe (las de whatspro_sales_prompts_list include_runs o de la actividad). ' +
      'action=approve: aprueba una corrida que espera en "En revisión" (las que lanza un conector con mode=queue nacen sin aprobar y ' +
      'no aparecen en whatspro_sales_work_queue hasta que una persona, o vos por pedido explícito de una persona, la apruebe). action=cancel: saca de la cola una corrida que no debe ejecutarse (todo menos lo ya completed). action=edit: corrige text y/o title ' +
      'de una corrida que todavía espera una decisión —queued, failed o blocked, o sea todo lo que la Cola lista "para ' +
      'supervisar"—; en una fallida, el texto corregido es el que se va a reintentar. No se edita lo que un conector está ' +
      'ejecutando (in_progress), lo terminado (completed) ni lo cancelado. action=retry: vuelve a lanzar una corrida fallida, cancelada o bloqueada con el ' +
      'mismo texto ya resuelto; mode="api" la corre ahí mismo con la IA del equipo, mode="queue" (default) la deja para un ' +
      'conector. La original queda cancelled con `relaunchedAs` apuntando a la nueva: no la reintentes dos veces. Ninguna toca el CRM.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['approve', 'cancel', 'edit', 'retry'] },
        run_id: { type: 'integer', minimum: 1 },
        text: { type: 'string', maxLength: 20000, description: 'Para edit: nuevo texto completo.' },
        title: { type: 'string', maxLength: 160, description: 'Para edit: nuevo título.' },
        mode: { type: 'string', enum: [...RUN_MODES], description: 'Para retry. Default queue.' },
        reason: { type: 'string', maxLength: 400, description: 'Para cancel: por qué (queda en summary).' },
        dry_run: { type: 'boolean' },
      },
      required: ['action', 'run_id'],
      additionalProperties: false,
    },
  },
];

// ── Validación de entrada ──────────────────────────────────────────────────

const variableSchema = z.object({
  name: z.string().max(60),
  label: z.string().max(80).optional(),
  type: z.enum(SKILL_VARIABLE_TYPES).optional(),
  required: z.boolean().optional(),
  placeholder: z.string().max(160).nullable().optional(),
  help: z.string().max(240).nullable().optional(),
  options: z.array(z.string().max(120)).max(40).optional(),
  defaultValue: z.string().max(400).nullable().optional(),
});

const recommendForSchema = z.object({
  gates: z.array(z.enum(GATES)).optional(),
  statuses: z.array(z.enum(ANALYSIS_STATUSES)).optional(),
  signals: z.array(z.enum(SIGNAL_KINDS)).optional(),
  owners: z.array(z.enum(OWNERS)).optional(),
});

const runManageSchema = z.object({
  action: z.enum(['approve', 'cancel', 'edit', 'retry']),
  run_id: z.number().int().positive(),
  text: z.string().max(20000).optional(),
  title: z.string().max(160).optional(),
  mode: z.enum(RUN_MODES).optional(),
  reason: z.string().max(400).optional(),
  dry_run: z.boolean().optional(),
});

const listSchema = z.object({
  kind: z.enum(['routine', 'on_demand', 'all']).optional(),
  category: z.enum(SKILL_CATEGORIES).optional(),
  target: z.enum(['team', 'chat']).optional(),
  search: z.string().max(120).optional(),
  include_runs: z.boolean().optional(),
  include_text: z.boolean().optional(),
  chat_id: z.number().int().positive().optional(),
});

const refSchema = z.object({
  key: z.string().max(64).optional(),
  id: z.number().int().positive().optional(),
  include_versions: z.boolean().optional(),
});

const renderSchema = z.object({
  key: z.string().max(64).optional(),
  id: z.number().int().positive().optional(),
  variables: z.record(z.string().max(60), z.string().max(4000)).optional(),
  chat_id: z.number().int().positive().optional(),
});

const manageSchema = z.object({
  action: z.enum(['create', 'update', 'duplicate', 'pin', 'retire']),
  key: z.string().max(64).optional(),
  id: z.number().int().positive().optional(),
  title: z.string().min(3).max(160).optional(),
  text: z.string().min(5).max(20000).optional(),
  description: z.string().max(400).optional(),
  category: z.enum(SKILL_CATEGORIES).optional(),
  icon: z.enum(SKILL_ICONS).optional(),
  recurrence: z.enum(SKILL_RECURRENCES).optional(),
  execution: z.enum(SKILL_EXECUTIONS).optional(),
  scope: z.enum(SKILL_SCOPES).optional(),
  variables: z.array(variableSchema).max(20).optional(),
  recommend_for: recommendForSchema.optional(),
  tool_chain: z.array(z.string().max(80)).max(20).optional(),
  notes: z.string().max(2000).optional(),
  pinned: z.boolean().optional(),
  dry_run: z.boolean().optional(),
});

const launchSchema = z.object({
  key: z.string().max(64).optional(),
  id: z.number().int().positive().optional(),
  text: z.string().max(20000).optional(),
  title: z.string().max(160).optional(),
  target_kind: z.enum(['team', 'chat', 'batch']),
  target_id: z.number().int().positive().optional(),
  target_ref: z.string().max(64).optional(),
  variables: z.record(z.string().max(60), z.string().max(4000)).optional(),
  mode: z.enum(RUN_MODES).optional(),
  dry_run: z.boolean().optional(),
});

const resultSchema = z.object({
  run_id: z.number().int().positive(),
  status: z.enum(['in_progress', 'completed', 'failed', 'blocked']),
  summary: z.string().max(4000).optional(),
  output: z.string().max(60000).optional(),
  connector: z.enum(['claude', 'chatgpt', 'grok']).optional(),
  human_request: z.object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2000).optional(),
    fields: z.array(z.object({
      id: z.string().trim().min(1).max(48),
      type: z.enum(HUMAN_DECISION_FIELD_TYPES),
      label: z.string().trim().min(1).max(160),
      description: z.string().trim().max(600).optional(),
      placeholder: z.string().trim().max(240).optional(),
      required: z.boolean().optional(),
      options: z.array(z.object({
        label: z.string().trim().min(1).max(80),
        value: z.string().trim().min(1).max(120),
        description: z.string().trim().max(240).optional(),
      })).min(2).max(8).optional(),
      allow_other: z.boolean().optional(),
      language: z.string().trim().max(32).optional(),
    })).min(1).max(8),
    submit_label: z.string().trim().max(60).optional(),
  }).optional(),
  dry_run: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (value.human_request && value.status !== 'blocked') {
    ctx.addIssue({ code: 'custom', path: ['human_request'], message: 'human_request sólo corresponde con status=blocked.' });
  }
  // Un `blocked` sin formulario no le dice a nadie qué decidir: la Cola lo
  // dibujaba como falla sin motivo. O se pide la decisión, o es `failed`.
  if (value.status === 'blocked' && !value.human_request) {
    ctx.addIssue({ code: 'custom', path: ['human_request'], message: 'status=blocked exige human_request con la decisión que tiene que tomar la persona. Si no hay nada que decidir, usá status=failed con el motivo en summary.' });
  }
});

// ── Serialización para el conector ─────────────────────────────────────────

/**
 * Un catálogo de 30 skills con su texto completo son decenas de miles de
 * tokens que el conector no necesita para elegir. El listado va recortado y el
 * texto entero se pide con `whatspro_sales_prompt_get` o se resuelve con
 * `whatspro_sales_prompt_render`.
 */
function summarize(skill: Skill, includeText: boolean) {
  return {
    id: skill.id,
    key: skill.key,
    title: skill.title,
    description: skill.description,
    category: skill.category,
    recurrence: skill.recurrence,
    execution: skill.execution,
    scope: skill.scope,
    pinned: skill.pinned,
    version: skill.version,
    usage_count: skill.usageCount,
    last_used_at: skill.lastUsedAt,
    tool_chain: skill.toolChain,
    variables: skill.variables.map((v) => ({ name: v.name, label: v.label, type: v.type, required: v.required, options: v.options ?? null })),
    recommend_for: skill.recommendFor,
    text: includeText ? skill.text : `${skill.text.slice(0, 400)}${skill.text.length > 400 ? '…' : ''}`,
  };
}

async function resolveSkill(teamId: number, ref: { key?: string; id?: number }): Promise<Skill> {
  if (!ref.key && !ref.id) throw new Error('Indicá la skill por `key` o por `id`.');
  const skill = await getSkill(teamId, { id: ref.id ?? null, key: ref.key ?? null });
  if (!skill) throw new Error(`No existe una skill viva con ${ref.id ? `id ${ref.id}` : `key "${ref.key}"`}.`);
  return skill;
}

// ── Ejecución ──────────────────────────────────────────────────────────────

export async function executePromptTool(name: string, input: Record<string, unknown>, context: GrokActionContext): Promise<unknown> {
  if (name === 'whatspro_sales_prompts_list') {
    const args = parse(listSchema, input);
    const skills = await listSkills(context.teamId, {
      category: args.category,
      target: args.target,
      search: args.search,
      kind: args.kind === 'all' ? undefined : args.kind,
    });
    // Cada corrida trae `approved`: una `queued` sin aprobar está "En revisión"
    // y el conector no la va a ver en whatspro_sales_work_queue todavía.
    const runs = args.include_runs || args.chat_id ? await listPromptRuns(context.teamId, { status: 'open', chatId: args.chat_id, limit: 100 }) : [];
    const recommended = args.chat_id ? await recommendSkillsForChat(context.teamId, args.chat_id, 6) : null;
    return {
      routines: skills.filter((s) => s.recurrence !== 'on_demand').map((s) => summarize(s, args.include_text === true)),
      on_demand: skills.filter((s) => s.recurrence === 'on_demand').map((s) => summarize(s, args.include_text === true)),
      recommended: recommended
        ? { situation: recommended.situation, skills: recommended.recommendations.map((r) => ({ ...summarize(r.skill, false), reason: r.reason })) }
        : null,
      runs,
      statuses: PROMPT_RUN_STATUSES,
      modes: RUN_MODES,
      how_to:
        'Elegí una skill y lanzala con whatspro_sales_prompt_launch. Si tiene `variables`, completalas ahí mismo (o pedí el texto resuelto con whatspro_sales_prompt_render). Las de `routines` son las que se corren de forma recurrente; las de `on_demand` sólo cuando alguien las pide.',
    };
  }

  if (name === 'whatspro_sales_prompt_get') {
    const args = parse(refSchema, input);
    const skill = await resolveSkill(context.teamId, args);
    return {
      skill: { ...summarize(skill, true), notes: skill.notes, variables: skill.variables },
      /** Variables usadas en el texto que no están declaradas: las completa el conector a criterio. */
      undeclared_variables: extractVariableNames(skill.text).filter((n) => !skill.variables.some((v) => v.name === n)),
      versions: args.include_versions ? (await listSkillVersions(context.teamId, skill.key)).map((v) => ({ id: v.id, version: v.version, status: v.status, updated_at: v.updatedAt })) : undefined,
    };
  }

  if (name === 'whatspro_sales_prompt_render') {
    const args = parse(renderSchema, input);
    const skill = await resolveSkill(context.teamId, args);
    const values = args.variables ?? {};
    const missing = missingVariables(skill.variables, values);
    const body = renderSkillText(skill.text, skill.variables, values);
    const contexto = args.chat_id ? `\n\nCONTEXTO: chat_id ${args.chat_id}. Usá whatspro_sales_dossier {chat_id: ${args.chat_id}} si necesitás el historial.` : '';
    const tools = skill.toolChain.length ? `\n\nTOOLS SUGERIDAS: ${skill.toolChain.join(' → ')}` : '';
    return {
      key: skill.key,
      version: skill.version,
      prompt: `${body}${tools}${contexto}`,
      missing_variables: missing.map((v) => ({ name: v.name, label: v.label, type: v.type, options: v.options ?? null })),
      ready: missing.length === 0,
      execution: skill.execution,
      scope: skill.scope,
    };
  }

  if (name === 'whatspro_sales_prompt_manage') {
    const args = parse(manageSchema, input);

    if (args.action === 'pin') {
      const skill = await resolveSkill(context.teamId, args);
      if (args.dry_run) return { dryRun: true, action: 'pin', key: skill.key, pinned: args.pinned !== false };
      return { skill: summarize(await setSkillPinned(context.teamId, context.userId ?? 0, skill.id, args.pinned !== false), false) };
    }

    if (args.action === 'retire') {
      const skill = await resolveSkill(context.teamId, args);
      if (args.dry_run) return { dryRun: true, action: 'retire', key: skill.key };
      return { retired: await retireSkill(context.teamId, context.userId ?? 0, skill.key), key: skill.key };
    }

    if (args.action === 'duplicate') {
      const skill = await resolveSkill(context.teamId, args);
      if (args.dry_run) return { dryRun: true, action: 'duplicate', from: skill.key };
      return { skill: summarize(await duplicateSkill(context.teamId, context.userId ?? 0, skill.id), false) };
    }

    // create | update: `update` parte de la skill existente y pisa sólo lo que vino.
    const previous = args.action === 'update' ? await resolveSkill(context.teamId, args) : null;
    const payload = {
      key: args.action === 'update' ? previous!.key : (args.key ?? null),
      title: args.title ?? previous?.title ?? '',
      text: args.text ?? previous?.text ?? '',
      description: args.description ?? previous?.description ?? null,
      category: args.category ?? previous?.category,
      icon: args.icon ?? previous?.icon,
      recurrence: args.recurrence ?? previous?.recurrence,
      execution: args.execution ?? previous?.execution,
      scope: args.scope ?? previous?.scope,
      variables: args.variables ?? previous?.variables,
      recommendFor: args.recommend_for ?? previous?.recommendFor,
      toolChain: args.tool_chain ?? previous?.toolChain,
      notes: args.notes ?? previous?.notes ?? null,
      pinned: args.pinned ?? previous?.pinned ?? false,
    };
    if (!payload.title || payload.title.length < 3) throw new Error('Falta `title` (mínimo 3 caracteres).');
    if (!payload.text || payload.text.length < 5) throw new Error('Falta `text` (mínimo 5 caracteres).');
    if (args.dry_run) return { dryRun: true, action: args.action, skill: payload };
    const saved = await upsertSkill(context.teamId, context.userId ?? 0, payload);
    return { skill: { ...summarize(saved, true), variables: saved.variables } };
  }

  if (name === 'whatspro_sales_prompt_launch') {
    const args = parse(launchSchema, input);
    if (args.dry_run) {
      const skill = args.key || args.id ? await resolveSkill(context.teamId, args) : null;
      const missing = skill ? missingVariables(skill.variables, args.variables ?? {}) : [];
      return {
        dryRun: true,
        key: skill?.key ?? 'manual',
        mode: args.mode ?? (skill ? (skill.execution === 'connector' ? 'queue' : 'api') : 'queue'),
        ready: missing.length === 0,
        missing_variables: missing.map((v) => ({ name: v.name, label: v.label })),
        prompt: skill ? renderSkillText(skill.text, skill.variables, args.variables ?? {}) : (args.text ?? ''),
      };
    }
    try {
      const skill = args.key || args.id ? await resolveSkill(context.teamId, args) : null;
      const { run } = await launchRun(context.teamId, context.userId ?? null, {
        skillId: skill?.id ?? null,
        text: args.text ?? null,
        title: args.title ?? null,
        targetKind: args.target_kind,
        targetId: args.target_id ?? null,
        targetRef: args.target_ref ?? null,
        variables: args.variables,
        mode: args.mode,
      });
      return { run };
    } catch (error) {
      if (error instanceof LaunchError) {
        return { error: error.message, missing_variables: error.missing.map((v) => ({ name: v.name, label: v.label, type: v.type, options: v.options ?? null })) };
      }
      throw error;
    }
  }

  if (name === 'whatspro_sales_prompt_result') {
    const args = parse(resultSchema, input);
    const humanRequest = args.human_request
      ? humanDecisionRequestSchema.parse({
          title: args.human_request.title,
          description: args.human_request.description,
          fields: args.human_request.fields.map((field) => ({
            ...field,
            allowOther: field.allow_other,
            allow_other: undefined,
          })),
          submitLabel: args.human_request.submit_label,
        })
      : null;
    if (args.dry_run) return { dryRun: true, runId: args.run_id, status: args.status, humanRequest };
    const existing = await getPromptRun(context.teamId, args.run_id);
    if (!existing) throw new Error(`No existe la corrida ${args.run_id} en este equipo.`);
    return completePromptRun(context.teamId, context.userId ?? null, args.run_id, {
      status: args.status,
      summary: args.summary ?? humanRequest?.description ?? humanRequest?.title ?? null,
      output: args.output ?? null,
      connector: args.connector ?? 'connector',
      metadata: humanRequest ? { humanRequest, humanRequestedAt: new Date().toISOString() } : undefined,
    });
  }

  if (name === 'whatspro_sales_run_manage') {
    const args = parse(runManageSchema, input);
    const existing = await getPromptRun(context.teamId, args.run_id);
    if (!existing) throw new Error(`No existe la corrida ${args.run_id} en este equipo.`);
    if (args.dry_run) return { dryRun: true, action: args.action, run: existing };
    try {
      if (args.action === 'approve') {
        const run = await approveRun(context.teamId, context.userId ?? null, args.run_id);
        return { run, note: 'Aprobada: ya la puede tomar un conector desde whatspro_sales_work_queue.' };
      }
      if (args.action === 'cancel') {
        // Qué se puede cancelar lo decide `completePromptRun`: la misma regla
        // que la interfaz, para que un camino no permita lo que el otro niega.
        const run = await completePromptRun(context.teamId, context.userId ?? null, args.run_id, {
          status: 'cancelled',
          summary: args.reason ?? 'Cancelada por conector',
          connector: 'connector',
        });
        return { run, note: 'Cancelada. Si hace falta volver a lanzarla, usá action=retry.' };
      }
      if (args.action === 'edit') {
        const run = await editQueuedRun(context.teamId, context.userId ?? null, args.run_id, { text: args.text, title: args.title });
        return { run };
      }
      const mode = args.mode ?? 'queue';
      const { run, from } = await relaunchRun(context.teamId, context.userId ?? null, args.run_id, mode);
      return { run, from, note: mode === 'api' ? (run.status === 'failed' ? `Volvió a fallar: ${run.summary ?? 'sin motivo'}` : 'Ejecutada con la IA del equipo; la salida está en run.output.') : 'En la cola: la toma el próximo conector que pida trabajo.' };
    } catch (error) {
      if (error instanceof LaunchError) throw new Error(error.message);
      throw error;
    }
  }

  throw new Error(`sales-ops prompts: tool desconocida ${name}`);
}
