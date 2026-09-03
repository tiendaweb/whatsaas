import 'server-only';

import { and, desc, eq, lt, ne } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { teamMiniAppThemes, teamMiniAppThemeVersions, type TeamMiniAppTheme } from '@/lib/db/schema';
import {
  BW_THEME_LIMITS,
  bwDefaultThemeDefinition,
  bwThemeDefinitionSchema,
  type BwThemeDefinition,
  type BwThemeMode,
  type BwThemeRecord,
  type BwThemeStatus,
  type BwValidationResult,
} from '../shared/schema';
import { validateBwThemeDefinition } from './validate';

/* ------------------------------------------------------------------ */
/* Normalización                                                        */
/* ------------------------------------------------------------------ */

function toMode(value: string): BwThemeMode {
  return value === 'custom' ? 'custom' : 'default';
}

function toStatus(value: string): BwThemeStatus {
  return value === 'published' || value === 'archived' ? value : 'draft';
}

/** Lectura tolerante: una definición vieja que ya no valida contra el
 * contrato actual se devuelve tal cual (cast) en vez de tirar — perder la
 * posibilidad de abrirla para arreglarla sería peor que mostrarla rara. */
function toDefinition(value: unknown): BwThemeDefinition {
  const parsed = bwThemeDefinitionSchema.safeParse(value);
  return parsed.success ? parsed.data : (value as BwThemeDefinition);
}

