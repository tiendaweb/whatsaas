import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamMembers, users } from '@/lib/db/schema';
import { getClientProjects } from '@/lib/plugins/tasks/server/client-projects';
import { loadTaskOsData } from '@/lib/plugins/tasks/server/task-os';
import type {
  MiembroEmpresa,
  ProyectosEmpresa,
  ProyectoEmpresa,
  TareaEmpresa,
} from '../shared/api-types';

/**
 * Los proyectos del equipo, para la vista de Proyectos de Empresa.
 *
 * No hay consulta nueva: se lee con `loadTaskOsData`, que es la misma carga
 * que usa Tareas OS. Duplicar el SQL acá habría dejado dos definiciones de
 * "qué tareas tiene un proyecto" —las tareas viven en varias ubicaciones a la
 * vez— y una de las dos iba a quedar vieja.
 *
 * Lo que sale de acá es una proyección chica: el árbol completo trae notas,
 * prompts de IA, portadas y comentarios de cada tarea, y esta pantalla dibuja
 * un tablero, un Gantt y una lista. Mandar todo al navegador serían megabytes
 * por cada apertura.
 *
 * Lo que la maqueta muestra y el sistema NO tiene, no se inventa: no hay
 * prioridad de tarea ni estado de proyecto, así que esos chips no existen acá.
 */
export async function getProyectosEmpresa(teamId: number): Promise<ProyectosEmpresa> {
  const [arbol, clientes] = await Promise.all([
    loadTaskOsData(teamId),
    getClientProjects(teamId),
  ]);
  const clientePorProyecto = new Map(clientes.map((c) => [c.projectId, c]));

  const proyectos: ProyectoEmpresa[] = [];
  const tareas: TareaEmpresa[] = [];
  const responsables = new Set<number>();

  for (const workspace of arbol) {
    for (const proyecto of workspace.projects) {
      const etiquetasDelProyecto = new Map((proyecto.labels ?? []).map((l) => [l.id, l]));
      let hechas = 0;
      let total = 0;
      let checklistHechos = 0;
      let checklistTotal = 0;
      let inicio: string | null = null;
      let fin: string | null = null;

      for (const columna of proyecto.columns) {
        for (const item of columna.items) {
          const hecha = item.status === 'done';
          total += 1;
          if (hecha) hechas += 1;

          // Una tarea sin fechas no entra al Gantt, pero sí al tablero y a la
          // lista: la mitad de las tareas reales del equipo no tiene fecha.
          const desde = fecha(item.startDate);
          const hasta = fecha(item.endDate ?? item.dueDate);
          if (desde && (inicio == null || desde < inicio)) inicio = desde;
          if (hasta && (fin == null || hasta > fin)) fin = hasta;

          if (item.assigneeId) responsables.add(item.assigneeId);

          const checklist = item.checklist ?? [];
          checklistTotal += checklist.length;
          checklistHechos += checklist.filter((c) => c.completed).length;

          const etiquetaIds = (item.labelIds ?? []).filter((id) => etiquetasDelProyecto.has(id));
          tareas.push({
            id: item.id,
            proyectoId: proyecto.id,
            columna: columna.title,
            columnaId: columna.id,
            titulo: item.title,
            notas: item.notes ?? null,
            hecha,
            inicio: desde,
            fin: hasta,
            responsableId: item.assigneeId ?? null,
            responsable: null,
            etiquetas: etiquetaIds
              .map((id) => etiquetasDelProyecto.get(id)!)
              .map((l) => ({ name: l.name, color: l.color })),
            etiquetaIds,
            checklist: {
              hechos: checklist.filter((c) => c.completed).length,
              total: checklist.length,
              // Enteros, no los primeros veinte: desde que el panel dejó de ser
              // de sólo lectura, un ítem que no viaja es un ítem que no se puede
              // marcar ni borrar, y "y N más" sin forma de llegar a ellos es una
              // trampa. Las checklists reales son de decenas de ítems, no de
              // miles, así que el costo es chico y acotado.
              items: checklist.map((c) => ({ id: c.id, texto: c.text, hecho: c.completed })),
            },
          });
        }
      }

      const cliente = clientePorProyecto.get(proyecto.id) ?? null;
      proyectos.push({
        id: proyecto.id,
        workspaceId: workspace.id,
        name: proyecto.name,
        color: proyecto.color,
        columnas: proyecto.columns.map((c) => ({ id: c.id, titulo: c.title })),
        etiquetas: (proyecto.labels ?? []).map((l) => ({ id: l.id, name: l.name, color: l.color })),
        tareas: total,
        hechas,
        checklistHechos,
        checklistTotal,
        inicio,
        fin,
        cliente: cliente
          ? {
              id: cliente.customerId,
              estado: cliente.customerStatus,
              puedeArchivar: cliente.canArchive,
              tareasAbiertas: cliente.openTasks,
            }
          : null,
      });
    }
  }

  // Los nombres del equipo, en una sola consulta. Antes se pedían sólo los de
  // los responsables actuales; ahora el panel deja reasignar, así que hace
  // falta el padrón completo para poblar el selector.
  const miembros = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId));

  const nombrePorId = new Map<number, string>(miembros.map((m) => [m.id, m.name?.trim() || m.email]));

  // Un responsable puede haber salido del equipo y seguir asignado: su nombre
  // no está en el padrón, y dejarlo en null borraría el dato en pantalla.
  const faltantes = [...responsables].filter((id) => !nombrePorId.has(id));
  if (faltantes.length) {
    const extra = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(inArray(users.id, faltantes));
    for (const fila of extra) nombrePorId.set(fila.id, fila.name?.trim() || fila.email);
  }

  for (const tarea of tareas) {
    tarea.responsable = tarea.responsableId == null ? null : nombrePorId.get(tarea.responsableId) ?? null;
  }

  const padron: MiembroEmpresa[] = miembros
    .map((m) => ({ id: m.id, nombre: m.name?.trim() || m.email }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return {
    workspaces: arbol.map((w) => ({ id: w.id, name: w.name, color: w.color })),
    proyectos,
    tareas,
    miembros: padron,
  };
}

/** `YYYY-MM-DD` en UTC, que es como se guardan y como las compara el Gantt. */
function fecha(valor: Date | null | undefined): string | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
