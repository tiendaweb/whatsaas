import 'server-only';

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { contacts, teamRadarWidgets, type NewTeamRadarWidget, type TeamRadarWidget } from '@/lib/db/schema';
import {
  RADAR_BLOCK_DEFAULT_ICON,
  RADAR_SECTION_ICON,
  RADAR_TONES,
  RADAR_ICONS,
  RADAR_WIDGET_SIZES,
  RADAR_WIDGET_SURFACES,
  isBuiltinRadarSection,
  isValidRadarSectionId,
  parseRadarBlocks,
  radarWidgetInputSchema,
  type RadarBlock,
  type RadarIcon,
  type RadarSection,
  type RadarSectionId,
  type RadarTone,
  type RadarWidget,
  type RadarWidgetInput,
  type RadarWidgetSize,
  type RadarWidgetSurface,
} from '@/lib/plugins/radar/shared/blocks';

/* ------------------------------------------------------------------ */
/* Normalización                                                        */
/* ------------------------------------------------------------------ */

/**
 * Tono por defecto de un widget según su sección, para cuando la IA (o la UI)
 * crea uno sin elegir tono. Criterio: el tono acompaña la INTENCIÓN de la
 * sección, no el dato puntual — resumen es institucional (indigo), clientes es
 * la relación con la gente (sky), prioridades es lo que urge (rose),
 * seguimiento es lo que avanza y se cumple (emerald), informes es lectura
 * tranquila (slate), mejoras es "algo hay que corregir" (amber) y trabajos es
 * ejecución/entregables (violet). Así dos widgets de la misma sección quedan
 * de la misma familia visual sin que nadie tenga que elegir nada.
 */
const RADAR_SECTION_DEFAULT_TONE: Record<RadarSection, RadarTone> = {
  resumen: 'indigo',
  clientes: 'sky',
  prioridades: 'rose',
  informes: 'slate',
  seguimiento: 'emerald',
  mejoras: 'amber',
  trabajos: 'violet',
};

/**
 * Icono con el que NACE un widget que no eligió uno. Sale del primer bloque, o
 * sea de lo que el widget muestra de verdad: un widget de tabla no puede tener
 * el mismo icono que uno de embudo sólo porque viven en la misma sección. El
 * icono de la sección queda como último recurso, para el caso raro de un widget
 * sin ningún bloque.
 */
function defaultWidgetIcon(blocks: RadarBlock[], section: RadarSectionId): RadarIcon {
  const first = blocks[0];
  if (first) return RADAR_BLOCK_DEFAULT_ICON[first.type];
  return isBuiltinRadarSection(section) ? RADAR_SECTION_ICON[section] : 'Compass';
}

/** Tono con el que nace un widget de una sección personalizada sin tono elegido. */
function sectionDefaultTone(section: RadarSectionId): RadarTone {
  return isBuiltinRadarSection(section) ? RADAR_SECTION_DEFAULT_TONE[section] : 'indigo';
}

// La tabla guarda section/surface/size/tone/icon como varchar libre (los escribe
// una IA por MCP). Si alguna fila trae basura, el widget tiene que seguir
// dibujándose con los defaults en vez de romper el panel entero.
// Una sección puede ser builtin o el slug de una personalizada: acá sólo se
// chequea la FORMA; si la sección ya no existe en el equipo, el widget queda
// invisible hasta reasignarlo (o hasta recrear la sección), no se pierde.
function toSection(value: string | null): RadarSectionId {
  return isValidRadarSectionId(value ?? '') ? (value as RadarSectionId) : 'resumen';
}

function toSurface(value: string | null): RadarWidgetSurface {
  return (RADAR_WIDGET_SURFACES as readonly string[]).includes(value ?? '')
    ? (value as RadarWidgetSurface)
    : 'dashboard';
}

function toSize(value: string | null): RadarWidgetSize {
  return (RADAR_WIDGET_SIZES as readonly string[]).includes(value ?? '') ? (value as RadarWidgetSize) : 'md';
}

