/**
 * Siembra "Documentación de la Plataforma" y "Capacitación de Uso" en la app Documentos
 * de la cuenta de Noelia (team 2). El plugin "documents" ya está habilitado para ella.
 *
 * Idempotente: las carpetas se buscan por nombre y los documentos por slug determinista.
 * Correrlo dos veces no duplica nada — actualiza el contenido de lo que ya existe.
 *
 *   npx tsx scripts/seed-noelia-docs.ts
 */
import 'dotenv/config';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamDocumentFolders, teamDocuments } from '@/lib/db/schema';
import { documentToText, parseDocumentJson } from '@/lib/plugins/documents/shared/content';
import { markdownToProseMirror } from '@/lib/plugins/documents/shared/markdown';
import { FOLDERS } from './seed-noelia-docs-content';

const TEAM_ID = 2;
const OWNER_USER_ID = 3; // Noelia

async function main() {
  for (const folderSpec of FOLDERS) {
    const [existingFolder] = await db
      .select()
      .from(teamDocumentFolders)
      .where(and(eq(teamDocumentFolders.teamId, TEAM_ID), eq(teamDocumentFolders.name, folderSpec.name)))
      .limit(1);

    const folder =
      existingFolder ??
      (
        await db
          .insert(teamDocumentFolders)
          .values({
            teamId: TEAM_ID,
            name: folderSpec.name,
            emoji: folderSpec.emoji,
            depth: 1,
            createdBy: OWNER_USER_ID,
          })
          .returning()
      )[0];

    console.log(
      `Carpeta «${folderSpec.name}» → id ${folder.id}${existingFolder ? ' (ya existía)' : ' (creada)'}`,
    );

    for (const [index, entry] of folderSpec.documents.entries()) {
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
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
