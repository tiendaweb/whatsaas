import 'server-only';

import { and, count, desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { contacts, teamDocuments, teamRadarReports } from '@/lib/db/schema';

/**
 * Vínculo explícito entre un informe (documento de la app Documentos) y aquello
 * que describe: un contacto, un usuario del equipo, o nada (informe general).
 * Sin esta tabla, responder "¿este cliente tiene informes?" obligaba a recorrer
 * carpetas por nombre, que se rompe apenas alguien renombra una carpeta.
 */
export const RADAR_REPORT_LINK_CATEGORIES = [
  'clientes',
  'equipo',
  'generales',
  'mejoras',
  'trabajos',
] as const;
export type RadarReportLinkCategory = (typeof RADAR_REPORT_LINK_CATEGORIES)[number];

export function isRadarReportLinkCategory(value: unknown): value is RadarReportLinkCategory {
  return typeof value === 'string' && (RADAR_REPORT_LINK_CATEGORIES as readonly string[]).includes(value);
}

export type LinkedRadarReport = {
  id: number;
  documentId: number;
  category: RadarReportLinkCategory;
  contactId: number | null;
  assignedUserId: number | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  document: {
    id: number;
    title: string;
    emoji: string | null;
    format: 'markdown' | 'html';
    updatedAt: string;
  };
};

/* ------------------------------------------------------------------ */
/* Escritura                                                            */
/* ------------------------------------------------------------------ */

/** El documento tiene que ser del equipo: si no, se estaría linkeando ajeno. */
async function assertDocumentBelongsToTeam(teamId: number, documentId: number) {
  const [row] = await db
    .select({ id: teamDocuments.id })
    .from(teamDocuments)
    .where(and(eq(teamDocuments.id, documentId), eq(teamDocuments.teamId, teamId)))
    .limit(1);
  if (!row) throw new Error(`El documento #${documentId} no pertenece a este equipo`);
}

async function assertContactBelongsToTeam(teamId: number, contactId: number) {
  const [row] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.teamId, teamId)))
    .limit(1);
  if (!row) throw new Error(`El contacto #${contactId} no pertenece a este equipo`);
}

/**
 * Idempotente por `documentId` (constraint única): re-vincular el mismo
 * documento actualiza la categoría/contacto en vez de duplicar la fila.
 */
export async function linkRadarReport(args: {
  teamId: number;
  userId: number;
  documentId: number;
  category: RadarReportLinkCategory;
  contactId?: number | null;
  assignedUserId?: number | null;
  summary?: string | null;
}) {
  await assertDocumentBelongsToTeam(args.teamId, args.documentId);
  if (typeof args.contactId === 'number') {
    await assertContactBelongsToTeam(args.teamId, args.contactId);
  }

  const now = new Date();
  const [row] = await db
    .insert(teamRadarReports)
    .values({
      teamId: args.teamId,
      documentId: args.documentId,
      category: args.category,
      contactId: args.contactId ?? null,
      assignedUserId: args.assignedUserId ?? null,
      summary: args.summary?.trim() || null,
      createdBy: args.userId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: teamRadarReports.documentId,
      set: {
        teamId: args.teamId,
        category: args.category,
        contactId: args.contactId ?? null,
        assignedUserId: args.assignedUserId ?? null,
        summary: args.summary?.trim() || null,
        updatedAt: now,
      },
    })
    .returning();

  return row;
}

export async function unlinkRadarReport(args: { teamId: number; documentId: number }): Promise<boolean> {
  const deleted = await db
    .delete(teamRadarReports)
    .where(
      and(eq(teamRadarReports.teamId, args.teamId), eq(teamRadarReports.documentId, args.documentId)),
    )
    .returning({ id: teamRadarReports.id });
  return deleted.length > 0;
}

/* ------------------------------------------------------------------ */
/* Lectura                                                              */
/* ------------------------------------------------------------------ */

/**
 * Un solo JOIN contra teamDocuments: traer todos los documentos del equipo a
 * memoria para cruzarlos acá escala mal apenas la app Documentos crece.
 */
export async function listLinkedRadarReports(args: {
  teamId: number;
  category?: RadarReportLinkCategory;
  contactId?: number;
  assignedUserId?: number;
}): Promise<LinkedRadarReport[]> {
  const filters = [eq(teamRadarReports.teamId, args.teamId)];
  if (args.category) filters.push(eq(teamRadarReports.category, args.category));
  if (typeof args.contactId === 'number') filters.push(eq(teamRadarReports.contactId, args.contactId));
  if (typeof args.assignedUserId === 'number') {
    filters.push(eq(teamRadarReports.assignedUserId, args.assignedUserId));
  }

  const rows = await db
    .select({
      id: teamRadarReports.id,
      documentId: teamRadarReports.documentId,
      category: teamRadarReports.category,
      contactId: teamRadarReports.contactId,
      assignedUserId: teamRadarReports.assignedUserId,
      summary: teamRadarReports.summary,
      createdAt: teamRadarReports.createdAt,
      updatedAt: teamRadarReports.updatedAt,
      docId: teamDocuments.id,
      docTitle: teamDocuments.title,
      docEmoji: teamDocuments.emoji,
      docFormat: teamDocuments.format,
      docUpdatedAt: teamDocuments.updatedAt,
    })
    .from(teamRadarReports)
    .innerJoin(teamDocuments, eq(teamRadarReports.documentId, teamDocuments.id))
    .where(and(...filters))
    .orderBy(desc(teamDocuments.updatedAt), desc(teamRadarReports.id));

  return rows.map((row) => ({
    id: row.id,
    documentId: row.documentId,
    category: isRadarReportLinkCategory(row.category) ? row.category : 'generales',
    contactId: row.contactId,
    assignedUserId: row.assignedUserId,
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    document: {
      id: row.docId,
      title: row.docTitle,
      emoji: row.docEmoji,
      format: row.docFormat === 'html' ? 'html' : 'markdown',
      updatedAt: row.docUpdatedAt.toISOString(),
    },
  }));
}

/**
 * Cuántos informes vinculados tiene cada contacto del equipo.
 *
 * OJO: se agrupa por la COLUMNA `teamRadarReports.contactId`, nunca por una
 * expresión que lleve un parámetro. En este repo ya hubo un bug con drizzle
 * donde el GROUP BY sobre una expresión parametrizada compilaba, pasaba el
 * build y explotaba recién en runtime.
 */
export async function countReportsByContact(teamId: number): Promise<Map<number, number>> {
  const rows = await db
    .select({ contactId: teamRadarReports.contactId, total: count() })
    .from(teamRadarReports)
    .where(eq(teamRadarReports.teamId, teamId))
    .groupBy(teamRadarReports.contactId);

  const out = new Map<number, number>();
  for (const row of rows) {
    if (row.contactId === null) continue; // informes generales, sin contacto
    out.set(row.contactId, Number(row.total));
  }
  return out;
}

export async function contactsWithReports(teamId: number): Promise<Set<number>> {
  const counts = await countReportsByContact(teamId);
  return new Set(counts.keys());
}
