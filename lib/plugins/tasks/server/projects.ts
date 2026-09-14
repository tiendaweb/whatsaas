import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamTaskColumns, teamTaskProjects } from '@/lib/db/schema';
import { ensureDefaultTaskWorkspace } from '@/lib/plugins/tasks/server/workspaces';

/** Las columnas con las que nace un tablero. Mismo juego que usaba la ruta. */
const COLUMNAS_POR_DEFECTO = ['Por hacer', 'En progreso', 'Completado'];

/**
 * Crea un proyecto con su tablero vacío.
 *
 * Estaba en línea dentro de `POST /api/plugins/tasks`; ahora también lo llama
 * Empresa, que dejó de ser de sólo lectura para Proyectos. Un proyecto creado
 * desde cualquiera de las dos apps tiene que nacer igual —mismas columnas,
 * mismo `order`—, así que la creación vive en un solo lugar.
 */
export async function createTaskProject(input: {
  teamId: number;
  userId: number;
  name: string;
  workspaceId?: number | null;
  color?: string | null;
  icon?: string | null;
  backgroundUrl?: string | null;
}) {
  const workspace = input.workspaceId
    ? { id: Number(input.workspaceId) }
    : await ensureDefaultTaskWorkspace(input.teamId, input.userId);

  const maxOrder = await db.query.teamTaskProjects.findMany({
    where: eq(teamTaskProjects.teamId, input.teamId),
    orderBy: (t, { desc }) => [desc(t.order)],
    limit: 1,
  });
  const order = maxOrder.length ? maxOrder[0].order + 1 : 0;

  const [project] = await db.insert(teamTaskProjects).values({
    teamId: input.teamId,
    workspaceId: workspace.id,
    name: input.name.trim(),
    backgroundUrl: input.backgroundUrl ?? null,
    color: input.color ?? null,
    icon: input.icon ?? null,
    createdBy: input.userId,
    order,
  }).returning();

  await db.insert(teamTaskColumns).values(
    COLUMNAS_POR_DEFECTO.map((title, i) => ({ projectId: project.id, teamId: input.teamId, title, order: i })),
  );

  return project;
}
