import 'server-only';

import { and, asc, desc, eq, lt, ne, sql } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import {
  teamRadarApps,
  teamRadarAppVersions,
  type TeamRadarApp,
} from '@/lib/db/schema';
import { RADAR_ICONS, RADAR_TONES, type RadarIcon, type RadarTone } from '@/lib/plugins/radar/shared/blocks';
import {
  RADAR_APP_STATUSES,
  RADAR_ENGINE_LIMITS,
  RADAR_ENGINE_SLUG_REGEX,
  radarAppDefinitionSchema,
  type RadarAppDefinition,
  type RadarAppRecord,
  type RadarAppStatus,
  type RadarAppSummary,
  type RadarValidationIssue,
  type RadarValidationResult,
} from '@/lib/plugins/radar/shared/engine';
import { validateRadarAppDefinition } from './validate';

/* ------------------------------------------------------------------ */
/* Normalización                                                        */
/* ------------------------------------------------------------------ */

// Igual que en widgets.ts: la fila guarda icon/tone/status como varchar libre
// (los escribe una IA por MCP), así que si trae basura se degrada al default
// en vez de romper la lectura.
function toIcon(value: string | null): RadarIcon | null {
  return (RADAR_ICONS as readonly string[]).includes(value ?? '') ? (value as RadarIcon) : null;
}

function toTone(value: string | null): RadarTone | null {
  return (RADAR_TONES as readonly string[]).includes(value ?? '') ? (value as RadarTone) : null;
}

function toStatus(value: string | null): RadarAppStatus {
  return (RADAR_APP_STATUSES as readonly string[]).includes(value ?? '') ? (value as RadarAppStatus) : 'draft';
}

/**
 * Lectura TOLERANTE de una definición guardada: si el JSON no valida contra el
 * contrato actual (lo escribió una versión vieja del engine), se devuelve tal
 * cual con un cast. Tirar en lectura dejaría la app irrecuperable justo cuando
 * más se necesita abrirla para arreglarla.
 */
function toDefinition(value: unknown): RadarAppDefinition {
  const parsed = radarAppDefinitionSchema.safeParse(value);
  return parsed.success ? parsed.data : (value as RadarAppDefinition);
}

function mapApp(row: TeamRadarApp): RadarAppRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    icon: toIcon(row.icon),
    tone: toTone(row.tone),
    ownerUserId: row.ownerUserId,
    status: toStatus(row.status),
    definition: toDefinition(row.definition),
    version: row.version,
    publishedVersion: row.publishedVersion,
    publishedDefinition: row.publishedDefinition === null ? null : toDefinition(row.publishedDefinition),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Los issues de zod, en el mismo formato que los de validate (path "/views/0/name"). */
function zodIssuesToValidation(issues: Array<{ path: PropertyKey[]; message: string }>): RadarValidationResult {
  const errors: RadarValidationIssue[] = issues.map((issue) => ({
    severity: 'error',
    path: `/${issue.path.map(String).join('/')}`,
    message: issue.message,
  }));
  return { ok: false, errors, warnings: [] };
}

async function findAppRow(teamId: number, slug: string): Promise<TeamRadarApp | null> {
  const [row] = await db
    .select()
    .from(teamRadarApps)
    .where(and(eq(teamRadarApps.teamId, teamId), eq(teamRadarApps.slug, slug)))
    .limit(1);
  return row ?? null;
}

/* ------------------------------------------------------------------ */
/* Lectura                                                              */
/* ------------------------------------------------------------------ */

export async function listRadarApps(
  teamId: number,
  opts?: { includeArchived?: boolean },
): Promise<RadarAppSummary[]> {
  const filters = [eq(teamRadarApps.teamId, teamId)];
  if (!opts?.includeArchived) filters.push(ne(teamRadarApps.status, 'archived'));

  const rows = await db
    .select()
    .from(teamRadarApps)
    .where(and(...filters))
    .orderBy(desc(teamRadarApps.updatedAt), desc(teamRadarApps.id));

  return rows.map((row) => {
    const app = mapApp(row);
    return {
      slug: app.slug,
      name: app.name,
      icon: app.icon,
      tone: app.tone,
      ownerUserId: app.ownerUserId,
      status: app.status,
      version: app.version,
      publishedVersion: app.publishedVersion,
      updatedAt: app.updatedAt,
    };
  });
}

