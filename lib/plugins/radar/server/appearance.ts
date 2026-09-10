import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { teamPlugins } from '@/lib/db/schema';
import { RADAR_PLUGIN_ID } from '@/lib/plugins/radar/shared/constants';
import {
  RADAR_RESERVED_SECTION_IDS,
  RADAR_SECTIONS,
  RADAR_SECTION_ICON,
  RADAR_SECTION_ID_REGEX,
  RADAR_SECTION_LABEL,
  isBuiltinRadarSection,
  parseRadarAppearance,
  radarCustomSectionSchema,
  type RadarAppearance,
  type RadarCustomSection,
  type RadarIcon,
  type RadarSection,
  type RadarSectionAppearance,
  type RadarSectionId,
  type RadarTone,
} from '@/lib/plugins/radar/shared/blocks';

/**
 * Apariencia de las secciones del menú lateral de Radar, por equipo.
 *
 * No tiene tabla propia a propósito: vive en el jsonb `team_plugins.settings`
 * de la fila del plugin `radar`, bajo la clave `appearance`. Por eso el
 * `settingsSchema` del manifiesto declara ese campo — si no, cada guardado
 * desde Admin lo borraría al parsear los settings.
 */

const EMPTY: RadarAppearance = { sections: {}, custom: [], order: [] };

async function readSettings(teamId: number): Promise<Record<string, unknown> | null> {
  const [row] = await db
    .select({ settings: teamPlugins.settings })
    .from(teamPlugins)
    .where(and(eq(teamPlugins.teamId, teamId), eq(teamPlugins.pluginId, RADAR_PLUGIN_ID)))
    .limit(1);
  return row ? ((row.settings ?? {}) as Record<string, unknown>) : null;
}

/** Overrides guardados del equipo. Lo inválido se descarta, nunca rompe. */
export async function getRadarAppearance(teamId: number): Promise<RadarAppearance> {
  const settings = await readSettings(teamId);
  if (!settings) return EMPTY;
  return parseRadarAppearance(settings.appearance);
}

export type RadarSectionResolved = {
  section: RadarSectionId;
  label: string;
  icon: RadarIcon;
  tone: RadarTone | null;
  /** Renglón chico de la card del menú. `null` = usar el default de la UI. */
  hint: string | null;
  /** true = no aparece en el menú (sus widgets y su override se conservan). */
  hidden: boolean;
  /** true = sección personalizada del equipo; false = builtin del código. */
  custom: boolean;
  /** true si el equipo cambió algo respecto de la constante del código. */
  overridden: boolean;
};

/**
 * Defaults del código + overrides del equipo + secciones personalizadas, en el
 * orden final del menú. Incluye las ocultas (con `hidden: true`): quien dibuja
 * el menú las filtra, pero quien administra necesita verlas para des-ocultarlas.
 */
/**
 * Secciones que nacen ocultas.
 *
 * Prioridades, Clientes y Seguimiento dibujaban un ranking de contactos que el
 * Command Center calcula mejor y con más datos: quedaban dos verdades sobre el
 * mismo cliente y la de Radar estaba congelada desde agosto (85 contactos con
 * `radar_prioridad`, 14 llamadas MCP en 21 días). Radar no deja de ser capaz de
 * mostrarlas —un equipo que las quiera las prende con
 * `whatspro_radar_manage_section action="show"`, y sus widgets y su
 * personalización siguen intactos— pero por defecto el ranking de contactos
 * vive en un solo lugar. Lo que queda acá es lo que Radar hace mejor que
 * nadie: componer pantallas con bloques.
 */
const OCULTAS_POR_DEFECTO: readonly string[] = ['prioridades', 'clientes', 'seguimiento'];

