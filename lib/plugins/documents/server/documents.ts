import { and, asc, desc, eq, ilike, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamDocumentFolders, teamDocumentLinks, teamDocuments, users } from '@/lib/db/schema';
import {
  documentToText,
  emptyDocument,
  excerpt,
  extractLinkedDocumentIds,
  parseDocumentJson,
  type DocumentJson,
} from '../shared/content';
import { uniqueSlug } from './slug';

export class DocumentError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export type DocumentSummary = {
  id: number;
  folderId: number | null;
  title: string;
  slug: string;
  emoji: string | null;
  excerpt: string;
  version: number;
  position: number;
  updatedAt: string;
};

const summarize = (row: typeof teamDocuments.$inferSelect): DocumentSummary => ({
  id: row.id,
  folderId: row.folderId,
  title: row.title,
  slug: row.slug,
  emoji: row.emoji,
  excerpt: excerpt(row.contentText),
  version: row.version,
  position: row.position,
  updatedAt: row.updatedAt.toISOString(),
});

export async function listDocuments(teamId: number): Promise<DocumentSummary[]> {
  const rows = await db
    .select()
    .from(teamDocuments)
    .where(eq(teamDocuments.teamId, teamId))
    .orderBy(asc(teamDocuments.position), asc(teamDocuments.title), asc(teamDocuments.id));

  return rows.map(summarize);
}

export async function getDocument(teamId: number, id: number) {
  const [row] = await db
    .select({ doc: teamDocuments, author: users.name, folder: teamDocumentFolders })
    .from(teamDocuments)
    .leftJoin(users, eq(teamDocuments.updatedBy, users.id))
    .leftJoin(teamDocumentFolders, eq(teamDocuments.folderId, teamDocumentFolders.id))
    .where(and(eq(teamDocuments.id, id), eq(teamDocuments.teamId, teamId)))
    .limit(1);

  if (!row) return null;

  // Ruta completa de carpetas para las migas de pan.
  const breadcrumbs: Array<{ id: number; name: string; emoji: string | null }> = [];
  let cursor = row.folder;
  while (cursor) {
    breadcrumbs.unshift({ id: cursor.id, name: cursor.name, emoji: cursor.emoji });
    if (!cursor.parentId) break;
    const [parent] = await db
      .select()
      .from(teamDocumentFolders)
      .where(and(eq(teamDocumentFolders.id, cursor.parentId), eq(teamDocumentFolders.teamId, teamId)))
      .limit(1);
    cursor = parent ?? null;
  }

  return {
    id: row.doc.id,
    folderId: row.doc.folderId,
    title: row.doc.title,
    slug: row.doc.slug,
    emoji: row.doc.emoji,
    content: row.doc.content,
    version: row.doc.version,
    updatedAt: row.doc.updatedAt.toISOString(),
    updatedByName: row.author,
    breadcrumbs,
  };
}

export async function createDocument(input: {
  teamId: number;
  userId: number;
  title?: string;
  emoji?: string | null;
  folderId?: number | null;
  content?: unknown;
}): Promise<DocumentSummary> {
  const title = (input.title ?? '').trim() || 'Documento sin título';

  let content: DocumentJson = emptyDocument();
  let contentText = '';
  if (input.content) {
    const parsed = parseDocumentJson(input.content);
    if (!parsed) throw new DocumentError('El contenido del documento no es válido.');
    content = parsed.toJSON() as DocumentJson;
    contentText = documentToText(parsed);
  }

  if (input.folderId) await assertFolder(input.teamId, input.folderId);

  const [lastDocument] = await db
    .select({ position: teamDocuments.position })
    .from(teamDocuments)
    .where(documentFolderWhere(input.teamId, input.folderId ?? null))
    .orderBy(desc(teamDocuments.position))
    .limit(1);
  const position = (lastDocument?.position ?? -1) + 1;

  let row: typeof teamDocuments.$inferSelect | undefined;
  for (let attempt = 0; attempt < 5 && !row; attempt += 1) {
    try {
      [row] = await db
        .insert(teamDocuments)
        .values({
          teamId: input.teamId,
          folderId: input.folderId ?? null,
          title,
          slug: await uniqueSlug(input.teamId, title),
          emoji: input.emoji ?? null,
          content,
          contentText,
          position,
          createdBy: input.userId,
          updatedBy: input.userId,
        })
        .returning();
    } catch (error) {
      // Dos documentos con el mismo título pueden calcular el mismo slug a la
      // vez. El que pierde la carrera vuelve a calcularlo con el nuevo sufijo.
      if (!isUniqueViolation(error) || attempt === 4) throw error;
    }
  }

  if (!row) throw new DocumentError('No se pudo crear el documento.', 409);

  await syncLinks(input.teamId, row.id, content);
  return summarize(row);
}

