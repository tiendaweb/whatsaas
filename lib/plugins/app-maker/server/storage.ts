import 'server-only';

import { and, desc, eq, like, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamRadarApps, teamRadarAppVersions } from '@/lib/db/schema';
import { readOnlyResourceMap } from '@/lib/readonly-api/catalog';
import {
  APP_MAKER_RUNTIME,
  APP_MAKER_SLUG_REGEX,
  appStatusSchema,
  applicationDefinitionSchema,
  type ApplicationDefinition,
  type AppMakerRecord,
  type AppStatus,
} from '../shared/contract';

/**
 * Transitional persistence adapter.
 *
 * APP MAKER owns its public contract and service. Until a dedicated migration
 * is approved, it reuses the existing versioned JSON app store behind a strict
 * namespace. No Radar service, schema or renderer is imported.
 */
const STORAGE_PREFIX = 'app-maker--';
const MAX_APPS_PER_TEAM = 30;
const MAX_VERSIONS = 30;

function storageSlug(slug: string) {
  return `${STORAGE_PREFIX}${slug}`;
}

function publicSlug(slug: string) {
  return slug.startsWith(STORAGE_PREFIX) ? slug.slice(STORAGE_PREFIX.length) : slug;
}

function normalizeStatus(value: string): AppStatus {
  const parsed = appStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : 'draft';
}

function parseDefinition(value: unknown): ApplicationDefinition | null {
  const parsed = applicationDefinitionSchema.safeParse(value);
  return parsed.success && parsed.data.runtime === APP_MAKER_RUNTIME ? parsed.data : null;
}

