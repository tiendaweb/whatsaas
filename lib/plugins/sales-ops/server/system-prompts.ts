import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamPrompts } from '@/lib/db/schema';
import { FOCUS_SYSTEM_PROMPT, FOCUS_USER_TEMPLATE } from './focus';
import {
  SALES_OPS_CLASSIFY_PROMPT,
  SALES_OPS_RADAR_PROMPT,
  type ActivePrompt,
  getPromptForDefinition,
} from './prompts';
import { SKILL_API_SYSTEM_PROMPT, SKILL_API_USER_TEMPLATE } from './skill-runner';
import { SUGGESTIONS_SYSTEM_PROMPT, SUGGESTIONS_USER_TEMPLATE } from './suggestions';
import { TASKS_OS_PRODUCTION_SYSTEM_PROMPT, TASKS_OS_PRODUCTION_USER_TEMPLATE } from '@/lib/plugins/tasks/server/production-os';

export const SYSTEM_PROMPT_MODULES = [
  { id: 'radar', label: 'Radar', description: 'Lectura de respuestas nuevas del cliente.' },
  { id: 'command-center', label: 'Command Center', description: 'Clasificación, próximas acciones y ejecución comercial.' },
  { id: 'tasks', label: 'Tareas OS', description: 'Preparación y ejecución del trabajo operativo.' },
] as const;

export type SystemPromptModule = (typeof SYSTEM_PROMPT_MODULES)[number]['id'];

export type SystemPromptDefinition = {
  key: string;
  title: string;
  module: SystemPromptModule;
  description: string;
  filePath: string;
  systemPrompt: string;
  userTemplate: string;
  variables: string[];
  toolChain: string[];
};

export const SYSTEM_PROMPT_DEFINITIONS: SystemPromptDefinition[] = [
  {
    ...SALES_OPS_CLASSIFY_PROMPT,
    module: 'command-center',
    description: 'Audita un expediente y decide gate, señales, responsable y próxima acción.',
    filePath: 'lib/plugins/sales-ops/server/prompts.ts',
    variables: ['facts_json', 'dossier_json'],
  },
  {
    key: 'sales-ops.suggestions',
    title: 'Sugerencias de próximas acciones',
    module: 'command-center',
    description: 'Elige hasta tres skills o acciones concretas para un chat.',
    filePath: 'lib/plugins/sales-ops/server/suggestions.ts',
    systemPrompt: SUGGESTIONS_SYSTEM_PROMPT,
    userTemplate: SUGGESTIONS_USER_TEMPLATE,
    variables: ['catalogo', 'situacion', 'dossier_json'],
    toolChain: [],
  },
  {
    ...SALES_OPS_RADAR_PROMPT,
    module: 'radar',
    description: 'Clasifica un mensaje entrante y detecta urgencia o avance de gate.',
    filePath: 'lib/plugins/sales-ops/server/prompts.ts',
    variables: ['current_gate', 'context_json', 'message_id', 'message_text'],
  },
  {
    key: 'sales-ops.focus',
    title: 'Asistente de Focus',
    module: 'command-center',
    description: 'Decide si redactar, programar, proponer CRM/cobro o derivar al conector.',
    filePath: 'lib/plugins/sales-ops/server/focus.ts',
    systemPrompt: FOCUS_SYSTEM_PROMPT,
    userTemplate: FOCUS_USER_TEMPLATE,
    variables: ['contexto', 'instruccion'],
    toolChain: [],
  },
  {
    key: 'sales-ops.skill-api',
    title: 'Motor API de Prompt Studio',
    module: 'command-center',
    description: 'Marco de seguridad y estilo para ejecutar una skill sin herramientas.',
    filePath: 'lib/plugins/sales-ops/server/skill-runner.ts',
    systemPrompt: SKILL_API_SYSTEM_PROMPT,
    userTemplate: SKILL_API_USER_TEMPLATE,
    variables: ['contexto', 'instruccion'],
    toolChain: [],
  },
  {
    key: 'tasks.production-execute',
    title: 'Ejecutor de pedidos de Producción',
    module: 'tasks',
    description: 'Combina el pedido, su checklist y el prompt operativo antes de ejecutarlo con la IA del equipo.',
    filePath: 'lib/plugins/tasks/server/production-os.ts',
    systemPrompt: TASKS_OS_PRODUCTION_SYSTEM_PROMPT,
    userTemplate: TASKS_OS_PRODUCTION_USER_TEMPLATE,
    variables: ['task_id', 'task_title', 'status', 'context', 'checklist', 'instruction'],
    toolChain: [],
  },
];