export async function updateDocument(input: {
  teamId: number;
  userId: number;
  id: number;
  title?: string;
  emoji?: string | null;
  folderId?: number | null;
  content?: unknown;
  version?: number;
}) {
  const [current] = await db
    .select()
    .from(teamDocuments)
    .where(and(eq(teamDocuments.id, input.id), eq(teamDocuments.teamId, input.teamId)))
    .limit(1);

  if (!current) throw new DocumentError('El documento no existe.', 404);

  // Concurrencia optimista: si alguien guardó mientras editábamos, no pisamos su trabajo.
  if (input.version !== undefined && input.version !== current.version) {
    throw new DocumentError(
      'Alguien más guardó este documento mientras lo editabas. Recargá para ver los cambios.',
      409,
    );
  }

  const patch: Record<string, unknown> = {
    updatedAt: new Date(),
    updatedBy: input.userId,
  };

  if (input.title !== undefined) {
    const title = input.title.trim() || 'Documento sin título';
    patch.title = title;
    if (title !== current.title) patch.slug = await uniqueSlug(input.teamId, title, current.id);
  }
  if (input.emoji !== undefined) patch.emoji = input.emoji;
  if (input.folderId !== undefined) {
    if (input.folderId !== null) await assertFolder(input.teamId, input.folderId);
    patch.folderId = input.folderId;
  }

  let content: DocumentJson | null = null;
  if (input.content !== undefined) {
    const parsed = parseDocumentJson(input.content);
    if (!parsed) throw new DocumentError('El contenido del documento no es válido.');
    content = parsed.toJSON() as DocumentJson;
    patch.content = content;
    patch.contentText = documentToText(parsed);
  }

  const updateConditions = [
    eq(teamDocuments.id, input.id),
    eq(teamDocuments.teamId, input.teamId),
  ];
  if (input.version !== undefined) updateConditions.push(eq(teamDocuments.version, input.version));

  const [row] = await db
    .update(teamDocuments)
    .set({
      ...patch,
      // El incremento ocurre en PostgreSQL. Junto con la versión en el WHERE,
      // esto convierte la comprobación optimista en una operación atómica.
      version: sql`${teamDocuments.version} + 1`,
    })
    .where(and(...updateConditions))
    .returning();

  if (!row) {
    throw new DocumentError(
      'Alguien más guardó este documento mientras lo editabas. Recargá para ver los cambios.',
      409,
    );
  }

  if (content) await syncLinks(input.teamId, row.id, content);

  return summarize(row);
}

export async function deleteDocument(teamId: number, id: number): Promise<void> {
  const result = await db
    .delete(teamDocuments)
    .where(and(eq(teamDocuments.id, id), eq(teamDocuments.teamId, teamId)))
    .returning({ id: teamDocuments.id });

  if (!result.length) throw new DocumentError('El documento no existe.', 404);
}

/**
 * Reordena un documento o lo mueve a otra carpeta sin tocar la versión ni la
 * fecha de edición de su contenido. Las posiciones de origen y destino se
 * compactan dentro de la misma transacción.
 */
