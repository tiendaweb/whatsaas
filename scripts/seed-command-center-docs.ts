/**
 * Sube la planificación del Command Center Comercial (docs/command-center-comercial/*.md) a la app Documentos.
 *
 * Idempotente: la carpeta se busca por nombre y cada documento por slug determinista.
 * Correrlo de nuevo actualiza el contenido de lo que ya existe.
 *
 *   npx tsx scripts/seed-command-center-docs.ts
 */
import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamDocumentFolders, teamDocuments } from '@/lib/db/schema';
import { documentToText, parseDocumentJson } from '@/lib/plugins/documents/shared/content';
import { markdownToProseMirror } from '@/lib/plugins/documents/shared/markdown';

const TEAM_ID = 2;
const OWNER_USER_ID = 3;
const PARENT_FOLDER_ID = 17; // 📁 Plataforma (misma carpeta madre que "Rediseño plugin Tareas")
const FOLDER_NAME = 'Command Center Comercial';
const FOLDER_EMOJI = '🧭';
const DOCS_DIR = join(process.cwd(), 'docs', 'command-center-comercial');

const DOCUMENTS = [
  { file: '00-LEEME.md', slug: 'ccc-00-leeme', emoji: '📘', title: '00 — Léeme: misión, doctrina y decisiones' },
  { file: '01-DIAGNOSTICO-INFRAESTRUCTURA.md', slug: 'ccc-01-diagnostico', emoji: '🩻', title: '01 — Diagnóstico de infraestructura (A + J)' },
  { file: '02-ARQUITECTURA.md', slug: 'ccc-02-arquitectura', emoji: '🏗️', title: '02 — Arquitectura propuesta (B)' },
  { file: '03-MODELO-DE-DATOS.md', slug: 'ccc-03-modelo-datos', emoji: '🗄️', title: '03 — Modelo de datos (C)' },
  { file: '04-MOTOR-DE-CLASIFICACION.md', slug: 'ccc-04-clasificacion', emoji: '🧠', title: '04 — Motor de clasificación y prioridad (F + G)' },
  { file: '05-PANTALLAS-Y-FLUJO.md', slug: 'ccc-05-pantallas-flujo', emoji: '📱', title: '05 — Pantallas y flujo operativo (D + E)' },
  { file: '06-MVP-PLAN-RIESGOS.md', slug: 'ccc-06-mvp-plan-riesgos', emoji: '🚀', title: '06 — MVP, plan de implementación y riesgos (H + I + K)' },
  { file: '07-PROMPT-STUDIO.md', slug: 'ccc-07-prompt-studio', emoji: '🎛️', title: '07 — Prompt Studio: prompts ejecutables por conectores' },
  { file: 'ESTADO.md', slug: 'ccc-estado', emoji: '🧭', title: 'ESTADO — investigación y decisiones' },
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
    const filePath = join(DOCS_DIR, entry.file);
    if (!existsSync(filePath)) {
      console.log(`  (pendiente) ${entry.title}`);
      continue;
    }
    const markdown = readFileSync(filePath, 'utf8');
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
