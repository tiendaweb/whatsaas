import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamDocumentFolders } from '@/lib/db/schema';

export const MAX_DEPTH = 5;

export type FolderRow = {
  id: number;
  parentId: number | null;
  name: string;
  emoji: string | null;
  depth: number;
  position: number;
};

export class FolderError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export async function listFolders(teamId: number): Promise<FolderRow[]> {
  const rows = await db
    .select({
      id: teamDocumentFolders.id,
      parentId: teamDocumentFolders.parentId,
      name: teamDocumentFolders.name,
      emoji: teamDocumentFolders.emoji,
      depth: teamDocumentFolders.depth,
      position: teamDocumentFolders.position,
    })
    .from(teamDocumentFolders)
    .where(eq(teamDocumentFolders.teamId, teamId))
    .orderBy(asc(teamDocumentFolders.position), asc(teamDocumentFolders.name));

  return rows as FolderRow[];
}

async function getFolder(teamId: number, id: number) {
  const [row] = await db
    .select()
    .from(teamDocumentFolders)
    .where(and(eq(teamDocumentFolders.id, id), eq(teamDocumentFolders.teamId, teamId)))
    .limit(1);
  return row ?? null;
}

/** Altura del subárbol (1 = la carpeta sola) y los ids que lo componen. */
async function subtree(teamId: number, rootId: number): Promise<{ ids: number[]; height: number }> {
  const result = await db.execute(sql`
    WITH RECURSIVE tree AS (
      SELECT id, 1 AS level
      FROM team_document_folders
      WHERE id = ${rootId} AND team_id = ${teamId}
      UNION ALL
      SELECT child.id, tree.level + 1
      FROM team_document_folders child
      JOIN tree ON child.parent_id = tree.id
      WHERE child.team_id = ${teamId}
    )
    SELECT id, level FROM tree
  `);

  // El driver (postgres.js) devuelve la lista de filas directamente, sin `.rows`.
  const rows = result as unknown as Array<{ id: number; level: number }>;
  return {
    ids: rows.map((row) => Number(row.id)),
    height: rows.reduce((max, row) => Math.max(max, Number(row.level)), 0),
  };
}

export async function createFolder(input: {
  teamId: number;
  userId: number;
  name: string;
  emoji?: string | null;
  parentId?: number | null;
}): Promise<FolderRow> {
  const name = input.name.trim();
  if (!name) throw new FolderError('La carpeta necesita un nombre.');

  let depth = 1;
  if (input.parentId) {
    const parent = await getFolder(input.teamId, input.parentId);
    if (!parent) throw new FolderError('La carpeta padre no existe.', 404);
    depth = parent.depth + 1;
    if (depth > MAX_DEPTH) {
      throw new FolderError(`No se pueden anidar más de ${MAX_DEPTH} niveles de carpetas.`);
    }
  }

  const [row] = await db
    .insert(teamDocumentFolders)
    .values({
      teamId: input.teamId,
      parentId: input.parentId ?? null,
      name,
      emoji: input.emoji ?? null,
      depth,
      createdBy: input.userId,
    })
    .returning();

  return row as FolderRow;
}

export async function updateFolder(input: {
  teamId: number;
  id: number;
  name?: string;
  emoji?: string | null;
}): Promise<FolderRow> {
  const folder = await getFolder(input.teamId, input.id);
  if (!folder) throw new FolderError('La carpeta no existe.', 404);

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new FolderError('La carpeta necesita un nombre.');
    patch.name = name;
  }
  if (input.emoji !== undefined) patch.emoji = input.emoji;

  const [row] = await db
    .update(teamDocumentFolders)
    .set(patch)
    .where(and(eq(teamDocumentFolders.id, input.id), eq(teamDocumentFolders.teamId, input.teamId)))
    .returning();

  return row as FolderRow;
}

/**
 * Mueve una carpeta (con todo su subárbol) bajo otro padre, o a la raíz.
 *
 * Tres cosas que hay que chequear ANTES de tocar nada:
 *  1. que el destino no sea la propia carpeta ni uno de sus descendientes (ciclo),
 *  2. que el subárbol entero siga entrando en 5 niveles,
 *  3. que el UPDATE de `parent_id` y `depth` sea uno solo — si se hacen por separado,
 *     el CHECK se dispara a mitad de camino (una carpeta sin padre con depth > 1).
 */
export async function moveFolder(input: {
  teamId: number;
  id: number;
  parentId: number | null;
}): Promise<FolderRow> {
  const folder = await getFolder(input.teamId, input.id);
  if (!folder) throw new FolderError('La carpeta no existe.', 404);

  const { ids, height } = await subtree(input.teamId, input.id);

  let newDepth = 1;
  if (input.parentId !== null) {
    if (input.parentId === input.id) throw new FolderError('Una carpeta no puede contenerse a sí misma.');
    if (ids.includes(input.parentId)) {
      throw new FolderError('No se puede mover una carpeta dentro de una de sus subcarpetas.');
    }

    const parent = await getFolder(input.teamId, input.parentId);
    if (!parent) throw new FolderError('La carpeta destino no existe.', 404);
    newDepth = parent.depth + 1;
  }

  if (newDepth + height - 1 > MAX_DEPTH) {
    throw new FolderError(
      `El movimiento dejaría carpetas a más de ${MAX_DEPTH} niveles de profundidad.`,
    );
  }

  const delta = newDepth - folder.depth;

  // Un único statement: la carpeta cambia de padre y todo su subárbol corre su depth.
  await db.execute(sql`
    UPDATE team_document_folders
    SET parent_id = CASE WHEN id = ${input.id} THEN ${input.parentId}::integer ELSE parent_id END,
        depth = depth + ${delta},
        updated_at = now()
    WHERE team_id = ${input.teamId}
      AND id = ANY(${sql.raw(`ARRAY[${ids.join(',')}]::integer[]`)})
  `);

  const moved = await getFolder(input.teamId, input.id);
  return moved as FolderRow;
}

export async function deleteFolder(teamId: number, id: number): Promise<void> {
  const folder = await getFolder(teamId, id);
  if (!folder) throw new FolderError('La carpeta no existe.', 404);

  // Las subcarpetas caen con ella (FK cascade); los documentos sobreviven en la raíz
  // (folder_id es ON DELETE set null).
  await db
    .delete(teamDocumentFolders)
    .where(and(eq(teamDocumentFolders.id, id), eq(teamDocumentFolders.teamId, teamId)));
}