function mapRow(row: typeof teamRadarApps.$inferSelect): AppMakerRecord | null {
  const definition = parseDefinition(row.definition);
  if (!definition || !row.slug.startsWith(STORAGE_PREFIX)) return null;
  const publishedDefinition = row.publishedDefinition ? parseDefinition(row.publishedDefinition) : null;
  return {
    id: row.id,
    slug: publicSlug(row.slug),
    name: row.name,
    status: normalizeStatus(row.status),
    version: row.version,
    publishedVersion: row.publishedVersion,
    definition,
    publishedDefinition,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function audit(teamId: number, userId: number, action: string, entityId: number | string) {
  await db.insert(activityLogs).values({
    teamId,
    userId,
    action,
    ipAddress: String(entityId).slice(0, 45),
  });
}

export async function listAppMakerApps(teamId: number, options?: { includeArchived?: boolean }) {
  const filters = [eq(teamRadarApps.teamId, teamId), like(teamRadarApps.slug, `${STORAGE_PREFIX}%`)];
  if (!options?.includeArchived) filters.push(ne(teamRadarApps.status, 'archived'));

  const rows = await db
    .select()
    .from(teamRadarApps)
    .where(and(...filters))
    .orderBy(desc(teamRadarApps.updatedAt), desc(teamRadarApps.id));

  return rows.map(mapRow).filter((record): record is AppMakerRecord => record !== null);
}

export async function getAppMakerApp(teamId: number, slug: string) {
  if (!APP_MAKER_SLUG_REGEX.test(slug)) return null;
  const [row] = await db
    .select()
    .from(teamRadarApps)
    .where(and(eq(teamRadarApps.teamId, teamId), eq(teamRadarApps.slug, storageSlug(slug))))
    .limit(1);
  return row ? mapRow(row) : null;
}

export type SaveAppMakerInput = {
  teamId: number;
  userId: number;
  definition: unknown;
  expectedVersion?: number;
  status?: Extract<AppStatus, 'draft' | 'preview' | 'published'>;
  summary?: string;
};

/**
 * A data source either reads a live WhatsPro resource (`contacts`, `tasks`, …)
 * or the app's own records (`app:<entidad>`). Generators routinely drop the
 * `app:` prefix, which parses fine and then fails at runtime with
 * "Recurso no disponible". Repair that unambiguous case and reject the rest so
 * the mistake surfaces on save instead of in front of the user.
 */
function bindDataSources(definition: ApplicationDefinition) {
  const entityKeys = new Set(definition.dataModel.entities.map((entity) => entity.key));
  const errors: Array<{ path: string; message: string }> = [];

  const dataSources = definition.dataSources.map((source, index) => {
    if (source.resource.startsWith('app:')) return source;
    if (readOnlyResourceMap.has(source.resource)) return source;
    if (entityKeys.has(source.resource)) return { ...source, resource: `app:${source.resource}` };
    errors.push({
      path: `/dataSources/${index}/resource`,
      message: `Recurso desconocido: ${source.resource}. Usá una clave del catálogo de solo lectura o "app:<entidad>" para los datos propios de la aplicación.`,
    });
    return source;
  });

  return { definition: { ...definition, dataSources }, errors };
}

export async function saveAppMakerApp(input: SaveAppMakerInput) {
  const parsed = applicationDefinitionSchema.safeParse(input.definition);
  if (!parsed.success) {
    return {
      saved: false as const,
      errors: parsed.error.issues.map((issue) => ({ path: `/${issue.path.join('/')}`, message: issue.message })),
      app: null,
    };
  }

  const bound = bindDataSources(parsed.data);
  if (bound.errors.length) return { saved: false as const, errors: bound.errors, app: null };

  const definition = bound.definition;
  const current = await getAppMakerApp(input.teamId, definition.slug);
  if (input.expectedVersion !== undefined && current?.version !== input.expectedVersion) {
    throw new Error(`version_conflict:${current?.version ?? 0}`);
  }

  if (!current) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(teamRadarApps)
      .where(and(eq(teamRadarApps.teamId, input.teamId), like(teamRadarApps.slug, `${STORAGE_PREFIX}%`)));
    if (count >= MAX_APPS_PER_TEAM) throw new Error('app_limit_reached');
  }

  const nextVersion = current ? current.version + 1 : 1;
  const shouldPublish = input.status === 'published';
  // A saved draft never takes the frozen published definition out of
  // production. `preview` is a lifecycle state only before first publish.
  const requestedStatus: Extract<AppStatus, 'draft' | 'preview' | 'published'> = shouldPublish
    ? 'published'
    : current?.publishedDefinition
      ? 'published'
      : input.status ?? (current?.status === 'preview' ? 'preview' : 'draft');
  const now = new Date();

  const row = await db.transaction(async (tx) => {
    const publishPatch = shouldPublish
      ? { publishedVersion: nextVersion, publishedDefinition: definition }
      : {};

    let saved: typeof teamRadarApps.$inferSelect;
    if (current) {
      [saved] = await tx
        .update(teamRadarApps)
        .set({
          name: definition.name,
          icon: definition.icon,
          tone: definition.theme.accent,
          status: requestedStatus,
          definition,
          version: nextVersion,
          ...publishPatch,
          updatedBy: input.userId,
          updatedAt: now,
        })
        .where(and(eq(teamRadarApps.id, current.id), eq(teamRadarApps.teamId, input.teamId)))
        .returning();
    } else {
      [saved] = await tx
        .insert(teamRadarApps)
        .values({
          teamId: input.teamId,
          slug: storageSlug(definition.slug),
          name: definition.name,
          icon: definition.icon,
          tone: definition.theme.accent,
          status: requestedStatus,
          definition,
          version: 1,
          publishedVersion: requestedStatus === 'published' ? 1 : null,
          publishedDefinition: requestedStatus === 'published' ? definition : null,
          createdBy: input.userId,
          updatedBy: input.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
    }

    await tx.insert(teamRadarAppVersions).values({
      appId: saved.id,
      version: nextVersion,
      definition,
      summary: input.summary?.trim().slice(0, 300) || null,
      createdBy: input.userId,
      createdAt: now,
    });

    const versions = await tx
      .select({ id: teamRadarAppVersions.id, version: teamRadarAppVersions.version })
      .from(teamRadarAppVersions)
      .where(eq(teamRadarAppVersions.appId, saved.id))
      .orderBy(desc(teamRadarAppVersions.version));
    const removable = versions
      .filter((version) => version.version !== saved.publishedVersion)
      .slice(MAX_VERSIONS)
      .map((version) => version.id);
    for (const id of removable) await tx.delete(teamRadarAppVersions).where(eq(teamRadarAppVersions.id, id));

    return saved;
  });

  await audit(input.teamId, input.userId, `app_maker.${requestedStatus === 'published' ? 'published' : 'saved'}`, row.id);
  return { saved: true as const, errors: [], app: mapRow(row) };
}

export async function setAppMakerStatus(input: {
  teamId: number;
  userId: number;
  slug: string;
  status: AppStatus;
}) {
  const current = await getAppMakerApp(input.teamId, input.slug);
  if (!current) return null;
  if (input.status === 'published') {
    return (await saveAppMakerApp({
      teamId: input.teamId,
      userId: input.userId,
      definition: current.definition,
      expectedVersion: current.version,
      status: 'published',
      summary: 'Publicación desde APP MAKER',
    })).app;
  }

  const [row] = await db
    .update(teamRadarApps)
    .set({ status: input.status, updatedBy: input.userId, updatedAt: new Date() })
    .where(and(eq(teamRadarApps.id, current.id), eq(teamRadarApps.teamId, input.teamId)))
    .returning();
  await audit(input.teamId, input.userId, `app_maker.${input.status}`, current.id);
  return mapRow(row);
}

export async function listAppMakerVersions(teamId: number, slug: string) {
  const app = await getAppMakerApp(teamId, slug);
  if (!app) return [];
  return db
    .select({ version: teamRadarAppVersions.version, summary: teamRadarAppVersions.summary, createdAt: teamRadarAppVersions.createdAt })
    .from(teamRadarAppVersions)
    .where(eq(teamRadarAppVersions.appId, app.id))
    .orderBy(desc(teamRadarAppVersions.version));
}
