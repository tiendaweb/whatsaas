import 'server-only';

/**
 * Materializa una VISTA de una app del Radar Engine: ejecuta los bindings
 * (datasources y métricas) y devuelve bloques del contrato de `blocks.ts`
 * listos para dibujar. El frontend no sabe de datasources: recibe una
 * `ResolvedRadarView` con los bloques ya armados.
 *
 * Regla de oro: un datasource roto NUNCA rompe la vista. Cualquier throw
 * dentro de un binding termina en un componente con `error` seteado (la UI lo
 * muestra) y un badge que falla queda en null sin tocar la navegación.
 */
import {
  parseRadarBlocks,
  type RadarBlock,
  type RadarTaskState,
} from '@/lib/plugins/radar/shared/blocks';
import type {
  RadarAction,
  RadarAppDefinition,
  RadarBinding,
  RadarComponent,
  RadarDatasource,
  RadarMetric,
  RadarView,
  RadarVisibility,
  ResolvedRadarComponent,
  ResolvedRadarNavItem,
  ResolvedRadarView,
} from '@/lib/plugins/radar/shared/engine';

import { executeRadarDatasource, listRadarSources, resolveRadarMetricValue } from './data';

/* ------------------------------------------------------------------ */
/* Helpers de datos → bloques                                           */
/* ------------------------------------------------------------------ */

/** Tipo de cada campo por source, para elegir el formato de columna en tablas. */
const FIELD_TYPES: Map<string, Map<string, 'string' | 'number' | 'boolean' | 'date'>> = new Map(
  listRadarSources().map((descriptor) => [
    descriptor.source,
    new Map(descriptor.fields.map((field) => [field.name, field.type])),
  ]),
);

/** "lastMessageAt" / "custom.radar_score" → "Last message at" / "Radar score". */
function humanize(name: string): string {
  const bare = name.replace(/^custom\./, '').replace(/[_.-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();
  if (!bare) return name;
  return bare.charAt(0).toUpperCase() + bare.slice(1).toLowerCase();
}

/** Fecha ISO corta: solo el día, con hora si no es medianoche. */
function shortDate(value: unknown): string | null {
  const date = value instanceof Date ? value : typeof value === 'string' || typeof value === 'number' ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return typeof value === 'string' ? value.slice(0, 40) : null;
  const iso = date.toISOString();
  return iso.slice(11, 16) === '00:00' ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function toText(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return shortDate(value);
  if (typeof value === 'string' && ISO_DATE_REGEX.test(value)) return shortDate(value);
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value).slice(0, max);
    } catch {
      return null;
    }
  }
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

/** Valor de celda de tabla: primitivo, con fechas y objetos ya stringificados. */
function toCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return shortDate(value);
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value).slice(0, 400);
    } catch {
      return null;
    }
  }
  return String(value).slice(0, 400);
}

/** `map` del binding: clave del display → campo de la fila. */
type BindingMap = Record<string, string> | undefined;

function mapGet(row: Record<string, unknown>, map: BindingMap, key: string): unknown {
  const field = map?.[key];
  return field ? row[field] : undefined;
}