function toTone(value: string | null): RadarTone | null {
  return (RADAR_TONES as readonly string[]).includes(value ?? '') ? (value as RadarTone) : null;
}

function toIcon(value: string | null): RadarIcon | null {
  return (RADAR_ICONS as readonly string[]).includes(value ?? '') ? (value as RadarIcon) : null;
}

function toSource(value: string | null): RadarWidget['source'] {
  return value === 'user' || value === 'system' ? value : 'ai';
}

function mapWidget(row: TeamRadarWidget): RadarWidget {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    description: row.description,
    icon: toIcon(row.icon),
    tone: toTone(row.tone),
    section: toSection(row.section),
    surface: toSurface(row.surface),
    size: toSize(row.size),
    position: row.position,
    contactId: row.contactId,
    enabled: row.enabled,
    source: toSource(row.source),
    blocks: parseRadarBlocks(row.blocks),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Lectura                                                              */
/* ------------------------------------------------------------------ */

export type ListRadarWidgetsInput = {
  teamId: number;
  section?: RadarSection | string;
  surface?: RadarWidgetSurface | string;
  /** `null` explícito = solo los widgets globales (sin contacto). */
  contactId?: number | null;
  includeDisabled?: boolean;
  /** Suma los archivados al listado normal. Por defecto quedan afuera. */
  includeArchived?: boolean;
  /** Solo los archivados: es el listado del banco de widgets. */
  onlyArchived?: boolean;
};

export async function listRadarWidgets(input: ListRadarWidgetsInput): Promise<RadarWidget[]> {
  const filters = [eq(teamRadarWidgets.teamId, input.teamId)];

  if (input.section && isValidRadarSectionId(input.section)) {
    filters.push(eq(teamRadarWidgets.section, input.section));
  }
  if (input.surface && (RADAR_WIDGET_SURFACES as readonly string[]).includes(input.surface)) {
    // `both` vive en las dos superficies, así que siempre entra en el filtro.
    filters.push(
      input.surface === 'both'
        ? eq(teamRadarWidgets.surface, 'both')
        : inArray(teamRadarWidgets.surface, [input.surface, 'both']),
    );
  }
  if (input.contactId !== undefined) {
    filters.push(
      input.contactId === null
        ? sql`${teamRadarWidgets.contactId} is null`
        : sql`(${teamRadarWidgets.contactId} = ${input.contactId} or ${teamRadarWidgets.contactId} is null)`,
    );
  }
  if (!input.includeDisabled) filters.push(eq(teamRadarWidgets.enabled, true));

  // Un widget archivado vive en el banco, no en el tablero: se excluye salvo
  // que lo pidan explícitamente.
  if (input.onlyArchived) filters.push(sql`${teamRadarWidgets.archivedAt} is not null`);
  else if (!input.includeArchived) filters.push(sql`${teamRadarWidgets.archivedAt} is null`);

  const rows = await db
    .select()
    .from(teamRadarWidgets)
    .where(and(...filters))
    // El banco se lee como historial: lo último archivado primero.
    .orderBy(
      ...(input.onlyArchived
        ? [desc(teamRadarWidgets.archivedAt), desc(teamRadarWidgets.id)]
        : [asc(teamRadarWidgets.position), asc(teamRadarWidgets.id)]),
    );

  return rows.map(mapWidget);
}

/** Busca por key sin importar si está archivado (el banco necesita leerlo). */
export async function getRadarWidget(teamId: number, key: string): Promise<RadarWidget | null> {
  const [row] = await db
    .select()
    .from(teamRadarWidgets)
    .where(and(eq(teamRadarWidgets.teamId, teamId), eq(teamRadarWidgets.key, key)))
    .limit(1);
  return row ? mapWidget(row) : null;
}

/* ------------------------------------------------------------------ */
/* Escritura                                                            */
/* ------------------------------------------------------------------ */

/** Un widget acotado a un contacto de OTRO equipo sería una fuga de datos. */
async function assertContactBelongsToTeam(teamId: number, contactId: number) {
  const [row] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.teamId, teamId)))
    .limit(1);
  if (!row) throw new Error(`El contacto #${contactId} no pertenece a este equipo`);
}