export type SystemPromptVersion = {
  id: number | null;
  version: number;
  status: 'active' | 'retired' | 'default';
  title: string;
  systemPrompt: string;
  userTemplate: string;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  createdBy: number | null;
};

export type SystemPromptDocument = Omit<SystemPromptDefinition, 'systemPrompt' | 'userTemplate'> & {
  active: ActivePrompt;
  versions: SystemPromptVersion[];
};

export function getSystemPromptDefinition(key: string): SystemPromptDefinition | null {
  return SYSTEM_PROMPT_DEFINITIONS.find((definition) => definition.key === key) ?? null;
}

export async function listSystemPromptDocuments(teamId: number): Promise<SystemPromptDocument[]> {
  const rows = await db.query.teamPrompts.findMany({
    where: eq(teamPrompts.teamId, teamId),
    columns: {
      id: true,
      key: true,
      version: true,
      status: true,
      title: true,
      systemPrompt: true,
      userTemplate: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      createdBy: true,
    },
    orderBy: (table, { desc }) => [desc(table.version)],
  });

  return Promise.all(
    SYSTEM_PROMPT_DEFINITIONS.map(async (definition) => {
      const ownRows = rows.filter((row) => row.key === definition.key);
      const active = await getPromptForDefinition(teamId, definition);
      return {
        key: definition.key,
        title: definition.title,
        module: definition.module,
        description: definition.description,
        filePath: definition.filePath,
        variables: definition.variables,
        toolChain: definition.toolChain,
        active,
        versions: [
          ...ownRows.map((row) => ({
            id: row.id,
            version: row.version,
            status: row.status === 'active' ? ('active' as const) : ('retired' as const),
            title: row.title,
            systemPrompt: row.systemPrompt,
            userTemplate: row.userTemplate,
            notes: row.notes,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            createdBy: row.createdBy,
          })),
          {
            id: null,
            version: 0,
            status: 'default' as const,
            title: `${definition.title} · archivo base`,
            systemPrompt: definition.systemPrompt,
            userTemplate: definition.userTemplate,
            notes: `Documento base en ${definition.filePath}`,
            createdAt: null,
            updatedAt: null,
            createdBy: null,
          },
        ],
      };
    }),
  );
}

export type SaveSystemPromptInput = {
  key: string;
  systemPrompt: string;
  userTemplate: string;
  notes?: string | null;
  expectedVersion?: number;
};

/** Guarda una copia por equipo; el archivo base queda intacto y siempre recuperable. */
export async function saveSystemPromptVersion(teamId: number, userId: number, input: SaveSystemPromptInput) {
  const definition = getSystemPromptDefinition(input.key);
  if (!definition) throw new Error('Este prompt del sistema no existe.');
  const systemPrompt = input.systemPrompt.trim();
  const userTemplate = input.userTemplate.trim();
  if (systemPrompt.length < 20) throw new Error('Las instrucciones del sistema son demasiado cortas.');
  if (userTemplate.length < 3) throw new Error('La plantilla de entrada está vacía.');

  const previous = await db.query.teamPrompts.findMany({
    where: and(eq(teamPrompts.teamId, teamId), eq(teamPrompts.key, definition.key)),
    columns: { version: true },
  });
  const currentVersion = previous.reduce((max, row) => Math.max(max, row.version), 0);
  if (typeof input.expectedVersion === 'number' && input.expectedVersion !== currentVersion) {
    throw new Error('Este documento cambió en otra ventana. Recargalo antes de guardar.');
  }
  const version = currentVersion + 1;
  const row = await db.transaction(async (tx) => {
    await tx
      .update(teamPrompts)
      .set({ status: 'retired', updatedAt: new Date() })
      .where(and(eq(teamPrompts.teamId, teamId), eq(teamPrompts.key, definition.key)));
    const [created] = await tx
      .insert(teamPrompts)
      .values({
        teamId,
        key: definition.key,
        title: definition.title,
        purpose: 'system',
        audience: 'server',
        version,
        status: 'active',
        systemPrompt,
        userTemplate,
        toolChain: definition.toolChain,
        notes: input.notes?.trim().slice(0, 2000) || null,
        createdBy: userId,
      })
      .returning();
    return created;
  });
  await db.insert(activityLogs).values({
    teamId,
    userId,
    action: 'SALES_OPS_SYSTEM_PROMPT_SAVED',
    metadata: { key: definition.key, version, promptId: row.id },
    ipAddress: null,
  });
  return { key: row.key, id: row.id, version: row.version };
}