export function resolveRadarSections(appearance: RadarAppearance): RadarSectionResolved[] {
  const builtin: RadarSectionResolved[] = RADAR_SECTIONS.map((section) => {
    const override = appearance.sections[section];
    return {
      section,
      label: override?.label ?? RADAR_SECTION_LABEL[section],
      icon: override?.icon ?? RADAR_SECTION_ICON[section],
      tone: override?.tone ?? null,
      hint: override?.hint ?? null,
      // El equipo manda: si alguien la mostró o la ocultó a mano, se respeta.
      hidden: override?.hidden ?? OCULTAS_POR_DEFECTO.includes(section),
      custom: false,
      overridden: Boolean(override && Object.keys(override).length),
    };
  });

  const custom: RadarSectionResolved[] = appearance.custom.map((section) => ({
    section: section.id,
    label: section.label,
    // Compass: una sección propia sin icono elegido es "un lugar nuevo a
    // explorar", y no repite el de ninguna sección builtin.
    icon: section.icon ?? 'Compass',
    tone: section.tone ?? null,
    hint: section.hint ?? null,
    hidden: section.hidden ?? false,
    custom: true,
    overridden: true,
  }));

  // `order` manda; lo que no figure ahí va al final en su orden por defecto
  // (builtins primero, personalizadas después). Ids desconocidos se ignoran.
  const byId = new Map<string, RadarSectionResolved>();
  for (const entry of [...builtin, ...custom]) byId.set(entry.section, entry);

  const ordered: RadarSectionResolved[] = [];
  for (const id of appearance.order) {
    const entry = byId.get(id);
    if (entry) {
      ordered.push(entry);
      byId.delete(id);
    }
  }
  for (const entry of [...builtin, ...custom]) {
    if (byId.has(entry.section)) ordered.push(entry);
  }
  return ordered;
}

/** Ids de sección a los que HOY se le puede asignar un widget en este equipo. */
export async function listRadarSectionIds(teamId: number): Promise<string[]> {
  const appearance = await getRadarAppearance(teamId);
  return resolveRadarSections(appearance).map((section) => section.section);
}

export async function getResolvedRadarSections(teamId: number): Promise<RadarSectionResolved[]> {
  return resolveRadarSections(await getRadarAppearance(teamId));
}

export type SetRadarAppearanceInput = {
  teamId: number;
  userId: number;
  /**
   * Overrides a aplicar. Se MEZCLAN con lo guardado: sólo se tocan las
   * secciones que vengan, y dentro de cada una, sólo los campos presentes. Una
   * sección con el objeto vacío (`{}`) borra su override y vuelve al default
   * del código: es la forma de "restablecer" sin un parámetro extra.
   */
  sections: Partial<Record<RadarSection, RadarSectionAppearance | Record<string, never>>>;
};

export async function setRadarAppearance(input: SetRadarAppearanceInput): Promise<RadarAppearance> {
  const current = await getRadarAppearance(input.teamId);
  const merged: Partial<Record<RadarSection, RadarSectionAppearance>> = { ...current.sections };

  for (const section of RADAR_SECTIONS) {
    const patch = input.sections[section];
    if (patch === undefined) continue;

    // Validación tolerante: se reusa el mismo parser de la lectura para que un
    // icono inventado se descarte igual que si viniera de la base.
    const clean = parseRadarAppearance({ sections: { [section]: patch } }).sections[section];
    if (!clean) {
      delete merged[section];
      continue;
    }
    merged[section] = { ...merged[section], ...clean };
  }

  // Las personalizadas y el orden no se tocan acá: viajan tal cual estaban.
  return writeAppearance(input.teamId, input.userId, {
    sections: merged,
    custom: current.custom,
    order: current.order,
  });
}

/** Escritura única de la apariencia: crea la fila del plugin si hace falta. */
async function writeAppearance(teamId: number, userId: number, next: RadarAppearance): Promise<RadarAppearance> {
  const settings = await readSettings(teamId);

  if (settings) {
    await db
      .update(teamPlugins)
      .set({ settings: { ...settings, appearance: next }, updatedAt: new Date() })
      .where(and(eq(teamPlugins.teamId, teamId), eq(teamPlugins.pluginId, RADAR_PLUGIN_ID)));
    return next;
  }

  // Radar es activationMode 'user': quien habilita el plugin es
  // `team_member_plugins`, no esta fila. Por eso la fila se crea apagada — sólo
  // existe para colgarle los settings, y así el estado que muestra Admin no
  // cambia por haber guardado un icono.
  await db.insert(teamPlugins).values({
    teamId,
    pluginId: RADAR_PLUGIN_ID,
    installed: false,
    enabled: false,
    settings: { scope: 'user', appearance: next },
    installedBy: userId,
    installedAt: new Date(),
    updatedAt: new Date(),
  });

  return next;
}

/* ------------------------------------------------------------------ */
/* Secciones personalizadas y orden del menú                            */
/* ------------------------------------------------------------------ */

export type CreateRadarSectionInput = {
  teamId: number;
  userId: number;
  id: string;
  label: string;
  icon?: RadarIcon;
  tone?: RadarTone;
  hint?: string;
};