export type UpsertRadarWidgetInput = {
  teamId: number;
  userId: number;
  source?: RadarWidget['source'];
  input: RadarWidgetInput | unknown;
};

/**
 * Idempotente por `(teamId, key)`: re-enviar la misma key actualiza el widget.
 * En el UPDATE, los opcionales que no vinieron NO pisan lo guardado — así una
 * IA puede reescribir sólo los bloques sin perder la posición y el tamaño que
 * el usuario acomodó a mano.
 */
export async function upsertRadarWidget(args: UpsertRadarWidgetInput): Promise<RadarWidget> {
  const input = radarWidgetInputSchema.parse(args.input);
  const source = args.source ?? 'ai';

  if (typeof input.contactId === 'number') {
    await assertContactBelongsToTeam(args.teamId, input.contactId);
  }

  const now = new Date();
  const insertSection: RadarSectionId = input.section ?? 'resumen';

  // Los opcionales ausentes simplemente NO entran al SET: así el UPDATE deja
  // intacto lo que ya estaba guardado en vez de pisarlo con el default.
  // `source` queda fuera a propósito: si el usuario armó el widget a mano, una
  // regeneración de la IA le actualiza el contenido pero no le roba la autoría.
  const conflictSet: Partial<NewTeamRadarWidget> = {
    // title y blocks son el contenido del widget: siempre se reemplazan.
    title: input.title,
    blocks: input.blocks,
    updatedBy: args.userId,
    updatedAt: now,
    // Un upsert explícito DESARCHIVA. Si no, re-crear un widget cuya key quedó
    // archivada en el banco actualizaría la fila archivada y el widget seguiría
    // invisible en el tablero: para quien lo pidió parecería que "no se creó".
    archivedAt: null,
    archivedBy: null,
  };
  if (input.description !== undefined) conflictSet.description = input.description ?? null;
  if (input.icon !== undefined) conflictSet.icon = input.icon;
  if (input.tone !== undefined) conflictSet.tone = input.tone;
  if (input.section !== undefined) conflictSet.section = input.section;
  if (input.surface !== undefined) conflictSet.surface = input.surface;
  if (input.size !== undefined) conflictSet.size = input.size;
  if (input.position !== undefined) conflictSet.position = input.position;
  if (input.contactId !== undefined) conflictSet.contactId = input.contactId ?? null;
  if (input.enabled !== undefined) conflictSet.enabled = input.enabled;

  const [row] = await db
    .insert(teamRadarWidgets)
    .values({
      teamId: args.teamId,
      key: input.key,
      title: input.title,
      description: input.description ?? null,
      // Al CREAR, un widget sin icono toma el del PRIMER BLOQUE (lo que
      // realmente muestra) y sin tono, el de su sección. En el UPDATE no
      // aplica: `conflictSet` sólo pisa icon/tone si vinieron explícitos, así
      // que un icono elegido a mano sobrevive a cualquier regeneración de la IA.
      icon: input.icon ?? defaultWidgetIcon(input.blocks, insertSection),
      tone: input.tone ?? sectionDefaultTone(insertSection),
      section: insertSection,
      surface: input.surface ?? 'dashboard',
      size: input.size ?? 'md',
      position: input.position ?? 0,
      contactId: input.contactId ?? null,
      enabled: input.enabled ?? true,
      source,
      blocks: input.blocks,
      createdBy: args.userId,
      updatedBy: args.userId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [teamRadarWidgets.teamId, teamRadarWidgets.key],
      set: conflictSet,
    })
    .returning();

  return mapWidget(row);
}

/* ------------------------------------------------------------------ */
/* Banco de widgets                                                     */
/* ------------------------------------------------------------------ */

/**
 * Manda el widget al banco: deja de aparecer en el tablero pero conserva la
 * fila (y su key, que sigue siendo única por equipo). Es lo que hace el botón
 * "Guardar en el banco" y el borrado desde los conectores.
 */
