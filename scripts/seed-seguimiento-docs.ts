/**
 * Sube la planificación de la vista Seguimiento (docs/seguimiento/*.md) a la app Documentos.
 *
 * Idempotente: la carpeta se busca por nombre y cada documento por slug determinista.
 * Correrlo de nuevo actualiza el contenido de lo que ya existe.
 *
 *   npx tsx scripts/seed-seguimiento-docs.ts
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamDocumentFolders, teamDocuments } from '@/lib/db/schema';
import { documentToText, parseDocumentJson } from '@/lib/plugins/documents/shared/content';
import { markdownToProseMirror } from '@/lib/plugins/documents/shared/markdown';

const TEAM_ID = 2;
const OWNER_USER_ID = 3;
const PARENT_FOLDER_ID = 17; // 📁 Plataforma (misma carpeta madre que "Rediseño plugin Tareas")
const FOLDER_NAME = 'Seguimiento · Agenda de contactos';
const FOLDER_EMOJI = '🎯';
const DOCS_DIR = join(process.cwd(), 'docs', 'seguimiento');

const DOCUMENTS = [
  { file: '00-LEEME.md', slug: 'seguimiento-00-leeme', emoji: '📘', title: '00 — Léeme: índice y decisiones' },
  { file: '01-PROMPT-MAESTRO.md', slug: 'seguimiento-01-prompt-maestro', emoji: '🚀', title: '01 — Prompt maestro (pegar en Claude Code)' },
  { file: '02-SPEC-PANTALLA.md', slug: 'seguimiento-02-spec-pantalla', emoji: '🎨', title: '02 — Especificación de pantalla' },
  { file: '03-MAPEO-DATOS.md', slug: 'seguimiento-03-mapeo-datos', emoji: '🗄️', title: '03 — Mapeo de datos (el más importante)' },
  { file: '04-CHAT-Y-PANEL-CONFIGURABLE.md', slug: 'seguimiento-04-chat-panel', emoji: '🧩', title: '04 — Chat lateral y panel configurable' },
  { file: '05-MENSAJES-PROGRAMADOS.md', slug: 'seguimiento-05-programados', emoji: '⏰', title: '05 — Mensajes programados' },
  { file: '06-COPY-ES.md', slug: 'seguimiento-06-copy-es', emoji: '🔤', title: '06 — Textos en español' },
  { file: '07-CHECKLIST-QA.md', slug: 'seguimiento-07-checklist-qa', emoji: '✅', title: '07 — Checklist de verificación' },
  { file: 'ESTADO.md', slug: 'seguimiento-estado', emoji: '🧭', title: 'ESTADO — reconocimiento y preguntas abiertas' },
];

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
          parentId: PARENT_FOLDER_ID,
          name: FOLDER_NAME,
          emoji: FOLDER_EMOJI,
          depth: 2,
          createdBy: OWNER_USER_ID,
        })
        .returning()
    )[0];

  console.log(`Carpeta «${FOLDER_NAME}» → id ${folder.id}${existingFolder ? ' (ya existía)' : ' (creada)'}`);

  for (const [index, entry] of DOCUMENTS.entries()) {
    const markdown = readFileSync(join(DOCS_DIR, entry.file), 'utf8');
    const node = parseDocumentJson(markdownToProseMirror(markdown));
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

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
