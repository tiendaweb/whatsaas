import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamDocumentFolders, teamDocumentPortals, teamDocuments } from '@/lib/db/schema';
import {
  DEFAULT_DOCUMENT_PORTAL,
  documentPortalDefinitionSchema,
  type DocumentPortalDefinition,
  type DocumentPortalSection,
} from '../shared/portal';
import { listDocuments, type DocumentSummary } from './documents';

export class DocumentPortalError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export type ResolvedDocumentPortalSection = DocumentPortalSection & {
  documents: DocumentSummary[];
};

export type DocumentPortalResponse = {
  definition: DocumentPortalDefinition;
  version: number;
  updatedAt: string | null;
  isDefault: boolean;
  views: Array<{
    id: string;
    name: string;
    description?: string;
    icon: DocumentPortalDefinition['views'][number]['icon'];
    sections: ResolvedDocumentPortalSection[];
  }>;
};

function resolveSection(section: DocumentPortalSection, documents: DocumentSummary[]) {
  if (section.source.kind === 'manual') {
    const byId = new Map(documents.map((document) => [document.id, document]));
    return section.source.documentIds
      .map((id) => byId.get(id))
      .filter((document): document is DocumentSummary => Boolean(document));
  }

  if (section.source.kind === 'folder') {
    const { folderId, limit } = section.source;
    return documents
      .filter((document) => document.folderId === folderId)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, limit);
  }

  return [...documents]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, section.source.limit);
}

export async function getDocumentPortal(teamId: number): Promise<DocumentPortalResponse> {
  const [row, documents] = await Promise.all([
    db.query.teamDocumentPortals.findFirst({ where: eq(teamDocumentPortals.teamId, teamId) }),
    listDocuments(teamId),
  ]);

  const parsed = documentPortalDefinitionSchema.safeParse(row?.definition ?? DEFAULT_DOCUMENT_PORTAL);
  if (!parsed.success) {
    throw new DocumentPortalError('La definición guardada del portal no es válida.', 500);
  }

  const definition = parsed.data;
  return {
    definition,
    version: row?.version ?? 0,
    updatedAt: row?.updatedAt.toISOString() ?? null,
    isDefault: !row,
    views: definition.views.map((view) => ({
      ...view,
      sections: view.sections.map((section) => ({
        ...section,
        documents: resolveSection(section, documents),
      })),
    })),
  };
}

async function assertPortalReferences(teamId: number, definition: DocumentPortalDefinition) {
  const documentIds = new Set<number>();
  const folderIds = new Set<number>();

  for (const view of definition.views) {
    for (const section of view.sections) {
      if (section.source.kind === 'manual') {
        for (const id of section.source.documentIds) documentIds.add(id);
      } else if (section.source.kind === 'folder') {
        folderIds.add(section.source.folderId);
      }
    }
  }

  const [ownedDocuments, ownedFolders] = await Promise.all([
    documentIds.size
      ? db.select({ id: teamDocuments.id }).from(teamDocuments).where(and(
          eq(teamDocuments.teamId, teamId),
          inArray(teamDocuments.id, [...documentIds]),
        ))
      : Promise.resolve([]),
    folderIds.size
      ? db.select({ id: teamDocumentFolders.id }).from(teamDocumentFolders).where(and(
          eq(teamDocumentFolders.teamId, teamId),
          inArray(teamDocumentFolders.id, [...folderIds]),
        ))
      : Promise.resolve([]),
  ]);

  const missingDocuments = [...documentIds].filter((id) => !ownedDocuments.some((row) => row.id === id));
  const missingFolders = [...folderIds].filter((id) => !ownedFolders.some((row) => row.id === id));
  if (missingDocuments.length) {
    throw new DocumentPortalError(`Hay documentos inexistentes o de otro equipo: ${missingDocuments.join(', ')}.`);
  }
  if (missingFolders.length) {
    throw new DocumentPortalError(`Hay carpetas inexistentes o de otro equipo: ${missingFolders.join(', ')}.`);
  }
}

export async function saveDocumentPortal(input: {
  teamId: number;
  userId: number;
  definition: unknown;
  version?: number;
}) {
  const parsed = documentPortalDefinitionSchema.safeParse(input.definition);
  if (!parsed.success) {
    throw new DocumentPortalError(parsed.error.issues[0]?.message ?? 'La definición del portal no es válida.');
  }
  await assertPortalReferences(input.teamId, parsed.data);

  const current = await db.query.teamDocumentPortals.findFirst({
    where: eq(teamDocumentPortals.teamId, input.teamId),
  });

  if (current && input.version !== undefined && input.version !== current.version) {
    throw new DocumentPortalError('El portal cambió mientras lo editabas. Recargá antes de guardar.', 409);
  }

  if (!current) {
    const [created] = await db.insert(teamDocumentPortals).values({
      teamId: input.teamId,
      definition: parsed.data,
      version: 1,
      createdBy: input.userId,
      updatedBy: input.userId,
    }).returning();
    return created;
  }

  const [updated] = await db.update(teamDocumentPortals).set({
    definition: parsed.data,
    version: current.version + 1,
    updatedBy: input.userId,
    updatedAt: new Date(),
  }).where(and(
    eq(teamDocumentPortals.id, current.id),
    eq(teamDocumentPortals.version, current.version),
  )).returning();

  if (!updated) throw new DocumentPortalError('El portal cambió mientras lo editabas. Recargá antes de guardar.', 409);
  return updated;
}