export async function archiveRadarWidget(args: {
  teamId: number;
  userId: number;
  key: string;
}): Promise<RadarWidget | null> {
  const [row] = await db
    .update(teamRadarWidgets)
    .set({ archivedAt: new Date(), archivedBy: args.userId, updatedAt: new Date() })
    .where(and(eq(teamRadarWidgets.teamId, args.teamId), eq(teamRadarWidgets.key, args.key)))
    .returning();
  return row ? mapWidget(row) : null;
}

/** Saca el widget del banco. Si viene `section`, además lo reubica. */
export async function restoreRadarWidget(args: {
  teamId: number;
  key: string;
  section?: RadarSectionId;
}): Promise<RadarWidget | null> {
  const set: Partial<NewTeamRadarWidget> = { archivedAt: null, archivedBy: null, updatedAt: new Date() };
  if (args.section && isValidRadarSectionId(args.section)) {
    set.section = args.section;
  }

  const [row] = await db
    .update(teamRadarWidgets)
    .set(set)
    .where(and(eq(teamRadarWidgets.teamId, args.teamId), eq(teamRadarWidgets.key, args.key)))
    .returning();
  return row ? mapWidget(row) : null;
}

/**
 * Copia un widget del banco a uno nuevo y ACTIVO con otra key. Es lo que
 * convierte al banco en biblioteca de plantillas: el original queda archivado.
 */
