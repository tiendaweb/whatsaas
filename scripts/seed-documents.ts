/**
 * Siembra el "Manual del equipo" en la app Documentos y activa el plugin para el equipo.
 *
 * Idempotente: la carpeta se busca por nombre y los documentos por slug determinista.
 * Correrlo dos veces no duplica nada — actualiza el contenido de lo que ya existe.
 *
 *   npx tsx scripts/seed-documents.ts
 */
import 'dotenv/config';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamDocumentFolders, teamDocuments, teamMemberPlugins } from '@/lib/db/schema';
import { documentToText, parseDocumentJson } from '@/lib/plugins/documents/shared/content';
import { markdownToProseMirror } from '@/lib/plugins/documents/shared/markdown';
import { DOCUMENTS } from './seed-documents-content';

const TEAM_ID = 2;
const OWNER_USER_ID = 3; // Noelia
const TEAM_USER_IDS = [3, 12]; // Noelia (owner) y Martin (agente)
const FOLDER_NAME = 'Manual del equipo';

async function main() {
  const [existingFolder] = await db
    .select()
    .from(teamDocumentFolders)
    .where(and(eq(teamDocumentFolders.teamId, TEAM_ID), eq(teamDocumentFolders.name, FOLDER_NAME)))
    .limit(1);

  const folder =
    existingFolder ??
    (
      await db
        .insert(teamDocumentFolders)
        .values({
          teamId: TEAM_ID,
          name: FOLDER_NAME,
          emoji: '📁',
          depth: 1,
          createdBy: OWNER_USER_ID,
        })
        .returning()
    )[0];

  console.log(`Carpeta «${FOLDER_NAME}» → id ${folder.id}${existingFolder ? ' (ya existía)' : ' (creada)'}`);

  for (const [index, entry] of DOCUMENTS.entries()) {
    const node = parseDocumentJson(markdownToProseMirror(entry.markdown));
    if (!node) throw new Error(`El contenido de «${entry.title}» no pasó la validación del esquema.`);

    const content = node.toJSON() as Record<string, unknown>;
    const contentText = documentToText(node);

    const [existing] = await db
      .select({ id: teamDocuments.id, version: teamDocuments.version })
      .from(teamDocuments)
      .where(and(eq(teamDocuments.teamId, TEAM_ID), eq(teamDocuments.slug, entry.slug)))
      .limit(1);

    if (existing) {
      await db
        .update(teamDocuments)
        .set({
          title: entry.title,
          emoji: entry.emoji,
          folderId: folder.id,
          content,
          contentText,
          position: index,
          version: existing.version + 1,
          updatedBy: OWNER_USER_ID,
          updatedAt: new Date(),
        })
        .where(eq(teamDocuments.id, existing.id));

      console.log(`  actualizado: ${entry.emoji} ${entry.title} (id ${existing.id})`);
      continue;
    }

    const [created] = await db
      .insert(teamDocuments)
      .values({
        teamId: TEAM_ID,
        folderId: folder.id,
        title: entry.title,
        slug: entry.slug,
        emoji: entry.emoji,
        content,
        contentText,
        position: index,
        createdBy: OWNER_USER_ID,
        updatedBy: OWNER_USER_ID,
      })
      .returning({ id: teamDocuments.id });

    console.log(`  creado: ${entry.emoji} ${entry.title} (id ${created.id})`);
  }

  for (const userId of TEAM_USER_IDS) {
    await db
      .insert(teamMemberPlugins)
      .values({ teamId: TEAM_ID, userId, pluginId: 'documents', enabled: true, updatedBy: OWNER_USER_ID })
      .onConflictDoUpdate({
        target: [teamMemberPlugins.teamId, teamMemberPlugins.userId, teamMemberPlugins.pluginId],
        set: { enabled: true, updatedAt: new Date() },
      });
  }

  console.log(`App Documentos activada para los usuarios ${TEAM_USER_IDS.join(', ')}.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