export async function moveDocument(input: {
  teamId: number;
  id: number;
  folderId: number | null;
  position: number;
}): Promise<{ id: number; folderId: number | null; position: number }> {
  if (!Number.isInteger(input.position) || input.position < 0) {
    throw new DocumentError('La posición del documento no es válida.');
  }

  return db.transaction(async (tx) => {
    // Serializa los reordenamientos del equipo para que dos movimientos
    // simultáneos no dejen posiciones duplicadas o huecos.
    await tx.execute(sql`
      SELECT id
      FROM team_documents
      WHERE team_id = ${input.teamId}
      FOR UPDATE
    `);

    const [document] = await tx
      .select({ id: teamDocuments.id, folderId: teamDocuments.folderId })
      .from(teamDocuments)
      .where(and(eq(teamDocuments.id, input.id), eq(teamDocuments.teamId, input.teamId)))
      .limit(1);

    if (!document) throw new DocumentError('El documento no existe.', 404);

    if (input.folderId !== null) {
      const [folder] = await tx
        .select({ id: teamDocumentFolders.id })
        .from(teamDocumentFolders)
        .where(
          and(
            eq(teamDocumentFolders.id, input.folderId),
            eq(teamDocumentFolders.teamId, input.teamId),
          ),
        )
        .limit(1);

      if (!folder) throw new DocumentError('La carpeta destino no existe.', 404);
    }

    const destinationRows = await tx
      .select({ id: teamDocuments.id })
      .from(teamDocuments)
      .where(documentFolderWhere(input.teamId, input.folderId))
      .orderBy(asc(teamDocuments.position), asc(teamDocuments.title), asc(teamDocuments.id));

    const destinationIds = destinationRows
      .map((row) => row.id)
      .filter((id) => id !== input.id);
    const targetPosition = Math.min(input.position, destinationIds.length);
    destinationIds.splice(targetPosition, 0, input.id);

    if (document.folderId !== input.folderId) {
      const sourceRows = await tx
        .select({ id: teamDocuments.id })
        .from(teamDocuments)
        .where(documentFolderWhere(input.teamId, document.folderId))
        .orderBy(asc(teamDocuments.position), asc(teamDocuments.title), asc(teamDocuments.id));

      const sourceIds = sourceRows.map((row) => row.id).filter((id) => id !== input.id);
      for (const [position, id] of sourceIds.entries()) {
        await tx
          .update(teamDocuments)
          .set({ position })
          .where(and(eq(teamDocuments.id, id), eq(teamDocuments.teamId, input.teamId)));
      }
    }

    for (const [position, id] of destinationIds.entries()) {
      await tx
        .update(teamDocuments)
        .set(id === input.id ? { folderId: input.folderId, position } : { position })
        .where(and(eq(teamDocuments.id, id), eq(teamDocuments.teamId, input.teamId)));
    }

    return { id: input.id, folderId: input.folderId, position: targetPosition };
  });
}

export async function searchDocuments(teamId: number, query: string, limit = 12) {
  const term = query.trim();

  const rows = await db
    .select({
      id: teamDocuments.id,
      title: teamDocuments.title,
      emoji: teamDocuments.emoji,
      contentText: teamDocuments.contentText,
    })
    .from(teamDocuments)
    .where(
      term
        ? and(
            eq(teamDocuments.teamId, teamId),
            or(ilike(teamDocuments.title, `%${term}%`), ilike(teamDocuments.contentText, `%${term}%`)),
          )
        : eq(teamDocuments.teamId, teamId),
    )
    .orderBy(desc(teamDocuments.updatedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    emoji: row.emoji,
    excerpt: excerpt(row.contentText, 90),
  }));
}

/** Documentos que enlazan a este. */
export async function listBacklinks(teamId: number, documentId: number) {
  const rows = await db
    .select({ id: teamDocuments.id, title: teamDocuments.title, emoji: teamDocuments.emoji })
    .from(teamDocumentLinks)
    .innerJoin(teamDocuments, eq(teamDocumentLinks.sourceDocumentId, teamDocuments.id))
    .where(
      and(
        eq(teamDocumentLinks.teamId, teamId),
        eq(teamDocumentLinks.targetDocumentId, documentId),
        ne(teamDocumentLinks.sourceDocumentId, documentId),
      ),
    );

  return rows;
}

async function assertFolder(teamId: number, folderId: number) {
  const [folder] = await db
    .select({ id: teamDocumentFolders.id })
    .from(teamDocumentFolders)
    .where(and(eq(teamDocumentFolders.id, folderId), eq(teamDocumentFolders.teamId, teamId)))
    .limit(1);

  if (!folder) throw new DocumentError('La carpeta no existe.', 404);
}

function documentFolderWhere(teamId: number, folderId: number | null) {
  return and(
    eq(teamDocuments.teamId, teamId),
    folderId === null ? isNull(teamDocuments.folderId) : eq(teamDocuments.folderId, folderId),
  );
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: string }).code === '23505';
}

/**
 * Recalcula los enlaces salientes del documento. Se borran todos y se reescriben:
 * es la única forma de que un enlace borrado del texto desaparezca del backlink.
 */
async function syncLinks(teamId: number, sourceId: number, content: DocumentJson) {
  const parsed = parseDocumentJson(content);
  const targets = parsed ? extractLinkedDocumentIds(parsed) : [];

  await db.delete(teamDocumentLinks).where(eq(teamDocumentLinks.sourceDocumentId, sourceId));
  if (!targets.length) return;

  // Sólo enlazamos documentos del mismo equipo que sigan existiendo.
  const valid = await db
    .select({ id: teamDocuments.id })
    .from(teamDocuments)
    .where(and(eq(teamDocuments.teamId, teamId), sql`${teamDocuments.id} = ANY(${targets})`));

  const rows = valid
    .filter((row) => row.id !== sourceId)
    .map((row) => ({ teamId, sourceDocumentId: sourceId, targetDocumentId: row.id }));

  if (rows.length) await db.insert(teamDocumentLinks).values(rows).onConflictDoNothing();
}