export async function duplicateRadarWidget(args: {
  teamId: number;
  userId: number;
  key: string;
  newKey: string;
  title?: string;
  section?: RadarSectionId;
}): Promise<RadarWidget> {
  const newKey = args.newKey.trim();
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(newKey) || newKey.length > 80) {
    throw new Error('La key nueva solo admite letras, números, guion y guion bajo (máximo 80).');
  }
  if (newKey === args.key) throw new Error('La key nueva tiene que ser distinta de la original.');

  const [source] = await db
    .select()
    .from(teamRadarWidgets)
    .where(and(eq(teamRadarWidgets.teamId, args.teamId), eq(teamRadarWidgets.key, args.key)))
    .limit(1);
  if (!source) throw new Error(`No existe un widget con la key "${args.key}" en este equipo.`);

  const [taken] = await db
    .select({ id: teamRadarWidgets.id })
    .from(teamRadarWidgets)
    .where(and(eq(teamRadarWidgets.teamId, args.teamId), eq(teamRadarWidgets.key, newKey)))
    .limit(1);
  if (taken) throw new Error(`Ya existe un widget con la key "${newKey}". Elegí otra.`);

  const section = args.section && isValidRadarSectionId(args.section) ? args.section : source.section;

  const now = new Date();
  const [row] = await db
    .insert(teamRadarWidgets)
    .values({
      teamId: args.teamId,
      key: newKey,
      title: args.title?.trim().slice(0, 200) || source.title,
      description: source.description,
      icon: source.icon,
      tone: source.tone,
      section,
      surface: source.surface,
      size: source.size,
      position: source.position,
      contactId: source.contactId,
      enabled: true,
      // La copia la hizo una persona desde el banco, aunque el original fuera
      // de la IA: así una regeneración automática no le pisa la plantilla.
      source: 'user',
      blocks: source.blocks,
      createdBy: args.userId,
      updatedBy: args.userId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return mapWidget(row);
}

/** Borrado FÍSICO e irreversible. Solo desde el banco, con confirmación. */
export async function purgeRadarWidget(args: { teamId: number; key: string }): Promise<boolean> {
  const deleted = await db
    .delete(teamRadarWidgets)
    .where(and(eq(teamRadarWidgets.teamId, args.teamId), eq(teamRadarWidgets.key, args.key)))
    .returning({ id: teamRadarWidgets.id });
  return deleted.length > 0;
}

/**
 * @deprecated Alias histórico de `purgeRadarWidget` — BORRA de verdad. Para el
 * comportamiento nuevo (mandar al banco) usá `archiveRadarWidget`.
 */
export const deleteRadarWidget = purgeRadarWidget;

/**
 * Mueve TODOS los widgets de una sección a otra (incluidos los deshabilitados
 * y los del banco). Es lo que evita que borrar una sección personalizada deje
 * widgets huérfanos en una sección que ya no existe.
 */
export async function reassignRadarWidgetsSection(args: {
  teamId: number;
  from: RadarSectionId;
  to: RadarSectionId;
}): Promise<number> {
  if (!isValidRadarSectionId(args.to) || args.from === args.to) return 0;
  const rows = await db
    .update(teamRadarWidgets)
    .set({ section: args.to, updatedAt: new Date() })
    .where(and(eq(teamRadarWidgets.teamId, args.teamId), eq(teamRadarWidgets.section, args.from)))
    .returning({ id: teamRadarWidgets.id });
  return rows.length;
}

export type ReorderRadarWidgetItem = {
  key: string;
  position: number;
  size?: RadarWidgetSize;
  section?: RadarSectionId;
};

/** Drag & resize de la grilla: una fila por widget movido. */
export async function reorderRadarWidgets(args: {
  teamId: number;
  items: ReorderRadarWidgetItem[];
}): Promise<number> {
  if (!args.items.length) return 0;

  let updated = 0;
  for (const item of args.items) {
    const rows = await db
      .update(teamRadarWidgets)
      .set({
        position: item.position,
        ...(item.size && (RADAR_WIDGET_SIZES as readonly string[]).includes(item.size) ? { size: item.size } : {}),
        ...(item.section && isValidRadarSectionId(item.section) ? { section: item.section } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(teamRadarWidgets.teamId, args.teamId), eq(teamRadarWidgets.key, item.key)))
      .returning({ id: teamRadarWidgets.id });
    updated += rows.length;
  }
  return updated;
}

/** PATCH parcial desde la UI: sólo toca lo que vino en el body. */
export type PatchRadarWidgetFields = {
  title?: string;
  description?: string | null;
  position?: number;
  size?: RadarWidgetSize;
  section?: RadarSectionId;
  surface?: RadarWidgetSurface;
  enabled?: boolean;
  icon?: RadarIcon | null;
  tone?: RadarTone | null;
  blocks?: unknown;
};

export async function patchRadarWidget(args: {
  teamId: number;
  userId: number;
  key: string;
  fields: PatchRadarWidgetFields;
}): Promise<RadarWidget | null> {
  const set: Partial<NewTeamRadarWidget> = { updatedBy: args.userId, updatedAt: new Date() };
  const f = args.fields;

  if (typeof f.title === 'string' && f.title.trim()) set.title = f.title.trim().slice(0, 200);
  if (f.description !== undefined) set.description = f.description?.trim() || null;
  if (typeof f.position === 'number' && Number.isInteger(f.position)) set.position = Math.max(0, Math.min(9999, f.position));
  if (f.size && (RADAR_WIDGET_SIZES as readonly string[]).includes(f.size)) set.size = f.size;
  if (f.section && isValidRadarSectionId(f.section)) set.section = f.section;
  if (f.surface && (RADAR_WIDGET_SURFACES as readonly string[]).includes(f.surface)) set.surface = f.surface;
  if (typeof f.enabled === 'boolean') set.enabled = f.enabled;
  if (f.icon !== undefined) set.icon = toIcon(f.icon ?? null);
  if (f.tone !== undefined) set.tone = toTone(f.tone ?? null);
  if (f.blocks !== undefined) set.blocks = parseRadarBlocks(f.blocks);

  // Sólo `updatedBy`/`updatedAt`: no hay nada real que actualizar.
  if (Object.keys(set).length === 2) return getRadarWidget(args.teamId, args.key);

  const [row] = await db
    .update(teamRadarWidgets)
    .set(set)
    .where(and(eq(teamRadarWidgets.teamId, args.teamId), eq(teamRadarWidgets.key, args.key)))
    .returning();

  return row ? mapWidget(row) : null;
}