/** Primer valor de texto "usable" de la fila, para list/stat sin map. */
function firstText(row: Record<string, unknown>): string | null {
  for (const value of Object.values(row)) {
    if (typeof value === 'string' && value.trim() && !ISO_DATE_REGEX.test(value)) return value.trim();
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Estado de tareas                                                     */
/* ------------------------------------------------------------------ */

/**
 * Mapa TOLERANTE del status real (texto libre por equipo) al estado visual del
 * bloque `tasks`. Lo que no matchea cae a `pending`; una tarea vencida y no
 * hecha se promociona a `overdue` mirando el vencimiento.
 */
const TASK_STATE_MAP: Record<string, RadarTaskState> = {
  pending: 'pending', open: 'pending', todo: 'pending', to_do: 'pending', backlog: 'pending', new: 'pending', nueva: 'pending', pendiente: 'pending',
  in_progress: 'in_progress', doing: 'in_progress', progress: 'in_progress', active: 'in_progress', en_curso: 'in_progress', en_progreso: 'in_progress', review: 'in_progress', wip: 'in_progress',
  done: 'done', completed: 'done', complete: 'done', closed: 'done', finished: 'done', hecha: 'done', terminada: 'done', completada: 'done',
  blocked: 'blocked', stuck: 'blocked', waiting: 'blocked', bloqueada: 'blocked', on_hold: 'blocked',
  overdue: 'overdue', late: 'overdue', vencida: 'overdue',
};

function taskState(rawStatus: unknown, due: unknown): RadarTaskState {
  const normalized = String(rawStatus ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const state = TASK_STATE_MAP[normalized] ?? 'pending';
  if (state === 'done' || state === 'overdue') return state;
  const dueDate = typeof due === 'string' || due instanceof Date ? new Date(due) : null;
  if (dueDate && !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < Date.now()) return 'overdue';
  return state;
}

/* ------------------------------------------------------------------ */
/* Materialización de bindings                                          */
/* ------------------------------------------------------------------ */

type Rows = Array<Record<string, unknown>>;

function materializeTable(ds: RadarDatasource, map: BindingMap, rows: Rows): RadarBlock[] {
  const types = FIELD_TYPES.get(ds.source);
  // Columnas: el select del datasource manda; después el map; último recurso,
  // las primeras claves de la primera fila.
  const entries: Array<{ key: string; label: string }> = ds.select?.length
    ? ds.select.map((name) => ({ key: name, label: humanize(name) }))
    : map && Object.keys(map).length
      ? Object.entries(map).map(([display, field]) => ({ key: field, label: humanize(display) }))
      : Object.keys(rows[0] ?? {}).map((name) => ({ key: name, label: humanize(name) }));

  const columns = entries.slice(0, 8).map((entry) => {
    const type = types?.get(entry.key);
    return {
      key: entry.key,
      label: entry.label,
      format: (type === 'number' ? 'number' : type === 'date' ? 'date' : 'text') as 'number' | 'date' | 'text',
      ...(type === 'number' ? { align: 'right' as const } : {}),
    };
  });

  const tableRows = rows.slice(0, 200).map((row) => {
    const out: Record<string, string | number | boolean | null> = {};
    for (const column of columns) out[column.key] = toCell(row[column.key]);
    return out;
  });

  return [{ type: 'table', columns, rows: tableRows }];
}

function materializeContacts(ds: RadarDatasource, map: BindingMap, rows: Rows): RadarBlock[] {
  if (ds.source !== 'contacts') {
    throw new Error(
      `El display "contacts" solo funciona con el source "contacts" y el datasource "${ds.key}" usa "${ds.source}". Cambiá el source o usá display "table" o "list".`,
    );
  }
  const items = rows
    .slice(0, 200)
    .map((row) => {
      const contactId = toNumber(row.id);
      if (!contactId || contactId <= 0 || !Number.isInteger(contactId)) return null;
      const name = toText(mapGet(row, map, 'name') ?? row.name, 200) ?? 'Sin nombre';
      const remoteJid = toText(row.remoteJid, 120);
      const instanceId = toNumber(row.instanceId);
      const priority = toText(mapGet(row, map, 'priority') ?? row.priority ?? row['custom.radar_prioridad'], 24);
      const score = toNumber(mapGet(row, map, 'score') ?? row.score ?? row['custom.radar_score']);
      const detail = toText(mapGet(row, map, 'detail') ?? row.detail, 400);
      return {
        contactId,
        name,
        ...(remoteJid ? { remoteJid } : {}),
        ...(instanceId !== null ? { instanceId } : {}),
        ...(priority ? { priority } : {}),
        ...(score !== null ? { score } : {}),
        ...(detail ? { detail } : {}),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return [{ type: 'contacts', items }];
}

function materializeTasks(map: BindingMap, rows: Rows): RadarBlock[] {
  const items = rows.slice(0, 40).map((row) => {
    const id = toNumber(row.id);
    const dueRaw = mapGet(row, map, 'due') ?? row.dueDate ?? row.due;
    const due = shortDate(dueRaw);
    const assignee = toText(mapGet(row, map, 'assignee') ?? row.assignee ?? row.assignedUserName, 80);
    const project = toText(mapGet(row, map, 'project') ?? row.projectName ?? row.project, 80);
    const detail = toText(mapGet(row, map, 'detail') ?? row.detail, 300);
    return {
      ...(id && id > 0 && Number.isInteger(id) ? { id } : {}),
      title: toText(mapGet(row, map, 'title') ?? row.title ?? row.name, 200) ?? 'Sin título',
      state: taskState(mapGet(row, map, 'state') ?? row.state ?? row.status, dueRaw),
      ...(due ? { due } : {}),
      ...(assignee ? { assignee } : {}),
      ...(project ? { project } : {}),
      ...(detail ? { detail } : {}),
    };
  });
  return items.length ? [{ type: 'tasks', items }] : [];
}

function materializeList(map: BindingMap, rows: Rows): RadarBlock[] {
  const items = rows
    .slice(0, 40)
    .map((row) => {
      const text = toText(mapGet(row, map, 'text'), 600) ?? firstText(row)?.slice(0, 600) ?? null;
      if (!text) return null;
      const badge = toText(mapGet(row, map, 'badge'), 48);
      return { text, ...(badge ? { badge: { label: badge } } : {}) };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
  return items.length ? [{ type: 'list', items }] : [];
}

function materializeStat(map: BindingMap, rows: Rows): RadarBlock[] {
  const items = rows.slice(0, 20).map((row) => {
    const values = Object.values(row);
    const label = toText(mapGet(row, map, 'label'), 160) ?? firstText(row)?.slice(0, 160) ?? toText(values[0], 160) ?? '—';
    const value = toText(mapGet(row, map, 'value'), 300) ?? toText(values[1] ?? values[0], 300) ?? '—';
    return { label, value };
  });
  return items.length ? [{ type: 'stat', items }] : [];
}

function materializeTiles(map: BindingMap, rows: Rows): RadarBlock[] {
  const items = rows
    .slice(0, 12)
    .map((row) => {
      const label = toText(mapGet(row, map, 'label') ?? row.name ?? row.title ?? row.label, 160) ?? firstText(row)?.slice(0, 160);
      if (!label) return null;
      const description = toText(mapGet(row, map, 'description') ?? row.description, 300);
      const rawValue = mapGet(row, map, 'value') ?? row.value ?? row.count ?? row.total;
      const numValue = toNumber(rawValue);
      const textValue = numValue === null ? toText(rawValue, 24) : null;
      return {
        label,
        ...(description ? { description } : {}),
        ...(numValue !== null ? { value: numValue } : textValue ? { value: textValue } : {}),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
  return items.length ? [{ type: 'tiles', items }] : [];
}

/* ------------------------------------------------------------------ */
/* Resolución de la vista                                               */
/* ------------------------------------------------------------------ */

type MetricResolution = { metric: RadarMetric; value: number; formatted: string };

/** ¿`userId` puede ver algo con esta visibilidad? Sin lista (o vacía) = todos. */
function isVisibleTo(visibility: RadarVisibility | undefined, userId: number): boolean {
  const userIds = visibility?.userIds;
  return !userIds?.length || userIds.includes(userId);
}

export async function resolveRadarView(args: {
  teamId: number;
  userId: number;
  definition: RadarAppDefinition;
  viewSlug?: string;
}): Promise<{ view: ResolvedRadarView; navigation: ResolvedRadarNavItem[]; defaultView: string }> {
  const { teamId, userId, definition } = args;

  // El caller ya chequea la visibilidad de la app; acá se repite igual porque
  // resolver una vista para alguien que no puede verla sería una fuga.
  if (!isVisibleTo(definition.visibility, userId)) {
    throw new Error(
      `El usuario ${userId} no está en visibility.userIds de la app "${definition.name}": no puede ver ninguna de sus vistas.`,
    );
  }

  const visibleViews = definition.views.filter((view) => isVisibleTo(view.visibility, userId));
  if (!visibleViews.length) {
    throw new Error(
      `Ninguna vista de "${definition.name}" es visible para el usuario ${userId}: todas lo excluyen por visibility.userIds.`,
    );
  }

  const bySlug = new Map(visibleViews.map((view) => [view.slug, view]));
  const defaultView =
    definition.defaultView && bySlug.has(definition.defaultView) ? definition.defaultView : visibleViews[0].slug;
  // Vista pedida inexistente o no visible → default, sin error: la navegación
  // vieja de un cliente no puede dejarlo sin pantalla.
  const chosen = args.viewSlug && bySlug.has(args.viewSlug) ? bySlug.get(args.viewSlug)! : bySlug.get(defaultView)!;

  // Cache de métricas por key: el badge de la navegación, un `when` y un
  // binding de metrics pueden pedir la misma métrica y se resuelve una vez.
  const metricCache = new Map<string, Promise<MetricResolution>>();
  const resolveMetric = (key: string): Promise<MetricResolution> => {
    const cached = metricCache.get(key);
    if (cached) return cached;
    const promise = (async () => {
      const metric = definition.metrics?.find((candidate) => candidate.key === key);
      if (!metric) {
        const valid = definition.metrics?.map((candidate) => candidate.key) ?? [];
        throw new Error(
          `No existe la métrica "${key}" en esta app. Métricas declaradas: ${valid.length ? valid.join(', ') : '(ninguna — agregala en definition.metrics)'}.`,
        );
      }
      // `definition.metrics` completo: una métrica de fórmula referencia a sus
      // hermanas por key y las resuelve en cadena.
      const resolved = await resolveRadarMetricValue(teamId, metric, definition.datasources, definition.metrics);
      return { metric, ...resolved };
    })();
    metricCache.set(key, promise);
    return promise;
  };

  const [navigation, components] = await Promise.all([
    resolveNavigation(definition, visibleViews, resolveMetric),
    resolveComponents(teamId, definition, chosen, resolveMetric),
  ]);

  const view: ResolvedRadarView = {
    slug: chosen.slug,
    name: chosen.name,
    icon: chosen.icon ?? null,
    tone: chosen.tone ?? null,
    hint: chosen.hint ?? null,
    components,
    refreshSeconds: chosen.refreshSeconds ?? null,
  };

  return { view, navigation, defaultView };
}

/* ------------------------------------------------------------------ */
/* Navegación                                                           */
/* ------------------------------------------------------------------ */

async function resolveNavigation(
  definition: RadarAppDefinition,
  visibleViews: RadarView[],
  resolveMetric: (key: string) => Promise<MetricResolution>,
): Promise<ResolvedRadarNavItem[]> {
  const bySlug = new Map(visibleViews.map((view) => [view.slug, view]));

  // Con `navigation` declarada mandan su orden y sus labels (solo vistas
  // visibles y existentes); sin ella, todas las visibles en su orden.
  const entries = definition.navigation?.length
    ? definition.navigation
        .filter((item) => bySlug.has(item.view))
        .map((item) => ({ view: bySlug.get(item.view)!, label: item.label, icon: item.icon, badgeMetric: item.badgeMetric }))
    : visibleViews.map((view) => ({
        view,
        label: undefined as string | undefined,
        icon: undefined as RadarView['icon'],
        badgeMetric: undefined as string | undefined,
      }));

  // Badges en paralelo; uno que falle queda en null — la navegación no se rompe.
  return Promise.all(
    entries.map(async (entry): Promise<ResolvedRadarNavItem> => {
      const badgeMetric = entry.badgeMetric ?? entry.view.badgeMetric;
      let badge: string | null = null;
      if (badgeMetric) {
        try {
          badge = (await resolveMetric(badgeMetric)).formatted;
        } catch {
          badge = null;
        }
      }
      return {
        view: entry.view.slug,
        label: entry.label ?? entry.view.name,
        icon: entry.icon ?? entry.view.icon ?? null,
        tone: entry.view.tone ?? null,
        badge,
      };
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Componentes                                                          */
/* ------------------------------------------------------------------ */

function evaluateWhen(op: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq', left: number, right: number): boolean {
  switch (op) {
    case 'gt': return left > right;
    case 'gte': return left >= right;
    case 'lt': return left < right;
    case 'lte': return left <= right;
    case 'eq': return left === right;
    case 'neq': return left !== right;
  }
}

async function materializeBinding(
  teamId: number,
  definition: RadarAppDefinition,
  binding: RadarBinding,
  resolveMetric: (key: string) => Promise<MetricResolution>,
): Promise<RadarBlock[]> {
  if (binding.kind === 'metrics') {
    const resolved = await Promise.all(binding.refs.map((ref) => resolveMetric(ref)));
    const items = resolved.map(({ metric, formatted }) => ({
      label: metric.label,
      // El item de kpi admite hasta 24 caracteres: un formateo largo se corta
      // antes de que el schema descarte el bloque entero.
      value: formatted.slice(0, 24),
      ...(metric.icon ? { icon: metric.icon } : {}),
      ...(metric.tone ? { tone: metric.tone } : {}),
      ...(metric.hint ? { hint: metric.hint.slice(0, 200) } : {}),
    }));
    return [{ type: 'kpi', items, ...(binding.columns ? { columns: binding.columns } : {}) }];
  }

  const ds = definition.datasources?.find((candidate) => candidate.key === binding.ref);
  if (!ds) {
    const valid = definition.datasources?.map((candidate) => candidate.key) ?? [];
    throw new Error(
      `El binding apunta al datasource "${binding.ref}", que no existe en esta app. Datasources declarados: ${valid.length ? valid.join(', ') : '(ninguno — agregalo en definition.datasources)'}.`,
    );
  }

  const { rows } = await executeRadarDatasource(teamId, {
    ...ds,
    ...(binding.limit ? { limit: binding.limit } : {}),
  });

  if (!rows.length) {
    const emptyText = binding.emptyText?.trim();
    return emptyText ? [{ type: 'text', body: emptyText }] : [];
  }

  switch (binding.display) {
    case 'table': return materializeTable(ds, binding.map, rows);
    case 'contacts': return materializeContacts(ds, binding.map, rows);
    case 'tasks': return materializeTasks(binding.map, rows);
    case 'list': return materializeList(binding.map, rows);
    case 'stat': return materializeStat(binding.map, rows);
    case 'tiles': return materializeTiles(binding.map, rows);
  }
}

async function resolveComponents(
  teamId: number,
  definition: RadarAppDefinition,
  view: RadarView,
  resolveMetric: (key: string) => Promise<MetricResolution>,
): Promise<ResolvedRadarComponent[]> {
  const actionsByKey = new Map((definition.actions ?? []).map((action) => [action.key, action]));

  const resolved = await Promise.all(
    view.components.map((component) => resolveComponent(teamId, definition, component, actionsByKey, resolveMetric)),
  );
  // `when` en false devuelve null: el componente directamente no aparece.
  return resolved.filter((component): component is ResolvedRadarComponent => component !== null);
}

async function resolveComponent(
  teamId: number,
  definition: RadarAppDefinition,
  component: RadarComponent,
  actionsByKey: Map<string, RadarAction>,
  resolveMetric: (key: string) => Promise<MetricResolution>,
): Promise<ResolvedRadarComponent | null> {
  const base: Omit<ResolvedRadarComponent, 'blocks' | 'error'> = {
    id: component.id,
    title: component.title ?? null,
    description: component.description ?? null,
    icon: component.icon ?? null,
    tone: component.tone ?? null,
    grid: component.grid ?? null,
    actions: (component.actions ?? [])
      .map((key) => actionsByKey.get(key))
      .filter((action): action is RadarAction => Boolean(action)),
    refreshSeconds: component.refreshSeconds ?? null,
  };

  const staticBlocks = component.blocks?.length ? parseRadarBlocks(component.blocks) : [];

  // `when`: la condición decide si el componente se dibuja. Si la métrica no
  // se puede resolver, el componente aparece con el error (no desaparece en
  // silencio: la IA tiene que poder ver qué está mal).
  if (component.when) {
    let metricValue: number;
    try {
      metricValue = (await resolveMetric(component.when.metric)).value;
    } catch (error) {
      return { ...base, blocks: staticBlocks, error: error instanceof Error ? error.message : String(error) };
    }
    if (!evaluateWhen(component.when.op, metricValue, component.when.value)) return null;
  }

  if (!component.binding) {
    return { ...base, blocks: staticBlocks, error: null };
  }

  try {
    const bound = await materializeBinding(teamId, definition, component.binding, resolveMetric);
    // Los bloques materializados pasan por el schema igual que los estáticos:
    // si algo salió con forma inválida, se descarta ese bloque y no la vista.
    return { ...base, blocks: [...staticBlocks, ...parseRadarBlocks(bound)], error: null };
  } catch (error) {
    // Contrato: un binding que tira deja el componente con blocks vacíos y el
    // mensaje en `error`; la UI lo muestra y el resto de la vista sigue vivo.
    return { ...base, blocks: [], error: error instanceof Error ? error.message : String(error) };
  }
}
