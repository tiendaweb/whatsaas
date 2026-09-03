import { nombreNormalizado } from './universo';
import { claveDia } from './fechas';
import type { Prioridad, Tarea } from './tipos';

export type MiembroFiltro = {
  id: number;
  name: string | null;
  email: string;
};

export const COLUMNAS_MIEMBROS = [
  { clave: 'noelia', label: 'Noelia' },
  { clave: 'martin', label: 'Martín' },
  { clave: 'carlos', label: 'Carlos' },
] as const;

export type ClaveMiembro = (typeof COLUMNAS_MIEMBROS)[number]['clave'];

const PRIO_RANK: Record<Prioridad, number> = { alta: 0, media: 1, baja: 2 };

export function primerNombreDe(miembro: Pick<MiembroFiltro, 'name' | 'email'>): string {
  const raw = (miembro.name ?? '').trim();
  if (raw) return raw.split(/\s+/)[0] ?? raw;
  return miembro.email.split('@')[0] || '—';
}

export function claveDeMiembro(miembro: Pick<MiembroFiltro, 'name' | 'email'>): string {
  return nombreNormalizado(primerNombreDe(miembro));
}

/**
 * Puntúa qué tan bien un miembro responde al nombre de una columna.
 * `null` = no es candidato. Cuanto más alto, mejor.
 *
 * Los tramos importan: una coincidencia EXACTA (por nombre o por la parte
 * local del correo) siempre le tiene que ganar a un prefijo. Ese era el bug:
 * conviven `martin@whatspro.uno` y `martinproduccion@aapp.space`, y el prefijo
 * del segundo ganaba por venir antes en el array.
 */
function puntajeMiembro(miembro: Pick<MiembroFiltro, 'name' | 'email'>, wanted: string): number | null {
  const nombre = nombreNormalizado(miembro.name ?? '');
  const local = nombreNormalizado(miembro.email.split('@')[0] ?? '');
  const primer = nombre ? (nombre.split(' ')[0] ?? nombre) : '';

  if (primer && primer === wanted) return 100;
  if (local === wanted) return 90;
  if (nombre && nombre.startsWith(`${wanted} `)) return 80;

  // Prefijos: último recurso. Se penaliza lo que sobra, para que `martin@` le
  // gane a `martinproduccion@` sin depender del orden en que venga el equipo.
  if (local.startsWith(wanted)) return 50 - Math.min(45, local.length - wanted.length);
  if (nombre.startsWith(wanted)) return 45 - Math.min(40, nombre.length - wanted.length);
  return null;
}

/**
 * Resuelve el nombre de una columna ('noelia' | 'martin' | 'carlos') al miembro
 * del equipo que le corresponde.
 *
 * Antes era un `find` con `mail.startsWith(clave)` y ganaba el primero que
 * pasara. Con dos cuentas que arrancan igual, la columna "Martín" apuntaba a
 * la equivocada: las tareas se asignaban a esa cuenta, y todo lo que se
 * asignara al Martín real caía fuera de las tres columnas, en "Sin asignar".
 * Ahora gana el mejor puntaje, con desempate estable por id.
 */
export function miembroPorClave(miembros: MiembroFiltro[], clave: string): MiembroFiltro | null {
  const wanted = nombreNormalizado(clave);
  let mejor: MiembroFiltro | null = null;
  let mejorPuntaje = -Infinity;

  for (const miembro of miembros) {
    const puntaje = puntajeMiembro(miembro, wanted);
    if (puntaje === null) continue;
    if (puntaje > mejorPuntaje || (puntaje === mejorPuntaje && mejor !== null && miembro.id < mejor.id)) {
      mejor = miembro;
      mejorPuntaje = puntaje;
    }
  }

  return mejor;
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
  clave: ClaveMiembro;
  label: string;
  miembro: MiembroFiltro | null;
  tareas: Tarea[];
};

export function agruparPorColumnasMiembro(tareas: Tarea[], miembros: MiembroFiltro[]): ColumnaMiembro[] {
  return COLUMNAS_MIEMBROS.map((col) => {
    const miembro = miembroPorClave(miembros, col.clave);
    const tareasCol = miembro
      ? tareas.filter((tarea) => duenoDeTarea(tarea) === miembro.id).sort(ordenarPorPrioridad)
      : [];
    return { clave: col.clave, label: col.label, miembro, tareas: tareasCol };
  });
}

// Complemento de las 3 columnas fijas: tareas cuyo dueño resuelto (assigneeId, o su
// creador si no tiene asignado) no es Noelia, Martín ni Carlos. Sin esto quedaban
// invisibles en "Todos los proyectos" — ni aparecían en ninguna columna ni se podían
// arrastrar para asignarlas.
export function tareasSinAsignar(tareas: Tarea[], miembros: MiembroFiltro[]): Tarea[] {
  const idsConocidos = new Set(
    COLUMNAS_MIEMBROS
      .map((col) => miembroPorClave(miembros, col.clave)?.id)
      .filter((id): id is number => id != null),
  );
  return tareas
    .filter((tarea) => !idsConocidos.has(duenoDeTarea(tarea) ?? -1))
    .sort(ordenarPorPrioridad);
}