function mapRow(row: TeamMiniAppTheme): BwThemeRecord {
  return {
    id: row.id,
    appSlug: row.appSlug,
    mode: toMode(row.mode),
    status: toStatus(row.status),
    definition: toDefinition(row.definition),
    version: row.version,
    publishedVersion: row.publishedVersion,
    publishedDefinition: row.publishedDefinition === null ? null : toDefinition(row.publishedDefinition),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function zodIssuesToValidation(issues: Array<{ path: PropertyKey[]; message: string }>): BwValidationResult {
  return {
    ok: false,
    errors: issues.map((issue) => ({ severity: 'error' as const, path: `/${issue.path.map(String).join('/')}`, message: issue.message })),
    warnings: [],
  };
}

async function findRow(teamId: number, appSlug: string): Promise<TeamMiniAppTheme | null> {
  const [row] = await db
    .select()
    .from(teamMiniAppThemes)
    .where(and(eq(teamMiniAppThemes.teamId, teamId), eq(teamMiniAppThemes.appSlug, appSlug)))
    .limit(1);
  return row ?? null;
}

/* ------------------------------------------------------------------ */
/* Lectura                                                              */
/* ------------------------------------------------------------------ */

export async function getBwTheme(teamId: number, appSlug: string): Promise<BwThemeRecord | null> {
  const row = await findRow(teamId, appSlug);
  return row ? mapRow(row) : null;
}

/**
 * Lo que consume la UI final (viewer, no conector): en modo "default" no
 * expone ninguna definición (la clásica hardcodeada no lee esto). En modo
 * "custom" prioriza la versión PUBLICADA; si nunca se publicó nada usa el
 * borrador; si ni siquiera existe fila todavía (se acaba de activar el modo
 * pero nadie aplicó nada aún) devuelve la definición por defecto — que
 * reproduce el menú clásico 1:1, así "custom" sin ediciones se ve idéntico.
 */
export async function getResolvedBwTheme(teamId: number, appSlug: string): Promise<{ mode: BwThemeMode; definition: BwThemeDefinition | null }> {
  const row = await findRow(teamId, appSlug);
  if (!row || row.mode !== 'custom') return { mode: row ? toMode(row.mode) : 'default', definition: null };
  const record = mapRow(row);
  const definition = record.publishedDefinition ?? record.definition ?? bwDefaultThemeDefinition();
  return { mode: 'custom', definition };
}

export async function listBwThemeVersions(teamId: number, appSlug: string) {
  const existing = await findRow(teamId, appSlug);
  if (!existing) return [];
  const rows = await db
    .select({
      version: teamMiniAppThemeVersions.version,
      summary: teamMiniAppThemeVersions.summary,
      createdBy: teamMiniAppThemeVersions.createdBy,
      createdAt: teamMiniAppThemeVersions.createdAt,
    })
    .from(teamMiniAppThemeVersions)
    .where(eq(teamMiniAppThemeVersions.themeId, existing.id))
    .orderBy(desc(teamMiniAppThemeVersions.version));
  return rows.map((row) => ({
    version: row.version,
    summary: row.summary,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    published: row.version === existing.publishedVersion,
  }));
}

export async function getBwThemeVersion(teamId: number, appSlug: string, version: number) {
  const existing = await findRow(teamId, appSlug);
  if (!existing) return null;
  const [row] = await db
    .select()
    .from(teamMiniAppThemeVersions)
    .where(and(eq(teamMiniAppThemeVersions.themeId, existing.id), eq(teamMiniAppThemeVersions.version, version)))
    .limit(1);
  return row ? { version: row.version, definition: toDefinition(row.definition) } : null;
}

/* ------------------------------------------------------------------ */
/* Modo: interruptor "clásico" vs "custom"                             */
/* ------------------------------------------------------------------ */

/**
 * Cambia el modo. Si activa "custom" y todavía no hay fila (o no hay
 * borrador), siembra la definición por defecto (menú clásico 1:1) para que
 * siempre haya algo válido que un conector pueda leer y editar a partir de
 * ahí — nunca un documento vacío.
 */
export async function setBwThemeMode(args: { teamId: number; userId: number; appSlug: string; mode: BwThemeMode }): Promise<BwThemeRecord> {
  const existing = await findRow(args.teamId, args.appSlug);
  const now = new Date();

  if (!existing) {
    const definition = bwDefaultThemeDefinition();
    const [row] = await db
      .insert(teamMiniAppThemes)
      .values({
        teamId: args.teamId,
        appSlug: args.appSlug,
        mode: args.mode,
        status: 'draft',
        definition,
        version: 1,
        createdBy: args.userId,
        updatedBy: args.userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await db.insert(teamMiniAppThemeVersions).values({
      themeId: row.id,
      version: 1,
      definition,
      summary: 'definición inicial (igual al tema clásico)',
      createdBy: args.userId,
      createdAt: now,
    });
    return mapRow(row);
  }

  const [row] = await db
    .update(teamMiniAppThemes)
    .set({ mode: args.mode, updatedBy: args.userId, updatedAt: now })
    .where(eq(teamMiniAppThemes.id, existing.id))
    .returning();
  return mapRow(row);
}

/* ------------------------------------------------------------------ */
/* Apply: la única puerta de escritura de definiciones                  */
/* ------------------------------------------------------------------ */

export type ApplyBwThemeInput = {
  teamId: number;
  userId: number;
  appSlug: string;
  /** La definición completa, cruda: se valida acá adentro. */
  definition: unknown;
  /** Optimistic locking: si viene y no coincide con la actual, se tira. */
  expectedVersion?: number;
  /** Valida y devuelve el resultado sin escribir nada. */
  dryRun?: boolean;
  /** Además de guardar el borrador, publica esta versión. */
  publish?: boolean;
  /** Etiqueta humana de la versión ("agregué vista de resumen ejecutivo"). */
  summary?: string;
};

export async function applyBwTheme(input: ApplyBwThemeInput): Promise<{
  applied: boolean;
  theme: BwThemeRecord | null;
  validation: BwValidationResult;
  version: number | null;
}> {
  const existing = await findRow(input.teamId, input.appSlug);
  const current = existing ? mapRow(existing) : null;

  if (input.expectedVersion !== undefined) {
    if (!existing) {
      throw new Error(`Todavía no hay tema para "${input.appSlug}": no se puede exigir expectedVersion=${input.expectedVersion}.`);
    }
    if (existing.version !== input.expectedVersion) {
      throw new Error(
        `Conflicto de versión en el tema de "${input.appSlug}": esperabas la ${input.expectedVersion} pero la actual es la ${existing.version}. Releé el tema y reintentá.`,
      );
    }
  }

  const parsed = bwThemeDefinitionSchema.safeParse(input.definition);
  if (!parsed.success) {
    return { applied: false, theme: current, validation: zodIssuesToValidation(parsed.error.issues), version: null };
  }
  const definition = parsed.data;

  const validation = validateBwThemeDefinition(definition);
  if (!validation.ok) return { applied: false, theme: current, validation, version: null };

  if (input.dryRun) return { applied: false, theme: current, validation, version: null };

  const now = new Date();
  const newVersion = existing ? existing.version + 1 : 1;
  const summary = input.summary?.trim().slice(0, 300) || null;
  const mode = existing?.mode ?? 'custom';

  const row = await db.transaction(async (tx) => {
    let themeRow: TeamMiniAppTheme;
    if (existing) {
      const [updated] = await tx
        .update(teamMiniAppThemes)
        .set({
          definition,
          version: newVersion,
          mode: 'custom',
          ...(input.publish
            ? { status: 'published' as const, publishedVersion: newVersion, publishedDefinition: definition }
            : existing.status === 'archived'
              ? { status: 'draft' as const }
              : {}),
          updatedBy: input.userId,
          updatedAt: now,
        })
        .where(eq(teamMiniAppThemes.id, existing.id))
        .returning();
      themeRow = updated;
    } else {
      const [created] = await tx
        .insert(teamMiniAppThemes)
        .values({
          teamId: input.teamId,
          appSlug: input.appSlug,
          mode,
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
      themeRow = created;
    }

    await tx.insert(teamMiniAppThemeVersions).values({
      themeId: themeRow.id,
      version: newVersion,
      definition,
      summary,
      createdBy: input.userId,
      createdAt: now,
    });

    const floor = newVersion - BW_THEME_LIMITS.maxVersionsKept;
    if (floor > 0) {
      const pruneFilters = [eq(teamMiniAppThemeVersions.themeId, themeRow.id), lt(teamMiniAppThemeVersions.version, floor + 1)];
      if (themeRow.publishedVersion !== null) pruneFilters.push(ne(teamMiniAppThemeVersions.version, themeRow.publishedVersion));
      await tx.delete(teamMiniAppThemeVersions).where(and(...pruneFilters));
    }

    return themeRow;
  });

  return { applied: true, theme: mapRow(row), validation, version: newVersion };
}

/* ------------------------------------------------------------------ */
/* Publicación y rollback                                               */
/* ------------------------------------------------------------------ */

export async function publishBwTheme(args: { teamId: number; userId: number; appSlug: string; version?: number }): Promise<BwThemeRecord> {
  const existing = await findRow(args.teamId, args.appSlug);
  if (!existing) throw new Error(`No hay tema para "${args.appSlug}" todavía.`);

  let version = existing.version;
  let definition = existing.definition;
  if (args.version !== undefined && args.version !== existing.version) {
    const stored = await getBwThemeVersion(args.teamId, args.appSlug, args.version);
    if (!stored) throw new Error(`El tema de "${args.appSlug}" no tiene una versión ${args.version} en el historial.`);
    version = stored.version;
    definition = stored.definition;
  }

  const [row] = await db
    .update(teamMiniAppThemes)
    .set({ status: 'published', publishedVersion: version, publishedDefinition: definition, updatedBy: args.userId, updatedAt: new Date() })
    .where(eq(teamMiniAppThemes.id, existing.id))
    .returning();
  return mapRow(row);
}

/** Igual criterio que Radar: el rollback aplica la definición vieja como
 * versión NUEVA — nunca se reescribe historia. */
export async function rollbackBwTheme(args: { teamId: number; userId: number; appSlug: string; toVersion: number }): Promise<BwThemeRecord> {
  const stored = await getBwThemeVersion(args.teamId, args.appSlug, args.toVersion);
  if (!stored) throw new Error(`El tema de "${args.appSlug}" no tiene una versión ${args.toVersion} en el historial.`);

  const result = await applyBwTheme({
    teamId: args.teamId,
    userId: args.userId,
    appSlug: args.appSlug,
    definition: stored.definition,
    publish: true,
    summary: `rollback a la versión ${args.toVersion}`,
  });
  if (!result.applied || !result.theme) {
    const detail = result.validation.errors[0]?.message ?? 'la definición guardada ya no valida';
    throw new Error(`No se pudo hacer rollback del tema de "${args.appSlug}" a la versión ${args.toVersion}: ${detail}`);
  }
  return result.theme;
}
