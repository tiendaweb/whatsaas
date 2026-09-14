import { claveDia } from './fechas';
import type { Prioridad, Tarea } from './tipos';

export type MiembroFiltro = {
  id: number;
  name: string | null;
  email: string;
};

const PRIO_RANK: Record<Prioridad, number> = { alta: 0, media: 1, baja: 2 };

export function primerNombreDe(miembro: Pick<MiembroFiltro, 'name' | 'email'>): string {
  const raw = (miembro.name ?? '').trim();
  if (raw) return raw.split(/\s+/)[0] ?? raw;
  return miembro.email.split('@')[0] || '—';
}

/** Dueño efectivo de una tarea: a quién está asignada o, si no, quién la creó. */
export function duenoDeTarea(tarea: Pick<Tarea, 'assigneeId' | 'createdBy'>): number | null {
  return tarea.assigneeId ?? tarea.createdBy ?? null;
}

export function ordenarPorPrioridad(a: Tarea, b: Tarea): number {
  if (PRIO_RANK[a.prioridad] !== PRIO_RANK[b.prioridad]) {
    return PRIO_RANK[a.prioridad] - PRIO_RANK[b.prioridad];
  }
  const aDue = claveDia(a.dueDate);
  const bDue = claveDia(b.dueDate);
  if (aDue && bDue && aDue !== bDue) return aDue.localeCompare(bDue);
  if (aDue && !bDue) return -1;
  if (!aDue && bDue) return 1;
  return a.id - b.id;
}

export type ColumnaMiembro = {
  /** Estable por usuario: sirve de `key` y de destino del arrastre. */
  clave: string;
  label: string;
  miembro: MiembroFiltro | null;
  tareas: Tarea[];
};

/**
 * Una columna por cada miembro del equipo.
 *
 * Antes eran tres columnas escritas a mano —Noelia, Martín y Carlos— que se
 * resolvían por nombre contra la lista real. En cualquier otra cuenta el
 * tablero mostraba tres columnas vacías con nombres de gente que no existe
 * ahí, y el trabajo de todos caía en "Sin asignar". Ahora las columnas SON el
 * equipo: quien entra hoy ve a los suyos, y quien suma a alguien lo ve
 * aparecer sin tocar código.
 *
 * Orden: primero quien más trabajo tiene y, a igualdad, alfabético. Así la
 * columna con carga queda a la vista sin depender de en qué orden devolvió la
 * API los miembros.
 */
export function agruparPorColumnasMiembro(tareas: Tarea[], miembros: MiembroFiltro[]): ColumnaMiembro[] {
  // Dos personas pueden llamarse igual de nombre: ahí se muestra el nombre
  // completo (o la parte del correo) para no tener dos columnas «Martín».
  const conteo = new Map<string, number>();
  for (const miembro of miembros) {
    const nombre = primerNombreDe(miembro);
    conteo.set(nombre, (conteo.get(nombre) ?? 0) + 1);
  }

  return miembros
    .map((miembro) => {
      const corto = primerNombreDe(miembro);
      const label = (conteo.get(corto) ?? 0) > 1
        ? (miembro.name?.trim() || miembro.email)
        : corto;
      return {
        clave: `u${miembro.id}`,
        label,
        miembro,
        tareas: tareas.filter((tarea) => duenoDeTarea(tarea) === miembro.id).sort(ordenarPorPrioridad),
      };
    })
    .sort((a, b) => b.tareas.length - a.tareas.length || a.label.localeCompare(b.label, 'es'));
}

/**
 * Lo que no le pertenece a nadie del equipo: sin dueño, o de alguien que ya no
 * está en la lista de miembros. Sin esta columna quedaban invisibles —ni
 * aparecían en ninguna columna ni se podían arrastrar para asignarlas—.
 */
export function tareasSinAsignar(tareas: Tarea[], miembros: MiembroFiltro[]): Tarea[] {
  const delEquipo = new Set(miembros.map((miembro) => miembro.id));
  return tareas
    .filter((tarea) => !delEquipo.has(duenoDeTarea(tarea) ?? -1))
    .sort(ordenarPorPrioridad);
}