export async function getRadarApp(teamId: number, slug: string): Promise<RadarAppRecord | null> {
  const row = await findAppRow(teamId, slug);
  return row ? mapApp(row) : null;
}

/* ------------------------------------------------------------------ */
/* Apply: la única puerta de escritura de definiciones                  */
/* ------------------------------------------------------------------ */

export type ApplyRadarAppInput = {
  teamId: number;
  userId: number;
  slug: string;
  /** La definición completa, cruda: se valida acá adentro. */
  definition: unknown;
  /** Optimistic locking: si viene y no coincide con la actual, se tira. */
  expectedVersion?: number;
  /** Valida y devuelve el resultado sin escribir nada. */
  dryRun?: boolean;
  /** Además de guardar el borrador, publica esta versión. */
  publish?: boolean;
  /** Etiqueta humana de la versión ("agregado AI Coach"). */
  summary?: string;
};

/**
 * Crea o actualiza una app. Cada apply exitoso es una versión NUEVA en el
 * historial: nunca se reescribe una versión guardada. El borrador (`definition`
 * de la fila principal) siempre es la última versión; publicar congela una
 * copia aparte en `publishedDefinition`.
 */
export async function applyRadarApp(input: ApplyRadarAppInput): Promise<{
  applied: boolean;
  app: RadarAppRecord | null;
  validation: RadarValidationResult;
  version: number | null;
}> {
  if (!RADAR_ENGINE_SLUG_REGEX.test(input.slug)) {
    throw new Error(`Slug de app inválido: "${input.slug}" (minúsculas, números y guion, 2 a 48).`);
  }

  const existing = await findAppRow(input.teamId, input.slug);
  const currentApp = existing ? mapApp(existing) : null;

  // El lock optimista se chequea ANTES de validar: si la IA está trabajando
  // sobre una versión vieja, no tiene sentido ni mirarle la definición.
  if (input.expectedVersion !== undefined) {
    if (!existing) {
      throw new Error(`La app "${input.slug}" no existe todavía: no se puede exigir expectedVersion=${input.expectedVersion}.`);
    }
    if (existing.version !== input.expectedVersion) {
      throw new Error(
        `Conflicto de versión en "${input.slug}": esperabas la ${input.expectedVersion} pero la actual es la ${existing.version}. Releé la app y reintentá.`,
      );
    }
  }

  // 1) Forma: zod. Si ni siquiera es una definición, no hay nada que escribir.
  const parsed = radarAppDefinitionSchema.safeParse(input.definition);
  if (!parsed.success) {
    return {
      applied: false,
      app: currentApp,
      validation: zodIssuesToValidation(parsed.error.issues),
      version: null,
    };
  }
  const definition = parsed.data;

  // 2) Semántica: referencias, duplicados, acciones a medio armar.
  const validation = validateRadarAppDefinition(definition);
  if (!validation.ok) {
    return { applied: false, app: currentApp, validation, version: null };
  }

  // 3) Dry run: todo validado, nada escrito.
  if (input.dryRun) {
    return { applied: false, app: currentApp, validation, version: null };
  }

  // 4) Límite de apps por equipo, sólo al CREAR.
  if (!existing) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(teamRadarApps)
      .where(eq(teamRadarApps.teamId, input.teamId));
    if (count >= RADAR_ENGINE_LIMITS.maxApps) {
      throw new Error(
        `Este equipo ya tiene ${count} apps de Radar (el máximo es ${RADAR_ENGINE_LIMITS.maxApps}). Archivá o borrá alguna antes de crear otra.`,
      );
    }
  }

  const now = new Date();
  const newVersion = existing ? existing.version + 1 : 1;
  const summary = input.summary?.trim().slice(0, 300) || null;

  const row = await db.transaction(async (tx) => {
    let appRow: TeamRadarApp;
    if (existing) {
      const [updated] = await tx
        .update(teamRadarApps)
        .set({
          name: definition.name,
          icon: definition.icon ?? null,
          tone: definition.tone ?? null,
          ownerUserId: definition.ownerUserId ?? null,
          definition,
          version: newVersion,
          // Un apply sobre una app archivada la revive como borrador: si
          // alguien la está editando, claramente dejó de ser un archivo muerto.
          ...(input.publish
            ? { status: 'published' as const, publishedVersion: newVersion, publishedDefinition: definition }
            : existing.status === 'archived'
              ? { status: 'draft' as const }
              : {}),
          updatedBy: input.userId,
          updatedAt: now,
        })
        .where(eq(teamRadarApps.id, existing.id))
        .returning();
      appRow = updated;
    } else {
      const [created] = await tx
        .insert(teamRadarApps)
        .values({
          teamId: input.teamId,
          slug: input.slug,
          name: definition.name,
          icon: definition.icon ?? null,
          tone: definition.tone ?? null,
          ownerUserId: definition.ownerUserId ?? null,
          status: input.publish ? 'published' : 'draft',
          definition,
          version: 1,
          publishedVersion: input.publish ? 1 : null,
          publishedDefinition: input.publish ? definition : null,
          createdBy: input.userId,
          updatedBy: input.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      appRow = created;
    }

    await tx.insert(teamRadarAppVersions).values({
      appId: appRow.id,
      version: newVersion,
      definition,
      summary,
      createdBy: input.userId,
      createdAt: now,
    });

    // Poda del historial: se van las versiones más viejas que exceden el
    // límite, pero NUNCA la publicada (tiene que poder volver a leerse).
    const floor = newVersion - RADAR_ENGINE_LIMITS.maxVersionsKept;
    if (floor > 0) {
      const pruneFilters = [
        eq(teamRadarAppVersions.appId, appRow.id),
        lt(teamRadarAppVersions.version, floor + 1),
      ];
      if (appRow.publishedVersion !== null) {
        pruneFilters.push(ne(teamRadarAppVersions.version, appRow.publishedVersion));
      }
      await tx.delete(teamRadarAppVersions).where(and(...pruneFilters));
    }

    return appRow;
  });

  return { applied: true, app: mapApp(row), validation, version: newVersion };
}

/* ------------------------------------------------------------------ */
/* Publicación e historial                                              */
/* ------------------------------------------------------------------ */

/**
 * Sin `version`, publica el borrador actual. Con `version`, congela esa
 * versión del historial como la publicada, SIN crear una versión nueva (el
 * borrador queda como estaba).
 */
export async function publishRadarApp(args: {
  teamId: number;
  userId: number;
  slug: string;
  version?: number;
}): Promise<RadarAppRecord> {
  const existing = await findAppRow(args.teamId, args.slug);
  if (!existing) throw new Error(`No existe una app "${args.slug}" en este equipo.`);

  let version = existing.version;
  let definition = existing.definition;

  if (args.version !== undefined && args.version !== existing.version) {
    const stored = await getRadarAppVersion(args.teamId, args.slug, args.version);
    if (!stored) {
      throw new Error(`La app "${args.slug}" no tiene una versión ${args.version} en el historial.`);
    }
    version = stored.version;
    definition = stored.definition;
  }

  const [row] = await db
    .update(teamRadarApps)
    .set({
      status: 'published',
      publishedVersion: version,
      publishedDefinition: definition,
      updatedBy: args.userId,
      updatedAt: new Date(),
    })
    .where(eq(teamRadarApps.id, existing.id))
    .returning();

  return mapApp(row);
}

/**
 * Vuelve a una versión vieja aplicándola como versión NUEVA (nunca se
 * reescribe historia: el rollback queda registrado como un paso más) y la
 * publica.
 */
export async function rollbackRadarApp(args: {
  teamId: number;
  userId: number;
  slug: string;
  toVersion: number;
}): Promise<RadarAppRecord> {
  const stored = await getRadarAppVersion(args.teamId, args.slug, args.toVersion);
  if (!stored) {
    throw new Error(`La app "${args.slug}" no tiene una versión ${args.toVersion} en el historial.`);
  }

  const result = await applyRadarApp({
    teamId: args.teamId,
    userId: args.userId,
    slug: args.slug,
    definition: stored.definition,
    publish: true,
    summary: `rollback a la versión ${args.toVersion}`,
  });

  if (!result.applied || !result.app) {
    const detail = result.validation.errors[0]?.message ?? 'la definición guardada ya no valida';
    throw new Error(`No se pudo hacer rollback de "${args.slug}" a la versión ${args.toVersion}: ${detail}`);
  }
  return result.app;
}

export async function listRadarAppVersions(
  teamId: number,
  slug: string,
): Promise<Array<{ version: number; summary: string | null; createdBy: number | null; createdAt: string; published: boolean }>> {
  const existing = await findAppRow(teamId, slug);
  if (!existing) return [];

  const rows = await db
    .select({
      version: teamRadarAppVersions.version,
      summary: teamRadarAppVersions.summary,
      createdBy: teamRadarAppVersions.createdBy,
      createdAt: teamRadarAppVersions.createdAt,
    })
    .from(teamRadarAppVersions)
    .where(eq(teamRadarAppVersions.appId, existing.id))
    .orderBy(desc(teamRadarAppVersions.version));

  return rows.map((row) => ({
    version: row.version,
    summary: row.summary,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    published: row.version === existing.publishedVersion,
  }));
}

export async function getRadarAppVersion(
  teamId: number,
  slug: string,
  version: number,
): Promise<{ version: number; definition: RadarAppDefinition } | null> {
  const existing = await findAppRow(teamId, slug);
  if (!existing) return null;

  const [row] = await db
    .select()
    .from(teamRadarAppVersions)
    .where(and(eq(teamRadarAppVersions.appId, existing.id), eq(teamRadarAppVersions.version, version)))
    .limit(1);

  return row ? { version: row.version, definition: toDefinition(row.definition) } : null;
}

/* ------------------------------------------------------------------ */
/* Archivo y duplicación                                                */
/* ------------------------------------------------------------------ */

/**
 * Archiva la app: desaparece de los listados normales pero conserva la fila,
 * el historial y el slug (sigue único por equipo). Un apply posterior la
 * revive como borrador.
 */
export async function archiveRadarApp(args: { teamId: number; userId: number; slug: string }): Promise<boolean> {
  const rows = await db
    .update(teamRadarApps)
    .set({ status: 'archived', updatedBy: args.userId, updatedAt: new Date() })
    .where(and(eq(teamRadarApps.teamId, args.teamId), eq(teamRadarApps.slug, args.slug)))
    .returning({ id: teamRadarApps.id });
  return rows.length > 0;
}

/**
 * Copia el BORRADOR actual a una app nueva (versión 1, sin publicar, sin
 * historial heredado). Es lo que convierte una app en plantilla.
 */
export async function duplicateRadarApp(args: {
  teamId: number;
  userId: number;
  slug: string;
  newSlug: string;
  name?: string;
}): Promise<RadarAppRecord> {
  if (!RADAR_ENGINE_SLUG_REGEX.test(args.newSlug)) {
    throw new Error(`Slug de app inválido: "${args.newSlug}" (minúsculas, números y guion, 2 a 48).`);
  }
  if (args.newSlug === args.slug) {
    throw new Error('El slug nuevo tiene que ser distinto del original.');
  }

  const source = await getRadarApp(args.teamId, args.slug);
  if (!source) throw new Error(`No existe una app "${args.slug}" en este equipo.`);

  const taken = await findAppRow(args.teamId, args.newSlug);
  if (taken) throw new Error(`Ya existe una app con el slug "${args.newSlug}". Elegí otro.`);

  const name = args.name?.trim().slice(0, 160) || source.name;
  // El nombre visible vive en la fila Y en la definición: si divergen, la UI
  // muestra uno y el engine resuelve el otro. Se copian sincronizados.
  const definition: RadarAppDefinition = { ...source.definition, name };

  const result = await applyRadarApp({
    teamId: args.teamId,
    userId: args.userId,
    slug: args.newSlug,
    definition,
    summary: `duplicada de "${args.slug}"`,
  });

  if (!result.applied || !result.app) {
    const detail = result.validation.errors[0]?.message ?? 'la definición original ya no valida';
    throw new Error(`No se pudo duplicar "${args.slug}": ${detail}`);
  }
  return result.app;
}
