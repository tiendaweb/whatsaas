/**
 * Publica la planificación versionable de docs/saas-maker dentro de la app
 * Documentos de WhatsPro. Es idempotente: conserva IDs y actualiza contenido,
 * títulos, emojis, posiciones y carpetas al volver a ejecutarse.
 *
 * Uso:
 *   npx tsx scripts/publish-saas-maker-plan.ts
 *
 * Variables opcionales:
 *   SAAS_MAKER_PLAN_EMAIL=noelia@whatspro.uno
 *   SAAS_MAKER_PLAN_TEAM_ID=2
 */
import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  activityLogs,
  teamDocumentFolders,
  teamDocuments,
  teamMembers,
  users,
} from '@/lib/db/schema';
import { documentToText, parseDocumentJson } from '@/lib/plugins/documents/shared/content';
import { markdownToProseMirror } from '@/lib/plugins/documents/shared/markdown';

const SOURCE_DIR = path.resolve(process.cwd(), 'docs/saas-maker');
const TARGET_EMAIL = (process.env.SAAS_MAKER_PLAN_EMAIL ?? 'noelia@whatspro.uno').trim().toLowerCase();
const TARGET_TEAM_ID = Number(process.env.SAAS_MAKER_PLAN_TEAM_ID ?? 2);

const ROOT_FOLDER = { name: 'SaaS Maker', emoji: '🏗️' };

const SECTIONS: Record<string, { name: string; emoji: string; position: number }> = {
  '00-direccion': { name: '00 · Dirección', emoji: '🧭', position: 0 },
  '01-producto': { name: '01 · Producto', emoji: '🧩', position: 1 },
  '02-arquitectura': { name: '02 · Arquitectura', emoji: '🏛️', position: 2 },
  '03-plataforma': { name: '03 · Plataforma', emoji: '⚙️', position: 3 },
  '04-experiencia': { name: '04 · Experiencia', emoji: '🎨', position: 4 },
  '05-datos-api': { name: '05 · Datos y API', emoji: '🗂️', position: 5 },
  '06-seguridad-operacion': { name: '06 · Seguridad y operación', emoji: '🛡️', position: 6 },
  '07-entrega': { name: '07 · Entrega', emoji: '🚀', position: 7 },
};

type SourceDocument = {
  absolutePath: string;
  relativePath: string;
  section: string | null;
  title: string;
  slug: string;
  emoji: string;
  markdown: string;
  position: number;
};

function slugPart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function documentEmoji(relativePath: string): string {
  if (relativePath === 'README.md') return '📘';
  if (/vision|principios/.test(relativePath)) return '🧭';
  if (/producto|comercial/.test(relativePath)) return '🧩';
  if (/arquitectura|builder|tenancy/.test(relativePath)) return '🏛️';
  if (/dominios/.test(relativePath)) return '🌐';
  if (/pagos/.test(relativePath)) return '💳';
  if (/ia-conectores/.test(relativePath)) return '🤖';
  if (/landings-diseno/.test(relativePath)) return '🎨';
  if (/datos-api/.test(relativePath)) return '🗂️';
  if (/seguridad/.test(relativePath)) return '🛡️';
  if (/roadmap/.test(relativePath)) return '🗺️';
  if (/checklists/.test(relativePath)) return '✅';
  return '📄';
}

function titleFromMarkdown(markdown: string, fallback: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || fallback;
}

async function readSourceDocuments(): Promise<SourceDocument[]> {
  const sources: SourceDocument[] = [];
  const rootMarkdown = await readFile(path.join(SOURCE_DIR, 'README.md'), 'utf8');

  sources.push({
    absolutePath: path.join(SOURCE_DIR, 'README.md'),
    relativePath: 'README.md',
    section: null,
    title: titleFromMarkdown(rootMarkdown, 'SaaS Maker — Plan maestro'),
    slug: 'saas-maker-plan-maestro',
    emoji: documentEmoji('README.md'),
    markdown: rootMarkdown,
    position: 0,
  });

  for (const section of Object.keys(SECTIONS).sort()) {
    const sectionDir = path.join(SOURCE_DIR, section);
    const files = (await readdir(sectionDir)).filter((name) => name.endsWith('.md')).sort();

    for (const [position, file] of files.entries()) {
      const absolutePath = path.join(sectionDir, file);
      const relativePath = path.posix.join(section, file);
      const markdown = await readFile(absolutePath, 'utf8');
      sources.push({
        absolutePath,
        relativePath,
        section,
        title: titleFromMarkdown(markdown, file.replace(/\.md$/, '')),
        slug: `saas-maker-${slugPart(relativePath.replace(/\.md$/, ''))}`,
        emoji: documentEmoji(relativePath),
        markdown,
        position,
      });
    }
  }

  return sources;
}

