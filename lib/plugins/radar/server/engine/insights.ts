import 'server-only';

import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { contacts, teamRadarInsights, type TeamRadarInsight } from '@/lib/db/schema';
import {
  RADAR_INSIGHT_SEVERITIES,
  RADAR_INSIGHT_STATUSES,
  radarInsightInputSchema,
  type RadarInsight,
  type RadarInsightInput,
  type RadarInsightSeverity,
  type RadarInsightStatus,
} from '@/lib/plugins/radar/shared/engine';

/* ------------------------------------------------------------------ */
/* Normalización                                                        */
/* ------------------------------------------------------------------ */

// severity/status/evidence son jsonb y varchar libres (los escribe una IA por
// MCP): si una fila trae basura, el insight se sigue leyendo con defaults en
// vez de romper el listado entero.
function toSeverity(value: string | null): RadarInsightSeverity {
  return (RADAR_INSIGHT_SEVERITIES as readonly string[]).includes(value ?? '')
    ? (value as RadarInsightSeverity)
    : 'info';
}

function toStatus(value: string | null): RadarInsightStatus {
  return (RADAR_INSIGHT_STATUSES as readonly string[]).includes(value ?? '')
    ? (value as RadarInsightStatus)
    : 'new';
}

function toEvidence(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === 'string');
  return items.length ? items : undefined;
}

function mapInsight(row: TeamRadarInsight): RadarInsight {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    severity: toSeverity(row.severity),
    confidence: row.confidence ?? undefined,
    contactId: row.contactId ?? undefined,
    appSlug: row.appSlug ?? undefined,
    source: row.source ?? undefined,
    evidence: toEvidence(row.evidence),
    recommendedAction: row.recommendedAction ?? undefined,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : undefined,
    status: toStatus(row.status),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Igual que en widgets.ts: un insight acotado a un contacto de OTRO equipo sería una fuga de datos. */
async function assertContactBelongsToTeam(teamId: number, contactId: number) {
  const [row] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.teamId, teamId)))
    .limit(1);
  if (!row) throw new Error(`El contacto #${contactId} no pertenece a este equipo`);
}

/* ------------------------------------------------------------------ */
/* Escritura                                                            */
/* ------------------------------------------------------------------ */

export async function createRadarInsight(args: {
  teamId: number;
  userId: number;
  input: RadarInsightInput;
}): Promise<RadarInsight> {
  const input = radarInsightInputSchema.parse(args.input);

  if (typeof input.contactId === 'number') {
    await assertContactBelongsToTeam(args.teamId, input.contactId);
  }

  const now = new Date();
  const [row] = await db
    .insert(teamRadarInsights)
    .values({
      teamId: args.teamId,
      appSlug: input.appSlug ?? null,
      contactId: input.contactId ?? null,
      title: input.title,
      description: input.description ?? null,
      severity: input.severity ?? 'info',
      confidence: input.confidence ?? null,
      source: input.source ?? null,
      evidence: input.evidence ?? null,
      recommendedAction: input.recommendedAction ?? null,
      status: 'new',
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      createdBy: args.userId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return mapInsight(row);
}

/* ------------------------------------------------------------------ */
/* Lectura                                                              */
/* ------------------------------------------------------------------ */

/**
 * Lista los insights del equipo, los más graves primero (critical > warning >
 * opportunity > info) y dentro de cada gravedad los más nuevos. Antes de leer,
 * los que ya vencieron y nadie llegó a atender (new/seen) pasan a 'expired' —
 * y esa transición se PERSISTE, así el que lista después por status ve lo mismo.
 */
export async function listRadarInsights(
  teamId: number,
  filters?: {
    status?: string;
    severity?: string;
    contactId?: number;
    appSlug?: string;
    limit?: number;
  },
): Promise<RadarInsight[]> {
  await db
    .update(teamRadarInsights)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(
      and(
        eq(teamRadarInsights.teamId, teamId),
        inArray(teamRadarInsights.status, ['new', 'seen']),
        lt(teamRadarInsights.expiresAt, new Date()),
      ),
    );

  const where = [eq(teamRadarInsights.teamId, teamId)];
  if (filters?.status && (RADAR_INSIGHT_STATUSES as readonly string[]).includes(filters.status)) {
    where.push(eq(teamRadarInsights.status, filters.status));
  }
  if (filters?.severity && (RADAR_INSIGHT_SEVERITIES as readonly string[]).includes(filters.severity)) {
    where.push(eq(teamRadarInsights.severity, filters.severity));
  }
  if (typeof filters?.contactId === 'number') {
    where.push(eq(teamRadarInsights.contactId, filters.contactId));
  }
  if (filters?.appSlug) {
    where.push(eq(teamRadarInsights.appSlug, filters.appSlug));
  }

  const limit = Math.min(Math.max(filters?.limit ?? 50, 1), 200);

  const rows = await db
    .select()
    .from(teamRadarInsights)
    .where(and(...where))
    .orderBy(
      // La gravedad manda sobre la fecha: un critical de ayer importa más que
      // un info de hace un minuto. Cualquier severidad basura cae al final.
      sql`case ${teamRadarInsights.severity} when 'critical' then 0 when 'warning' then 1 when 'opportunity' then 2 when 'info' then 3 else 4 end`,
      desc(teamRadarInsights.createdAt),
      desc(teamRadarInsights.id),
    )
    .limit(limit);

  return rows.map(mapInsight);
}

/* ------------------------------------------------------------------ */
/* Ciclo de vida                                                        */
/* ------------------------------------------------------------------ */

export async function updateRadarInsightStatus(args: {
  teamId: number;
  userId: number;
  id: number;
  status: RadarInsightStatus;
}): Promise<RadarInsight | null> {
  if (!(RADAR_INSIGHT_STATUSES as readonly string[]).includes(args.status)) {
    throw new Error(`Status de insight inválido: "${args.status}" (los válidos: ${RADAR_INSIGHT_STATUSES.join(', ')}).`);
  }

  const [row] = await db
    .update(teamRadarInsights)
    .set({ status: args.status, updatedAt: new Date() })
    .where(and(eq(teamRadarInsights.teamId, args.teamId), eq(teamRadarInsights.id, args.id)))
    .returning();

  return row ? mapInsight(row) : null;
}
