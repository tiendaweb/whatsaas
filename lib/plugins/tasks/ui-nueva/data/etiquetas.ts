import type { TaskLabel, TaskProject } from '@/lib/plugins/tasks/client/types';
import type { EtiquetaUnificada, Prioridad } from './tipos';

export function normalizarNombre(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function slugEtiqueta(name: string): string {
  const slug = normalizarNombre(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || 'tag';
}

export function esReservada(id: string): boolean {
  return id.startsWith('prio-') || id.startsWith('rec-');
}

export function etiquetasUnificadas(proyectos: TaskProject[], opts?: { soloUsadas?: boolean }): EtiquetaUnificada[] {
  const map = new Map<string, EtiquetaUnificada & { colorVotes: Map<string, number>; usos: number }>();

  for (const proyecto of proyectos) {
    for (const label of proyecto.labels ?? []) {
      if (esReservada(label.id)) continue;
      const key = normalizarNombre(label.name);
      if (!key) continue;
      const tareasConLabel = proyecto.columns.reduce(
        (n, col) => n + col.items.filter((item) => item.labelIds?.includes(label.id)).length,
        0,
      );
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          name: label.name,
          color: label.color,
          ids: [label.id],
          projectIds: [proyecto.id],
          projectNames: [proyecto.name],
          colorVotes: new Map([[label.color, Math.max(tareasConLabel, 1)]]),
          usos: tareasConLabel,
        });
        continue;
      }
      if (!existing.ids.includes(label.id)) existing.ids.push(label.id);
      if (!existing.projectIds.includes(proyecto.id)) {
        existing.projectIds.push(proyecto.id);
        existing.projectNames.push(proyecto.name);
      }
      existing.colorVotes.set(label.color, (existing.colorVotes.get(label.color) ?? 0) + Math.max(tareasConLabel, 1));
      existing.usos += tareasConLabel;
    }
  }

  const soloUsadas = opts?.soloUsadas ?? true;
  return Array.from(map.values()).filter((entry) => !soloUsadas || entry.usos > 0).map((entry) => {
    let bestColor = entry.color;
    let bestVotes = -1;
    for (const [color, votes] of entry.colorVotes) {
      if (votes > bestVotes) {
        bestColor = color;
        bestVotes = votes;
      }
    }
    if (bestColor !== entry.color) {
      console.info(`[tareas] etiqueta "${entry.name}" unificada con color ${bestColor} (había variantes)`);
    }
    return {
      name: entry.name,
      color: bestColor,
      ids: entry.ids,
      projectIds: entry.projectIds,
      projectNames: entry.projectNames,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

const ALTA = new Set(['alta', 'importante', 'urgente']);
const MEDIA = new Set(['media', 'normal']);
const BAJA = new Set(['baja']);

export function prioridadPorNombre(labels: TaskLabel[], labelIds: string[]): Prioridad | null {
  for (const id of labelIds) {
    const label = labels.find((item) => item.id === id);
    if (!label || esReservada(label.id)) continue;
    const key = normalizarNombre(label.name);
    if (ALTA.has(key)) return 'alta';
    if (BAJA.has(key)) return 'baja';
    if (MEDIA.has(key)) return 'media';
  }
  return null;
}

export function proyectoTienePrio(labels: TaskLabel[]): boolean {
  return (labels ?? []).some((label) => label.id.startsWith('prio-'));
}

export function proyectoTieneRec(labels: TaskLabel[]): boolean {
  return (labels ?? []).some((label) => label.id.startsWith('rec-'));
}

export function agregarEtiquetaAditiva(labels: TaskLabel[], next: TaskLabel): TaskLabel[] {
  if (labels.some((label) => label.id === next.id || normalizarNombre(label.name) === normalizarNombre(next.name))) {
    return labels;
  }
  return [...labels, next];
}