async function resolveOwner() {
  if (!Number.isInteger(TARGET_TEAM_ID) || TARGET_TEAM_ID <= 0) {
    throw new Error('SAAS_MAKER_PLAN_TEAM_ID debe ser un entero positivo.');
  }

  const [owner] = await db
    .select({ userId: users.id, email: users.email, teamId: teamMembers.teamId })
    .from(users)
    .innerJoin(teamMembers, eq(teamMembers.userId, users.id))
    .where(and(eq(users.email, TARGET_EMAIL), eq(teamMembers.teamId, TARGET_TEAM_ID)))
    .limit(1);

  if (!owner) {
    throw new Error(`No existe la membresía ${TARGET_EMAIL} → team ${TARGET_TEAM_ID}.`);
  }
  return owner;
}

async function ensureFolder(input: {
  name: string;
  emoji: string;
  parentId: number | null;
  position: number;
  userId: number;
}) {
  const parentCondition = input.parentId === null
    ? isNull(teamDocumentFolders.parentId)
    : eq(teamDocumentFolders.parentId, input.parentId);

  const [existing] = await db
    .select()
    .from(teamDocumentFolders)
    .where(and(
      eq(teamDocumentFolders.teamId, TARGET_TEAM_ID),
      parentCondition,
      eq(teamDocumentFolders.name, input.name),
    ))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(teamDocumentFolders)
      .set({ emoji: input.emoji, position: input.position, updatedAt: new Date() })
      .where(eq(teamDocumentFolders.id, existing.id))
      .returning();
    return { folder: updated, created: false };
  }

  const [created] = await db
    .insert(teamDocumentFolders)
    .values({
      teamId: TARGET_TEAM_ID,
      parentId: input.parentId,
      name: input.name,
      emoji: input.emoji,
      depth: input.parentId === null ? 1 : 2,
      position: input.position,
      createdBy: input.userId,
    })
    .returning();
  return { folder: created, created: true };
}

async function publishDocument(source: SourceDocument, folderId: number, userId: number) {
  const parsed = parseDocumentJson(markdownToProseMirror(source.markdown));
  if (!parsed) {
    throw new Error(`El contenido de ${source.relativePath} no pasó la validación del editor.`);
  }

  const content = parsed.toJSON() as Record<string, unknown>;
  const contentText = documentToText(parsed);
  const [existing] = await db
    .select({ id: teamDocuments.id, version: teamDocuments.version })
    .from(teamDocuments)
    .where(and(eq(teamDocuments.teamId, TARGET_TEAM_ID), eq(teamDocuments.slug, source.slug)))
    .limit(1);

  if (existing) {
    await db
      .update(teamDocuments)
      .set({
        folderId,
        title: source.title,
        emoji: source.emoji,
        content,
        contentText,
        format: 'markdown',
        htmlContent: null,
        position: source.position,
        version: existing.version + 1,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(teamDocuments.id, existing.id));
    return { id: existing.id, action: 'updated' as const };
  }

  const [created] = await db
    .insert(teamDocuments)
    .values({
      teamId: TARGET_TEAM_ID,
      folderId,
      title: source.title,
      slug: source.slug,
      emoji: source.emoji,
      content,
      contentText,
      format: 'markdown',
      position: source.position,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning({ id: teamDocuments.id });
  return { id: created.id, action: 'created' as const };
}

async function main() {
  const owner = await resolveOwner();
  const sources = await readSourceDocuments();
  const rootResult = await ensureFolder({
    ...ROOT_FOLDER,
    parentId: null,
    position: 0,
    userId: owner.userId,
  });

  const folderIds = new Map<string | null, number>([[null, rootResult.folder.id]]);
  let foldersCreated = rootResult.created ? 1 : 0;

  for (const [key, section] of Object.entries(SECTIONS)) {
    const result = await ensureFolder({
      ...section,
      parentId: rootResult.folder.id,
      userId: owner.userId,
    });
    folderIds.set(key, result.folder.id);
    if (result.created) foldersCreated += 1;
  }

  const published: Array<{
    id: number;
    action: 'created' | 'updated';
    path: string;
    title: string;
  }> = [];

  for (const source of sources) {
    const folderId = folderIds.get(source.section);
    if (!folderId) throw new Error(`No se resolvió la carpeta para ${source.relativePath}.`);
    const result = await publishDocument(source, folderId, owner.userId);
    published.push({ ...result, path: source.relativePath, title: source.title });
  }

  await db.insert(activityLogs).values({
    teamId: TARGET_TEAM_ID,
    userId: owner.userId,
    action: `documents.saas_maker_plan.synced:${published.length}`,
  });

  const result = {
    target: { email: owner.email, teamId: owner.teamId },
    sourceDirectory: SOURCE_DIR,
    rootFolder: { id: rootResult.folder.id, name: ROOT_FOLDER.name },
    folders: { total: Object.keys(SECTIONS).length + 1, created: foldersCreated },
    documents: {
      total: published.length,
      created: published.filter((entry) => entry.action === 'created').length,
      updated: published.filter((entry) => entry.action === 'updated').length,
      entries: published,
    },
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
