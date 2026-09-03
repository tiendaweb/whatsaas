import { ES } from '../i18n/es';
import { duenoDeTarea } from './miembros';
import { claveDia, esHoy, esVencida, finDeSemanaClave, hoyClave, mananaClave } from './fechas';
import type { NavId, Prioridad, Tarea } from './tipos';

const PRIO_RANK: Record<Prioridad, number> = { alta: 0, media: 1, baja: 2 };

export function esActiva(tarea: Tarea): boolean {
  return tarea.status !== 'done' && !tarea.aiReadyAt;
}

export function ordenarMezcla(a: Tarea, b: Tarea): number {
  const aDue = claveDia(a.dueDate);
  const bDue = claveDia(b.dueDate);
  if (aDue && bDue && aDue !== bDue) return aDue.localeCompare(bDue);
  if (aDue && !bDue) return -1;
  if (!aDue && bDue) return 1;
  if (PRIO_RANK[a.prioridad] !== PRIO_RANK[b.prioridad]) {
    return PRIO_RANK[a.prioridad] - PRIO_RANK[b.prioridad];
  }
  return a.id - b.id;
}

export function filtrarVista(tareas: Tarea[], nav: NavId): Tarea[] {
  const hoy = hoyClave();
  switch (nav) {
    case 'hoy':
      return tareas.filter((tarea) => esActiva(tarea) && esHoy(tarea.dueDate)).sort(ordenarMezcla);
    case 'proximas':
      return tareas
        .filter((tarea) => esActiva(tarea) && claveDia(tarea.dueDate) !== null && claveDia(tarea.dueDate)! > hoy)
        .sort(ordenarMezcla);
    case 'vencidas':
      return tareas.filter((tarea) => esVencida(tarea.dueDate, esActiva(tarea))).sort(ordenarMezcla);
    case 'completadas':
      return tareas
        .filter((tarea) => tarea.status === 'done')
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '') || b.id - a.id)
        .slice(0, 200);
    case 'enCola':
      // Las preparadas salen de todas las vistas abiertas: sin este filtro
      // quedaban invisibles hasta que un conector las reportara.
      return tareas
        .filter((tarea) => tarea.status !== 'done' && Boolean(tarea.aiReadyAt))
        .sort((a, b) => (b.aiReadyAt ?? '').localeCompare(a.aiReadyAt ?? '') || b.id - a.id);
    case 'bandeja':
    default:
      return tareas.filter(esActiva).sort(ordenarMezcla);
  }
}

export type GrupoFecha = { clave: string; label: string; tareas: Tarea[] };

export function agruparPorFecha(tareas: Tarea[]): GrupoFecha[] {
  const hoy = hoyClave();
  const manana = mananaClave();
  const finSemana = finDeSemanaClave();
  const buckets: Record<string, Tarea[]> = {
    vencidas: [],
    hoy: [],
    manana: [],
    estaSemana: [],
    masAdelante: [],
    sinFecha: [],
  };

  for (const tarea of tareas) {
    const clave = claveDia(tarea.dueDate);
    if (!clave) buckets.sinFecha.push(tarea);
    else if (clave < hoy) buckets.vencidas.push(tarea);
    else if (clave === hoy) buckets.hoy.push(tarea);
    else if (clave === manana) buckets.manana.push(tarea);
    else if (clave <= finSemana) buckets.estaSemana.push(tarea);
    else buckets.masAdelante.push(tarea);
  }

  const order: Array<[string, string]> = [
    ['vencidas', ES.grupos.vencidas],
    ['hoy', ES.grupos.hoy],
    ['manana', ES.grupos.manana],
    ['estaSemana', ES.grupos.estaSemana],
    ['masAdelante', ES.grupos.masAdelante],
    ['sinFecha', ES.grupos.sinFecha],
  ];

  return order
    .filter(([key]) => buckets[key].length > 0)
    .map(([key, label]) => ({ clave: key, label, tareas: buckets[key] }));
}

export function coincideBusqueda(tarea: Tarea, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (tarea.title.toLowerCase().includes(q)) return true;
  if (tarea.notes.toLowerCase().includes(q)) return true;
  if (tarea.proyectoNombre.toLowerCase().includes(q)) return true;
  if (tarea.etiquetas.some((etiqueta) => etiqueta.name.toLowerCase().includes(q))) return true;
  return false;
}

export function aplicarFiltros(tareas: Tarea[], opts: {
  workspaceId: number | null;
  projectIds: number[] | null;
  etiquetaIds: string[] | null;
  taskIds: number[] | null;
  /** Miembro por el que se filtra: se compara contra el DUEÑO de la tarea. */
  duenoId: number | null;
  query: string;
}): Tarea[] {
  return tareas.filter((tarea) => {
    if (opts.workspaceId && tarea.workspaceId !== opts.workspaceId) return false;
    if (opts.projectIds && !opts.projectIds.includes(tarea.projectId)) return false;
    if (opts.etiquetaIds && !tarea.labelIds.some((id) => opts.etiquetaIds!.includes(id))) return false;
    if (opts.taskIds && !opts.taskIds.includes(tarea.id)) return false;
    // El filtro de miembros compara contra el dueño efectivo (asignado, o el
    // creador si no tiene asignado) — la misma noción que usan las columnas de
    // Espacios. Antes miraba sólo `createdBy`: al arrastrar una tarea a otra
    // persona seguía contando como del creador, así que se caía del tablero
    // filtrado y parecía que la asignación no había funcionado.
    if (opts.duenoId != null && duenoDeTarea(tarea) !== opts.duenoId) return false;
    return coincideBusqueda(tarea, opts.query);
  });
}

export function titulosNav(nav: NavId): string {
  switch (nav) {
    case 'hoy': return ES.nav.hoy;
    case 'proximas': return ES.nav.proximas;
    case 'vencidas': return ES.nav.vencidas;
    case 'completadas': return ES.nav.completadas;
    case 'enCola': return ES.nav.enCola;
    case 'metricas': return ES.metricas.titulo;
    case 'ajustes': return ES.ajustes.titulo;
    case 'comoUsar': return ES.comoUsar.titulo;
    case 'enfoque': return ES.nav.enfoque;
    case 'espacios': return ES.nav.espaciosTitulo;
    default: return ES.cabecera.misTareas;
  }
}