/** Crea una entrada nueva del menú. El contenido serán los widgets con `section: id`. */
export async function createRadarCustomSection(input: CreateRadarSectionInput): Promise<RadarAppearance> {
  const id = input.id.trim().toLowerCase();
  if (!RADAR_SECTION_ID_REGEX.test(id)) {
    throw new Error('El id de la sección tiene que ser un slug en minúsculas: letras, números y guion (2 a 32).');
  }
  if (RADAR_RESERVED_SECTION_IDS.includes(id)) {
    throw new Error(`"${id}" es una sección del sistema: personalizala con un override, no se puede recrear.`);
  }

  const current = await getRadarAppearance(input.teamId);
  if (current.custom.some((section) => section.id === id)) {
    throw new Error(`Ya existe una sección personalizada con el id "${id}" en este equipo.`);
  }
  if (current.custom.length >= 12) {
    throw new Error('Este equipo ya tiene 12 secciones personalizadas, que es el máximo. Borrá alguna antes de crear otra.');
  }

  const section = radarCustomSectionSchema.parse({
    id,
    label: input.label,
    ...(input.icon ? { icon: input.icon } : {}),
    ...(input.tone ? { tone: input.tone } : {}),
    ...(input.hint ? { hint: input.hint } : {}),
  });

  return writeAppearance(input.teamId, input.userId, {
    sections: current.sections,
    custom: [...current.custom, section],
    order: current.order,
  });
}

export type UpdateRadarCustomSectionInput = {
  teamId: number;
  userId: number;
  id: string;
  fields: Partial<Pick<RadarCustomSection, 'label' | 'icon' | 'tone' | 'hint' | 'hidden'>>;
};

/** Cambia etiqueta/icono/tono/hint/hidden de una sección personalizada. */
export async function updateRadarCustomSection(input: UpdateRadarCustomSectionInput): Promise<RadarAppearance> {
  const current = await getRadarAppearance(input.teamId);
  const index = current.custom.findIndex((section) => section.id === input.id);
  if (index < 0) {
    throw new Error(`No existe una sección personalizada con el id "${input.id}" en este equipo.`);
  }

  const merged = radarCustomSectionSchema.parse({ ...current.custom[index], ...input.fields, id: input.id });
  const custom = [...current.custom];
  custom[index] = merged;

  return writeAppearance(input.teamId, input.userId, { sections: current.sections, custom, order: current.order });
}

/** Borra la sección personalizada del menú. Los widgets NO se tocan acá. */
export async function deleteRadarCustomSection(input: {
  teamId: number;
  userId: number;
  id: string;
}): Promise<RadarAppearance> {
  const current = await getRadarAppearance(input.teamId);
  if (!current.custom.some((section) => section.id === input.id)) {
    throw new Error(`No existe una sección personalizada con el id "${input.id}" en este equipo.`);
  }

  return writeAppearance(input.teamId, input.userId, {
    sections: current.sections,
    custom: current.custom.filter((section) => section.id !== input.id),
    order: current.order.filter((id) => id !== input.id),
  });
}

/**
 * Oculta o muestra CUALQUIER sección (builtin o personalizada) sin perder sus
 * widgets ni su personalización. Es el "sacar del menú" reversible.
 */
export async function setRadarSectionHidden(input: {
  teamId: number;
  userId: number;
  id: string;
  hidden: boolean;
}): Promise<RadarAppearance> {
  if (isBuiltinRadarSection(input.id)) {
    return setRadarAppearance({
      teamId: input.teamId,
      userId: input.userId,
      sections: { [input.id]: { hidden: input.hidden } },
    });
  }
  return updateRadarCustomSection({
    teamId: input.teamId,
    userId: input.userId,
    id: input.id,
    fields: { hidden: input.hidden },
  });
}

/**
 * Reordena el menú entero. `order` es la lista de ids en el orden deseado; los
 * ids que falten quedan al final en su orden por defecto, así mandar una lista
 * parcial (solo lo que se quiere arriba) también funciona.
 */
export async function reorderRadarSections(input: {
  teamId: number;
  userId: number;
  order: string[];
}): Promise<RadarAppearance> {
  const current = await getRadarAppearance(input.teamId);
  const valid = new Set(resolveRadarSections(current).map((section) => section.section));
  const order: string[] = [];
  for (const id of input.order) {
    const clean = typeof id === 'string' ? id.trim() : '';
    if (clean && valid.has(clean) && !order.includes(clean)) order.push(clean);
  }
  if (!order.length) {
    throw new Error(`Ningún id de la lista existe en el menú de este equipo. Los ids válidos son: ${[...valid].join(', ')}.`);
  }

  return writeAppearance(input.teamId, input.userId, {
    sections: current.sections,
    custom: current.custom,
    order,
  });
}
