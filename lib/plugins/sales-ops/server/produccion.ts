import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamTaskProjects, teamTaskWorkspaces } from '@/lib/db/schema';
import { leerEstadoPrompt } from '@/lib/plugins/grok-connector/server/bulk-actions';
import { createColumnInProject, createTaskInColumn, getProjectFirstColumn, loadTaskOsData } from '@/lib/plugins/tasks/server/task-os';
import { DEMOS_WORKSPACE_NAME } from './demos';
import { CLIENTS_WORKSPACE_NAME } from './client-projects';

/**
 * Producción: lo vendido convertido en trabajo, visto desde el Command Center.
 *
 * Tareas OS es la fuente de verdad; acá se leen tres workspaces con nombre
 * fijo —Demos, Clientes y Command Center— y se calcula lo que la vista
 * necesita y el tablero no muestra: el avance de cada proyecto, si está en
 * ejecución, y en qué estado quedó lo que corre con IA. Editar es editar en
 * Tareas OS (mismas rutas): no hay una copia.
 */

export const COMMAND_CENTER_WORKSPACE_NAME = 'Command Center';
const BITACORA_PROJECT_NAME = 'Bitácora';
const DONE_COLUMN = /hecho|completad|done|terminad|listo/i;

export type ProdItem = {
  id: number;
  title: string;
  notes: string;
  status: string;
  columnId: number;
  columnTitle: string;
  done: boolean;
  progress: number;
  checklist: Array<{ id: string; text: string; completed: boolean }>;
  dueDate: string | null;
  assigneeId: number | null;
  updatedAt: string;
  /** Chat del Command Center al que pertenece, si la tarea lo dice en las notas ("Chat #123"). */
  chatId: number | null;
  ia: { status: 'pending' | 'done' | 'not_applicable'; note: string | null; prompt: string } | null;
};

export type ProdProject = {
  id: number;
  name: string;
  workspaceId: number;
  columns: Array<{ id: number; title: string; done: boolean }>;
  items: ProdItem[];
  total: number;
  hechas: number;
  progress: number;
  estado: 'sin_empezar' | 'en_ejecucion' | 'hecho';
  conIa: number;
  iaPendientes: number;
  updatedAt: string;
};

export type ProdWorkspace = { id: number; name: string; projects: ProdProject[] };

export type ProduccionPayload = {
  demos: ProdWorkspace | null;
  clientes: ProdWorkspace | null;
  commandCenter: ProdWorkspace;
  bitacoraColumnId: number;
};

async function ensureCommandCenterWorkspace(teamId: number, userId: number) {
  let workspace = await db.query.teamTaskWorkspaces.findFirst({ where: and(eq(teamTaskWorkspaces.teamId, teamId), eq(teamTaskWorkspaces.name, COMMAND_CENTER_WORKSPACE_NAME)) });
  if (!workspace) {
    [workspace] = await db
      .insert(teamTaskWorkspaces)
      .values({ teamId, name: COMMAND_CENTER_WORKSPACE_NAME, order: 60, icon: 'compass', aiPrompt: 'Workspace del Command Center Comercial: pasos, decisiones y documentación de cada entrega. Cada tarea es un paso documentado; el avance se mira desde Producción.', createdBy: userId })
      .returning();
  }
  let project = await db.query.teamTaskProjects.findFirst({ where: and(eq(teamTaskProjects.teamId, teamId), eq(teamTaskProjects.workspaceId, workspace.id), eq(teamTaskProjects.name, BITACORA_PROJECT_NAME)) });
  if (!project) {
    [project] = await db.insert(teamTaskProjects).values({ teamId, workspaceId: workspace.id, name: BITACORA_PROJECT_NAME, order: 0, icon: 'book-open', createdBy: userId }).returning();
    for (const title of ['Por hacer', 'En curso', 'Hecho']) await createColumnInProject({ teamId, projectId: project.id, title });
  }
  const column = await getProjectFirstColumn(teamId, project.id);
  return { workspace, project, column };
}

type RawWorkspace = Awaited<ReturnType<typeof loadTaskOsData>>[number];

function mapWorkspace(w: RawWorkspace): ProdWorkspace {
  const projects: ProdProject[] = w.projects.map((p) => {
    const columns = p.columns.map((c) => ({ id: c.id, title: c.title, done: DONE_COLUMN.test(c.title) }));
    const doneCols = new Set(columns.filter((c) => c.done).map((c) => c.id));
    const items: ProdItem[] = [];
    for (const c of p.columns) {
      for (const it of c.items) {
        if (it.parentTaskId) continue;
        const checklist = (Array.isArray(it.checklist) ? it.checklist : []) as Array<{ id: string; text: string; completed: boolean }>;
        const done = it.status === 'done' || doneCols.has(c.id);
        const progress = done ? 1 : checklist.length ? checklist.filter((x) => x.completed).length / checklist.length : it.status === 'in_progress' || /curso|progreso/i.test(c.title) ? 0.5 : 0;
        const chat = /Chat #(\d+)/.exec(it.notes ?? '');
        items.push({
          id: it.id,
          title: it.title,
          notes: it.notes ?? '',
          status: it.status,
          columnId: c.id,
          columnTitle: c.title,
          done,
          progress,
          checklist: checklist.map((x) => ({ id: x.id, text: x.text, completed: Boolean(x.completed) })),
          dueDate: it.dueDate ? (it.dueDate instanceof Date ? it.dueDate.toISOString().slice(0, 10) : String(it.dueDate)) : null,
          assigneeId: it.assigneeId ?? null,
          updatedAt: it.updatedAt instanceof Date ? it.updatedAt.toISOString() : String(it.updatedAt ?? ''),
          chatId: chat ? Number(chat[1]) : null,
          ia: it.aiPrompt?.trim() ? leerEstadoPrompt(it.aiPrompt) : null,
        });
      }
    }
    const total = items.length;
    const hechas = items.filter((i) => i.done).length;
    const progress = total ? items.reduce((s, i) => s + i.progress, 0) / total : 0;
    const updatedAt = items.reduce((max, i) => (i.updatedAt > max ? i.updatedAt : max), p.updatedAt instanceof Date ? p.updatedAt.toISOString() : String(p.updatedAt ?? ''));
    return {
      id: p.id,
      name: p.name,
      workspaceId: w.id,
      columns,
      items,
      total,
      hechas,
      progress,
      estado: total === 0 || progress === 0 ? 'sin_empezar' : progress >= 1 ? 'hecho' : 'en_ejecucion',
      conIa: items.filter((i) => i.ia).length,
      iaPendientes: items.filter((i) => i.ia?.status === 'pending').length,
      updatedAt,
    };
  });
  projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { id: w.id, name: w.name, projects };
}

export async function loadProduccion(teamId: number, userId: number): Promise<ProduccionPayload> {
  const { column } = await ensureCommandCenterWorkspace(teamId, userId);
  const all = await loadTaskOsData(teamId);
  const byName = (name: string) => all.find((w) => w.name === name);
  const cc = byName(COMMAND_CENTER_WORKSPACE_NAME);
  const demos = byName(DEMOS_WORKSPACE_NAME);
  const clientes = byName(CLIENTS_WORKSPACE_NAME);
  return {
    demos: demos ? mapWorkspace(demos) : null,
    clientes: clientes ? mapWorkspace(clientes) : null,
    commandCenter: cc ? mapWorkspace(cc) : { id: 0, name: COMMAND_CENTER_WORKSPACE_NAME, projects: [] },
    bitacoraColumnId: column.id,
  };
}

/** Un paso documentado en la Bitácora del workspace Command Center. */
export async function documentarPaso(teamId: number, userId: number, input: { title: string; notes?: string; chatId?: number | null }) {
  const { column } = await ensureCommandCenterWorkspace(teamId, userId);
  const task = await createTaskInColumn({
    teamId,
    userId,
    columnId: column.id,
    title: input.title.trim().slice(0, 200),
    notes: [input.chatId ? `Chat #${input.chatId}` : null, input.notes?.trim() || null].filter(Boolean).join('\n\n').slice(0, 20000),
  });
  if (!task) throw new Error('No se pudo crear el paso.');
  return { taskId: task.id };
}
